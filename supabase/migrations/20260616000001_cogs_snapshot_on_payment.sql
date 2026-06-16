-- ─────────────────────────────────────────────────────────────────────────────
-- Costeo — Entrega 2: snapshot de COGS al cobrar.
--
--   1) comanda_items.unit_cost_at_sale (nullable): costo de UNA unidad del
--      producto al momento de la venta. El reporte hace cantidad × este valor.
--      Aditiva → no afecta inserts/lecturas existentes.
--
--   2) finalize_comanda_payment: dentro del loop de items que YA existe (el que
--      descuenta inventario), calcular el costo del producto y guardarlo.
--      Precedencia (igual que utils/cost.js):
--        - receta activa con TODOS sus insumos costeados → Σ(deduct_amount × unit_cost)
--        - receta con algún insumo sin unit_cost          → NULL (incompleto)
--        - sin receta                                     → products.manual_cost (puede ser NULL)
--      El bloque de costeo es NO-FATAL: va en su propio BEGIN..EXCEPTION WHEN
--      OTHERS THEN NULL, de modo que un error de costeo JAMÁS aborta el cobro.
--      El descuento de inventario sigue siendo fatal (como hoy).
--
--   Se preserva SECURITY DEFINER + SET search_path = public (versión vigente
--   20260516000001). Sin cambios de RLS ni de frontend. Rollback manual en
--   tasks/rollback_cogs_snapshot_2026-06-16.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "public"."comanda_items"
  add column if not exists "unit_cost_at_sale" numeric(12,4);

comment on column "public"."comanda_items"."unit_cost_at_sale" is
  'Snapshot del costo de UNA unidad del producto al momento de la venta (COGS). NULL = no costeado al vender (reporte usa costo en vivo de fallback).';

CREATE OR REPLACE FUNCTION public.finalize_comanda_payment(
    p_comanda_id     uuid,
    p_user_id        uuid,
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
        paid_by_user_id = p_user_id,
        cobrado_by      = p_user_id,
        cobrado_at      = NOW(),
        tip_total       = p_propina
    WHERE id = p_comanda_id
      AND status = 'processing_payment';

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        -- Another concurrent call already transitioned the status
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
        p_user_id,
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
        -- 3a. Descuento de inventario (FATAL a propósito: si falla, aborta el cobro)
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
                p_user_id,
                'Deducción por cobro de comanda ' || p_comanda_id::TEXT
            ) INTO v_result;

            IF NOT (v_result->>'ok')::BOOLEAN THEN
                RAISE EXCEPTION '%', v_result->>'error';
            END IF;
        END LOOP;

        -- 3b. Snapshot de costo de UNA unidad (NO-FATAL: nunca rompe el cobro)
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
                -- receta: costo completo SOLO si todos los insumos tienen unit_cost
                v_unit_cost := CASE WHEN v_uncosted = 0 THEN v_recipe_cost ELSE NULL END;
            ELSE
                -- sin receta: costo manual del producto (puede ser NULL)
                SELECT p.manual_cost INTO v_unit_cost
                  FROM products p WHERE p.id = v_item.product_id;
            END IF;

            UPDATE comanda_items
               SET unit_cost_at_sale = v_unit_cost
             WHERE id = v_item.comanda_item_id;
        EXCEPTION WHEN OTHERS THEN
            NULL;  -- el costeo NUNCA bloquea el cobro
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
        p_user_id,
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

-- Ensure authenticated users can call this function
GRANT EXECUTE ON FUNCTION public.finalize_comanda_payment(
    uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;
