-- ============================================================================
-- AUDITORIA MENSUAL — Continental POS
-- Archivo reutilizable. Solo SELECT: NO modifica nada.
--
-- COMO USARLO (cada mes, dia 1):
--   1. Corre el BLOQUE 1 (scorecard) y pegale el resultado a Claude.
--   2. Claude te dira cuales bloques de detalle (2..9) correr; solo los marcados REVISAR.
--   3. Para cambiar de mes: en el editor, Buscar y Reemplazar las dos fechas
--      '2026-09-01 00:00-06' (ini) y '2026-10-01 00:00-06' (fin) por las del mes nuevo.
--      Mexico no tiene horario de verano: -06 todo el anio.
--
-- Umbral de "monto raro": $18,000 (decision de Javi 2026-10-04). Cambialo en el BLOQUE 1 y 8.
-- Excepciones: 3 movimientos revisados por Javi (31/32 legitimos) y los 21 movimientos de septiembre capturados el 2026-10-04 y
-- re-fechados (tasks/refechar_movimientos_sept_2026-10-04.sql). Cuelgan de un turno de
-- octubre pero tienen fecha de septiembre; se cuentan aparte como "explicados".
-- Terminales de tarjeta: factor neto mp 0.9594, getnet 0.9783 (src/utils/ledger.js).
-- ============================================================================


