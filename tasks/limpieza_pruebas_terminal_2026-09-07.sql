-- =====================================================================
-- LIMPIEZA · borrar los 2 cobros de prueba del selector de terminal
-- Generado 2026-09-07
--
-- Folios 864 (getnet, $30) y 865 (mp, $30), mesa "Test mesa", 6-sep-2026.
-- Javi confirmó que NO fueron cargos reales — solo se escribió el monto en
-- el POS, no se pasó ninguna tarjeta. Por eso se pueden borrar sin dejar
-- hueco contra los estados de cuenta.
--
-- NO ejecutar de un jalón. Bloque por bloque, en orden.
-- BLOQUES 1-3 son SELECT (no cambian nada). El DELETE está en el 4.
--
-- ORDEN DE BORRADO (importa):
--   1º comanda_items  — su FK a comandas es solo ON UPDATE CASCADE, NO
--                       ON DELETE. Si se borra la comanda primero, truena.
--   2º comandas       — `payments` (ON DELETE CASCADE) y `comanda_events`
--                       (ON DELETE CASCADE) se van solos.
--
-- Los `inventory_movements` NO se borran: su FK a comanda_items es
-- ON DELETE SET NULL, así que la fila se queda con el link en NULL. El log
-- de inventario sigue siendo honesto (sí hubo una deducción), solo pierde
-- a qué venta pertenecía. El BLOQUE 3 dice si hubo alguna.
-- =====================================================================


-- ── BLOQUE 1: confirmar QUÉ se va a borrar ───────────────────────────
-- Deben salir exactamente 2 filas: folios 864 y 865, status 'paid',
-- $30 de tarjeta cada una, del 6-sep-2026, mesa "Test mesa".
-- Si sale algo distinto, PARA aquí.
SELECT
    c.folio,
    c.id                                            AS comanda_id,
    c.status,
    u.name                                          AS mesa,
    c.opened_at  AT TIME ZONE 'America/Mexico_City' AS abierta,
    c.cobrado_at AT TIME ZONE 'America/Mexico_City' AS cobrada,
    c.final_total,
    c.tip_total,
    p.efectivo,
    p.tarjeta,
    p.transferencia,
    p.tip_amount,
    p.card_terminal,
    s.status                                        AS estado_del_turno,
    (SELECT COUNT(*) FROM comanda_items ci WHERE ci.comanda_id = c.id) AS items,
    (SELECT COUNT(*) FROM comanda_events ce WHERE ce.comanda_id = c.id) AS eventos
FROM comandas c
LEFT JOIN payments p ON p.comanda_id = c.id
LEFT JOIN units    u ON u.id = c.unit_id
LEFT JOIN shifts   s ON s.id = p.shift_id
WHERE c.folio IN (864, 865);
-- ⚠️ Mira `estado_del_turno`: si dice 'closed', avísame ANTES de borrar.
--    Los totales del turno (shifts.total_tarjeta, etc.) se congelan al
--    cerrar, así que quedarían $60 arriba de la realidad y hay que
--    corregirlos aparte. Si dice 'open', no hay problema: se recalculan
--    al cerrar.


-- ── BLOQUE 2: confirmar que NADA MÁS depende de estas comandas ───────
-- Estas dos FKs NO tienen cascada — si alguna trae filas, el DELETE
-- fallaría. Ambas deben dar 0.
SELECT 'customer_memberships' AS tabla, COUNT(*) AS filas
FROM customer_memberships
WHERE paid_via_comanda_id IN (SELECT id FROM comandas WHERE folio IN (864, 865))
UNION ALL
SELECT 'membership_benefit_usage', COUNT(*)
FROM membership_benefit_usage
WHERE comanda_id IN (SELECT id FROM comandas WHERE folio IN (864, 865));


-- ── BLOQUE 3: ¿se descontó inventario? ───────────────────────────────
-- Javi cree que el agua mineral no tiene receta activa ahorita. Esto lo
-- confirma. Si sale 0 filas, no hay stock fantasma y no hay nada que
-- hacer. Si salen filas, avísame antes de seguir y te preparo el ajuste
-- que regresa el stock.
SELECT
    c.folio,
    pr.name                AS producto,
    ii.name                AS insumo,
    im.movement_type,
    im.quantity_change,
    im.note
FROM inventory_movements im
JOIN comanda_items ci ON ci.id = im.comanda_item_id
JOIN comandas      c  ON c.id = ci.comanda_id
LEFT JOIN products        pr ON pr.id = im.product_id
LEFT JOIN inventory_items ii ON ii.id = im.inventory_item_id
WHERE c.folio IN (864, 865);


-- =====================================================================
-- ⛔ A PARTIR DE AQUÍ SÍ BORRA. Solo corre el bloque 4 si los bloques
--    1, 2 y 3 salieron como se espera.
-- =====================================================================

-- ── BLOQUE 4: el borrado ─────────────────────────────────────────────
-- Va en una transacción: o se borra todo, o no se borra nada.
BEGIN;

    -- 1º los items (su FK a comandas no tiene ON DELETE)
    DELETE FROM comanda_items
    WHERE comanda_id IN (SELECT id FROM comandas WHERE folio IN (864, 865));

    -- 2º las comandas — payments y comanda_events se van en cascada
    DELETE FROM comandas
    WHERE folio IN (864, 865);

COMMIT;


-- ── BLOQUE 5: ⭐ VERIFICACIÓN ─────────────────────────────────────────
-- Las tres deben dar 0.
SELECT 'comandas 864/865 que quedan' AS check, COUNT(*) AS filas
FROM comandas WHERE folio IN (864, 865)
UNION ALL
SELECT 'payments huérfanos', COUNT(*)
FROM payments p WHERE NOT EXISTS (SELECT 1 FROM comandas c WHERE c.id = p.comanda_id)
UNION ALL
SELECT 'comanda_items huérfanos', COUNT(*)
FROM comanda_items ci WHERE NOT EXISTS (SELECT 1 FROM comandas c WHERE c.id = ci.comanda_id);


-- ── BLOQUE 6: ⭐ que el backfill de terminal siga intacto ─────────────
-- Debe volver a dar los mismos totales de antes de las pruebas:
--   mp      $195,114.27
--   getnet  $ 91,685.14
--   suma    $286,799.41
SELECT p.card_terminal, COUNT(*) AS folios, SUM(p.tarjeta) AS bruto
FROM payments p
WHERE p.tarjeta > 0
GROUP BY p.card_terminal
ORDER BY p.card_terminal;
