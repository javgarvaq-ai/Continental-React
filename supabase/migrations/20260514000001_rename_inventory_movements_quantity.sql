-- ─────────────────────────────────────────────────────────────────────────────
-- D2 — Rename inventory_movements.quantity → resulting_stock
--
-- The column stores the stock level AFTER the movement was applied, not the
-- quantity that was moved (that's quantity_change). The old name caused
-- confusion when reading queries or writing new report logic.
--
-- Steps:
--   1. Rename the column.
--   2. Recreate deduct_inventory_item — references the column in its INSERT.
--   3. Recreate adjust_inventory_stock — references the column in its INSERT.
--
-- No JS/frontend changes needed: no SELECT on this column exists in src/.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Rename column ─────────────────────────────────────────────────────────
ALTER TABLE public.inventory_movements
    RENAME COLUMN quantity TO resulting_stock;

-- ── 2. Recreate deduct_inventory_item ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_inventory_item(
    p_inventory_item_id uuid,
    p_deduct_amount     numeric,
    p_product_id        uuid,
    p_comanda_item_id   uuid,
    p_user_id           uuid,
    p_note              text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_new_stock numeric;
    v_item_name text;
BEGIN
    UPDATE inventory_items
    SET current_stock = current_stock - p_deduct_amount
    WHERE id         = p_inventory_item_id
      AND current_stock >= p_deduct_amount
      AND active     = true
    RETURNING current_stock, name INTO v_new_stock, v_item_name;

    IF NOT FOUND THEN
        SELECT name INTO v_item_name
        FROM inventory_items WHERE id = p_inventory_item_id;

        RETURN jsonb_build_object(
            'ok',    false,
            'error', COALESCE(
                'Inventario insuficiente para ' || v_item_name,
                'Artículo de inventario no encontrado'
            )
        );
    END IF;

    INSERT INTO inventory_movements (
        inventory_item_id, product_id, comanda_item_id,
        movement_type, quantity_change, resulting_stock, user_id, note
    ) VALUES (
        p_inventory_item_id, p_product_id, p_comanda_item_id,
        'sale_deduction', -p_deduct_amount, v_new_stock, p_user_id, p_note
    );

    RETURN jsonb_build_object('ok', true, 'new_stock', v_new_stock);
END;
$$;

-- ── 3. Recreate adjust_inventory_stock ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
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
            SELECT current_stock INTO v_current_stock
            FROM inventory_items WHERE id = p_id;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('ok', false, 'error', 'Artículo de inventario no encontrado.');
            END IF;

            RETURN jsonb_build_object(
                'ok',            false,
                'error',         'insufficient_stock',
                'current_stock', v_current_stock
            );
        END IF;
    END IF;

    INSERT INTO inventory_movements (
        inventory_item_id,
        movement_type,
        quantity_change,
        resulting_stock,
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