-- ===== BLOQUE 1: SCORECARD (corre este y pega el resultado) ================
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
pay AS (SELECT y.* FROM payments y, p WHERE y.created_at >= p.ini AND y.created_at < p.fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin),
exc(id) AS (VALUES
    ('5cbc123c-c941-48d8-a784-4e5cd90b18cb'::uuid),
    ('badf5c47-2125-487b-96fc-4789278e3748'::uuid),
    ('7ea9ca41-d9cc-4b7b-bb7d-c87ccf9d54d5'::uuid),
    ('5a2770d3-94a5-4c23-8212-41d530b828a2'::uuid),
    ('6322b549-18f1-42cf-a55e-de14b7fa8c75'::uuid),
    ('b6fdbc22-f93f-4f39-a56d-98c120ffa4a0'::uuid),
    ('370519a6-d841-4186-85bb-a192fae5d84c'::uuid),
    ('a46cb99b-55ba-4593-841a-76397d04afc5'::uuid),
    ('795908a6-1e3f-4433-8948-424909d6b157'::uuid),
    ('5fb3382b-8024-458a-b782-d43ea14723c5'::uuid),
    ('6743d35c-17a5-41b1-8ec5-07a2967e43e4'::uuid),
    ('2ab5ff81-17b7-4fd1-97e7-0b26ff430e0f'::uuid),
    ('55657f30-d28f-4374-badf-c47ac6a650b7'::uuid),
    ('1da43396-2049-4908-bc90-73d52b33ef11'::uuid),
    ('549a2fa8-f324-41d5-9020-edc5fcb69060'::uuid),
    ('1ceba901-0cca-4f25-8d7a-702f6fc2719a'::uuid),
    ('5977706d-98be-4818-a491-35be21eb08ef'::uuid),
    ('d90216a3-e507-4cf5-bf5d-aafb549ddc0d'::uuid),
    ('d1c929b9-8093-4871-b651-4143092c3b5c'::uuid),
    ('502e27cc-14a0-4893-82ff-2b77d2237a6b'::uuid),
    ('372a5997-0958-4f3f-a143-d8120ecc2ed1'::uuid),
    ('cdae9bf7-85e0-42c6-a8b9-36528b8245bc'::uuid),
    ('576b3446-72aa-425c-90f3-3bdbaff6fcdb'::uuid),
    ('3d2d47bc-02af-42ad-bd2b-8a1a3de9bf55'::uuid)
),
nota_mes AS (
    SELECT m.id, m.created_at, m.amount, m.note,
           CASE left((regexp_match(lower(m.note), '\y(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sept|sep|octubre|oct|noviembre|nov|diciembre|dic)\y'))[1], 3)
                WHEN 'ene' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'abr' THEN 4
                WHEN 'may' THEN 5 WHEN 'jun' THEN 6 WHEN 'jul' THEN 7 WHEN 'ago' THEN 8
                WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dic' THEN 12 END AS mes_nota,
           extract(month FROM m.created_at AT TIME ZONE 'America/Mexico_City')::int AS mes_fecha
    FROM mov m
    WHERE m.note IS NOT NULL
),
fuera_turno AS (
    SELECT m.id, m.created_at, s.opened_at, m.amount, m.note
    FROM mov m JOIN shifts s ON s.id = m.shift_id
    WHERE m.created_at < s.opened_at - interval '1 minute'
),
cierres AS (SELECT s.* FROM shifts s, p WHERE s.status = 'closed' AND s.closed_at >= p.ini AND s.closed_at < p.fin),
aperturas AS (
    SELECT id, opened_at, starting_cash, prev_counted FROM (
        SELECT s.id, s.opened_at, s.starting_cash,
               lag(s.cash_counted) OVER (ORDER BY s.opened_at) AS prev_counted,
               lag(s.status)       OVER (ORDER BY s.opened_at) AS prev_status
        FROM shifts s
    ) x, p
    WHERE x.opened_at >= p.ini AND x.opened_at < p.fin
      AND x.prev_status = 'closed' AND x.prev_counted IS NOT NULL
      AND x.starting_cash <> x.prev_counted
),
dups AS (
    SELECT shift_id, amount, lower(btrim(note)) AS nota,
           (created_at AT TIME ZONE 'America/Mexico_City')::date AS dia, count(*) AS veces
    FROM mov
    GROUP BY 1, 2, 3, 4
    HAVING count(*) > 1
),
acum AS (
    SELECT
      (SELECT coalesce(sum(coalesce(y.tarjeta,0) + coalesce(y.transferencia,0)),0)
         FROM payments y, p WHERE y.created_at < p.fin)
      +
      (SELECT coalesce(sum((CASE WHEN m.destination_location = 'bank' THEN m.amount ELSE 0 END)
                         - (CASE WHEN m.source_location      = 'bank' THEN m.amount ELSE 0 END)),0)
         FROM cash_movements m, p WHERE m.created_at < p.fin)              AS saldo_banco,
      (SELECT coalesce(sum(coalesce(y.tarjeta,0) *
                (1 - CASE y.card_terminal WHEN 'getnet' THEN 0.9783 ELSE 0.9594 END)),0)
         FROM payments y, p WHERE y.created_at < p.fin)                    AS comision_acum,
      (SELECT coalesce(sum((CASE WHEN m.destination_location = 'house_safe' THEN m.amount ELSE 0 END)
                         - (CASE WHEN m.source_location      = 'house_safe' THEN m.amount ELSE 0 END)),0)
         FROM cash_movements m, p WHERE m.created_at < p.fin)              AS saldo_resguardo
)
SELECT orden, chequeo, resultado, esperado, estado FROM (
  -- ---- Resumen del mes (informativo) ----
  SELECT 10 AS orden, 'Folios cobrados' AS chequeo, (SELECT count(*) FROM pay)::numeric AS resultado, '-' AS esperado, 'INFO' AS estado
  UNION ALL SELECT 11, 'Efectivo cobrado',          (SELECT round(coalesce(sum(efectivo),0),2) FROM pay), '-', 'INFO'
  UNION ALL SELECT 12, 'Tarjeta terminal mp',       (SELECT round(coalesce(sum(tarjeta),0),2) FROM pay WHERE card_terminal = 'mp'), '-', 'INFO'
  UNION ALL SELECT 13, 'Tarjeta terminal getnet',   (SELECT round(coalesce(sum(tarjeta),0),2) FROM pay WHERE card_terminal = 'getnet'), '-', 'INFO'
  UNION ALL SELECT 14, 'Transferencia (cliente)',   (SELECT round(coalesce(sum(transferencia),0),2) FROM pay), '-', 'INFO'
  UNION ALL SELECT 15, 'Propinas cobradas',         (SELECT round(coalesce(sum(tip_amount),0),2) FROM pay), '-', 'INFO'
  UNION ALL SELECT 20, 'Gastos totales (expense)',  (SELECT round(coalesce(sum(amount),0),2) FROM mov WHERE movement_nature = 'expense'), '-', 'INFO'
  UNION ALL SELECT 21, 'Gastos operativos (sin propinas entregadas)', (SELECT round(coalesce(sum(amount),0),2) FROM mov WHERE movement_nature = 'expense' AND category IS DISTINCT FROM 'propinas_entregadas'), '-', 'INFO'
  -- ---- Chequeos ----
  UNION ALL SELECT 30, 'Gastos sin nota', n::numeric, '0', CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT count(*) AS n FROM mov WHERE movement_nature = 'expense' AND (note IS NULL OR btrim(note) = '')) a
  UNION ALL SELECT 31, 'Nota con mes distinto a la fecha', n::numeric, '0', CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT count(*) AS n FROM nota_mes WHERE mes_nota IS NOT NULL AND mes_nota <> mes_fecha AND id NOT IN (SELECT id FROM exc)) a
  UNION ALL SELECT 32, 'Movimiento fechado ANTES de abrir su turno (sin explicar)', n::numeric, '0', CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT count(*) AS n FROM fuera_turno WHERE id NOT IN (SELECT id FROM exc)) a
  UNION ALL SELECT 33, 'Movimientos explicados (re-fechados 4-oct + revisados por Javi)', n::numeric, 'excepcion conocida', 'INFO'
    FROM (SELECT count(*) AS n FROM fuera_turno WHERE id IN (SELECT id FROM exc)) a
  UNION ALL SELECT 40, 'Turnos cerrados en el mes', (SELECT count(*) FROM cierres)::numeric, '-', 'INFO'
  UNION ALL SELECT 41, 'Turnos con diferencia de caja <> 0', n::numeric, '0 (ref jun-sep: 16 de 100)', CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT count(*) AS n FROM cierres WHERE round(coalesce(difference,0)::numeric,2) <> 0) a
  UNION ALL SELECT 42, 'Suma de diferencias de caja', (SELECT round(coalesce(sum(round(difference::numeric,2)),0),2) FROM cierres), '0', 'INFO'
  UNION ALL SELECT 43, 'Aperturas que no cuadran con el cierre anterior', (SELECT count(*) FROM aperturas)::numeric, '0', CASE WHEN (SELECT count(*) FROM aperturas) = 0 THEN 'OK' ELSE 'REVISAR' END
  UNION ALL SELECT 44, 'Diferencia NETA de caja (diferencias de turno + saltos de apertura)', x, 'dentro de +-100', CASE WHEN abs(x) <= 100 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT (SELECT round(coalesce(sum(round(difference::numeric,2)),0),2) FROM cierres)
                + (SELECT round(coalesce(sum(starting_cash - prev_counted),0),2) FROM aperturas) AS x) a
  UNION ALL SELECT 50, 'Propinas entregadas', (SELECT round(coalesce(sum(amount),0),2) FROM mov WHERE category = 'propinas_entregadas'), '-', 'INFO'
  UNION ALL SELECT 51, 'Propinas: cobradas - entregadas', d,
         'dentro de 5% de lo cobrado (desfase de fin de mes es normal)',
         CASE WHEN c = 0 THEN 'INFO' WHEN abs(d) <= 0.05 * c THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT (SELECT round(coalesce(sum(tip_amount),0),2) FROM pay) AS c,
                 (SELECT round(coalesce(sum(tip_amount),0),2) FROM pay)
               - (SELECT round(coalesce(sum(amount),0),2) FROM mov WHERE category = 'propinas_entregadas') AS d) a
  UNION ALL SELECT 60, 'Posibles movimientos duplicados (grupos)', (SELECT count(*) FROM dups)::numeric, '0', CASE WHEN (SELECT count(*) FROM dups) = 0 THEN 'OK' ELSE 'REVISAR' END
  UNION ALL SELECT 61, 'Pagos con tarjeta sin terminal', n::numeric, '0', CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT count(*) AS n FROM pay WHERE coalesce(tarjeta,0) > 0 AND card_terminal IS NULL) a
  UNION ALL SELECT 62, 'Movimientos con monto <= 0 o > 18000', n::numeric, '0', CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT count(*) AS n FROM mov WHERE amount IS NULL OR amount <= 0 OR amount > 18000) a
  UNION ALL SELECT 63, 'Pagos con montos negativos', n::numeric, '0', CASE WHEN n = 0 THEN 'OK' ELSE 'REVISAR' END
    FROM (SELECT count(*) AS n FROM pay WHERE efectivo < 0 OR tarjeta < 0 OR transferencia < 0 OR total_paid < 0 OR tip_amount < 0) a
  -- ---- Resguardo (caja fuerte / casa): el sistema solo sabe lo registrado; compara con el conteo FISICO ----
  UNION ALL SELECT 80, 'Resguardo: sacado del cajon en el mes (cajon -> resguardo)', (SELECT round(coalesce(sum(amount),0),2) FROM mov WHERE destination_location = 'house_safe'), '-', 'INFO'
  UNION ALL SELECT 81, 'Resguardo: regresado o gastado desde resguardo en el mes', (SELECT round(coalesce(sum(amount),0),2) FROM mov WHERE source_location = 'house_safe'), '-', 'INFO'
  UNION ALL SELECT 82, 'Resguardo: saldo segun el sistema al cierre del mes', (SELECT round(saldo_resguardo,2) FROM acum), 'IGUAL al efectivo fisico en resguardo', 'CONTAR'
  -- ---- Parte B (insumos para la conciliacion bancaria; se concilia con el saldo real de Mercado Pago) ----
  UNION ALL SELECT 70, 'Comision esperada del mes: terminal mp (4.06%)',   (SELECT round(coalesce(sum(tarjeta),0) * (1-0.9594),2) FROM pay WHERE card_terminal = 'mp'), '-', 'INFO'
  UNION ALL SELECT 71, 'Comision esperada del mes: terminal getnet (2.17%)', (SELECT round(coalesce(sum(tarjeta),0) * (1-0.9783),2) FROM pay WHERE card_terminal = 'getnet'), '-', 'INFO'
  UNION ALL SELECT 72, 'Saldo Banco del sistema al cierre del mes (bruto, acumulado)', (SELECT round(saldo_banco,2) FROM acum), '-', 'INFO'
  UNION ALL SELECT 73, 'Comision acumulada estimada (todo el historial)', (SELECT round(comision_acum,2) FROM acum), '-', 'INFO'
  UNION ALL SELECT 74, 'Banco neto estimado (72 - 73)', (SELECT round(saldo_banco - comision_acum,2) FROM acum), '-', 'INFO'
) t
ORDER BY orden;


