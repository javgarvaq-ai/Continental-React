-- ─────────────────────────────────────────────────────────────────────────────
-- Nómina — Fase 3: historial de pagos (cierre semanal inmutable + reapertura)
--
-- payroll_records guarda un SNAPSHOT por empleado al "cerrar" una semana:
-- horas planeadas, horas reales confirmadas, tarifa vigente y total a pagar
-- (total_pay = actual_hours × hourly_rate_snapshot). Los montos nunca se
-- editan — mismo espíritu de audit trail que cash_movements / membership_usage.
--
-- Reabrir una semana NO borra ni edita montos: marca la(s) fila(s) como
-- ANULADAS (voided_at / voided_by). El índice único parcial deja una sola
-- fila ACTIVA por (empleado, semana), pero conserva el historial completo de
-- cierres/anulaciones. Volver a cerrar inserta una fila activa nueva.
--
-- La reapertura es el ÚNICO tipo de UPDATE permitido, y va por el RPC
-- void_payroll_week (SECURITY INVOKER). La policy de UPDATE solo admite la
-- transición activa → anulada; nunca des-anular ni mantener activa.
-- Todo restringido al rol admin (única página que consume esta tabla).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Tabla ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payroll_records (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id           uuid NOT NULL REFERENCES public.employees(id),
    week_start            date NOT NULL,
    planned_hours         numeric NOT NULL DEFAULT 0,
    actual_hours          numeric NOT NULL DEFAULT 0,
    hourly_rate_snapshot  numeric NOT NULL DEFAULT 0,
    total_pay             numeric NOT NULL DEFAULT 0,
    notes                 text,
    created_by            uuid REFERENCES public.users(id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    voided_at             timestamptz,
    voided_by             uuid REFERENCES public.users(id)
);

-- Una sola fila ACTIVA por empleado+semana; las anuladas conservan historial.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_records_active_unique
    ON public.payroll_records (employee_id, week_start)
    WHERE voided_at IS NULL;

-- Consultas por semana (cierre/reapertura, total semanal).
CREATE INDEX IF NOT EXISTS payroll_records_week_idx
    ON public.payroll_records (week_start);


-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- SELECT: solo admin (dato sensible de sueldos; solo la página admin lo lee).
CREATE POLICY "payroll_records_select" ON public.payroll_records
    FOR SELECT TO authenticated
    USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- INSERT: solo admin (cerrar semana). WITH CHECK exige fila NO anulada al nacer.
CREATE POLICY "payroll_records_insert" ON public.payroll_records
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
        AND voided_at IS NULL
    );

-- UPDATE: solo la transición activa → anulada (reabrir), solo admin.
-- USING filtra filas actualmente activas; WITH CHECK obliga a que queden
-- anuladas. No se puede des-anular (una fila anulada no pasa el USING) ni
-- mantener activa un UPDATE (WITH CHECK exige voided_at IS NOT NULL).
CREATE POLICY "payroll_records_void" ON public.payroll_records
    FOR UPDATE TO authenticated
    USING (
        voided_at IS NULL
        AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
    )
    WITH CHECK (voided_at IS NOT NULL);

-- Sin policy DELETE: las filas nunca se borran.


-- ── 3. void_payroll_week() — reabrir semana (anula todas sus filas activas) ───

CREATE OR REPLACE FUNCTION public.void_payroll_week(p_week_start date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE payroll_records
    SET voided_at = now(),
        voided_by = auth.uid()
    WHERE week_start = p_week_start
      AND voided_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count = 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'No hay una semana cerrada para reabrir.'
        );
    END IF;

    RETURN jsonb_build_object('ok', true, 'voided', v_count);
END;
$$;

-- Solo sesiones autenticadas; el RLS (admin, activa→anulada) hace el resto.
REVOKE EXECUTE ON FUNCTION public.void_payroll_week(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.void_payroll_week(date) TO authenticated;
