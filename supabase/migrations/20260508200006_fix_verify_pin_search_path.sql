-- Fix verify_pin: Supabase puts pgcrypto in the 'extensions' schema, not 'public'.
-- The previous version had SET search_path = public which caused crypt() to not be found.
-- Solution: include 'extensions' in the search_path so crypt() resolves correctly.

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

CREATE OR REPLACE FUNCTION verify_pin(
  p_user_id uuid,
  p_pin     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user   RECORD;
  v_hash   text;
BEGIN
  SELECT id, name, role, active, pin_hash
  INTO   v_user
  FROM   users
  WHERE  id     = p_user_id
    AND  active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  -- Normalize $2b$ → $2a$ so pgcrypto crypt() can verify bcryptjs hashes
  v_hash := replace(v_user.pin_hash, '$2b$', '$2a$');

  IF crypt(p_pin, v_hash) = v_hash THEN
    RETURN jsonb_build_object(
      'success', true,
      'user', jsonb_build_object(
        'id',     v_user.id,
        'name',   v_user.name,
        'role',   v_user.role,
        'active', v_user.active
      )
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'PIN incorrecto');
  END IF;
END;
$$;