-- ===== BLOQUE 2: Gastos del mes por categoria (siempre util) ===============
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin)
SELECT movement_nature, category, count(*) AS movs, sum(amount) AS total
FROM mov
WHERE movement_nature = 'expense'
GROUP BY movement_nature, category
ORDER BY total DESC;


-- ===== BLOQUE 3: Fechas sospechosas (si el check 31 o 32 salio REVISAR) ====
-- tipo 'nota_mes' = la nota nombra un mes distinto al de created_at.
-- tipo 'antes_de_turno' = created_at anterior a la apertura de su turno.
-- explicado = true si es uno de los 21 re-fechados del 4-oct (excepcion conocida).
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin),
exc(id) AS (VALUES
    ('5cbc123c-c941-48d8-a784-4e5cd90b18cb'::uuid),
    ('badf5c47-2125-487b-96fc-4789278e3748'::uuid),
    ('7ea9ca41-d9cc-4b7b-bb7d-c87ccf9d54d5'::uuid),
    ('5a2770d3-94a5-4c23-8212-41d530b828a2'::uuid),
    ('6322b549-18f1-42cf-a55e-de14b7fa8c75'::uuid),
    ('b6fdbc22-f93f-4f39-a56d-98c120ffa4a0'::uuid),
    ('370519a6-d841-4186-85bb-a192fae5d84c'::uuid),
    ('a46cb99b-55ba-4593-841a-76397d04afc5'::uuid),
    ('795908a6-1e3f-4433-8948-424909d6b157'::uuid),
    ('5fb3382b-8024-458a-b782-d43ea14723c5'::uuid),
    ('6743d35c-17a5-41b1-8ec5-07a2967e43e4'::uuid),
    ('2ab5ff81-17b7-4fd1-97e7-0b26ff430e0f'::uuid),
    ('55657f30-d28f-4374-badf-c47ac6a650b7'::uuid),
    ('1da43396-2049-4908-bc90-73d52b33ef11'::uuid),
    ('549a2fa8-f324-41d5-9020-edc5fcb69060'::uuid),
    ('1ceba901-0cca-4f25-8d7a-702f6fc2719a'::uuid),
    ('5977706d-98be-4818-a491-35be21eb08ef'::uuid),
    ('d90216a3-e507-4cf5-bf5d-aafb549ddc0d'::uuid),
    ('d1c929b9-8093-4871-b651-4143092c3b5c'::uuid),
    ('502e27cc-14a0-4893-82ff-2b77d2237a6b'::uuid),
    ('372a5997-0958-4f3f-a143-d8120ecc2ed1'::uuid),
    ('cdae9bf7-85e0-42c6-a8b9-36528b8245bc'::uuid),
    ('576b3446-72aa-425c-90f3-3bdbaff6fcdb'::uuid),
    ('3d2d47bc-02af-42ad-bd2b-8a1a3de9bf55'::uuid)
),
nota_mes AS (
    SELECT m.id, m.created_at, m.amount, m.note,
           CASE left((regexp_match(lower(m.note), '\y(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sept|sep|octubre|oct|noviembre|nov|diciembre|dic)\y'))[1], 3)
                WHEN 'ene' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'abr' THEN 4
                WHEN 'may' THEN 5 WHEN 'jun' THEN 6 WHEN 'jul' THEN 7 WHEN 'ago' THEN 8
                WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dic' THEN 12 END AS mes_nota,
           extract(month FROM m.created_at AT TIME ZONE 'America/Mexico_City')::int AS mes_fecha
    FROM mov m
    WHERE m.note IS NOT NULL
),
fuera_turno AS (
    SELECT m.id, m.created_at, s.opened_at, m.amount, m.note
    FROM mov m JOIN shifts s ON s.id = m.shift_id
    WHERE m.created_at < s.opened_at - interval '1 minute'
)
SELECT 'nota_mes' AS tipo, n.id, n.created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       n.mes_nota, n.mes_fecha, n.amount, n.note, (n.id IN (SELECT id FROM exc)) AS explicado
FROM nota_mes n WHERE n.mes_nota IS NOT NULL AND n.mes_nota <> n.mes_fecha
UNION ALL
SELECT 'antes_de_turno', f.id, f.created_at AT TIME ZONE 'America/Mexico_City',
       NULL, NULL, f.amount, f.note, (f.id IN (SELECT id FROM exc))
