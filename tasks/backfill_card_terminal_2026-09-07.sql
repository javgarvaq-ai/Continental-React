-- =====================================================================
-- FASE 0 + FASE 1 · Backfill de `payments.card_terminal`
-- Generado 2026-09-07 · plan v3 en tasks/todo.md
--
-- NO ejecutar automáticamente. Correr en el SQL Editor de Supabase,
-- BLOQUE por BLOQUE, en orden. Los bloques 1-2 son SELECT (no cambian
-- nada). Si algo ahí no coincide, PARA y avísame antes de seguir.
--
-- Requiere que la migración que crea la columna ya esté aplicada.
-- =====================================================================
--
-- CÓMO SE CLASIFICÓ (revisable, no es una suposición)
--
-- Se comparó cada venta con tarjeta del ledger contra las 353
-- "Liberación de dinero" del estado de cuenta de Mercado Pago, que son
-- una por venta, del mismo día, netas de 4.06%. Lo que Mercado Pago
-- liberó fue por terminal 1; el resto fue Getnet.
--
--   REGLA BASE  ·  folio <= 572  -> mp        (285 folios, $180,440.50)
--                  folio >= 573  -> getnet    (175 folios, $110,308.91)
--
--   El corte es limpio: la última venta con tarjeta antes del 25-jul es
--   el folio 572 y la primera después es el 574. No hay traslape.
--
--   EXCEPCIONES · 9 días de la era Getnet en los que TAMBIÉN se cobró
--   por Mercado Pago. Los 24 folios se identificaron uno por uno contra
--   su liberación, y los 9 días cierran al centavo:
--
--     día          MP esperado   MP asignado   folios
--     2026-07-25       724.90        724.90    573
--     2026-07-26     1,972.40      1,972.40    585, 590, 591, 593
--     2026-07-28       216.00        216.00    600
--     2026-08-07     4,331.68      4,331.67    667, 669, 674, 676, 677
--     2026-08-08       760.70        760.70    678, 679
--     2026-08-09     3,746.55      3,746.55    681, 683, 684, 686
--     2026-08-13     3,279.59      3,279.20    700, 701, 702, 703, 704
--     2026-08-20       424.35        424.35    752
--     2026-09-04       248.00        248.00    833
--     TOTAL         15,704.17     15,703.77
--
--   RESULTADO (sobre la columna Banco del ledger = tarjeta + transferencia):
--                  mp     309 folios  $196,144.27
--                  getnet 151 folios  $ 94,605.14
--                  suma   460 folios  $290,749.41  ✓ (cuadra con el total
--                  de tarjeta+transferencia de las pantallas de Cierre Mensual)
--
--   ⚠️ OJO AL VERIFICAR: los UPDATE de abajo solo tocan pagos con `tarjeta > 0`.
--   Los cobros por SPEI del cliente ($3,950 en el periodo) NO son tarjeta y se
--   quedan con `card_terminal` en NULL, a propósito. Por eso al sumar SOLO la
--   columna `tarjeta` los totales bajan así:
--
--                  mp     $195,114.27   (196,144.27 − 1,030 de SPEI de junio)
--                  getnet $ 91,685.14   ( 94,605.14 − 2,920 de SPEI jul/ago)
--                  suma   $286,799.41   ✓ = "Tarjeta" de Cierre Mensual
--
--   Los MONTOS son la prueba dura. Los CONTEOS de folios son aproximados,
--   porque no sé cuáles cobros por SPEI venían solos y cuáles mezclados con
--   tarjeta en el mismo folio.
--
--   CONTROL     ·  (mp bruto − $1,030 de SPEI de junio) × 0.9594
--                  = $187,192.63  vs  $187,316.75 de liberaciones reales
--                  = −$124.12 de diferencia (0.07%), exactamente el mismo
--                  residuo que ya se había medido en la auditoría.
-- =====================================================================


-- ── BLOQUE 1: foto ANTES de tocar nada ────────────────────────────────
-- Lo que importa: tarjeta_total = $286,799.41 EXACTO, y sin_terminal igual
-- al número de pagos (o sea, todos en NULL todavía).
-- pagos_con_tarjeta anda por ~450-460 (menos de 460 porque algunos folios
-- fueron solo SPEI del cliente, sin tarjeta).
SELECT
    COUNT(*)                                    AS pagos_con_tarjeta,
    SUM(p.tarjeta)                              AS tarjeta_total,
    COUNT(*) FILTER (WHERE p.card_terminal IS NULL) AS sin_terminal
FROM payments p
WHERE p.tarjeta > 0;


