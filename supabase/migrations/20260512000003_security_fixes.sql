-- ─────────────────────────────────────────────────────────────────────────────
-- Security fixes: S-3, S-6, S-7
-- ─────────────────────────────────────────────────────────────────────────────


-- ── S-3: activate_membership — guard comanda must be open ─────────────────────
--
-- Problem: the RPC inserted a membership charge into comanda_items without
-- checking that the comanda was still open. A stale UI session could call this
-- after the comanda had already moved to pending_payment or processing_payment,
-- adding a charge to a bill that was already presented.
--
-- Fix: add an EXISTS check at the top of the function. If the comanda is not
-- open, return { ok: false, error: 'comanda_not_open' } immediately.

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
        RETURN jsonb_build_object(
            'ok',    false,
            'error', 'La comanda ya no está abierta.'
        );
    END IF;

    v_current_month := date_trunc('month', NOW())::date;

    -- ── Guard: no duplicate active membership this month ─────────────────────
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

-- Keep only the authenticated grant; revoke the unnecessary anon grant.
REVOKE EXECUTE ON FUNCTION public.activate_membership(uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.activate_membership(uuid, uuid, uuid) TO authenticated;


-- ── S-6: revoke anon EXECUTE on process_membership_on_payment ────────────────
--
-- The original migration granted EXECUTE to anon. The Auth migration later
-- granted it to authenticated but never revoked the anon grant.
-- In practice RLS on the underlying tables blocks any real damage, but the
-- grant is unnecessary and violates least-privilege.

REVOKE EXECUTE ON FUNCTION public.process_membership_on_payment(uuid, uuid, uuid, numeric, numeric, integer)
    FROM anon;
GRANT  EXECUTE ON FUNCTION public.process_membership_on_payment(uuid, uuid, uuid, numeric, numeric, integer)
    TO authenticated;


-- ── S-7: restrict shifts INSERT/UPDATE to admin and manager ──────────────────
--
-- Problem: shifts_insert and shifts_update were open to any authenticated user
-- (USING true). A waiter with a valid session could open a new shift or modify
-- an existing one directly via the REST API.
--
-- Fix: same role-check subquery pattern used in migration 20260512000001.
-- SELECT stays open (all authenticated can read shift data for the POS).

DROP POLICY IF EXISTS "shifts_insert" ON public.shifts;
DROP POLICY IF EXISTS "shifts_update" ON public.shifts;

CREATE POLICY "shifts_insert" ON public.shifts
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    );

CREATE POLICY "shifts_update" ON public.shifts
    FOR UPDATE TO authenticated
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    )
    WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
    );
