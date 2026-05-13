-- ─────────────────────────────────────────────────────────────────────────────
-- S-2 — Make finalize_comanda_payment idempotent
--
-- Problem: the RPC had no status guard on the UPDATE. A retry caused by a
-- network timeout (waiter taps "confirm" twice) would run the full RPC a
-- second time: inserting a duplicate payments row and deducting inventory
-- twice — even though the comanda was already marked paid on the first call.
--
-- Fix:
--   1. Check comanda is in 'processing_payment' BEFORE doing anything.
--      If not, return { ok: false, error: 'already_paid' } immediately.
--   2. Add AND status = 'processing_payment' to the UPDATE itself so that
--      even under a true race condition the UPDATE is a no-op on the second
--      call. Use GET DIAGNOSTICS to verify the row was actually updated.
--      If 0 rows updated, return { ok: false, error: 'already_paid' }.
--
-- The caller (comandaCheckout.js → handleConfirmPayment) already checks
-- data?.ok === false and surfaces the error via setStatus — no frontend
-- changes needed. The second tap will show "Esta comanda ya fue cobrada."
-- instead of silently double-charging.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.finalize_comanda_payment(
    p_comanda_id      uuid,
    p_user_id         uuid,
    p_shift_id        uuid,
    p_cobrado_at      timestamptz,
    p_tip_total       numeric,
    p_efectivo        numeric,
    p_tarjeta         numeric,
    p_transferencia   numeric,
    p_total_paid      numeric,
    p_tip_amount      numeric,
    p_change_given    numeric,
    p_total           numeric,
    p_cash_received   numeric,
    p_total_aplicado  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_item        RECORD;
    v_recipe      RECORD;
    v_deduction   NUMERIC;
    v_result      JSONB;
    v_rows        INTEGER;
BEGIN
    -- ── Guard: comanda must be in processing_payment ──────────────────────────
    -- This is the idempotency check. If the comanda is already 'paid' (because
    -- a previous call succeeded) or in any other state, we return immediately
    -- without touching payments or inventory. The UPDATE below enforces the
    -- same constraint atomically.

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
        cobrado_at      = p_cobrado_at,
        tip_total       = p_tip_total
    WHERE id = p_comanda_id
      AND status = 'processing_payment';   -- ← race-condition guard

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
        p_tip_amount,
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
            'propina',           p_tip_total,
            'cambio',            p_change_given,
            'efectivo_recibido', p_cash_received,
            'total_aplicado',    p_total_aplicado
        )
    );

    RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
    RAISE; -- re-raise so Postgres rolls back the entire transaction
END;
$$;