FROM fuera_turno f
ORDER BY tipo, fecha_mx;


-- ===== BLOQUE 4: Turnos con diferencia de caja (check 41) ==================
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
cierres AS (SELECT s.* FROM shifts s, p WHERE s.status = 'closed' AND s.closed_at >= p.ini AND s.closed_at < p.fin)
SELECT id, opened_at AT TIME ZONE 'America/Mexico_City' AS abierto_mx,
       closed_at AT TIME ZONE 'America/Mexico_City' AS cerrado_mx,
       starting_cash, expected_cash, cash_counted, difference
FROM cierres
WHERE round(coalesce(difference,0)::numeric,2) <> 0
ORDER BY closed_at;


-- ===== BLOQUE 5: Aperturas que no cuadran con el cierre anterior (check 43) =
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
aperturas AS (
    SELECT id, opened_at, starting_cash, prev_counted FROM (
        SELECT s.id, s.opened_at, s.starting_cash,
               lag(s.cash_counted) OVER (ORDER BY s.opened_at) AS prev_counted,
               lag(s.status)       OVER (ORDER BY s.opened_at) AS prev_status
        FROM shifts s
    ) x, p
    WHERE x.opened_at >= p.ini AND x.opened_at < p.fin
      AND x.prev_status = 'closed' AND x.prev_counted IS NOT NULL
      AND x.starting_cash <> x.prev_counted
)
SELECT id, opened_at AT TIME ZONE 'America/Mexico_City' AS abierto_mx,
       prev_counted AS cierre_anterior, starting_cash AS apertura,
       starting_cash - prev_counted AS diferencia
