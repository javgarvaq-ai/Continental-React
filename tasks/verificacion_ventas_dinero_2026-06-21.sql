-- ============================================================================
--  VERIFICACIÓN DE VENTAS Y DINERO — Continental POS
--  Generado: 2026-06-21  ·  Periodo: 2026-06-08 a 2026-06-21
-- ----------------------------------------------------------------------------
--  CÓMO USARLO
--  1. Corre cada bloque por separado en el SQL Editor de Supabase.
--  2. Si necesitas otro rango, ajusta las dos fechas en "params" (start_op /
--     end_op) en CADA bloque. Son DÍAS OPERATIVOS, no fechas de calendario.
--  3. Pégame los resultados de cada uno y confirmamos que el admin del POS
--     cuente lo mismo.
--
--  DÍA OPERATIVO (clave para que cuadre con el admin):
--  El bar corta el "día" a las 06:00 hora MX (America/Mexico_City, -06:00).
--  Una venta de la 1:00 AM del día 11 pertenece al día 10. La expresión:
--      (ts AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
--  replica exactamente operationalDateKey() del código (services/reports.js).
--
--  RELACIONES IMPORTANTES (confirmadas en el esquema/RPC finalize_comanda_payment):
--   - payments.total_paid      = total cobrado de la comanda (SIN propina)
--   - payments.tip_amount      = propina (se cuenta aparte del ingreso)
--   - payments.efectivo/tarjeta/transferencia = monto aplicado por método
--       -> debe cumplir: efectivo + tarjeta + transferencia = total_paid
--   - payments.change_given    = cambio devuelto (efectivo recibido = efectivo + change_given)
--   - Ingreso del día (admin) = SUM(payments.total_paid) por día operativo
--   - Efectivo esperado en caja = starting_cash + efectivo_pagos
--                                 + depósitos_a_drawer - retiros_de_drawer
--
--  ALCANCE: solo ventas y dinero (pagos, turnos, caja, comandas, inventario,
--  membresías). NO incluye margen/COGS — el costeo todavía no está
--  completamente capturado para todos los productos (decisión de Javi,
--  2026-06-21). Mismo patrón que tasks/verificacion_conteo_2026-06-13.sql,
--  solo con el rango de fechas actualizado.
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 — RESUMEN MAESTRO DE TURNOS (lo más importante)
-- Compara los totales GUARDADOS en el turno contra los RECALCULADOS desde
-- payments y cash_movements. Cualquier delta != 0 es un descuadre a revisar.
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    s.id,
    s.status,
    (s.opened_at AT TIME ZONE 'America/Mexico_City') AS abierto_mx,
    (s.closed_at AT TIME ZONE 'America/Mexico_City') AS cerrado_mx,
    s.starting_cash                                  AS fondo_inicial,
    p.num_pagos,
    -- Recalculado desde payments
    COALESCE(p.efectivo_calc, 0)       AS efectivo_calc,
    COALESCE(p.tarjeta_calc, 0)        AS tarjeta_calc,
    COALESCE(p.transferencia_calc, 0)  AS transferencia_calc,
    COALESCE(p.propina_calc, 0)        AS propina_calc,
    COALESCE(p.cambio_calc, 0)         AS cambio_calc,
    -- Recalculado desde cash_movements
    COALESCE(cm.depositos_drawer, 0)   AS depositos_drawer,
    COALESCE(cm.retiros_drawer, 0)     AS retiros_drawer,
    -- Efectivo esperado: recalculado vs guardado vs contado
    (s.starting_cash + COALESCE(p.efectivo_calc,0)
                     + COALESCE(cm.depositos_drawer,0)
                     - COALESCE(cm.retiros_drawer,0))  AS expected_cash_calc,
    s.expected_cash                                    AS expected_cash_guardado,
    s.cash_counted                                     AS efectivo_contado,
    s.difference                                       AS diferencia_guardada,
    -- DELTAS guardado - recalculado (deben ser 0)
    (s.total_efectivo      - COALESCE(p.efectivo_calc,0))      AS d_efectivo,
    (s.total_tarjeta       - COALESCE(p.tarjeta_calc,0))       AS d_tarjeta,
    (s.total_transferencia - COALESCE(p.transferencia_calc,0)) AS d_transferencia,
    (s.total_propinas      - COALESCE(p.propina_calc,0))       AS d_propinas,
    (s.total_retiros       - COALESCE(cm.retiros_drawer,0))    AS d_retiros
FROM shifts s
CROSS JOIN params
LEFT JOIN LATERAL (
    SELECT SUM(pay.efectivo)      AS efectivo_calc,
           SUM(pay.tarjeta)       AS tarjeta_calc,
           SUM(pay.transferencia) AS transferencia_calc,
           SUM(pay.tip_amount)    AS propina_calc,
           SUM(pay.change_given)  AS cambio_calc,
           COUNT(*)               AS num_pagos
    FROM payments pay
    WHERE pay.shift_id = s.id
) p ON true
LEFT JOIN LATERAL (
    SELECT SUM(amount) FILTER (WHERE destination_location = 'drawer') AS depositos_drawer,
           SUM(amount) FILTER (WHERE source_location      = 'drawer') AS retiros_drawer
    FROM cash_movements c
    WHERE c.shift_id = s.id
) cm ON true
WHERE (s.opened_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN (SELECT start_op FROM params) AND (SELECT end_op FROM params)
ORDER BY s.opened_at;


-- ============================================================================
-- BLOQUE 2 — INGRESOS POR DÍA OPERATIVO
-- Replica buildDailyRevenue del admin: ingreso = SUM(total_paid).
-- Compara estos números 1:1 contra "Ventas por día" del reporte admin.
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    (created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date AS dia_operativo,
    COUNT(*)                 AS num_pagos,
    SUM(total_paid)          AS ingreso_total,
    SUM(efectivo)            AS efectivo,
    SUM(tarjeta)             AS tarjeta,
    SUM(transferencia)       AS transferencia,
    SUM(tip_amount)          AS propinas,
    SUM(change_given)        AS cambio
FROM payments
CROSS JOIN params
WHERE (created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
GROUP BY 1
ORDER BY 1;


-- ============================================================================
-- BLOQUE 3 — GRAN TOTAL DEL PERIODO (cuadre rápido contra el total del admin)
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    COUNT(*)            AS num_pagos,
    SUM(total_paid)     AS ingreso_total,
    SUM(efectivo)       AS efectivo,
    SUM(tarjeta)        AS tarjeta,
    SUM(transferencia)  AS transferencia,
    SUM(tip_amount)     AS propinas,
    SUM(change_given)   AS cambio
FROM payments
CROSS JOIN params
WHERE (created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op;


-- ============================================================================
-- BLOQUE 4 — CONSISTENCIA INTERNA DE CADA PAGO
-- Debe regresar 0 filas. Detecta pagos donde la suma de métodos no cuadra
-- con el total cobrado (efectivo + tarjeta + transferencia != total_paid).
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    p.id, p.comanda_id, c.folio,
    p.total_paid,
    p.efectivo, p.tarjeta, p.transferencia,
    (p.efectivo + p.tarjeta + p.transferencia)               AS suma_metodos,
    (p.efectivo + p.tarjeta + p.transferencia - p.total_paid) AS descuadre
FROM payments p
CROSS JOIN params
LEFT JOIN comandas c ON c.id = p.comanda_id
WHERE (p.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
  AND ABS(p.efectivo + p.tarjeta + p.transferencia - p.total_paid) > 0.005
ORDER BY c.folio;


-- ============================================================================
-- BLOQUE 5 — COMANDA vs ITEMS vs PAGO (¿se cobró todo lo que se vendió?)
-- Para cada comanda pagada compara:
--   items_calc   = SUM(unit_price*quantity) de items activos NO gratis
--   final_total  = total guardado en la comanda
--   total_paid   = total efectivamente cobrado
-- Revisa filas donde d_items_vs_final o d_pago_vs_final != 0.
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    c.folio,
    c.id,
    c.final_total,
    c.tip_total,
    COALESCE(i.items_calc, 0)               AS items_calc,
    COALESCE(pg.total_paid, 0)              AS total_paid,
    COALESCE(pg.tip_amount, 0)              AS tip_pagado,
    pg.num_pagos,
    (COALESCE(i.items_calc,0)  - c.final_total) AS d_items_vs_final,
    (COALESCE(pg.total_paid,0) - c.final_total) AS d_pago_vs_final
FROM comandas c
CROSS JOIN params
LEFT JOIN LATERAL (
    SELECT SUM(unit_price * quantity) AS items_calc
    FROM comanda_items
    WHERE comanda_id = c.id
      AND status = 'active'
      AND is_free_mixer  = false
      AND is_free_benefit = false
) i ON true
LEFT JOIN LATERAL (
    SELECT SUM(total_paid) AS total_paid,
           SUM(tip_amount) AS tip_amount,
           COUNT(*)        AS num_pagos
    FROM payments WHERE comanda_id = c.id
) pg ON true
WHERE c.status = 'paid'
  AND (c.cobrado_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
ORDER BY c.folio;


-- ============================================================================
-- BLOQUE 6 — ANOMALÍAS DE INTEGRIDAD (debe regresar 0 filas en cada tipo)
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT * FROM (
    -- Comandas pagadas SIN registro de pago
    SELECT 'comanda_pagada_sin_pago' AS problema, c.folio::text AS ref, c.id::text AS id
    FROM comandas c
    CROSS JOIN params
    WHERE c.status = 'paid'
      AND (c.cobrado_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date BETWEEN start_op AND end_op
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.comanda_id = c.id)

    UNION ALL
    -- Pagos sin comanda (huérfanos)
    SELECT 'pago_sin_comanda', p.id::text, p.id::text
    FROM payments p
    CROSS JOIN params
    WHERE (p.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date BETWEEN start_op AND end_op
      AND NOT EXISTS (SELECT 1 FROM comandas c WHERE c.id = p.comanda_id)

    UNION ALL
    -- Pagos sin shift_id (no entran al cierre de turno)
    SELECT 'pago_sin_turno', p.id::text, p.id::text
    FROM payments p
    CROSS JOIN params
    WHERE (p.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date BETWEEN start_op AND end_op
      AND p.shift_id IS NULL

    UNION ALL
    -- Comandas pagadas con total nulo
    SELECT 'comanda_pagada_sin_total', c.folio::text, c.id::text
    FROM comandas c
    CROSS JOIN params
    WHERE c.status = 'paid'
      AND (c.cobrado_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date BETWEEN start_op AND end_op
      AND c.final_total IS NULL

    UNION ALL
    -- Comandas atoradas (no abiertas ni pagadas) — revisar manualmente
    SELECT 'comanda_estado_intermedio', c.folio::text, c.status
    FROM comandas c
    CROSS JOIN params
    WHERE c.status IN ('pending_payment', 'processing_payment')
      AND (c.opened_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date BETWEEN start_op AND end_op
) t
ORDER BY problema;


-- ============================================================================
-- BLOQUE 7 — VENTAS POR PRODUCTO
-- Compara contra el reporte de productos del admin.
-- NOTA: el admin tiene una regla especial para combos de cerveza (3x2/cubeta)
-- donde cuenta las cervezas "mixer" en lugar de la cantidad del combo. Esta
-- query usa el conteo directo; si un combo de cerveza no cuadra, es por eso
-- y lo revisamos aparte.
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    pr.name                              AS producto,
    cat.name                             AS categoria,
    SUM(ci.quantity)                     AS unidades,
    SUM(ci.unit_price * ci.quantity)     AS ingreso
FROM comanda_items ci
CROSS JOIN params
JOIN comandas c   ON c.id = ci.comanda_id
JOIN products pr  ON pr.id = ci.product_id
LEFT JOIN categories cat ON cat.id = pr.category_id
WHERE c.status = 'paid'
  AND ci.status = 'active'
  AND ci.is_free_mixer  = false
  AND ci.is_free_benefit = false
  AND (c.cobrado_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
GROUP BY 1, 2
ORDER BY ingreso DESC;


-- ============================================================================
-- BLOQUE 8 — VENTAS POR CATEGORÍA
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    COALESCE(cat.name, 'Sin categoría')  AS categoria,
    SUM(ci.quantity)                     AS unidades,
    SUM(ci.unit_price * ci.quantity)     AS ingreso
FROM comanda_items ci
CROSS JOIN params
JOIN comandas c  ON c.id = ci.comanda_id
JOIN products pr ON pr.id = ci.product_id
LEFT JOIN categories cat ON cat.id = pr.category_id
WHERE c.status = 'paid'
  AND ci.status = 'active'
  AND ci.is_free_mixer  = false
  AND ci.is_free_benefit = false
  AND (c.cobrado_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
GROUP BY 1
ORDER BY ingreso DESC;


-- ============================================================================
-- BLOQUE 9 — MOVIMIENTOS DE CAJA (detalle + resumen)
-- ============================================================================
-- 9a. Detalle
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    (cm.created_at AT TIME ZONE 'America/Mexico_City') AS fecha_mx,
    cm.type, cm.category, cm.movement_nature,
    cm.source_location, cm.destination_location,
    cm.amount, cm.note,
    u.name AS usuario
FROM cash_movements cm
CROSS JOIN params
LEFT JOIN users u ON u.id = cm.user_id
WHERE (cm.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
ORDER BY cm.created_at;

-- 9b. Resumen por naturaleza/ubicación
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    SUM(amount) FILTER (WHERE destination_location = 'drawer')      AS entradas_a_caja,
    SUM(amount) FILTER (WHERE source_location      = 'drawer')      AS salidas_de_caja,
    SUM(amount) FILTER (WHERE destination_location = 'house_safe')  AS a_caja_fuerte,
    SUM(amount) FILTER (WHERE destination_location = 'bank')        AS a_banco,
    SUM(amount) FILTER (WHERE movement_nature      = 'expense')     AS gastos
FROM cash_movements
CROSS JOIN params
WHERE (created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op;


-- ============================================================================
-- BLOQUE 10 — INVENTARIO: ¿se descontó todo lo vendido?
-- Debe regresar 0 filas. Lista items vendidos cuyo producto TIENE receta
-- activa pero NO generaron movimiento de inventario (sale_deduction).
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    c.folio,
    ci.id        AS comanda_item_id,
    pr.name      AS producto,
    ci.quantity
FROM comanda_items ci
CROSS JOIN params
JOIN comandas c        ON c.id = ci.comanda_id AND c.status = 'paid'
JOIN products pr       ON pr.id = ci.product_id
JOIN product_recipes rcp ON rcp.product_id = ci.product_id AND rcp.active = true
LEFT JOIN inventory_movements im
       ON im.comanda_item_id = ci.id AND im.movement_type = 'sale_deduction'
WHERE ci.status = 'active'
  AND (c.cobrado_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
  AND im.id IS NULL
ORDER BY c.folio;


-- ============================================================================
-- BLOQUE 11 — INVENTARIO: stock actual + consumo del periodo
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    ii.name,
    ii.unit_type,
    ii.current_stock,
    COALESCE(d.consumido, 0) AS consumido_periodo
FROM inventory_items ii
CROSS JOIN params
LEFT JOIN LATERAL (
    SELECT SUM(ABS(im.quantity_change)) AS consumido
    FROM inventory_movements im
    WHERE im.inventory_item_id = ii.id
      AND im.movement_type = 'sale_deduction'
      AND (im.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
          BETWEEN start_op AND end_op
) d ON true
WHERE ii.active = true
ORDER BY ii.current_stock ASC;


-- ============================================================================
-- BLOQUE 12 — MEMBRESÍAS vendidas/activadas en el periodo
-- Cross-check: las membresías cobradas vía comanda deben tener su pago contado.
-- ============================================================================
WITH params AS (SELECT date '2026-06-08' AS start_op, date '2026-06-21' AS end_op)
SELECT
    mp.name                 AS plan,
    mp.price_monthly,
    cm.month,
    cm.status,
    COUNT(*)                AS cantidad,
    COUNT(cm.paid_via_comanda_id) AS pagadas_via_comanda
FROM customer_memberships cm
CROSS JOIN params
JOIN membership_plans mp ON mp.id = cm.plan_id
WHERE (cm.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
GROUP BY mp.name, mp.price_monthly, cm.month, cm.status
ORDER BY mp.name;
