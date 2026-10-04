-- ============================================================================
-- Re-fechar 21 movimientos de septiembre capturados el 2026-10-04
-- Plan aprobado por Javi 2026-10-04 (tasks/todo.md). Tabla: public.cash_movements
-- Solo cambia created_at. shift_id NO se toca (los 21 son origen 'bank': no
-- afectan cajon ni expected_cash). Zona horaria America/Mexico_City = UTC-6.
-- Hora asignada: 12:00:NN del dia real (NN = orden de captura, conserva el orden).
-- Se hace match por id Y por amount: si algo no coincide, esa fila no se toca.
-- Total esperado: 21 filas / $28,756.51
-- Correr cada BLOQUE por separado, en orden. El editor web muestra solo el
-- resultado del ultimo statement de cada ejecucion.
-- ============================================================================


-- ===== BLOQUE 1: PREVIEW (solo lectura) ====================================
-- Esperado: 21 filas, todas con coincide = true. Revisa que fecha_nueva_mx
-- corresponda a la fecha escrita en la nota.
WITH map(id, amount, new_ts) AS (VALUES
    ('5cbc123c-c941-48d8-a784-4e5cd90b18cb', 2805, '2026-09-21 12:00:00-06'),
    ('badf5c47-2125-487b-96fc-4789278e3748', 3000, '2026-09-22 12:00:01-06'),
    ('7ea9ca41-d9cc-4b7b-bb7d-c87ccf9d54d5', 474.26, '2026-09-22 12:00:02-06'),
    ('5a2770d3-94a5-4c23-8212-41d530b828a2', 94, '2026-09-22 12:00:03-06'),
    ('6322b549-18f1-42cf-a55e-de14b7fa8c75', 630, '2026-09-25 12:00:04-06'),
    ('b6fdbc22-f93f-4f39-a56d-98c120ffa4a0', 198.55, '2026-09-25 12:00:05-06'),
    ('370519a6-d841-4186-85bb-a192fae5d84c', 284.91, '2026-09-25 12:00:06-06'),
    ('a46cb99b-55ba-4593-841a-76397d04afc5', 63, '2026-09-25 12:00:07-06'),
    ('795908a6-1e3f-4433-8948-424909d6b157', 1570, '2026-09-25 12:00:08-06'),
    ('5fb3382b-8024-458a-b782-d43ea14723c5', 150, '2026-09-25 12:00:09-06'),
    ('6743d35c-17a5-41b1-8ec5-07a2967e43e4', 2900, '2026-09-25 12:00:10-06'),
    ('2ab5ff81-17b7-4fd1-97e7-0b26ff430e0f', 1244.72, '2026-09-25 12:00:11-06'),
    ('55657f30-d28f-4374-badf-c47ac6a650b7', 188, '2026-09-25 12:00:12-06'),
    ('1da43396-2049-4908-bc90-73d52b33ef11', 564, '2026-09-25 12:00:13-06'),
    ('549a2fa8-f324-41d5-9020-edc5fcb69060', 58.12, '2026-09-26 12:00:14-06'),
    ('1ceba901-0cca-4f25-8d7a-702f6fc2719a', 2155, '2026-09-28 12:00:15-06'),
    ('5977706d-98be-4818-a491-35be21eb08ef', 10000, '2026-09-29 12:00:16-06'),
    ('d90216a3-e507-4cf5-bf5d-aafb549ddc0d', 252.75, '2026-09-29 12:00:17-06'),
    ('d1c929b9-8093-4871-b651-4143092c3b5c', 12, '2026-09-29 12:00:18-06'),
    ('502e27cc-14a0-4893-82ff-2b77d2237a6b', 1783.2, '2026-09-29 12:00:19-06'),
    ('372a5997-0958-4f3f-a143-d8120ecc2ed1', 329, '2026-09-29 12:00:20-06')
)
SELECT m.id,
       m.created_at AT TIME ZONE 'America/Mexico_City'          AS fecha_actual_mx,
       v.new_ts::timestamptz AT TIME ZONE 'America/Mexico_City' AS fecha_nueva_mx,
       m.amount,
       m.note,
       (m.amount = v.amount::numeric)                           AS coincide
FROM map v
LEFT JOIN cash_movements m ON m.id = v.id::uuid
ORDER BY v.new_ts;


