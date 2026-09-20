-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 0.2 del audit 2026-09-18 (hallazgo 2.14): 6 de 8 RPCs SECURITY DEFINER
-- están expuestas a `anon` (confirmado corriendo
--   SELECT proname, proacl FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace AND prosecdef;
-- en el SQL Editor de Supabase el 2026-09-20). Supabase da EXECUTE a
-- anon/authenticated por default en funciones nuevas de public — un
-- `REVOKE ... FROM public` (como el de 20260907000001) NO quita ese grant
-- explícito a `anon`, hay que revocarlo por rol explícitamente.
--
-- Funciones que sí necesitan seguir siendo llamables por `authenticated`
-- (cualquier mesero las usa en el flujo normal de cobro):
--   finalize_comanda_payment, present_bill_atomic, set_payment_card_terminal
--   → solo se les quita `anon`.
--
-- Funciones que además deben quedar restringidas a admin/manager (hoy
-- cualquier `authenticated` podía llamarlas sin chequeo de rol interno):
--   adjust_payment_tip, adjust_inventory_stock
--   → se les quita `anon` y se les agrega el mismo chequeo de rol que ya
--     usan las RLS policies en 20260512000001_admin_role_rls.sql:
--     (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
--
-- deduct_inventory_item: verificado por grep que no tiene ningún caller
-- directo desde el frontend (solo la llama internamente
-- finalize_comanda_payment, dentro del mismo proceso, como owner de la
-- función — eso no requiere el grant de EXECUTE). Se le quita EXECUTE a
-- `anon` Y a `authenticated`: nadie debe poder llamarla directo.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Funciones que se quedan abiertas a `authenticated`, solo se cierran a anon ──

REVOKE EXECUTE ON FUNCTION public.finalize_comanda_payment(
    uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.present_bill_atomic(uuid, uuid, numeric) FROM anon;

REVOKE EXECUTE ON FUNCTION public.set_payment_card_terminal(uuid, text) FROM anon;


-- ── 2. deduct_inventory_item: sin caller directo desde frontend, se cierra a todos ──

REVOKE EXECUTE ON FUNCTION public.deduct_inventory_item(
    uuid, numeric, uuid, uuid, uuid, text
) FROM anon, authenticated;


-- ── 3. adjust_payment_tip: se cierra a anon + se agrega chequeo de rol ──────────

REVOKE EXECUTE ON FUNCTION public.adjust_payment_tip(uuid, numeric) FROM anon;

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
    -- Guard nuevo: solo admin/manager (antes cualquier `authenticated` podía)
    IF (SELECT role FROM public.users WHERE id = auth.uid()) NOT IN ('admin', 'manager') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
    END IF;

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


-- ── 4. adjust_inventory_stock: se cierra a anon + se agrega chequeo de rol ──────

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_stock(
    uuid, numeric, text, uuid, text
) FROM anon;

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
    p_id      uuid,
    p_amount  numeric,
    p_type    text,       -- 'entry' | 'adjustment_minus'
    p_user_id uuid,
    p_note    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_new_stock     numeric;
    v_movement_type text;
    v_qty_change    numeric;
    v_current_stock numeric;
BEGIN
    -- Guard nuevo: solo admin/manager (antes cualquier `authenticated` podía)
    IF (SELECT role FROM public.users WHERE id = auth.uid()) NOT IN ('admin', 'manager') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
    END IF;

    IF p_type = 'entry' THEN
        v_movement_type := 'entry';
        v_qty_change    := p_amount;

        UPDATE inventory_items
        SET current_stock = current_stock + p_amount
        WHERE id = p_id
        RETURNING current_stock INTO v_new_stock;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Artículo de inventario no encontrado.');
        END IF;

    ELSE
        -- adjustment_minus: only deduct if current_stock >= p_amount
        v_movement_type := 'adjustment_minus';
        v_qty_change    := -p_amount;

        UPDATE inventory_items
        SET current_stock = current_stock - p_amount
        WHERE id = p_id AND current_stock >= p_amount
        RETURNING current_stock INTO v_new_stock;

        IF NOT FOUND THEN
            SELECT current_stock INTO v_current_stock
            FROM inventory_items WHERE id = p_id;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('ok', false, 'error', 'Artículo de inventario no encontrado.');
            END IF;

            RETURN jsonb_build_object(
                'ok',            false,
                'error',         'insufficient_stock',
                'current_stock', v_current_stock
            );
        END IF;
    END IF;

    INSERT INTO inventory_movements (
        inventory_item_id,
        movement_type,
        quantity_change,
        resulting_stock,
        user_id,
        note
    ) VALUES (
        p_id,
        v_movement_type,
        v_qty_change,
        v_new_stock,
        p_user_id,
        p_note
    );

    RETURN jsonb_build_object('ok', true, 'new_stock', v_new_stock);
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, numeric, text, uuid, text) TO authenticated;
