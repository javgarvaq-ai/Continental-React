-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: finalize_comanda_payment must be SECURITY DEFINER
--
-- Problem:
--   The function runs as the calling 'authenticated' role. The payments table
--   only has an INSERT policy for 'anon' (carried over from the remote schema
--   dump). There is no INSERT policy for 'authenticated', so any call to
--   finalize_comanda_payment that reaches the INSERT INTO payments (...) line
--   is blocked by RLS with:
--     "new row violates row-level security policy for table payments"
--
-- Fix:
--   Add SECURITY DEFINER so the function executes as its owner (postgres),
--   which bypasses RLS. This is consistent with deduct_inventory_item and
--   every other trusted RPC in this codebase.
--
--   We do NOT add a direct INSERT policy for 'authenticated' on payments
--   because that would allow any authenticated user to insert payment rows
--   without going through the function's guards (idempotency check, status
--   transition, inventory deduction).
--
-- Audit:
--   All other tables written to by POS operations (comanda_events,
--   inventory_movements, cash_movements, customer_memberships, comanda_items,
--   shifts) already have correct INSERT policies for 'authenticated' or are
--   written through SECURITY DEFINER functions. No other gaps found.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.finalize_comanda_payment(
    p_comanda_id     uuid,
    p_user_id        uuid,
    p_shift_id       uuid,
    p_propina        numeric,
    p_efectivo       numeric,
    p_tarjeta        numeric,
    p_transferencia  numeric,
    p_total_paid     numeric,
    p_change_given   numeric,
    p_total          numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item        RECORD;
    v_recipe      RECORD;
    v_deduction   NUMERIC;
    v_result      JSONB;
    v_rows        INTEGER;
BEGIN
    -- ── Guard: comanda must be in processing_payment ──────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM comandas
        WHERE id = p_comanda_id AND status = 'processing_payment'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_paid');
    END IF;

    -- ── 1. Update comanda to paid (atomic status transition) ──────────────────
    UPDATE comandas
    SET
        status          = 'paid',
        paid_by_user_id = p_user_id,
        cobrado_by      = p_user_id,
        cobrado_at      = NOW(),
        tip_total       = p_propina
    WHERE id = p_comanda_id
      AND status = 'processing_payment';

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        -- Another concurrent call already transitioned the status
        RETURN jsonb_build_object('ok', false, 'error', 'already_paid');
    END IF;

    -- ── 2. Insert payment record ──────────────────────────────────────────────
    INSERT INTO payments (
        comanda_id,
        shift_id,
        paid_by_user,
        efectivo,
        tarjeta,
        transferencia,
        total_paid,
        tip_amount,
        change_given
    ) VALUES (
        p_comanda_id,
        p_shift_id,
        p_user_id,
        p_efectivo,
        p_tarjeta,
        p_transferencia,
        p_total_paid,
        p_propina,
        p_change_given
    );

    -- ── 3. Deduct inventory for every active item in this comanda ─────────────
    FOR v_item IN
        SELECT ci.id AS comanda_item_id,
               ci.product_id,
               ci.quantity
        FROM   comanda_items ci
        WHERE  ci.comanda_id = p_comanda_id
          AND  ci.status     = 'active'
    LOOP
        FOR v_recipe IN
            SELECT pr.inventory_item_id,
                   pr.deduct_amount
            FROM   product_recipes pr
            WHERE  pr.product_id = v_item.product_id
              AND  pr.active     = true
        LOOP
            v_deduction := v_item.quantity * v_recipe.deduct_amount;

            SELECT deduct_inventory_item(
                v_recipe.inventory_item_id,
                v_deduction,
                v_item.product_id,
                v_item.comanda_item_id,
                p_user_id,
                'Deducción por cobro de comanda ' || p_comanda_id::TEXT
            ) INTO v_result;

            IF NOT (v_result->>'ok')::BOOLEAN THEN
                RAISE EXCEPTION '%', v_result->>'error';
            END IF;
        END LOOP;
    END LOOP;

    -- ── 4. Insert comanda event ───────────────────────────────────────────────
    INSERT INTO comanda_events (
        comanda_id,
        user_id,
        event_type,
        event_data
    ) VALUES (
        p_comanda_id,
        p_user_id,
        'cobro_confirmed',
        jsonb_build_object(
            'total',             p_total,
            'efectivo',          p_efectivo,
            'tarjeta',           p_tarjeta,
            'transferencia',     p_transferencia,
            'propina',           p_propina,
            'cambio',            p_change_given,
            'efectivo_recibido', p_efectivo + p_change_given,
            'total_aplicado',    p_total_paid
        )
    );

    RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Ensure authenticated users can call this function
GRANT EXECUTE ON FUNCTION public.finalize_comanda_payment(
    uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;
