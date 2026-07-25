-- ============================================================================
--  AUDITORÍA BANCO + PROPINAS — Continental POS
--  Generado: 2026-07-25  ·  Periodo: 2026-07-01 a 2026-07-25 (ajustable)
-- ----------------------------------------------------------------------------
--  CONTEXTO
--  Javi mandó capturas de los movimientos reales de Mercado Pago (banco) y un
--  export del Ledger del sistema (tasks/../ledger_2026-07-19_2026-07-25.csv).
--  El CSV solo trae el delta AGREGADO de "Banco" por folio (tarjeta+
--  transferencia juntos) y el texto humano del cash_movement — no alcanza
--  para separar tarjeta (con comisión MP) de transferencia (llega íntegra),
--  ni para reconstruir cuánta propina se cobró realmente en efectivo por
--  turno. Estos 4 bloques traen esos datos en crudo.
--
--  CÓMO USARLO
--  1. Corre cada bloque por separado en el SQL Editor de Supabase.
--  2. Si quieres otro rango, ajusta start_op / end_op en CADA bloque (son
--     días operativos, no fechas de calendario — ver nota abajo).
--  3. Pégame los resultados de los 4 bloques (CSV o tabla, como te acomode).
--
--  DÍA OPERATIVO: el bar corta a las 06:00 hora MX (America/Mexico_City).
--      (ts AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
--  replica operationalDateKey() del código.
--
--  CONFIRMADO EN CÓDIGO (src/utils/payments.js → computePaymentBreakdown):
--      totalDue  = total_venta + propina
--      totalPaid = efectivo_neto + tarjeta + transferencia   (debe = totalDue)
--  → la propina NO tiene columna propia por método: si el cliente pagó todo
--  en efectivo, la propina completa vive dentro de `efectivo`; si pagó con
--  tarjeta, vive dentro de `tarjeta`. tip_amount es el monto total de
--  propina del pago, sin importar el método. Por eso el Bloque 3 compara
--  SUM(tip_amount) por turno contra el cash_movement "Propinas entregadas"
--  — un delta ahí puede ser real (propina cobrada por tarjeta, pagada en
--  efectivo al staff = sale del negocio, no es descuadre) o puede ser el
--  hueco conocido de "ventas sin propina" (ver tasks/todo.md backlog).
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 — PAGOS DETALLE (para separar tarjeta vs transferencia por folio)
-- Con esto puedo saber, para cada entrada "Folio cobrado" del CSV, cuánto de
-- ese delta de Banco corresponde a tarjeta (sujeto a comisión MP, llega vía
-- "Liberación de dinero" días después) vs transferencia (llega íntegra,
-- mismo día). Es la pieza que falta para cruzar contra tus capturas.
-- ============================================================================
WITH params AS (SELECT date '2026-07-01' AS start_op, date '2026-07-25' AS end_op)
SELECT
    p.id,
    p.created_at,
    (p.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date AS dia_operativo,
    c.folio,
    p.shift_id,
    p.efectivo,
    p.tarjeta,
    p.transferencia,
    p.tip_amount,
    p.change_given,
    p.total_paid
FROM payments p
JOIN comandas c ON c.id = p.comanda_id
CROSS JOIN params
WHERE (p.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
ORDER BY p.created_at;


-- ============================================================================
-- BLOQUE 2 — CASH_MOVEMENTS DETALLE (categoría cruda, no el texto del CSV)
-- Necesito category/movement_nature/source/destination exactos para separar
-- limpio: qué tocó "bank" (para cruzar contra el banco), qué categoría se
-- usó para cada nota, y quién lo capturó.
-- ============================================================================
WITH params AS (SELECT date '2026-07-01' AS start_op, date '2026-07-25' AS end_op)
SELECT
    m.id,
    m.created_at,
    (m.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date AS dia_operativo,
    m.shift_id,
    m.type,
    m.category,
    m.movement_nature,
    m.source_location,
    m.destination_location,
    m.amount,
    m.note,
    u.name AS capturado_por
FROM cash_movements m
LEFT JOIN users u ON u.id = m.user_id
CROSS JOIN params
WHERE (m.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
ORDER BY m.created_at;


-- ============================================================================
-- BLOQUE 3 — RECONCILIACIÓN DE PROPINAS POR TURNO
-- Compara lo que el sistema calcula que se cobró de propina (SUM tip_amount
-- de payments) contra lo que realmente salió como "Propinas entregadas"
-- (cash_movement, category ilike '%propina%'). d_propina != 0 es la señal
-- a explicar turno por turno.
-- ============================================================================
WITH params AS (SELECT date '2026-07-01' AS start_op, date '2026-07-25' AS end_op)
SELECT
    s.id AS shift_id,
    (s.opened_at AT TIME ZONE 'America/Mexico_City') AS abierto_mx,
    s.starting_cash,
    s.cash_counted,
    s.difference AS dif_turno_guardada,
    COALESCE(p.propina_cobrada, 0)   AS propina_cobrada_sistema,
    COALESCE(cm.propina_entregada, 0) AS propina_entregada_caja,
    (COALESCE(p.propina_cobrada, 0) - COALESCE(cm.propina_entregada, 0)) AS d_propina
FROM shifts s
CROSS JOIN params
LEFT JOIN LATERAL (
    SELECT SUM(tip_amount) AS propina_cobrada
    FROM payments pay
    WHERE pay.shift_id = s.id
) p ON true
LEFT JOIN LATERAL (
    SELECT SUM(amount) AS propina_entregada
    FROM cash_movements c
    WHERE c.shift_id = s.id
      AND c.category ILIKE '%propina%'
) cm ON true
WHERE (s.opened_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN (SELECT start_op FROM params) AND (SELECT end_op FROM params)
ORDER BY s.opened_at;


-- ============================================================================
-- BLOQUE 4 — NÓMINA: cash_movements vs payroll_records
-- Cruza cada movimiento de "Nómina (caja/banco)" contra las semanas de
-- nómina cerradas, para detectar pagos duplicados o no reflejados
-- (ej. la secuencia rara del 24/jul: Nómina caja -$538 Javier → Ajuste
-- ingreso +$538 "error" → Nómina banco -$538 "julio 19" — confirmar que
-- solo se pagó una vez).
-- ============================================================================
WITH params AS (SELECT date '2026-07-01' AS start_op, date '2026-07-25' AS end_op)
SELECT
    m.created_at,
    m.category,
    m.amount,
    m.note,
    m.shift_id
FROM cash_movements m
CROSS JOIN params
WHERE m.category ILIKE '%n%mina%'
  AND (m.created_at AT TIME ZONE 'America/Mexico_City' - interval '6 hours')::date
      BETWEEN start_op AND end_op
ORDER BY m.created_at;

WITH params AS (SELECT date '2026-07-01' AS start_op, date '2026-07-25' AS end_op)
SELECT
    pr.week_start,
    pr.employee_id,
    pr.total_pay,
    pr.voided_at,
    pr.created_at
FROM payroll_records pr
CROSS JOIN params
WHERE pr.week_start BETWEEN (SELECT start_op FROM params) AND (SELECT end_op FROM params)
ORDER BY pr.week_start, pr.employee_id;
