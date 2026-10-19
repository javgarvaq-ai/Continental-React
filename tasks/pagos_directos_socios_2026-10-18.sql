-- ============================================================================
-- Pagos directos de socios (Eduardo y Javi) que no estaban en el sistema
-- Aprobado por Javi 2026-10-18. Tabla: public.cash_movements. 16 pagos = 32 filas.
-- Cada pago = Aportación socio → Banco + gasto Banco → fuera, mismo monto y fecha
-- (15 del mes indicado, 12:00:NN). Saldo de banco neto = 0. NO se incluyen:
--   · Nómina $2,000 de Eduardo (ya está: aportación 13-sep "Pago negro efectivo")
--   · "préstamos" $3,000 de Eduardo (ya está: aportación banco 7-sep)
-- shift_id = turno abierto más reciente antes de esa fecha · user_id = Javier.
-- Total esperado: 32 filas · aportaciones $32,630.02 · gastos $32,630.02
-- Correr cada BLOQUE por separado, en orden.
-- ============================================================================

-- ===== BLOQUE 1: PREVIEW (solo lectura) ====================================
-- Esperado: 32 filas, todas con shift_id y user_id NO nulos; ya_cargado = false.
WITH v(ts, amount, category, nature, type, src, dst, note) AS (VALUES
    ('2026-06-15 12:00:00-06', 4000, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Seguro anual de protección del bar · pago directo socio (cargado 18-oct)'),
    ('2026-06-15 12:00:01-06', 4000, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Seguro anual de protección del bar (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:02-06', 4900, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Luz CFE bimestre jun-jul · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:03-06', 4900, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Luz CFE bimestre jun-jul (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:04-06', 2600, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Fotos publicidad · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:05-06', 2600, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Fotos publicidad (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:06-06', 450, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Permiso provisional · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:07-06', 450, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Permiso provisional (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:08-06', 1200, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Cerveza · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:09-06', 1200, 'pago_proveedor_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Cerveza (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:10-06', 6300, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Luz CFE bimestre ago-sep · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:11-06', 6300, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Luz CFE bimestre ago-sep (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:12-06', 2102, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Botellas Oviedo · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:13-06', 2102, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Botellas Oviedo (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:14-06', 1518.02, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Botellas Oviedo · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:15-06', 1518.02, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Botellas Oviedo (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:16-06', 450, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Comida Liz · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:17-06', 450, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Comida Liz (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:18-06', 436, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Chicharrones · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:19-06', 436, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Chicharrones (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:20-06', 420, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Carnitas · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:21-06', 420, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Carnitas (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:22-06', 390, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Refrescos · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:23-06', 390, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Refrescos (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:24-06', 600, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Comida Liz · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:25-06', 600, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Comida Liz (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:26-06', 564, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Chicharrón · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:27-06', 564, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Chicharrón (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:28-06', 1100, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Aldo (botanas/refrescos) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:29-06', 1100, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Aldo (botanas/refrescos) (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:30-06', 5600, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Pago préstamo Juan (completa 4 × 15,500) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:31-06', 5600, 'pago_prestamo_banco', 'debt_payment', 'withdrawal', 'bank', 'loan', 'Pago préstamo Juan (completa 4 × 15,500) (pagó Eduardo) · pago directo socio (cargado 18-oct)')
)
SELECT v.ts::timestamptz AT TIME ZONE 'America/Mexico_City' AS fecha_mx, v.category, v.amount, v.note,
       (SELECT s.id FROM shifts s WHERE s.opened_at <= v.ts::timestamptz ORDER BY s.opened_at DESC LIMIT 1) AS shift_id,
       (SELECT u.id FROM users u WHERE u.name = 'Javier' LIMIT 1) AS user_id,
       EXISTS (SELECT 1 FROM cash_movements c WHERE c.note LIKE '%cargado 18-oct)%') AS ya_cargado
FROM v ORDER BY v.ts;


-- ===== BLOQUE 2: INSERT (un solo statement, atómico) =======================
-- Devuelve: filas = 32, aportaciones = 32630.02, gastos = 32630.02.
-- No hace nada si ya se cargó antes (evita duplicar).
WITH v(ts, amount, category, nature, type, src, dst, note) AS (VALUES
    ('2026-06-15 12:00:00-06', 4000, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Seguro anual de protección del bar · pago directo socio (cargado 18-oct)'),
    ('2026-06-15 12:00:01-06', 4000, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Seguro anual de protección del bar (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:02-06', 4900, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Luz CFE bimestre jun-jul · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:03-06', 4900, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Luz CFE bimestre jun-jul (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:04-06', 2600, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Fotos publicidad · pago directo socio (cargado 18-oct)'),
    ('2026-08-15 12:00:05-06', 2600, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Fotos publicidad (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:06-06', 450, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Permiso provisional · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:07-06', 450, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Permiso provisional (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:08-06', 1200, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Cerveza · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:09-06', 1200, 'pago_proveedor_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Cerveza (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:10-06', 6300, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Javi: Luz CFE bimestre ago-sep · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:11-06', 6300, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Luz CFE bimestre ago-sep (pagó Javi) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:12-06', 2102, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Botellas Oviedo · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:13-06', 2102, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Botellas Oviedo (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:14-06', 1518.02, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Botellas Oviedo · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:15-06', 1518.02, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Botellas Oviedo (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:16-06', 450, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Comida Liz · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:17-06', 450, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Comida Liz (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:18-06', 436, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Chicharrones · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:19-06', 436, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Chicharrones (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:20-06', 420, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Carnitas · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:21-06', 420, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Carnitas (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:22-06', 390, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Refrescos · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:23-06', 390, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Refrescos (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:24-06', 600, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Comida Liz · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:25-06', 600, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Comida Liz (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:26-06', 564, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Chicharrón · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:27-06', 564, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Chicharrón (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:28-06', 1100, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Aldo (botanas/refrescos) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:29-06', 1100, 'gasto_operativo_banco', 'expense', 'withdrawal', 'bank', 'expense', 'Aldo (botanas/refrescos) (pagó Eduardo) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:30-06', 5600, 'aportacion_socio_banco', 'owner_funding', 'deposit', 'owner', 'bank', 'Aportación Eduardo: Pago préstamo Juan (completa 4 × 15,500) · pago directo socio (cargado 18-oct)'),
    ('2026-09-15 12:00:31-06', 5600, 'pago_prestamo_banco', 'debt_payment', 'withdrawal', 'bank', 'loan', 'Pago préstamo Juan (completa 4 × 15,500) (pagó Eduardo) · pago directo socio (cargado 18-oct)')
),
ins AS (
    INSERT INTO cash_movements (created_at, shift_id, user_id, type, amount, note, category, movement_nature, source_location, destination_location)
    SELECT v.ts::timestamptz,
           (SELECT s.id FROM shifts s WHERE s.opened_at <= v.ts::timestamptz ORDER BY s.opened_at DESC LIMIT 1),
           (SELECT u.id FROM users u WHERE u.name = 'Javier' LIMIT 1),
           v.type, v.amount, v.note, v.category, v.nature, v.src, v.dst
    FROM v
    WHERE NOT EXISTS (SELECT 1 FROM cash_movements c WHERE c.note LIKE '%cargado 18-oct)%')
    RETURNING movement_nature, amount
)
SELECT count(*) AS filas,
       sum(amount) FILTER (WHERE movement_nature = 'owner_funding') AS aportaciones,
       sum(amount) FILTER (WHERE movement_nature <> 'owner_funding') AS gastos
FROM ins;


-- ===== BLOQUE 3: VERIFICACIÓN (solo lectura) ===============================
-- Esperado por mes: jun 2 filas $8,000 (4k+4k) · ago 4 filas $15,000 · sep 26 filas $42,260.04
-- (cada fila cuenta aportación y gasto, por eso cada mes es el doble de lo pagado).
SELECT to_char(created_at AT TIME ZONE 'America/Mexico_City','YYYY-MM') AS mes,
       count(*) AS filas, sum(amount) AS total
FROM cash_movements
WHERE note LIKE '%cargado 18-oct)%'
GROUP BY 1 ORDER BY 1;


-- ===== BLOQUE 4: ROLLBACK (solo si algo salió mal) =========================
DELETE FROM cash_movements
WHERE note LIKE '%pago directo socio (cargado 18-oct)%'
RETURNING id, amount, note;
