-- R4: Rate limiting for verify_pin
--
-- The POS runs on Vercel (public internet), so the anon key is reachable by anyone.
-- Without rate limiting, a 6-digit PIN (1M combinations) can be brute-forced trivially.
--
-- Strategy:
--   - Track failed attempts per user in two new columns on `users`.
--   - After 5 consecutive wrong PINs, lock the account for 15 minutes.
--   - A correct PIN resets the counter and clears the lock.
--   - The lock check is the very first thing the RPC does — no bcrypt work on locked accounts.

-- ─────────────────────────────────────────────
-- 1. Add tracking columns to users
-- ─────────────────────────────────────────────
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS failed_pin_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until        timestamptz NULL;

-- ─────────────────────────────────────────────
-- 2. Recreate verify_pin with rate limiting
--    Replaces the version in 20260508200006_fix_verify_pin_search_path.sql
-- ─────────────────────────────────────────────
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
  v_user RECORD;
  v_hash text;
BEGIN
  SELECT id, name, role, active, pin_hash, failed_pin_attempts, locked_until
  INTO   v_user
  FROM   users
  WHERE  id     = p_user_id
    AND  active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  -- Lockout check: reject immediately if still within the lock window.
  -- No bcrypt work is done, which also removes a timing side-channel.
  IF v_user.locked_until IS NOT NULL AND v_user.locked_until > NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.'
    );
  END IF;

  -- Normalize $2b$ → $2a$ so pgcrypto crypt() can verify bcryptjs-generated hashes
  v_hash := replace(v_user.pin_hash, '$2b$', '$2a$');

  IF crypt(p_pin, v_hash) = v_hash THEN
    -- Correct PIN: clear the counter and any existing lock
    UPDATE users
    SET    failed_pin_attempts = 0,
           locked_until        = NULL
    WHERE  id = p_user_id;

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
    -- Wrong PIN: increment counter and lock once threshold is hit
    UPDATE users
    SET    failed_pin_attempts = failed_pin_attempts + 1,
           locked_until = CASE
             WHEN failed_pin_attempts + 1 >= 5
             THEN NOW() + interval '15 minutes'
             ELSE locked_until  -- keep existing lock if already set; NULL otherwise
           END
    WHERE  id = p_user_id;

    RETURN jsonb_build_object('success', false, 'error', 'PIN incorrecto');
  END IF;
END;
$$;
