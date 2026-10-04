-- =====================================================================
-- PRÉSTAMO + APORTACIÓN DE SOCIO · generado 2026-10-04
--
-- 1) Reclasifica los 3 pagos del préstamo de Juan (jul/ago/sep) a la
--    categoría nueva `pago_prestamo_banco` (naturaleza debt_payment):
--    dejan de contar como gasto operativo/renta y de bajar la utilidad.
--    El banco baja igual que antes (siguen saliendo del banco).
--    NO se toca "PROPINAS PRESTAMO MEMO" (0bcdbe05…, $800): es otra cosa.
-- 2) Registra la aportación de Eduardo Ibarra: $3,000, 7-sep, entró a
--    Mercado Pago.
--
-- ORDEN: BLOQUE 1 (solo lectura) → revisar → BLOQUE 2 (escribe) →
--        BLOQUE 3 (verificación). El BLOQUE 4 es el ROLLBACK, solo si algo salió mal.
-- ⚠️ Antes de correr: el código nuevo (categorías) ya debe estar desplegado,
--    si no, la pantalla de Movimientos mostrará la clave cruda.
-- =====================================================================


-- ── BLOQUE 1: PREVIEW (no cambia nada) ───────────────────────────────
-- Deben salir 3 filas: 15500 / 15500 / 15400 (total 46,400), todas
-- source=bank, nota "Pago prestamo/préstamo Juan".
SELECT id, created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       category, movement_nature, destination_location, amount, note
FROM cash_movements
WHERE id IN ('60111cb3-ab20-4759-9269-e574f4955d02',
             '298e825c-2cb4-4cca-9b0b-74690d6f1096',
             'd24cf433-7d43-46a4-836f-398a4d2e512b')
ORDER BY created_at;

-- Turno del 7-sep al que se va a pegar la aportación (debe salir 1 fila,
-- opened_by_user_id NO nulo, abierto 12:48 y cerrado 22:16).
SELECT id, opened_by_user_id,
       opened_at AT TIME ZONE 'America/Mexico_City' AS abrio_mx,
       closed_at AT TIME ZONE 'America/Mexico_City' AS cerro_mx
FROM shifts WHERE id = '83dcb48e-cdd1-4818-beeb-5754a67a626f';

-- Que no exista ya una aportación igual (debe dar 0).
SELECT COUNT(*) AS aportaciones_ya_registradas
FROM cash_movements
WHERE category = 'aportacion_socio_banco' AND amount = 3000;


-- ── BLOQUE 2: ESCRITURA (atómica; si algo no cuadra, truena y no cambia nada) ──
DO $$
DECLARE
    n int;
    v_user uuid;
BEGIN
    -- 2a) reclasificar los 3 préstamos
    UPDATE cash_movements
    SET category = 'pago_prestamo_banco',
        movement_nature = 'debt_payment',
        destination_location = 'loan'
    WHERE id IN ('60111cb3-ab20-4759-9269-e574f4955d02',
                 '298e825c-2cb4-4cca-9b0b-74690d6f1096',
                 'd24cf433-7d43-46a4-836f-398a4d2e512b')
      AND note ILIKE '%pr_stamo%'
      AND source_location = 'bank'
      AND amount IN (15500, 15400);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 3 THEN
        RAISE EXCEPTION 'Reclasificación: se esperaban 3 filas y fueron % — nada se guardó', n;
    END IF;

    -- 2b) aportación de socio
    SELECT opened_by_user_id INTO v_user
    FROM shifts WHERE id = '83dcb48e-cdd1-4818-beeb-5754a67a626f';
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'El turno 83dcb48e… no existe o no tiene opened_by_user_id — nada se guardó';
    END IF;

    INSERT INTO cash_movements
        (id, shift_id, user_id, type, amount, note, created_at,
         category, movement_nature, source_location, destination_location)
    VALUES
        ('a0a0a0a0-3000-4000-8000-000000000001',
         '83dcb48e-cdd1-4818-beeb-5754a67a626f', v_user,
         'deposit', 3000,
         'Aportación socio Eduardo Ibarra 7 sept (transferencia a Mercado Pago)',
         '2026-09-07 13:00:00-06',
         'aportacion_socio_banco', 'owner_funding', 'owner', 'bank');
END $$;


-- ── BLOQUE 3: ⭐ VERIFICACIÓN ─────────────────────────────────────────
-- Esperado: 3 filas pago_prestamo_banco/debt_payment/loan (46,400) + 1 fila aportacion_socio_banco (3,000).
SELECT id, created_at AT TIME ZONE 'America/Mexico_City' AS fecha_mx,
       category, movement_nature, source_location, destination_location, amount, note
FROM cash_movements
WHERE category IN ('pago_prestamo_banco', 'aportacion_socio_banco')
ORDER BY created_at;


-- ── BLOQUE 4: ROLLBACK (solo si algo salió mal) ──────────────────────
-- DO $$
-- BEGIN
--     DELETE FROM cash_movements WHERE id = 'a0a0a0a0-3000-4000-8000-000000000001'
--       AND category = 'aportacion_socio_banco';
--     UPDATE cash_movements SET category='renta_banco', movement_nature='expense', destination_location='expense'
--      WHERE id = '60111cb3-ab20-4759-9269-e574f4955d02';
--     UPDATE cash_movements SET category='gasto_operativo_banco', movement_nature='expense', destination_location='expense'
--      WHERE id IN ('298e825c-2cb4-4cca-9b0b-74690d6f1096','d24cf433-7d43-46a4-836f-398a4d2e512b');
-- END $$;
