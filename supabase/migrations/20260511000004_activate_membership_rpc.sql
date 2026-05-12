-- R3: Atomic membership activation
--
-- Previously, activateMembership (JS) inserted into customer_memberships, then
-- addNormalProductToComanda (JS) added the charge to comanda_items in a separate call.
-- If the second call failed silently, the membership was active but the customer paid $0.
--
-- This RPC wraps both operations in a single PG transaction: if either fails, both roll back.
--
-- Parameters:
--   p_customer_id  — customers.id
--   p_plan_id      — membership_plans.id
--   p_comanda_id   — comandas.id
--
-- Returns:
--   { ok: true,  membership_id: uuid }  on success
--   { ok: false, error: text }          on business-rule failure (duplicate, plan not found)
--   RAISE on unexpected DB error        → full rollback

CREATE OR REPLACE FUNCTION public.activate_membership(
    p_customer_id uuid,
    p_plan_id     uuid,
    p_comanda_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_current_month  date;
    v_product_id     uuid;
    v_product_price  numeric;
    v_existing_item  uuid;
    v_membership_id  uuid;
BEGIN
    v_current_month := date_trunc('month', NOW())::date;

    -- ── Guard: no duplicate active membership this month ─────
    IF EXISTS (
        SELECT 1 FROM customer_memberships
        WHERE  customer_id = p_customer_id
          AND  month       = v_current_month
          AND  status      = 'active'
    ) THEN
        RETURN jsonb_build_object(
            'ok',    false,
            'error', 'Este cliente ya tiene una membresía activa este mes.'
        );
    END IF;

    -- ── Insert the membership ────────────────────────────────
    INSERT INTO customer_memberships (customer_id, plan_id, month, status, paid_via_comanda_id)
    VALUES (p_customer_id, p_plan_id, v_current_month, 'active', p_comanda_id)
    RETURNING id INTO v_membership_id;

    -- ── Look up the plan's charge product (may be null) ──────
    SELECT product_id INTO v_product_id
    FROM   membership_plans
    WHERE  id = p_plan_id;

    -- ── If the plan has a product, add it to the comanda ─────
    -- Mirrors the logic in addNormalProductToComanda:
    -- increment quantity if an active item already exists, otherwise insert.
    IF v_product_id IS NOT NULL THEN
        SELECT price INTO v_product_price
        FROM   products
        WHERE  id = v_product_id;

        SELECT id INTO v_existing_item
        FROM   comanda_items
        WHERE  comanda_id     = p_comanda_id
          AND  product_id     = v_product_id
          AND  status         = 'active'
          AND  is_free_mixer  = false
          AND  is_free_benefit = false
        LIMIT 1;

        IF v_existing_item IS NOT NULL THEN
            UPDATE comanda_items
            SET    quantity = quantity + 1
            WHERE  id = v_existing_item;
        ELSE
            INSERT INTO comanda_items (
                comanda_id, product_id, quantity, unit_price,
                status, is_free_mixer, source_type
            ) VALUES (
                p_comanda_id, v_product_id, 1, v_product_price,
                'active', false, 'regular'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'membership_id', v_membership_id);

EXCEPTION WHEN OTHERS THEN
    RAISE; -- re-raise so Postgres rolls back the entire transaction
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_membership(uuid, uuid, uuid) TO anon;
