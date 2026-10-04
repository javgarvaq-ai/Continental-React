-- =====================================================================
-- LIMPIEZA DE CAJA DE SEPTIEMBRE · generado 2026-10-04
--
-- A) 20-sep, turno e506c4ce…: borrar SOLO los folios de prueba 963 y 964
--    ("TestMesa", $130 efectivo c/u) y corregir los totales congelados del
--    turno (-$260). ⚠️ NO se borra el turno: tiene ventas reales (961, 965)
--    y ~20 movimientos reales (nómina, proveedores, préstamo…).
-- B) 27-sep, turno 524768b0…: el cobro 1003 ($170, Barra 11) es REAL. El
--    turno se abrió y cerró con $0 por error. Se corrige el conteo para que
--    la cadena de turnos cuadre: apertura 3,382 → cierre 3,552 (diferencia 0).
-- C) 26-sep: -$30 entre turnos → 1 movimiento `ajuste_egreso_caja` de $30
--    pegado al turno anterior al 24c7e4ee…, 1 segundo después de su cierre.
--
-- ORDEN: BLOQUE 1 (lectura) → revisar → BLOQUE 2 (escribe, atómico) →
--        BLOQUE 3 (verificación). BLOQUE 4 = rollback.
-- =====================================================================


-- ── BLOQUE 1: PREVIEW (no cambia nada) ───────────────────────────────
-- 1a) Deben salir 2 filas: folios 963 y 964, mesa TestMesa, $130 efectivo,
--     status paid, turno e506c4ce… en estado 'closed'.
SELECT c.folio, c.id AS comanda_id, c.status, u.name AS mesa,
       c.cobrado_at AT TIME ZONE 'America/Mexico_City' AS cobrada_mx,
       p.efectivo, p.tarjeta, p.transferencia, p.tip_amount, p.change_given,
       s.status AS estado_turno,
       (SELECT COUNT(*) FROM comanda_items ci WHERE ci.comanda_id = c.id) AS items
FROM comandas c
LEFT JOIN payments p ON p.comanda_id = c.id
LEFT JOIN units    u ON u.id = c.unit_id
LEFT JOIN shifts   s ON s.id = p.shift_id
WHERE c.folio IN (963, 964);

-- 1b) Dependencias sin cascada: ambas deben dar 0.
SELECT 'customer_memberships' AS tabla, COUNT(*) AS filas
FROM customer_memberships
WHERE paid_via_comanda_id IN (SELECT id FROM comandas WHERE folio IN (963, 964))
UNION ALL
SELECT 'membership_benefit_usage', COUNT(*)
FROM membership_benefit_usage
WHERE comanda_id IN (SELECT id FROM comandas WHERE folio IN (963, 964));

-- 1c) ¿Se descontó inventario? (si sale 0 filas, no hay nada que regresar)
SELECT c.folio, im.movement_type, im.quantity_change, im.note
FROM inventory_movements im
JOIN comanda_items ci ON ci.id = im.comanda_item_id
JOIN comandas c ON c.id = ci.comanda_id
WHERE c.folio IN (963, 964);

-- 1d) Los dos turnos a corregir. Esperado:
--     e506c4ce…: total_efectivo X, expected_cash 6539, difference -260
--     524768b0…: starting_cash 0, cash_counted 0, expected_cash 170, difference -170
SELECT id, status, starting_cash, cash_counted, expected_cash, difference, total_efectivo,
       opened_at AT TIME ZONE 'America/Mexico_City' AS abrio_mx,
       closed_at AT TIME ZONE 'America/Mexico_City' AS cerro_mx
FROM shifts
WHERE id IN ('e506c4ce-f27f-4455-acfc-f51ba082d46c', '524768b0-8d18-42e3-8061-b7374c3ca648');

-- 1e) Turno anterior al 24c7e4ee… (el que cerró con 3,946). Debe salir 1 fila
--     con cash_counted 3946, cerrado antes de que abriera 24c7e4ee…
SELECT p.id, p.cash_counted, p.opened_by_user_id,
       p.closed_at AT TIME ZONE 'America/Mexico_City' AS cerro_mx,
       n.opened_at AT TIME ZONE 'America/Mexico_City' AS abre_siguiente_mx
FROM shifts n
JOIN LATERAL (
    SELECT * FROM shifts x
    WHERE x.status = 'closed' AND x.closed_at <= n.opened_at
    ORDER BY x.closed_at DESC LIMIT 1
) p ON true
WHERE n.id::text LIKE '24c7e4ee%';


-- ── BLOQUE 2: ESCRITURA (atómica: si un guard falla, no se guarda NADA) ──
DO $$
DECLARE
    n int;
    v_prev_id uuid;
    v_prev_user uuid;
    v_prev_closed timestamptz;
    v_next_open timestamptz;