FROM aperturas
ORDER BY opened_at;


-- ===== BLOQUE 6: Posibles duplicados (check 60) ============================
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin),
dups AS (
    SELECT shift_id, amount, lower(btrim(note)) AS nota,
           (created_at AT TIME ZONE 'America/Mexico_City')::date AS dia, count(*) AS veces
    FROM mov
    GROUP BY 1, 2, 3, 4
    HAVING count(*) > 1
)
SELECT m.id, m.created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       m.shift_id, m.category, m.amount, m.note, d.veces
FROM mov m
JOIN dups d ON d.shift_id IS NOT DISTINCT FROM m.shift_id AND d.amount = m.amount
           AND d.nota IS NOT DISTINCT FROM lower(btrim(m.note))
           AND d.dia = (m.created_at AT TIME ZONE 'America/Mexico_City')::date
ORDER BY d.dia, m.amount, m.created_at;


-- ===== BLOQUE 7: Gastos sin nota y pagos con tarjeta sin terminal (30, 61) =
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin),
pay AS (SELECT y.* FROM payments y, p WHERE y.created_at >= p.ini AND y.created_at < p.fin)
SELECT 'gasto_sin_nota' AS tipo, id, created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       amount AS monto, category AS detalle
FROM mov WHERE movement_nature = 'expense' AND (note IS NULL OR btrim(note) = '')
UNION ALL
SELECT 'tarjeta_sin_terminal', id, created_at AT TIME ZONE 'America/Mexico_City', tarjeta, comanda_id::text
FROM pay WHERE coalesce(tarjeta,0) > 0 AND card_terminal IS NULL
ORDER BY tipo, fecha_mx;


