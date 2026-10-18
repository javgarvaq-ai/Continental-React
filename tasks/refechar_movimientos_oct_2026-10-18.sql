-- ============================================================================
-- Re-fechar 11 movimientos de banco de octubre capturados el 2026-10-18
-- Aprobado por Javi 2026-10-18. Tabla: public.cash_movements
-- Solo cambia created_at (+ la nota de la nómina: "11 de octubre" -> "10 de octubre").
-- shift_id NO se toca: los 11 son origen 'bank', no afectan cajón ni expected_cash.
-- NO incluye la propina de $690 (drawer, 02:16 del 18-oct = día operativo 17-oct, correcto).
-- Hora: 12:00:NN del día real (NN = orden de captura). Match por id Y amount.
-- Total esperado: 11 filas / $18,893.68
-- Correr cada BLOQUE por separado, en orden.
-- ============================================================================


-- ===== BLOQUE 1: PREVIEW (solo lectura) ====================================
-- Esperado: 11 filas, todas con coincide = true.
WITH map(id, amount, new_ts) AS (VALUES
    ('7d92d829-9588-4e44-a07d-aede7db63f0c',    94   , '2026-10-06 12:00:00-06'),
    ('60ce2ff7-ac66-42ce-a2cd-7d1641dc0e0d',   402.28, '2026-10-06 12:00:01-06'),
    ('0d03d613-93e7-401d-8a52-db62eb40445b',   524   , '2026-10-06 12:00:02-06'),
    ('07a533b6-8e16-4f25-bc95-483093fc0979',    18   , '2026-10-06 12:00:03-06'),
    ('0f06c1a1-dc11-4906-b52b-c8a75fa35ca0', 10000   , '2026-10-06 12:00:04-06'),
    ('fb2616ed-e6bd-4059-b016-e7d077ac85da',   824   , '2026-10-09 12:00:05-06'),
    ('02ce1364-dfe2-4042-abd4-307acf1d7de7',    94   , '2026-10-09 12:00:06-06'),
    ('2a2532de-742c-401d-915c-e163c8de5546',   578.4 , '2026-10-09 12:00:07-06'),
    ('febff996-dd39-48aa-8bab-dca7c935cf7d',   159   , '2026-10-09 12:00:08-06'),
    ('3b97ea49-dc39-4f1a-ba0a-5aeb84b051a2',  3200   , '2026-10-09 12:00:09-06'),
    ('421289ba-27b8-4274-a86d-6361bd101676',  3000   , '2026-10-10 12:00:10-06')
)
SELECT m.id,
       m.created_at AT TIME ZONE 'America/Mexico_City'          AS fecha_actual_mx,
       v.new_ts::timestamptz AT TIME ZONE 'America/Mexico_City' AS fecha_nueva_mx,
       m.amount,
       m.source_location,
       m.note,
       (m.amount = v.amount::numeric)                           AS coincide
FROM map v
LEFT JOIN cash_movements m ON m.id = v.id::uuid
ORDER BY v.new_ts;


-- ===== BLOQUE 2: UPDATE (un solo statement, atómico) =======================
-- Corre SOLO después de confirmar el preview.
-- Devuelve: filas = 11, total = 18893.68. Si filas != 11, avísame antes de seguir.
-- (Filtros source_location = 'bank' y created_at >= 18-oct 14:00 evitan
--  tocar algo de cajón o re-aplicarlo por accidente.)
WITH map(id, amount, new_ts) AS (VALUES
    ('7d92d829-9588-4e44-a07d-aede7db63f0c',    94   , '2026-10-06 12:00:00-06'),
    ('60ce2ff7-ac66-42ce-a2cd-7d1641dc0e0d',   402.28, '2026-10-06 12:00:01-06'),
    ('0d03d613-93e7-401d-8a52-db62eb40445b',   524   , '2026-10-06 12:00:02-06'),
    ('07a533b6-8e16-4f25-bc95-483093fc0979',    18   , '2026-10-06 12:00:03-06'),
    ('0f06c1a1-dc11-4906-b52b-c8a75fa35ca0', 10000   , '2026-10-06 12:00:04-06'),
    ('fb2616ed-e6bd-4059-b016-e7d077ac85da',   824   , '2026-10-09 12:00:05-06'),
    ('02ce1364-dfe2-4042-abd4-307acf1d7de7',    94   , '2026-10-09 12:00:06-06'),
    ('2a2532de-742c-401d-915c-e163c8de5546',   578.4 , '2026-10-09 12:00:07-06'),
    ('febff996-dd39-48aa-8bab-dca7c935cf7d',   159   , '2026-10-09 12:00:08-06'),
    ('3b97ea49-dc39-4f1a-ba0a-5aeb84b051a2',  3200   , '2026-10-09 12:00:09-06'),
    ('421289ba-27b8-4274-a86d-6361bd101676',  3000   , '2026-10-10 12:00:10-06')
),
upd AS (
    UPDATE cash_movements m
       SET created_at = v.new_ts::timestamptz,
           note = CASE WHEN m.id = '421289ba-27b8-4274-a86d-6361bd101676'
                       THEN replace(m.note, 'Nomina Memo 11 de octubre', 'Nomina Memo 10 de octubre')
                       ELSE m.note END
      FROM map v
     WHERE m.id = v.id::uuid
       AND m.amount = v.amount::numeric
       AND m.source_location = 'bank'
       AND m.created_at >= '2026-10-18 14:00-06'
    RETURNING m.amount
)
SELECT count(*) AS filas, sum(amount) AS total FROM upd;