-- ===== BLOQUE 2: UPDATE (un solo statement, atomico) =======================
-- Corre SOLO despues de confirmar el preview.
-- Devuelve: filas = 21, total = 28756.51. Si filas != 21, avisame antes de seguir.
-- (El filtro created_at >= 4-oct evita re-aplicarlo por accidente.)
WITH map(id, amount, new_ts) AS (VALUES
    ('5cbc123c-c941-48d8-a784-4e5cd90b18cb', 2805, '2026-09-21 12:00:00-06'),
    ('badf5c47-2125-487b-96fc-4789278e3748', 3000, '2026-09-22 12:00:01-06'),
    ('7ea9ca41-d9cc-4b7b-bb7d-c87ccf9d54d5', 474.26, '2026-09-22 12:00:02-06'),
    ('5a2770d3-94a5-4c23-8212-41d530b828a2', 94, '2026-09-22 12:00:03-06'),
    ('6322b549-18f1-42cf-a55e-de14b7fa8c75', 630, '2026-09-25 12:00:04-06'),
    ('b6fdbc22-f93f-4f39-a56d-98c120ffa4a0', 198.55, '2026-09-25 12:00:05-06'),
    ('370519a6-d841-4186-85bb-a192fae5d84c', 284.91, '2026-09-25 12:00:06-06'),
    ('a46cb99b-55ba-4593-841a-76397d04afc5', 63, '2026-09-25 12:00:07-06'),
    ('795908a6-1e3f-4433-8948-424909d6b157', 1570, '2026-09-25 12:00:08-06'),
    ('5fb3382b-8024-458a-b782-d43ea14723c5', 150, '2026-09-25 12:00:09-06'),
    ('6743d35c-17a5-41b1-8ec5-07a2967e43e4', 2900, '2026-09-25 12:00:10-06'),
    ('2ab5ff81-17b7-4fd1-97e7-0b26ff430e0f', 1244.72, '2026-09-25 12:00:11-06'),
    ('55657f30-d28f-4374-badf-c47ac6a650b7', 188, '2026-09-25 12:00:12-06'),
    ('1da43396-2049-4908-bc90-73d52b33ef11', 564, '2026-09-25 12:00:13-06'),
    ('549a2fa8-f324-41d5-9020-edc5fcb69060', 58.12, '2026-09-26 12:00:14-06'),
    ('1ceba901-0cca-4f25-8d7a-702f6fc2719a', 2155, '2026-09-28 12:00:15-06'),
    ('5977706d-98be-4818-a491-35be21eb08ef', 10000, '2026-09-29 12:00:16-06'),
    ('d90216a3-e507-4cf5-bf5d-aafb549ddc0d', 252.75, '2026-09-29 12:00:17-06'),
    ('d1c929b9-8093-4871-b651-4143092c3b5c', 12, '2026-09-29 12:00:18-06'),
    ('502e27cc-14a0-4893-82ff-2b77d2237a6b', 1783.2, '2026-09-29 12:00:19-06'),
    ('372a5997-0958-4f3f-a143-d8120ecc2ed1', 329, '2026-09-29 12:00:20-06')
),
upd AS (
    UPDATE cash_movements m
       SET created_at = v.new_ts::timestamptz
      FROM map v
     WHERE m.id = v.id::uuid
       AND m.amount = v.amount::numeric
       AND m.created_at >= '2026-10-04 00:00-06'
    RETURNING m.amount
)
SELECT count(*) AS filas, sum(amount) AS total FROM upd;


-- ===== BLOQUE 3: VERIFICACION (solo lectura) ===============================
-- 3a. Esperado: 21 filas, total 28756.51, entre 2026-09-21 y 2026-09-29.
SELECT count(*) AS filas, sum(amount) AS total,
       min(created_at AT TIME ZONE 'America/Mexico_City') AS primera,
       max(created_at AT TIME ZONE 'America/Mexico_City') AS ultima
