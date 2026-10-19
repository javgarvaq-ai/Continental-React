-- Corrige nota: pago de $2,450 del 26-sep capturado como "Nomina Memo" era de Gus.
-- Aprobado por Javi 2026-10-18. Solo cambia la nota (monto, fecha y categoría quedan igual).

-- ===== BLOQUE 1: PREVIEW (solo lectura) — esperado: 1 fila, amount 2450, note "Nomina Memo"
SELECT id, created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx, category, amount, note
FROM cash_movements
WHERE amount = 2450
  AND category = 'nomina_caja'
  AND created_at >= '2026-09-26 16:20-06' AND created_at < '2026-09-26 16:35-06';

-- ===== BLOQUE 2: UPDATE — esperado: 1 fila devuelta
UPDATE cash_movements
   SET note = 'Nomina Gus (capturado como Memo, corregido 18-oct)'
 WHERE amount = 2450
   AND category = 'nomina_caja'
   AND note ILIKE 'nomina memo'
   AND created_at >= '2026-09-26 16:20-06' AND created_at < '2026-09-26 16:35-06'
RETURNING id, created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx, amount, note;

-- ===== BLOQUE 3: ROLLBACK (solo si algo salió mal)
-- UPDATE cash_movements SET note = 'Nomina Memo'
--  WHERE note = 'Nomina Gus (capturado como Memo, corregido 18-oct)' RETURNING id, note;
