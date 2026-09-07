-- =====================================================================
-- DIAGNÓSTICO: faltante de $578.00 — turno del 5→6 de julio 2026
--
-- 100% SOLO LECTURA. Todos los bloques son SELECT. No modifica nada.
-- Correr en el SQL Editor de Supabase, bloque por bloque.
--
-- Contexto reconstruido desde el ledger (ver
-- tasks/conciliacion_bancaria_2026-09-06.md):
--
--   Fondo inicial (contado apertura 05-jul 11:18) ....  $   437.50
--   + 8 ventas en efectivo ..........................   $ 2,405.00
--   − propinas entregadas 21:22 ("préstamo memo 4 jul") $  -800.00
--   − propinas entregadas 23:57 ("PROPINAS 5/7") .....  $  -486.00
--   = ESPERADO en caja ..............................   $ 1,556.50
--     CONTADO físico al cierre (06-jul 00:01) .......   $   978.50
--     FALTANTE ......................................   $  -578.00
--
-- HIPÓTESIS PRINCIPAL: el faltante son propinas del 5 de julio que se
-- sacaron del cajón esa noche ANTES del conteo y se registraron hasta
-- la mañana siguiente. A las 08:37 del 6-jul hay un movimiento
-- "Propinas entregadas -$630.00 / Propinas julio 5 ajuste", envuelto en
-- un par Apertura/Cierre con Contado $0.00 (o sea, un ajuste
-- administrativo, no un turno real). $630 − $578 = $52 de diferencia.
--
-- El BLOQUE 4 es el que confirma o descarta la hipótesis.
-- =====================================================================


-- ── BLOQUE 1: el turno en cuestión ────────────────────────────────────
-- Debe regresar 1 fila: apertura 05-jul ~11:18, cierre 06-jul ~00:01,
-- starting_cash 437.50, cash_counted 978.50, difference -578.00.
SELECT
    s.id,
    s.opened_at AT TIME ZONE 'America/Mexico_City'  AS abierto,
    s.closed_at AT TIME ZONE 'America/Mexico_City'  AS cerrado,
    s.starting_cash,
    s.cash_counted,
    s.difference,
    s.expected_cash,
    s.total_efectivo,
    s.total_tarjeta,
    s.total_transferencia,
    s.total_propinas,          -- << CLAVE: propinas COBRADAS en el turno
    s.total_retiros,
    uo.name AS abrio,
    uc.name AS cerro
FROM shifts s
LEFT JOIN users uo ON uo.id = s.opened_by_user_id
LEFT JOIN users uc ON uc.id = s.closed_by_user_id
WHERE s.opened_at >= '2026-07-05T06:00:00-06:00'
  AND s.opened_at <  '2026-07-06T06:00:00-06:00'
ORDER BY s.opened_at;
-- Copia el "id" — es el <SHIFT_ID> de los bloques siguientes.


-- ── BLOQUE 2: los 19 cobros del turno, uno por uno ────────────────────
-- Esta es la "auditoría de tickets", pero hecha por consulta.
-- Revisa la columna `efectivo`: si algún cobro que aquí sale como
-- efectivo en realidad se cobró con tarjeta, ahí está el faltante.
-- (Ya pasó antes: ver tasks/correccion_pago_efectivo_tarjeta_2026-08-04.sql)
SELECT
    c.folio,
    p.created_at AT TIME ZONE 'America/Mexico_City' AS cobrado,
    c.status                AS estado_comanda,
    p.efectivo,
    p.tarjeta,
    p.transferencia,
    p.total_paid,
    p.tip_amount            AS propina,
    p.change_given          AS cambio,
    u.name                  AS cobro
FROM payments p
JOIN comandas c ON c.id = p.comanda_id
LEFT JOIN users u ON u.id = p.paid_by_user
WHERE p.shift_id = '<SHIFT_ID>'
ORDER BY p.created_at;
-- Esperado del ledger: 8 en efectivo ($2,405.00) + 11 con tarjeta,
-- y el folio #433 partido (efectivo $200.00 + tarjeta $830.00).


