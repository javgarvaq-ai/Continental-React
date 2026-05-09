-- Phase 2 RPCs
-- 1. present_bill_atomic  (HP-1)
-- 2. verify_pin           (CRIT-3 paso 1)
-- 3. adjust_inventory_stock (replaces non-atomic client-side approach)

-- ─────────────────────────────────────────────
-- 1. present_bill_atomic
-- Atomically transitions a comanda from 'open' → 'pending_payment'
-- and inserts the audit event in the same transaction.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION present_bill_atomic(
  p_comanda_id uuid,
  p_user_id    uuid,
  p_total      numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated int;
BEGIN
  UPDATE comandas
  SET
    status     = 'pending_payment',
    final_total = p_total,
    cuenta_by  = p_user_id,
    cuenta_at  = now()
  WHERE id     = p_comanda_id
    AND status = 'open';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'La comanda no está abierta o no existe.'
    );
  END IF;

  INSERT INTO comanda_events (comanda_id, user_id, event_type, event_data)
  VALUES (
    p_comanda_id,
    p_user_id,
    'cuenta_clicked',
    jsonb_build_object('total', p_total)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─────────────────────────────────────────────
-- 2. verify_pin
-- Verifies a user's PIN entirely server-side so pin_hash never leaves the DB.
-- Uses pgcrypto's crypt() which handles Blowfish/bcrypt.
-- bcryptjs generates $2b$ hashes; pgcrypto expects $2a$ — they are
-- algorithmically identical so we normalize the prefix before comparing.
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION verify_pin(
  p_user_id uuid,
  p_pin     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ─────────────────────────────────────────────
-- 3. adjust_inventory_stock
-- Atomically adjusts inventory stock and records the movement.
-- Replaces the non-atomic SELECT + UPDATE + INSERT pattern in the client.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION adjust_inventory_stock(
  p_id     uuid,
  p_amount numeric,
  p_type   text,      -- 'entry' | 'adjustment_minus'
  p_user_id uuid,
  p_note   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stock      numeric;
  v_movement_type  text;
  v_qty_change     numeric;
BEGIN
  IF p_type = 'entry' THEN
    v_movement_type := 'entry';
    v_qty_change    := p_amount;
  ELSE
    v_movement_type := 'adjustment_minus';
    v_qty_change    := -p_amount;
  END IF;

  UPDATE inventory_items
  SET current_stock = CASE
    WHEN p_type = 'entry' THEN current_stock + p_amount
    ELSE GREATEST(current_stock - p_amount, 0)
  END
  WHERE id = p_id
  RETURNING current_stock INTO v_new_stock;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Artículo de inventario no encontrado.');
  END IF;

  INSERT INTO inventory_movements (
    inventory_item_id,
    movement_type,
    quantity_change,
    quantity,
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
