-- ============================================================
-- User management RPCs
-- Moves PIN hashing server-side (pgcrypto).
-- Drops permissive users INSERT/UPDATE policies so direct
-- mutations from the anon client are no longer possible.
-- ============================================================

-- create_user: inserts a new user, hashes PIN server-side
CREATE OR REPLACE FUNCTION public.create_user(
    p_name text,
    p_role text,
    p_pin  text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    IF p_role NOT IN ('admin', 'manager', 'waiter') THEN
        RETURN json_build_object('success', false, 'error', 'Rol inválido');
    END IF;

    INSERT INTO public.users (name, role, pin_hash, active)
    VALUES (trim(p_name), p_role, crypt(p_pin, gen_salt('bf', 10)), true)
    RETURNING id INTO v_user_id;

    RETURN json_build_object('success', true, 'id', v_user_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- reset_user_pin: replaces a user's PIN hash server-side
CREATE OR REPLACE FUNCTION public.reset_user_pin(
    p_user_id uuid,
    p_pin     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    UPDATE public.users
    SET pin_hash = crypt(p_pin, gen_salt('bf', 10))
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
    END IF;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- update_user_active: toggles the active flag (no PIN involved)
CREATE OR REPLACE FUNCTION public.update_user_active(
    p_user_id uuid,
    p_active  boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.users
    SET active = p_active
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado');
    END IF;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to anon role (required for SetupAdminPage and admin panel)
GRANT EXECUTE ON FUNCTION public.create_user(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.reset_user_pin(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_user_active(uuid, boolean) TO anon;

-- ============================================================
-- Drop the permissive INSERT/UPDATE policies on users.
-- All mutations now go through SECURITY DEFINER RPCs which
-- bypass RLS, so these policies are no longer needed and
-- only leave the door open.
-- ============================================================
DROP POLICY IF EXISTS users_insert ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