FROM cash_movements
WHERE id IN (
    '5cbc123c-c941-48d8-a784-4e5cd90b18cb',
    'badf5c47-2125-487b-96fc-4789278e3748',
    '7ea9ca41-d9cc-4b7b-bb7d-c87ccf9d54d5',
    '5a2770d3-94a5-4c23-8212-41d530b828a2',
    '6322b549-18f1-42cf-a55e-de14b7fa8c75',
    'b6fdbc22-f93f-4f39-a56d-98c120ffa4a0',
    '370519a6-d841-4186-85bb-a192fae5d84c',
    'a46cb99b-55ba-4593-841a-76397d04afc5',
    '795908a6-1e3f-4433-8948-424909d6b157',
    '5fb3382b-8024-458a-b782-d43ea14723c5',
    '6743d35c-17a5-41b1-8ec5-07a2967e43e4',
    '2ab5ff81-17b7-4fd1-97e7-0b26ff430e0f',
    '55657f30-d28f-4374-badf-c47ac6a650b7',
    '1da43396-2049-4908-bc90-73d52b33ef11',
    '549a2fa8-f324-41d5-9020-edc5fcb69060',
    '1ceba901-0cca-4f25-8d7a-702f6fc2719a',
    '5977706d-98be-4818-a491-35be21eb08ef',
    'd90216a3-e507-4cf5-bf5d-aafb549ddc0d',
    'd1c929b9-8093-4871-b651-4143092c3b5c',
    '502e27cc-14a0-4893-82ff-2b77d2237a6b',
    '372a5997-0958-4f3f-a143-d8120ecc2ed1'
);

-- 3b. Gastos de septiembre por categoria (compara con tu Cierre Mensual de sept).
--     El total de gastos de sept debe haber subido exactamente $28,756.51.
SELECT movement_nature, category, count(*) AS movs, sum(amount) AS total
FROM cash_movements
WHERE created_at >= '2026-09-01 00:00-06' AND created_at < '2026-10-01 00:00-06'
  AND movement_nature = 'expense'
GROUP BY movement_nature, category
ORDER BY total DESC;


-- ===== BLOQUE 4: ROLLBACK (solo si algo salio mal) =========================
-- Regresa las 21 filas a su created_at original (4-oct, hora de captura).
WITH orig(id, ts) AS (VALUES
    ('5cbc123c-c941-48d8-a784-4e5cd90b18cb', '2026-10-04 12:29:04.710641-06'),
    ('badf5c47-2125-487b-96fc-4789278e3748', '2026-10-04 12:29:36.56355-06'),
    ('7ea9ca41-d9cc-4b7b-bb7d-c87ccf9d54d5', '2026-10-04 12:30:12.310639-06'),
    ('5a2770d3-94a5-4c23-8212-41d530b828a2', '2026-10-04 12:30:29.766478-06'),
    ('6322b549-18f1-42cf-a55e-de14b7fa8c75', '2026-10-04 12:32:11.175446-06'),
    ('b6fdbc22-f93f-4f39-a56d-98c120ffa4a0', '2026-10-04 12:32:35.585556-06'),
    ('370519a6-d841-4186-85bb-a192fae5d84c', '2026-10-04 12:33:11.922706-06'),
    ('a46cb99b-55ba-4593-841a-76397d04afc5', '2026-10-04 12:33:38.345726-06'),
    ('795908a6-1e3f-4433-8948-424909d6b157', '2026-10-04 12:34:09.419898-06'),
    ('5fb3382b-8024-458a-b782-d43ea14723c5', '2026-10-04 12:34:31.43218-06'),
    ('6743d35c-17a5-41b1-8ec5-07a2967e43e4', '2026-10-04 12:34:51.978463-06'),
    ('2ab5ff81-17b7-4fd1-97e7-0b26ff430e0f', '2026-10-04 12:36:19.664468-06'),
    ('55657f30-d28f-4374-badf-c47ac6a650b7', '2026-10-04 12:36:34.507514-06'),
    ('1da43396-2049-4908-bc90-73d52b33ef11', '2026-10-04 12:37:01.510416-06'),
    ('549a2fa8-f324-41d5-9020-edc5fcb69060', '2026-10-04 12:39:10.69902-06'),
    ('1ceba901-0cca-4f25-8d7a-702f6fc2719a', '2026-10-04 12:40:43.997941-06'),
    ('5977706d-98be-4818-a491-35be21eb08ef', '2026-10-04 12:41:21.030135-06'),
    ('d90216a3-e507-4cf5-bf5d-aafb549ddc0d', '2026-10-04 12:41:43.164499-06'),
    ('d1c929b9-8093-4871-b651-4143092c3b5c', '2026-10-04 12:41:59.66386-06'),
    ('502e27cc-14a0-4893-82ff-2b77d2237a6b', '2026-10-04 12:42:18.917705-06'),
    ('372a5997-0958-4f3f-a143-d8120ecc2ed1', '2026-10-04 12:42:47.351825-06')
)
UPDATE cash_movements m
   SET created_at = o.ts::timestamptz
  FROM orig o
 WHERE m.id = o.id::uuid
RETURNING m.id, m.created_at;
