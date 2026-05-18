-- ─────────────────────────────────────────────────────────────────────────────
-- adjust_payment_tip: allow admins to correct the tip amount on a paid comanda
--
-- Updates:
--   payments.tip_amount    — the actual tip recorded on the payment row
--   comandas.tip_total     — kept in sync so reports are consistent
--
-- Guards:
--   - Payment must exist
--   - Comanda must be in 'paid' status (can't adjust tip on open/cancelled)
--   - tip_amount must be >= 0
--
-- Security: SECURITY DEFINER so the function bypasses RLS on payments
-- (authenticated users only have SELECT on payments, not UPDATE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.adjust_payment_tip(
    p_payment_id  uuid,
    p_tip_amount  numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_comanda_id uuid;
    v_rows       integer;
BEGIN
    -- Validate tip
    IF p_tip_amount < 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'tip_negative');
    END IF;

    -- Resolve comanda_id from payment (also confirms payment exists)
    SELECT comanda_id INTO v_comanda_id
    FROM payments
    WHERE id = p_payment_id;

    IF v_comanda_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'payment_not_found');
    END IF;

    -- Guard: comanda must be paid
    IF NOT EXISTS (
        SELECT 1 FROM comandas
        WHERE id = v_comanda_id AND status = 'paid'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'comanda_not_paid');
    END IF;

    -- Update payment tip
    UPDATE payments
    SET tip_amount = p_tip_amount
    WHERE id = p_payment_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'payment_not_found');
    END IF;

    -- Sync comanda tip_total
    UPDATE comandas
    SET tip_total = p_tip_amount
    WHERE id = v_comanda_id;

    RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_payment_tip(uuid, numeric) TO authenticated;
