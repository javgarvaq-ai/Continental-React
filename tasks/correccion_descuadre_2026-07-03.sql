-- =====================================================================
-- Corrección: descuadre caja/caja fuerte por doble captura de pago
-- a proveedor de jugos (03/07/26) — ver tasks/todo.md (plan aprobado
-- por Javi 2026-07-03) para el diagnóstico completo.
--
-- NO ejecutar automáticamente. Correr en el SQL Editor de Supabase,
-- BLOQUE por BLOQUE, en orden. Los BLOQUE 1-2 son solo SELECT
-- (no cambian nada) — úsalos para confirmar antes de correr el INSERT.
--
-- Requiere que ya se hayan agregado las categorías nuevas en el
-- frontend (src/config/cashMovements.js) antes de desplegar — pero
-- el INSERT de abajo funciona igual sin desplegar nada, porque
-- cash_movements.category no tiene CHECK constraint en la BD.
-- =====================================================================

-- ── BLOQUE 1: confirmar el turno abierto ahora mismo (shift_id a usar) ──
SELECT id, status, opened_at, starting_cash, opened_by_user_id
FROM shifts
WHERE status = 'open'
ORDER BY opened_at DESC;
-- Debe regresar EXACTAMENTE 1 fila. Copia su "id" — es el <SHIFT_ID> de abajo.
-- Si regresa 0 o más de 1 fila, PARA aquí y avísame antes de seguir.

-- ── BLOQUE 2: confirmar tu user_id (quien registra la corrección) ──
SELECT id, name, role
FROM users
WHERE role = 'admin'
ORDER BY name;
-- Copia el "id" que corresponda a quien va a correr esto (Javi) — es el <USER_ID> de abajo.

-- ── BLOQUE 3: confirmar saldos ANTES de corregir (deben coincidir con el audit) ──
-- Caja fuerte esperado: 4420.00  |  Caja (cajón, del turno actual): depende del turno abierto
SELECT
    SUM(CASE WHEN destination_location = 'house_safe' THEN amount
             WHEN source_location      = 'house_safe' THEN -amount
             ELSE 0 END) AS saldo_caja_fuerte_actual
FROM cash_movements;

-- ── BLOQUE 4: LAS 2 FILAS DE CORRECCIÓN (esto sí escribe datos) ──
-- Reemplaza <SHIFT_ID> y <USER_ID> con los valores confirmados en BLOQUE 1 y 2.
-- No toca ni borra las líneas 461/463 originales (Pago proveedor (resguardo) /
-- Regreso de resguardo) — quedan intactas, estas son filas NUEVAS que las referencian.

-- 4a) +1,080 a Caja fuerte (corrige el doble descuento que nunca salió físicamente de ahí)
INSERT INTO cash_movements (
    shift_id, user_id, type, amount, note, category,
    movement_nature, source_location, destination_location
) VALUES (
    '<SHIFT_ID>', '<USER_ID>', 'deposit', 1080.00,
    'Corrección error de captura 03/07/26 — ver movimientos "Pago proveedor (resguardo)" y "Regreso de resguardo" del mismo día (jugos). El pago real salió de caja en efectivo, no de resguardo; la devolución del proveedor volvió a restar resguardo por error. Caja fuerte nunca se tocó físicamente. Corrige +1,080.',
    'ajuste_ingreso_resguardo', 'adjustment', 'adjustment', 'house_safe'
);

-- 4b) -540 de Caja (registra el gasto real en efectivo que nunca se cargó a caja)
INSERT INTO cash_movements (
    shift_id, user_id, type, amount, note, category,
    movement_nature, source_location, destination_location
) VALUES (
    '<SHIFT_ID>', '<USER_ID>', 'withdrawal', 540.00,
    'Corrección error de captura 03/07/26 — gasto real en efectivo (proveedor de jugos) que se capturó por error contra resguardo en vez de caja. Corrige -540 en caja.',
    'ajuste_egreso_caja', 'adjustment', 'drawer', 'adjustment'
);

-- ── BLOQUE 5: verificación DESPUÉS de correr el BLOQUE 4 ──
-- Caja fuerte esperado: 4420 + 1080 = 5500.00
SELECT
    SUM(CASE WHEN destination_location = 'house_safe' THEN amount
             WHEN source_location      = 'house_safe' THEN -amount
             ELSE 0 END) AS saldo_caja_fuerte_final
FROM cash_movements;

-- Las 2 filas nuevas deben aparecer así en /admin/cash-movements y en /admin/ledger:
SELECT id, created_at, category, type, amount, source_location, destination_location, note
FROM cash_movements
WHERE category IN ('ajuste_ingreso_resguardo', 'ajuste_egreso_caja')
ORDER BY created_at DESC
LIMIT 2;
