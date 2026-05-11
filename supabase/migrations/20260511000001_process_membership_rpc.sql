-- ============================================================
-- process_membership_on_payment RPC
--
-- Replaces the non-atomic JS processMembershipOnPayment function.
-- All membership state mutations (visit_count, bottle_credits,
-- benefit_usage inserts) run inside a single PG transaction.
--
-- Key guarantees:
--   1. SELECT FOR UPDATE on customers row eliminates the TOCTOU
--      race when two tablets process the same customer concurrently.
--   2. Idempotency guard: if membership_benefit_usage already has
--      a row for this (customer, comanda) pair, returns early.
--   3. RAISE re-raises any exception so Postgres rolls back fully.
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_membership_on_payment(
    p_customer_id      uuid,
    p_membership_id    uuid,    -- customer_memberships.id
    p_comanda_id       uuid,
    p_discount_pct     numeric,
    p_discount_amount  numeric,
    p_milestone_visits integer  -- 0 = no milestone benefit configured
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_prev_visits           integer;
    v_new_visits            integer;
    v_prev_cycles           integer;
    v_new_cycles            integer;
    v_earned_bottle_credit  boolean;
    v_current_credits       integer;
    v_credits_after_earning integer;
    v_credits_final         integer;
    v_free_bottle_product   uuid;
    v_free_product_product  uuid;
    v_milestone_missing     boolean;
BEGIN
    -- ── Idempotency guard ────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM membership_benefit_usage
        WHERE  comanda_id  = p_comanda_id
          AND  customer_id = p_customer_id
        LIMIT  1
    ) THEN
        RETURN jsonb_build_object('ok', true, 'already_processed', true);
    END IF;

    -- ── Lock customer row (prevents concurrent visit-count race) ──
    SELECT visit_count, bottle_credits_available
    INTO   v_prev_visits, v_current_credits
    FROM   customers
    WHERE  id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado.');
    END IF;

    v_prev_visits   := COALESCE(v_prev_visits, 0);
    v_new_visits    := v_prev_visits + 1;
    v_current_credits := COALESCE(v_current_credits, 0);

    -- Flag for caller warning when benefit exists but visits not configured
    v_milestone_missing := (p_membership_id IS NOT NULL AND p_milestone_visits <= 0);

    -- ── Milestone cycle calculation ──────────────────────────
    IF p_milestone_visits > 0 THEN
        v_prev_cycles          := FLOOR(v_prev_visits::numeric / p_milestone_visits);
        v_new_cycles           := FLOOR(v_new_visits::numeric  / p_milestone_visits);
        v_earned_bottle_credit := (v_new_cycles > v_prev_cycles);
    ELSE
        v_earned_bottle_credit := false;
    END IF;

    -- ── Find free benefit items already in this comanda ──────
    -- Join path: comanda_items → membership_benefit_products
    --            → membership_plan_benefits → customer_memberships
    -- This matches the JS logic that looked up products by benefit_type.

    SELECT ci.product_id INTO v_free_bottle_product
    FROM   comanda_items             ci
    JOIN   membership_benefit_products mbp ON mbp.product_id = ci.product_id
    JOIN   membership_plan_benefits    mpb ON mpb.id          = mbp.benefit_id
    JOIN   customer_memberships        cm  ON cm.plan_id      = mpb.plan_id
    WHERE  ci.comanda_id      = p_comanda_id
      AND  ci.is_free_benefit = true
      AND  ci.status          = 'active'
      AND  mpb.benefit_type   = 'free_bottle_milestone'
      AND  cm.id              = p_membership_id
    LIMIT 1;

    SELECT ci.product_id INTO v_free_product_product
    FROM   comanda_items             ci
    JOIN   membership_benefit_products mbp ON mbp.product_id = ci.product_id
    JOIN   membership_plan_benefits    mpb ON mpb.id          = mbp.benefit_id
    JOIN   customer_memberships        cm  ON cm.plan_id      = mpb.plan_id
    WHERE  ci.comanda_id      = p_comanda_id
      AND  ci.is_free_benefit = true
      AND  ci.status          = 'active'
      AND  mpb.benefit_type   = 'free_product'
      AND  cm.id              = p_membership_id
    LIMIT 1;

    -- ── Credit arithmetic ────────────────────────────────────
    v_credits_after_earning := v_current_credits + CASE WHEN v_earned_bottle_credit THEN 1 ELSE 0 END;
    v_credits_final := CASE
        WHEN v_free_bottle_product IS NOT NULL
        THEN GREATEST(v_credits_after_earning - 1, 0)
        ELSE v_credits_after_earning
    END;

    -- ── Update customer counters ─────────────────────────────
    UPDATE customers
    SET    visit_count               = v_new_visits,
           bottle_credits_available  = v_credits_final
    WHERE  id = p_customer_id;

    -- ── Insert usage entries ─────────────────────────────────
    IF p_discount_amount > 0 AND p_membership_id IS NOT NULL THEN
        INSERT INTO membership_benefit_usage (
            customer_id, customer_membership_id, comanda_id,
            benefit_type, discount_percentage, discount_amount_saved
        ) VALUES (
            p_customer_id, p_membership_id, p_comanda_id,
            'discount', p_discount_pct, p_discount_amount
        );
    END IF;

    IF v_free_product_product IS NOT NULL AND p_membership_id IS NOT NULL THEN
        INSERT INTO membership_benefit_usage (
            customer_id, customer_membership_id, comanda_id,
            benefit_type, free_product_id, discount_amount_saved
        ) VALUES (
            p_customer_id, p_membership_id, p_comanda_id,
            'free_product', v_free_product_product, 0
        );
    END IF;

    IF v_free_bottle_product IS NOT NULL AND p_membership_id IS NOT NULL THEN
        INSERT INTO membership_benefit_usage (
            customer_id, customer_membership_id, comanda_id,
            benefit_type, free_bottle_product_id, discount_amount_saved
        ) VALUES (
            p_customer_id, p_membership_id, p_comanda_id,
            'free_bottle_milestone', v_free_bottle_product, 0
        );
    END IF;

    -- ── Return result to caller ──────────────────────────────
    RETURN jsonb_build_object(
        'ok',                       true,
        'new_visit_count',          v_new_visits,
        'earned_bottle_credit',     v_earned_bottle_credit,
        'new_bottle_credits',       v_credits_final,
        'milestone_config_missing', v_milestone_missing
    );

EXCEPTION WHEN OTHERS THEN
    RAISE; -- re-raise so Postgres rolls back the entire transaction
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_membership_on_payment(uuid, uuid, uuid, numeric, numeric, integer) TO anon;