-- ===== BLOQUE 8: Montos raros (checks 62 y 63) =============================
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin),
pay AS (SELECT y.* FROM payments y, p WHERE y.created_at >= p.ini AND y.created_at < p.fin)
SELECT 'movimiento' AS tipo, id, created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       amount AS monto, category || ' | ' || coalesce(note,'') AS detalle
FROM mov WHERE amount IS NULL OR amount <= 0 OR amount > 18000
UNION ALL
SELECT 'pago_negativo', id, created_at AT TIME ZONE 'America/Mexico_City',
       total_paid, 'ef=' || coalesce(efectivo,0) || ' tj=' || coalesce(tarjeta,0) || ' tr=' || coalesce(transferencia,0)
FROM pay WHERE efectivo < 0 OR tarjeta < 0 OR transferencia < 0 OR total_paid < 0 OR tip_amount < 0
ORDER BY tipo, fecha_mx;


-- ===== BLOQUE 9: Propinas por dia (si el check 51 salio REVISAR) ===========
-- Compara lo cobrado contra lo entregado dia por dia (hora Mexico).
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin),
pay AS (SELECT y.* FROM payments y, p WHERE y.created_at >= p.ini AND y.created_at < p.fin),
cob AS (SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date AS dia, sum(tip_amount) AS cobradas FROM pay GROUP BY 1),
ent AS (SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date AS dia, sum(amount) AS entregadas FROM mov WHERE category = 'propinas_entregadas' GROUP BY 1)
SELECT coalesce(c.dia, e.dia) AS dia, coalesce(c.cobradas,0) AS cobradas, coalesce(e.entregadas,0) AS entregadas,
       coalesce(c.cobradas,0) - coalesce(e.entregadas,0) AS diferencia