-- ── BLOQUE 2: confirmar el corte del folio 572/574 ───────────────────
-- Debe mostrar que 572 es del 24-jul (o antes) y 574 del 25-jul (o después).
SELECT c.folio, p.created_at AT TIME ZONE 'America/Mexico_City' AS cobrado, p.tarjeta
FROM payments p
JOIN comandas c ON c.id = p.comanda_id
WHERE p.tarjeta > 0 AND c.folio BETWEEN 570 AND 578
ORDER BY c.folio;


-- ── BLOQUE 3: regla base — todo lo anterior al corte es Mercado Pago ──
UPDATE payments p
SET    card_terminal = 'mp'
FROM   comandas c
WHERE  c.id = p.comanda_id
  AND  p.tarjeta > 0
  AND  c.folio <= 572;
-- Esperado: ~281-285 filas (los folios <= 572 que sí tienen tarjeta).


-- ── BLOQUE 4: regla base — todo lo posterior al corte es Getnet ───────
UPDATE payments p
SET    card_terminal = 'getnet'
FROM   comandas c
WHERE  c.id = p.comanda_id
  AND  p.tarjeta > 0
  AND  c.folio >= 573;
-- Esperado: ~171-175 filas (los folios >= 573 que sí tienen tarjeta).


-- ── BLOQUE 5: excepciones — 24 folios de la era Getnet que fueron MP ──
UPDATE payments p
SET    card_terminal = 'mp'
FROM   comandas c
WHERE  c.id = p.comanda_id
  AND  p.tarjeta > 0
  AND  c.folio IN (573, 585, 590, 591, 593, 600,
                   667, 669, 674, 676, 677, 678, 679,
                   681, 683, 684, 686,
                   700, 701, 702, 703, 704,
                   752, 833);
-- Esperado: 24 filas.


-- ── BLOQUE 6: ⭐ VERIFICACIÓN — el reparto final ──────────────────────
-- Los MONTOS deben dar EXACTAMENTE esto (los conteos son aproximados):
--   mp      ~305   195,114.27
--   getnet  ~151    91,685.14
--   suma           286,799.41   <- este es el que no puede fallar
--
-- Si la suma da $286,799.41 y el reparto da esos dos montos, quedó bien.
-- Si la suma da $290,749.41, algún UPDATE agarró cobros por SPEI que no
-- debía: revisa que los tres UPDATE traigan `p.tarjeta > 0`.
SELECT p.card_terminal, COUNT(*) AS folios, SUM(p.tarjeta) AS bruto
FROM payments p
WHERE p.tarjeta > 0
GROUP BY p.card_terminal
ORDER BY p.card_terminal;


-- ── BLOQUE 7: ⭐ VERIFICACIÓN — que ninguna venta quedó sin terminal ──
-- Debe dar 0 filas.
SELECT c.folio, p.created_at AT TIME ZONE 'America/Mexico_City' AS cobrado, p.tarjeta
FROM payments p
JOIN comandas c ON c.id = p.comanda_id
WHERE p.tarjeta > 0 AND p.card_terminal IS NULL
ORDER BY c.folio;


-- ── BLOQUE 8: ⭐ VERIFICACIÓN día por día contra el banco ─────────────
-- Para cada día operativo, `mp_neto` debe dar la suma de las
-- "Liberación de dinero" de ese día en el estado de cuenta de Mercado
-- Pago. Es la prueba de que el backfill quedó bien, no solo de que
-- corrió. Los 9 días de excepción son los que hay que mirar con lupa.
SELECT
    (p.created_at AT TIME ZONE 'America/Mexico_City')::date AS dia,
    SUM(p.tarjeta) FILTER (WHERE p.card_terminal = 'mp')              AS mp_bruto,
    ROUND(SUM(p.tarjeta) FILTER (WHERE p.card_terminal = 'mp') * 0.9594, 2) AS mp_neto,
    SUM(p.tarjeta) FILTER (WHERE p.card_terminal = 'getnet')          AS getnet_bruto,
    ROUND(SUM(p.tarjeta) FILTER (WHERE p.card_terminal = 'getnet') * 0.9783, 2) AS getnet_neto
FROM payments p
WHERE p.tarjeta > 0
GROUP BY 1
ORDER BY 1;


-- ── ROLLBACK (por si algo sale mal) ──────────────────────────────────
-- Deja todo como estaba. La columna es informativa: ponerla en NULL no
-- rompe nada mientras el ledger tenga fallback (ver plan v3, Fase 3).
-- UPDATE payments SET card_terminal = NULL WHERE tarjeta > 0;
