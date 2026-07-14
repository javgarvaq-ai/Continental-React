-- ─────────────────────────────────────────────────────────────────────────────
-- Checador en POS — Fase 1
--
-- 1. UNIQUE parcial en employees(user_id): un usuario mapea a lo más a un
--    empleado (NULLs permitidos — empleados sin cuenta siguen siendo válidos).
-- 2. Policies de employee_time_logs: además de admin/manager (respaldo manual),
--    cualquier usuario autenticado puede escribir logs de SU PROPIO empleado
--    (employees.user_id = auth.uid()). Un waiter no puede checar por otro.
-- 3. clock_self(): toggle atómico entrada/salida para el usuario de la sesión.
--    SECURITY INVOKER — corre bajo el RLS del que llama; no hay forma de
--    escalar a otros empleados ni pasando parámetros (no recibe ninguno).
--
-- El índice único parcial existente employee_one_open_checkin (1 log abierto
-- por empleado) protege la carrera de doble check-in; clock_self captura
-- unique_violation y responde con mensaje amigable.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Un empleado por usuario ───────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_unique
    ON public.employees (user_id)
    WHERE user_id IS NOT NULL;


-- ── 2. RLS: escritura del empleado propio ────────────────────────────────────

DROP POLICY IF EXISTS "time_logs_insert" ON public.employee_time_logs;
DROP POLICY IF EXISTS "time_logs_update" ON public.employee_time_logs;

CREATE POLICY "time_logs_insert" ON public.employee_time_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
        OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    );

CREATE POLICY "time_logs_update" ON public.employee_time_logs
    FOR UPDATE TO authenticated
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
        OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
    WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager')
        OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    );

-- time_logs_select (TO authenticated, USING true) se conserva sin cambios.


-- ── 3. clock_self() — toggle atómico entrada/salida ──────────────────────────

CREATE OR REPLACE FUNCTION public.clock_self()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_emp_id   uuid;
    v_emp_name text;
    v_log_id   uuid;
    v_in_at    timestamptz;
    v_now      timestamptz := now();
BEGIN
    SELECT id, name INTO v_emp_id, v_emp_name
    FROM employees
    WHERE user_id = auth.uid() AND active = true;

    IF v_emp_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Tu usuario no está ligado a un empleado activo. Pide al admin que te ligue en Empleados.'
        );
    END IF;

    -- Log abierto → checar salida
    SELECT id, checked_in_at INTO v_log_id, v_in_at
    FROM employee_time_logs
    WHERE employee_id = v_emp_id AND checked_out_at IS NULL
    FOR UPDATE;

    IF v_log_id IS NOT NULL THEN
        UPDATE employee_time_logs
        SET checked_out_at = v_now
        WHERE id = v_log_id;

        RETURN jsonb_build_object(
            'ok', true,
            'action', 'out',
            'at', v_now,
            'checked_in_at', v_in_at,
            'employee_name', v_emp_name
        );
    END IF;

    -- Sin log abierto → checar entrada
    INSERT INTO employee_time_logs (employee_id, checked_in_at)
    VALUES (v_emp_id, v_now);

    RETURN jsonb_build_object(
        'ok', true,
        'action', 'in',
        'at', v_now,
        'employee_name', v_emp_name
    );

EXCEPTION WHEN unique_violation THEN
    -- Carrera: otro request ya insertó la entrada (employee_one_open_checkin)
    RETURN jsonb_build_object(
        'ok', false,
        'error', 'Ya hay una checada en proceso. Recarga e intenta de nuevo.'
    );
END;
$$;

-- Solo sesiones autenticadas pueden ejecutarla (anon no tiene por qué llamarla;
-- de cualquier forma auth.uid() sería NULL y el RLS bloquearía el write).
REVOKE EXECUTE ON FUNCTION public.clock_self() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.clock_self() TO authenticated;