FROM cob c FULL JOIN ent e ON e.dia = c.dia
ORDER BY dia;


-- ===== BLOQUE 10: DETALLE COMBINADO (checks 31, 32, 41, 43, 44 en UNA sola consulta) =====
-- Si el scorecard marca REVISAR en 31/32/41/43/44, corre solo este y pega el resultado.
WITH p AS (SELECT '2026-09-01 00:00-06'::timestamptz AS ini, '2026-10-01 00:00-06'::timestamptz AS fin),
mov AS (SELECT m.* FROM cash_movements m, p WHERE m.created_at >= p.ini AND m.created_at < p.fin),
exc(id) AS (VALUES
    ('5cbc123c-c941-48d8-a784-4e5cd90b18cb'::uuid),
    ('badf5c47-2125-487b-96fc-4789278e3748'::uuid),
    ('7ea9ca41-d9cc-4b7b-bb7d-c87ccf9d54d5'::uuid),
    ('5a2770d3-94a5-4c23-8212-41d530b828a2'::uuid),
    ('6322b549-18f1-42cf-a55e-de14b7fa8c75'::uuid),
    ('b6fdbc22-f93f-4f39-a56d-98c120ffa4a0'::uuid),
    ('370519a6-d841-4186-85bb-a192fae5d84c'::uuid),
    ('a46cb99b-55ba-4593-841a-76397d04afc5'::uuid),
    ('795908a6-1e3f-4433-8948-424909d6b157'::uuid),
    ('5fb3382b-8024-458a-b782-d43ea14723c5'::uuid),
    ('6743d35c-17a5-41b1-8ec5-07a2967e43e4'::uuid),
    ('2ab5ff81-17b7-4fd1-97e7-0b26ff430e0f'::uuid),
    ('55657f30-d28f-4374-badf-c47ac6a650b7'::uuid),
    ('1da43396-2049-4908-bc90-73d52b33ef11'::uuid),
    ('549a2fa8-f324-41d5-9020-edc5fcb69060'::uuid),
    ('1ceba901-0cca-4f25-8d7a-702f6fc2719a'::uuid),
    ('5977706d-98be-4818-a491-35be21eb08ef'::uuid),
    ('d90216a3-e507-4cf5-bf5d-aafb549ddc0d'::uuid),
    ('d1c929b9-8093-4871-b651-4143092c3b5c'::uuid),
    ('502e27cc-14a0-4893-82ff-2b77d2237a6b'::uuid),
    ('372a5997-0958-4f3f-a143-d8120ecc2ed1'::uuid),
    ('cdae9bf7-85e0-42c6-a8b9-36528b8245bc'::uuid),
    ('576b3446-72aa-425c-90f3-3bdbaff6fcdb'::uuid),
    ('3d2d47bc-02af-42ad-bd2b-8a1a3de9bf55'::uuid)
),
nota_mes AS (
    SELECT m.id, m.created_at, m.amount, m.note,
           CASE left((regexp_match(lower(m.note), '\y(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sept|sep|octubre|oct|noviembre|nov|diciembre|dic)\y'))[1], 3)
                WHEN 'ene' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'abr' THEN 4
                WHEN 'may' THEN 5 WHEN 'jun' THEN 6 WHEN 'jul' THEN 7 WHEN 'ago' THEN 8
                WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dic' THEN 12 END AS mes_nota,
           extract(month FROM m.created_at AT TIME ZONE 'America/Mexico_City')::int AS mes_fecha
    FROM mov m
    WHERE m.note IS NOT NULL
),
fuera_turno AS (
    SELECT m.id, m.created_at, s.opened_at, m.amount, m.note
    FROM mov m JOIN shifts s ON s.id = m.shift_id
    WHERE m.created_at < s.opened_at - interval '1 minute'
),
cierres AS (SELECT s.* FROM shifts s, p WHERE s.status = 'closed' AND s.closed_at >= p.ini AND s.closed_at < p.fin),
aperturas AS (
    SELECT id, opened_at, starting_cash, prev_counted FROM (
        SELECT s.id, s.opened_at, s.starting_cash,
               lag(s.cash_counted) OVER (ORDER BY s.opened_at) AS prev_counted,
               lag(s.status)       OVER (ORDER BY s.opened_at) AS prev_status
        FROM shifts s
    ) x, p
    WHERE x.opened_at >= p.ini AND x.opened_at < p.fin
      AND x.prev_status = 'closed' AND x.prev_counted IS NOT NULL
      AND x.starting_cash <> x.prev_counted
)
SELECT '31 nota con mes distinto' AS tipo, n.id::text AS id,
       (n.created_at AT TIME ZONE 'America/Mexico_City')::text AS fecha_mx,
       n.amount AS monto, n.note AS detalle