-- ── BLOQUE 3: todos los movimientos de efectivo del turno ─────────────
-- Esperado: solo 2 salidas de propinas (-$800.00 y -$486.00).
-- Si aparece algo más que toque el cajón, cambia la cuenta.
SELECT
    cm.created_at AT TIME ZONE 'America/Mexico_City' AS hora,
    cm.category,
    cm.type,
    cm.movement_nature,
    cm.source_location,
    cm.destination_location,
    cm.amount,
    cm.note,
    u.name AS quien
FROM cash_movements cm
LEFT JOIN users u ON u.id = cm.user_id
WHERE cm.shift_id = '<SHIFT_ID>'
ORDER BY cm.created_at;


-- ── BLOQUE 4: ⭐ LA PRUEBA — propinas cobradas vs entregadas del 5-jul ──
-- Si "cobradas" ≈ $1,116.00 (= $486 entregados esa noche + $630 del
-- ajuste de la mañana siguiente), la hipótesis queda confirmada: el
-- faltante son propinas que salieron del cajón antes del conteo.
--
-- Si "cobradas" ≈ $486.00, el $630 de la mañana siguiente fue otra cosa
-- y el faltante de $578 sigue sin explicación → hay que buscar en otro
-- lado (bloques 2 y 5).
SELECT
    'Propinas COBRADAS el día operativo 5-jul' AS concepto,
    COALESCE(SUM(p.tip_amount), 0)             AS monto,
    COUNT(*)                                   AS n
FROM payments p
WHERE p.created_at >= '2026-07-05T06:00:00-06:00'
  AND p.created_at <  '2026-07-06T06:00:00-06:00'
UNION ALL
SELECT
    'Propinas ENTREGADAS por el 5-jul (esa noche + ajuste del 6-jul)',
    COALESCE(SUM(cm.amount), 0),
    COUNT(*)
FROM cash_movements cm
WHERE cm.category = 'propinas_entregadas'
  AND cm.created_at >= '2026-07-05T20:00:00-06:00'
  AND cm.created_at <  '2026-07-06T10:00:00-06:00';
-- Nota: el rango de "entregadas" arranca a las 20:00 a propósito, para
-- excluir el préstamo de $800 que corresponde a las propinas del 4-jul.


-- ── BLOQUE 5: los 2 folios que desaparecieron de la secuencia ─────────
-- En ese turno faltan los folios #439 y #443 (no tienen fila en
-- `payments`). Si están 'cancelled' es normal. Si están 'open' o
-- 'pending_payment' CON items, es consumo que nunca se cobró.
SELECT
    c.folio,
    c.status,
    c.created_at AT TIME ZONE 'America/Mexico_City' AS abierta,
    c.closed_at  AT TIME ZONE 'America/Mexico_City' AS cerrada,
    c.total,
    c.final_total,
    (SELECT COUNT(*) FROM comanda_items ci
      WHERE ci.comanda_id = c.id AND ci.status = 'active') AS items_activos,
    (p.id IS NOT NULL) AS tiene_pago
FROM comandas c
LEFT JOIN payments p ON p.comanda_id = c.id
WHERE c.folio IN (439, 443)
ORDER BY c.folio;


-- ── BLOQUE 6: qué se consumió en esos folios (solo si el 5 los marca vivos) ──
SELECT
    c.folio,
    pr.name AS producto,
    ci.quantity,
    ci.unit_price,
    ci.status
FROM comanda_items ci
JOIN comandas c ON c.id = ci.comanda_id
LEFT JOIN products pr ON pr.id = ci.product_id
WHERE c.folio IN (439, 443)
ORDER BY c.folio, pr.name;


-- ── BLOQUE 7: contexto — el par administrativo del 6-jul por la mañana ─
-- Debe mostrar 2 turnos con starting_cash = 0 y cash_counted = 0,
-- envolviendo el ajuste de propinas de $630.
SELECT
    s.id,
    s.opened_at AT TIME ZONE 'America/Mexico_City' AS abierto,
    s.closed_at AT TIME ZONE 'America/Mexico_City' AS cerrado,
    s.starting_cash,
    s.cash_counted,
    s.difference,
    s.total_propinas
FROM shifts s
WHERE s.opened_at >= '2026-07-06T06:00:00-06:00'
  AND s.opened_at <  '2026-07-07T06:00:00-06:00'
ORDER BY s.opened_at;
