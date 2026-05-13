-- ─────────────────────────────────────────────────────────────────────────────
-- U-1 — Fix activate_membership month calculation to use Mexico timezone
--
-- Problem: date_trunc('month', NOW()) uses UTC. The bar operates 11 PM–2 AM
-- Mexico time, which is already the next UTC day. On the last night of a month
-- (e.g., May 31st 11 PM Mexico = June 1st UTC), the RPC would store the
-- membership under June while the client JS (using local browser time) queries
-- for May — membership appears missing.
--
-- Fix: one line — add AT TIME ZONE 'America/Mexico_City' so the month is
-- computed in local time, matching what the browser sends.
-- Supabase project stays in UTC (standard practice); only this computation
-- is evaluated in the correct local timezone.
-- ─────────────────────────────────────────────────────────────────────────────

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
    -- ── Guard: comanda must be open ──────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM comandas
        WHERE id = p_comanda_id AND status = 'open'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'La comanda ya no está abierta.');
    END IF;

    -- Compute current month in Mexico local time (not UTC)
    v_current_month := date_trunc('month', NOW() AT TIME ZONE 'America/Mexico_City')::date;

    -- ── Guard: no duplicate active membership this month ─────────────────────
    IF EXISTS (
        SELECT 1 FROM customer_memberships
        WHERE  customer_id = p_customer_id
          AND  month       = v_current_month
          AND  status      = 'active'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Este cliente ya tiene una membresía activa este mes.');
    END IF;

    -- ── Insert the membership ─────────────────────────────────────────────────
    INSERT INTO customer_memberships (customer_id, plan_id, month, status, paid_via_comanda_id)
    VALUES (p_customer_id, p_plan_id, v_current_month, 'active', p_comanda_id)
    RETURNING id INTO v_membership_id;

    -- ── Look up the plan's charge product (may be null) ──────────────────────
    SELECT product_id INTO v_product_id
    FROM   membership_plans
    WHERE  id = p_plan_id;

    -- ── If the plan has a product, add it to the comanda ─────────────────────
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
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_membership(uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.activate_membership(uuid, uuid, uuid) TO authenticated;