BEGIN
    -- A1) guard: exactamente 2 comandas de prueba
    SELECT COUNT(*) INTO n
    FROM comandas c JOIN units u ON u.id = c.unit_id
    WHERE c.folio IN (963, 964) AND u.name = 'TestMesa' AND c.status = 'paid';
    IF n <> 2 THEN
        RAISE EXCEPTION 'Se esperaban 2 comandas TestMesa pagadas (963/964) y hay % — nada se guardó', n;
    END IF;

    -- A2) borrar (items primero; payments y comanda_events se van en cascada)
    DELETE FROM comanda_items
    WHERE comanda_id IN (SELECT id FROM comandas WHERE folio IN (963, 964));
    DELETE FROM comandas WHERE folio IN (963, 964);

    -- A3) totales congelados del turno cerrado
    UPDATE shifts
    SET total_efectivo = total_efectivo - 260,
        expected_cash  = expected_cash  - 260,
        difference     = COALESCE(difference, 0) + 260
    WHERE id = 'e506c4ce-f27f-4455-acfc-f51ba082d46c'
      AND status = 'closed'
      AND round(expected_cash::numeric, 2) = 6539
      AND round(difference::numeric, 2) = -260;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
        RAISE EXCEPTION 'Turno e506c4ce no coincide con lo esperado (6539 / -260) — nada se guardó';
    END IF;

    -- B) turno fantasma del 27-sep
    UPDATE shifts
    SET starting_cash = 3382, cash_counted = 3552, expected_cash = 3552, difference = 0
    WHERE id = '524768b0-8d18-42e3-8061-b7374c3ca648'
      AND status = 'closed'
      AND round(starting_cash::numeric, 2) = 0
      AND round(cash_counted::numeric, 2) = 0
      AND round(expected_cash::numeric, 2) = 170;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
        RAISE EXCEPTION 'Turno 524768b0 no coincide con lo esperado (0 / 0 / 170) — nada se guardó';
    END IF;

    -- C) -$30 del 26-sep: movimiento de ajuste en el turno anterior
    SELECT p.id, p.opened_by_user_id, p.closed_at, nx.opened_at
      INTO v_prev_id, v_prev_user, v_prev_closed, v_next_open
    FROM shifts nx
    JOIN LATERAL (
        SELECT * FROM shifts x
        WHERE x.status = 'closed' AND x.closed_at <= nx.opened_at
        ORDER BY x.closed_at DESC LIMIT 1
    ) p ON true
    WHERE nx.id::text LIKE '24c7e4ee%';

    IF v_prev_id IS NULL OR v_prev_user IS NULL THEN
        RAISE EXCEPTION 'No se encontró el turno anterior al 24c7e4ee — nada se guardó';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM shifts WHERE id = v_prev_id AND round(cash_counted::numeric, 2) = 3946) THEN
        RAISE EXCEPTION 'El turno anterior no cerró con 3,946 — nada se guardó';
    END IF;
    IF v_prev_closed + interval '1 second' >= v_next_open THEN
        RAISE EXCEPTION 'No hay hueco entre el cierre y la apertura siguiente — nada se guardó';
    END IF;

    INSERT INTO cash_movements
        (id, shift_id, user_id, type, amount, note, created_at,
         category, movement_nature, source_location, destination_location)
    VALUES
        ('a0a0a0a0-0030-4000-8000-000000000002', v_prev_id, v_prev_user,
         'withdrawal', 30, 'Ajuste faltante 26 sept (cierre 3,946 → apertura 3,916)',
         v_prev_closed + interval '1 second',
         'ajuste_egreso_caja', 'adjustment', 'drawer', 'adjustment');
END $$;


-- ── BLOQUE 3: ⭐ VERIFICACIÓN ─────────────────────────────────────────
-- 3a) Debe dar 0 filas (ya no existen 963/964).
SELECT folio FROM comandas WHERE folio IN (963, 964);

-- 3b) e506c4ce: difference 0, expected_cash 6279. 524768b0: 3382 / 3552 / 3552 / 0.
SELECT id, starting_cash, cash_counted, expected_cash, difference, total_efectivo
FROM shifts
WHERE id IN ('e506c4ce-f27f-4455-acfc-f51ba082d46c', '524768b0-8d18-42e3-8061-b7374c3ca648');

-- 3c) 1 fila: ajuste de $30.
SELECT id, shift_id, created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx, category, amount, note
FROM cash_movements WHERE id = 'a0a0a0a0-0030-4000-8000-000000000002';

-- 3d) Huérfanos: ambas 0.
SELECT 'payments huérfanos' AS check, COUNT(*) AS filas
FROM payments p WHERE NOT EXISTS (SELECT 1 FROM comandas c WHERE c.id = p.comanda_id)
UNION ALL
SELECT 'comanda_items huérfanos', COUNT(*)
FROM comanda_items ci WHERE NOT EXISTS (SELECT 1 FROM comandas c WHERE c.id = ci.comanda_id);


-- ── BLOQUE 4: ROLLBACK ───────────────────────────────────────────────
-- Los folios 963/964 NO se pueden "des-borrar" (eran de prueba, sin valor).
-- Lo demás sí se revierte:
-- DO $$
-- BEGIN
--     DELETE FROM cash_movements WHERE id = 'a0a0a0a0-0030-4000-8000-000000000002';
--     UPDATE shifts SET starting_cash=0, cash_counted=0, expected_cash=170, difference=-170
--      WHERE id = '524768b0-8d18-42e3-8061-b7374c3ca648';
--     UPDATE shifts SET total_efectivo = total_efectivo + 260, expected_cash = 6539, difference = -260
--      WHERE id = 'e506c4ce-f27f-4455-acfc-f51ba082d46c';
-- END $$;
