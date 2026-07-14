-- ─────────────────────────────────────────────────────────────────────────────
-- Checador — Fase 2: auditoría y corrección de employee_time_logs
--
-- - source: 'clock' (checada del propio empleado vía clock_self) o 'admin'
--   (registro/toggle manual desde EmployeesAdminPage).
-- - edited_by / edited_at / note: rastro de correcciones del admin (cerrar un
--   log olvidado, ajustar hora de entrada/salida). NULL = log intacto.
--
-- No hay policy DELETE en employee_time_logs — los logs nunca se borran,
-- solo se corrigen con rastro (mismo espíritu de audit trail del proyecto).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.employee_time_logs
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'clock',
    ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS edited_at timestamptz,
    ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.employee_time_logs
    DROP CONSTRAINT IF EXISTS employee_time_logs_source_check;

ALTER TABLE public.employee_time_logs
    ADD CONSTRAINT employee_time_logs_source_check
    CHECK (source IN ('clock', 'admin'));

-- Backfill: todo lo anterior al día operacional 2026-07-13 (deploy del checador
-- Fase 1) fue registrado manualmente por el admin. Los logs del propio 13-jul
-- pueden ser de cualquiera de las dos fuentes — se dejan en 'clock' (cosmético,
-- un solo día de ambigüedad).
UPDATE public.employee_time_logs
SET source = 'admin'
WHERE checked_in_at < '2026-07-13T06:00:00-06:00';
