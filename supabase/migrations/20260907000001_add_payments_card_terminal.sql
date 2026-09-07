-- ─────────────────────────────────────────────────────────────────────────────
-- payments.card_terminal — con qué terminal física se cobró una venta con tarjeta
--
-- Por qué: el negocio cobra con DOS terminales y cada una tiene una comisión
-- distinta (Mercado Pago 4.06% = 3.5% + IVA · Getnet 2.17% = 1.87% + IVA).
-- Sin este dato el sistema no puede calcular la comisión real, y el saldo del
-- banco que muestra el Ledger se infla. Al 2026-09-06 la leyenda "Real estimado"
-- erraba por $1,730.41 y crecía $18.90 por cada $1,000 vendidos con Getnet.
-- Ver tasks/conciliacion_bancaria_2026-09-06.md y el plan v3 en tasks/todo.md.
--
-- El backfill del histórico va aparte, en
-- tasks/backfill_card_terminal_2026-09-07.sql (bloque por bloque, lo corre Javi).
--
-- IMPORTANTE: `finalize_comanda_payment` NO se toca (decisión de Javi
-- 2026-09-07). La terminal se guarda en una llamada separada, después del
-- cobro, con el RPC de abajo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS card_terminal text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_card_terminal_check'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_card_terminal_check
            CHECK (card_terminal IS NULL OR card_terminal IN ('mp', 'getnet'));
    END IF;
END $$;

COMMENT ON COLUMN public.payments.card_terminal IS
    'Terminal física usada para la parte con tarjeta: mp (Mercado Pago, 4.06%) o getnet (2.17%). NULL = histórico sin clasificar o falló el guardado posterior al cobro.';


-- ─────────────────────────────────────────────────────────────────────────────
-- set_payment_card_terminal — guarda la terminal DESPUÉS del cobro
--
-- Por qué un RPC y no un UPDATE directo: los usuarios `authenticated` solo
-- tienen SELECT sobre `payments` (ver 20260516000002_fix_payments_select_rls.sql,
-- que decidió a propósito NO dar UPDATE para que nadie pueda esquivar los
-- guards del RPC de cobro). Un `.update()` desde el frontend afectaría 0 filas
-- EN SILENCIO. Mismo patrón que `adjust_payment_tip`.
--
-- SECURITY DEFINER para poder escribir la columna sin abrir UPDATE a todos.
-- Solo puede tocar `card_terminal` — no puede mover montos.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_payment_card_terminal(
    p_comanda_id uuid,
    p_terminal   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tarjeta numeric;
    v_rows    integer;
BEGIN
    IF p_terminal IS NULL OR p_terminal NOT IN ('mp', 'getnet') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'terminal_invalida');
    END IF;

    SELECT tarjeta INTO v_tarjeta
    FROM payments
    WHERE comanda_id = p_comanda_id;

    IF v_tarjeta IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pago_no_encontrado');
    END IF;

    IF v_tarjeta <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pago_sin_tarjeta');
    END IF;

    UPDATE payments
    SET    card_terminal = p_terminal
    WHERE  comanda_id = p_comanda_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'sin_cambios');
    END IF;

    RETURN jsonb_build_object('ok', true, 'terminal', p_terminal);
END;
$$;

REVOKE ALL ON FUNCTION public.set_payment_card_terminal(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_payment_card_terminal(uuid, text) TO authenticated;
