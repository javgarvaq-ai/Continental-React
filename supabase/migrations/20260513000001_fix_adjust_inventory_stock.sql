-- Migration: 20260513000001_fix_adjust_inventory_stock
-- Fix: adjust_inventory_stock for 'adjustment_minus' now rejects when stock
-- is insufficient instead of silently capping to 0 and recording a false movement.
-- Returns { ok: false, error: 'insufficient_stock', current_stock: <n> } on failure.

CREATE OR REPLACE FUNCTION adjust_inventory_stock(
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

  IF p_type = 'entry' THEN
    -- Entries always succeed (adding stock)
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
      -- Determine whether item is missing or stock is insufficient
      SELECT current_stock INTO v_current_stock
      FROM inventory_items
      WHERE id = p_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Artículo de inventario no encontrado.');
      END IF;

      -- Item exists but stock is too low — reject without mutating anything
      RETURN jsonb_build_object(
        'ok',            false,
        'error',         'insufficient_stock',
        'current_stock', v_current_stock
      );
    END IF;

  END IF;

  -- Only reached on successful UPDATE — record movement with true values
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
