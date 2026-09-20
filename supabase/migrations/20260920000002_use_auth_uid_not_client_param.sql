-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 0.5 del audit (hallazgo 2.15): finalize_comanda_payment,
-- present_bill_atomic y adjust_inventory_stock reciben "quién hizo la acción"
-- como parámetro `p_user_id` mandado por el cliente. Cualquier llamada directa
-- a la API (no solo desde el POS) puede mandar el uuid que quiera — el rastro
-- de auditoría (comanda_events.user_id, payments.paid_by_user,
-- inventory_movements.user_id) es falsificable.
--
-- Fix: usar `auth.uid()` (viene del JWT verificado por Supabase, el cliente
-- no lo puede cambiar) en vez de confiar en `p_user_id`. Se verificó primero
-- (src/services/auth.js) que cada usuario entra con su propia cuenta real de
-- Supabase Auth (PIN = password) — no es una sesión de dispositivo compartida
-- — así que auth.uid() sí identifica bien a quien está actuando.
--
-- El parámetro `p_user_id` SE MANTIENE en la firma de las 3 funciones (mismo
-- nombre, misma posición) para no tocar el frontend — Supabase hace match de
-- RPC por nombre de parámetro, renombrarlo rompería las llamadas existentes.
-- Simplemente ya no se usa su valor para nada.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. present_bill_atomic ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.present_bill_atomic(
  p_comanda_id uuid,
  p_user_id    uuid,  -- ya NO se usa (ver comentario arriba) — se queda solo por compatibilidad de firma
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
    cuenta_by  = auth.uid(),
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
    auth.uid(),
    'cuenta_clicked',
    jsonb_build_object('total', p_total)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ── 2. adjust_inventory_stock ────────────────────────────────────────────────
-- (mismo body que 20260920000001, solo cambia user_id → auth.uid() en el INSERT)

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
    p_id      uuid,
    p_amount  numeric,
    p_type    text,       -- 'entry' | 'adjustment_minus'
    p_user_id uuid,       -- ya NO se usa (ver comentario arriba) — se queda solo por compatibilidad de firma
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
    IF (SELECT role FROM public.users WHERE id = auth.uid()) NOT IN ('admin', 'manager') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
    END IF;

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
        auth.uid(),
        p_note
    );

    RETURN jsonb_build_object('ok', true, 'new_stock', v_new_stock);
END;
$$;


-- ── 3. finalize_comanda_payment ──────────────────────────────────────────────
-- (mismo body que 20260616000001, solo cambia p_user_id → auth.uid() en los
-- 4 lugares donde se usaba: comandas, payments, deduct_inventory_item y
-- comanda_events)

CREATE OR REPLACE FUNCTION public.finalize_comanda_payment(
    p_comanda_id     uuid,
    p_user_id        uuid,  -- ya NO se usa (ver comentario arriba) — se queda solo por compatibilidad de firma
    p_shift_id       uuid,
    p_propina        numeric,
    p_efectivo       numeric,
    p_tarjeta        numeric,
    p_transferencia  numeric,
    p_total_paid     numeric,
    p_change_given   numeric,
    p_total          numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item        RECORD;
    v_recipe      RECORD;
    v_deduction   NUMERIC;
    v_result      JSONB;
    v_rows        INTEGER;
    v_actor       uuid := auth.uid();
BEGIN
    -- ── Guard: comanda must be in processing_payment ──────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM comandas
        WHERE id = p_comanda_id AND status = 'processing_payment'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_paid');
    END IF;

    -- ── 1. Update comanda to paid (atomic status transition) ──────────────────
    UPDATE comandas
    SET
        status          = 'paid',
        paid_by_user_id = v_actor,
        cobrado_by      = v_actor,
        cobrado_at      = NOW(),
        tip_total       = p_propina
    WHERE id = p_comanda_id
      AND status = 'processing_payment';

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_paid');
    END IF;

    -- ── 2. Insert payment record ──────────────────────────────────────────────
    INSERT INTO payments (
        comanda_id,
        shift_id,
        paid_by_user,
        efectivo,
        tarjeta,
        transferencia,
        total_paid,
        tip_amount,
        change_given
    ) VALUES (
        p_comanda_id,
        p_shift_id,
        v_actor,
        p_efectivo,
        p_tarjeta,
        p_transferencia,
        p_total_paid,
        p_propina,
        p_change_given
    );

    -- ── 3. Deduct inventory + snapshot de costo, por cada item activo ─────────
    FOR v_item IN
        SELECT ci.id AS comanda_item_id,
               ci.product_id,
               ci.quantity
        FROM   comanda_items ci
        WHERE  ci.comanda_id = p_comanda_id
          AND  ci.status     = 'active'
    LOOP
        FOR v_recipe IN
            SELECT pr.inventory_item_id,
                   pr.deduct_amount
            FROM   product_recipes pr
            WHERE  pr.product_id = v_item.product_id
              AND  pr.active     = true
        LOOP
            v_deduction := v_item.quantity * v_recipe.deduct_amount;

            SELECT deduct_inventory_item(
                v_recipe.inventory_item_id,
                v_deduction,
                v_item.product_id,
                v_item.comanda_item_id,
                v_actor,
                'Deducción por cobro de comanda ' || p_comanda_id::TEXT
            ) INTO v_result;

            IF NOT (v_result->>'ok')::BOOLEAN THEN
                RAISE EXCEPTION '%', v_result->>'error';
            END IF;
        END LOOP;

        DECLARE
            v_recipe_count integer;
            v_uncosted     integer;
            v_recipe_cost  numeric;
            v_unit_cost    numeric;
        BEGIN
            SELECT count(*),
                   count(*) FILTER (WHERE ii.unit_cost IS NULL),
                   sum(pr.deduct_amount * ii.unit_cost)
              INTO v_recipe_count, v_uncosted, v_recipe_cost
              FROM product_recipes pr
              JOIN inventory_items ii ON ii.id = pr.inventory_item_id
             WHERE pr.product_id = v_item.product_id
               AND pr.active = true;

            IF v_recipe_count > 0 THEN
                v_unit_cost := CASE WHEN v_uncosted = 0 THEN v_recipe_cost ELSE NULL END;
            ELSE
                SELECT p.manual_cost INTO v_unit_cost
                  FROM products p WHERE p.id = v_item.product_id;
            END IF;

            UPDATE comanda_items
               SET unit_cost_at_sale = v_unit_cost
             WHERE id = v_item.comanda_item_id;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- ── 4. Insert comanda event ───────────────────────────────────────────────
    INSERT INTO comanda_events (
        comanda_id,
        user_id,
        event_type,
        event_data
    ) VALUES (
        p_comanda_id,
        v_actor,
        'cobro_confirmed',
        jsonb_build_object(
            'total',             p_total,
            'efectivo',          p_efectivo,
            'tarjeta',           p_tarjeta,
            'transferencia',     p_transferencia,
            'propina',           p_propina,
            'cambio',            p_change_given,
            'efectivo_recibido', p_efectivo + p_change_given,
            'total_aplicado',    p_total_paid
        )
    );

    RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;
