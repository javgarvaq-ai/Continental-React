-- =====================================================================
-- Corrección: comanda capturada como pago en EFECTIVO, pero en realidad
-- se cobró con TARJETA (comanda del día operativo 2026-08-03, detectada
-- 2026-08-04) — ver tasks/todo.md (plan pendiente de aprobación) para
-- el diagnóstico completo.
--
-- comanda_id = 4a850cf2-d46c-4fca-a5f1-7834b30d9bae
--
-- NO ejecutar automáticamente. Correr en el SQL Editor de Supabase,
-- BLOQUE por BLOQUE, en orden. BLOQUES 1-3 son solo SELECT (no cambian
-- nada) — úsalos para confirmar los datos ANTES de correr cualquier
-- UPDATE. Si algo en 1-3 no coincide con lo que esperas, PARA y avísame
-- antes de seguir.
--
-- Por qué se corrige así: `payments` tiene UNA fila por comanda
-- (payments_comanda_id_unique) con montos separados por método
-- (efectivo/tarjeta/transferencia). El Ledger, los reportes y el
-- cálculo de comisión de tarjeta (utils/ledger.js) leen esta fila
-- directamente — corregirla aquí es la corrección de raíz. Ver BLOQUE 5
-- (opcional, tu decisión) para la fila cacheada en `shifts` si ese
-- turno ya está cerrado.
-- =====================================================================

-- ── BLOQUE 1: confirmar la comanda ──
SELECT id, status, table_id, total, final_total, created_at
FROM comandas
WHERE id = '4a850cf2-d46c-4fca-a5f1-7834b30d9bae';
-- Confirma que existe y que la fecha coincide con "ayer".

-- ── BLOQUE 2: confirmar el pago actual (esto es lo que vamos a corregir) ──
SELECT id, comanda_id, shift_id, efectivo, tarjeta, transferencia,
       total_paid, tip_amount, change_given, created_at
FROM payments
WHERE comanda_id = '4a850cf2-d46c-4fca-a5f1-7834b30d9bae';
-- Debe regresar EXACTAMENTE 1 fila (payments_comanda_id_unique).
-- Anota el valor de "efectivo" — es el <MONTO> que se mueve a tarjeta.
-- Anota "shift_id" — lo necesitas para el BLOQUE 3 y el BLOQUE 5.

-- ── BLOQUE 3: confirmar el turno al que pertenece ese pago ──
-- Reemplaza <SHIFT_ID> con el valor confirmado en BLOQUE 2.
SELECT id, status, opened_at, closed_at, cash_counted, expected_cash,
       difference, total_efectivo, total_tarjeta
FROM shifts
WHERE id = '<SHIFT_ID>';
-- Si status = 'closed': total_efectivo/total_tarjeta/expected_cash/
-- difference son una FOTO fija tomada al cerrar (closeShift en
-- services/shifts.js) — NO se recalculan solas. Si quieres que el
-- historial de ese turno también refleje el cambio, hace falta el
-- BLOQUE 5. Si prefieres dejar esa foto tal cual (como registro de lo
-- que se contó/creyó esa noche) y que solo el pago quede corregido
-- hacia adelante, te saltas el BLOQUE 5.

-- ── BLOQUE 4: LA CORRECCIÓN — mueve el monto de efectivo a tarjeta ──
-- No hace falta escribir el monto a mano: se mueve el valor actual de
-- "efectivo" completo a "tarjeta" y "efectivo" queda en 0. El guard
-- "AND efectivo > 0" evita aplicar esto dos veces por error.
UPDATE payments
SET tarjeta  = tarjeta + efectivo,
    efectivo = 0
WHERE comanda_id = '4a850cf2-d46c-4fca-a5f1-7834b30d9bae'
  AND efectivo > 0
RETURNING id, comanda_id, efectivo, tarjeta, transferencia, total_paid;
-- total_paid NO cambia (efectivo+tarjeta+transferencia sigue sumando
-- lo mismo) — solo se mueve entre columnas.

-- ── BLOQUE 5 (OPCIONAL — solo si decides corregir también el turno) ──
-- Sáltate este bloque si prefieres dejar la foto del cierre de turno
-- como estaba (con la diferencia de esa noche documentada aquí mismo
-- como explicación). Si SÍ quieres que el historial del turno quede
-- consistente con el pago corregido, reemplaza <SHIFT_ID> y <MONTO>
-- (el valor de "efectivo" que anotaste en BLOQUE 2, ANTES de que el
-- BLOQUE 4 lo pusiera en 0) y corre esto:
UPDATE shifts
SET total_efectivo = total_efectivo - <MONTO>,
    total_tarjeta  = total_tarjeta + <MONTO>,
    expected_cash  = expected_cash - <MONTO>,
    difference     = cash_counted - (expected_cash - <MONTO>)
WHERE id = '<SHIFT_ID>'
RETURNING id, status, cash_counted, expected_cash, difference, total_efectivo, total_tarjeta;
-- Nota: si difference ya explicaba exactamente este faltante (ej. el
-- turno cerró "corto" por este monto), después de este UPDATE
-- difference debería acercarse a 0 — eso confirma que esta comanda era
-- la causa del descuadre de esa noche.

-- ── BLOQUE 6: verificación final ──
SELECT id, comanda_id, efectivo, tarjeta, transferencia, total_paid
FROM payments
WHERE comanda_id = '4a850cf2-d46c-4fca-a5f1-7834b30d9bae';
