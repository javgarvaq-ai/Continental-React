-- ============================================================================
-- EXPORT para conciliacion bancaria — solo lectura. Todo el historial.
-- Devuelve cada cobro con tarjeta/transferencia y cada movimiento que toca el
-- Banco (origen o destino = 'bank'), en hora Mexico. En el SQL Editor de Supabase:
-- correr, luego "Download CSV"/"Export" y subir el archivo al chat.
-- ============================================================================
SELECT 'pago' AS tipo,
       y.created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       y.id::text AS id,
       coalesce(y.card_terminal, '') AS terminal,
       coalesce(y.tarjeta, 0) AS tarjeta,
       coalesce(y.transferencia, 0) AS transferencia,
       '' AS category,
       NULL::numeric AS monto,
       '' AS origen,
       '' AS destino,
       '' AS nota
FROM payments y
WHERE coalesce(y.tarjeta, 0) > 0 OR coalesce(y.transferencia, 0) > 0
UNION ALL
SELECT 'mov',
       m.created_at AT TIME ZONE 'America/Mexico_City',
       m.id::text,
       '', NULL, NULL,
       coalesce(m.category, ''),
       m.amount,
       coalesce(m.source_location, ''),
       coalesce(m.destination_location, ''),
       coalesce(m.note, '')
FROM cash_movements m
WHERE m.source_location = 'bank' OR m.destination_location = 'bank'
ORDER BY fecha_mx, tipo;