FROM nota_mes n WHERE n.mes_nota IS NOT NULL AND n.mes_nota <> n.mes_fecha AND n.id NOT IN (SELECT id FROM exc)
UNION ALL
SELECT '32 antes de abrir turno (sin explicar)', f.id::text,
       (f.created_at AT TIME ZONE 'America/Mexico_City')::text, f.amount,
       coalesce(f.note,'') || ' | turno abrio ' || (f.opened_at AT TIME ZONE 'America/Mexico_City')::text
FROM fuera_turno f WHERE f.id NOT IN (SELECT id FROM exc)
UNION ALL
SELECT '41 turno con diferencia', c.id::text,
       (c.closed_at AT TIME ZONE 'America/Mexico_City')::text, round(c.difference::numeric,2),
       'abrio ' || (c.opened_at AT TIME ZONE 'America/Mexico_City')::text ||
       ' | inicial ' || c.starting_cash || ' | esperado ' || round(coalesce(c.expected_cash,0)::numeric,2) || ' | contado ' || coalesce(c.cash_counted,0)
FROM cierres c WHERE round(coalesce(c.difference,0)::numeric,2) <> 0
UNION ALL
SELECT '43 apertura no cuadra con cierre anterior', a.id::text,
       (a.opened_at AT TIME ZONE 'America/Mexico_City')::text, a.starting_cash - a.prev_counted,
       'cierre anterior ' || a.prev_counted || ' | apertura ' || a.starting_cash
FROM aperturas a
ORDER BY 1, 3;


-- ===== BLOQUE 11: RESGUARDO (caja fuerte / casa) — movimientos y saldo corrido DEL SISTEMA ====
-- Todo el historial. El saldo corrido es lo que el sistema cree que hay en el resguardo:
-- se compara contra el efectivo FISICO. Una diferencia = dinero que salio/entro sin registrar.
SELECT m.created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       m.category, m.amount, m.source_location AS origen, m.destination_location AS destino, m.note,
       sum((CASE WHEN m.destination_location = 'house_safe' THEN m.amount ELSE 0 END)
         - (CASE WHEN m.source_location      = 'house_safe' THEN m.amount ELSE 0 END))
           OVER (ORDER BY m.created_at, m.id) AS saldo_resguardo
FROM cash_movements m
WHERE m.source_location = 'house_safe' OR m.destination_location = 'house_safe'
ORDER BY m.created_at, m.id;
