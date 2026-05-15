-- ============================================================
-- DEV TOOL: execute_sql
-- Temporary admin utility for QA testing.
-- DELETE THIS MIGRATION (and drop the function) after QA is done:
--   DROP FUNCTION IF EXISTS public.execute_sql(text);
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result      json;
    caller_role text;
    normalized  text;
BEGIN
    -- 1. Verify the caller is an admin in our users table
    SELECT role INTO caller_role
    FROM public.users
    WHERE id = auth.uid();

    IF caller_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol admin';
    END IF;

    -- 2. Enforce SELECT-only: query must start with SELECT or WITH
    normalized := lower(trim(query));
    IF normalized NOT LIKE 'select%' AND normalized NOT LIKE 'with%' THEN
        RAISE EXCEPTION 'Solo se permiten consultas SELECT o WITH (read-only)';
    END IF;

    -- 3. Execute and return results as JSON array
    BEGIN
        EXECUTE format(
            'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (%s) t',
            query
        ) INTO result;
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object(
            'error',  SQLERRM,
            'detail', SQLSTATE
        );
    END;

    RETURN result;
END;
$$;

-- Only authenticated users can call this; anon cannot
GRANT  EXECUTE ON FUNCTION public.execute_sql(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_sql(text) FROM anon;