-- ===== BLOQUE 3: VERIFICACIÓN (solo lectura) ===============================
-- Esperado: 6-oct 5 filas $11,038.28 · 9-oct 5 filas $4,855.40 · 10-oct 1 fila $3,000.00
SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date AS dia,
       count(*) AS filas, sum(amount) AS total
FROM cash_movements
WHERE id IN (
    '7d92d829-9588-4e44-a07d-aede7db63f0c','60ce2ff7-ac66-42ce-a2cd-7d1641dc0e0d',
    '0d03d613-93e7-401d-8a52-db62eb40445b','07a533b6-8e16-4f25-bc95-483093fc0979',
    '0f06c1a1-dc11-4906-b52b-c8a75fa35ca0','fb2616ed-e6bd-4059-b016-e7d077ac85da',
    '02ce1364-dfe2-4042-abd4-307acf1d7de7','2a2532de-742c-401d-915c-e163c8de5546',
    'febff996-dd39-48aa-8bab-dca7c935cf7d','3b97ea49-dc39-4f1a-ba0a-5aeb84b051a2',
    '421289ba-27b8-4274-a86d-6361bd101676'
)
GROUP BY 1 ORDER BY 1;


-- ===== BLOQUE 4: ROLLBACK (solo si algo salió mal) =========================
-- Regresa las 11 filas a su hora de captura (18-oct, precisión al segundo)
-- y la nota de la nómina a su texto original.
WITH orig(id, ts) AS (VALUES
    ('7d92d829-9588-4e44-a07d-aede7db63f0c', '2026-10-18 14:46:06-06'),
    ('60ce2ff7-ac66-42ce-a2cd-7d1641dc0e0d', '2026-10-18 14:46:33-06'),
    ('0d03d613-93e7-401d-8a52-db62eb40445b', '2026-10-18 14:46:52-06'),
    ('07a533b6-8e16-4f25-bc95-483093fc0979', '2026-10-18 14:47:03-06'),
    ('0f06c1a1-dc11-4906-b52b-c8a75fa35ca0', '2026-10-18 14:47:42-06'),
    ('fb2616ed-e6bd-4059-b016-e7d077ac85da', '2026-10-18 14:48:22-06'),
    ('02ce1364-dfe2-4042-abd4-307acf1d7de7', '2026-10-18 14:49:22-06'),
    ('2a2532de-742c-401d-915c-e163c8de5546', '2026-10-18 14:49:43-06'),
    ('febff996-dd39-48aa-8bab-dca7c935cf7d', '2026-10-18 14:50:09-06'),
    ('3b97ea49-dc39-4f1a-ba0a-5aeb84b051a2', '2026-10-18 14:53:01-06'),
    ('421289ba-27b8-4274-a86d-6361bd101676', '2026-10-18 14:56:19-06')
)
UPDATE cash_movements m
   SET created_at = o.ts::timestamptz,
       note = CASE WHEN m.id = '421289ba-27b8-4274-a86d-6361bd101676'
                   THEN replace(m.note, 'Nomina Memo 10 de octubre', 'Nomina Memo 11 de octubre')
                   ELSE m.note END
  FROM orig o
 WHERE m.id = o.id::uuid
RETURNING m.id, m.created_at, m.note;
