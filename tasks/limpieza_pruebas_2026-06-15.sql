-- ============================================================
-- LIMPIEZA de datos de PRUEBA — Entrega 1 costeo (2026-06-15)
--
-- Borra SOLO: ventas de prueba (mesa "TEST") + el turno de prueba.
-- NO toca: costos capturados (inventory_items.unit_cost / products.manual_cost)
--          — esos son reales y se quedan.
--
-- Correr en el SQL Editor de Supabase.
-- PASO 0 → averigua los identificadores.
-- PASO 1 → PREVIEW (no borra). Revisa que los conteos cuadren.
-- PASO 2 → DELETE (descomenta y corre en bloque) cuando el preview se vea bien.
-- ============================================================

-- ---------- PASO 0: identificadores ----------
-- Nombre EXACTO de tu mesa de prueba (ajústalo abajo si no es 'TEST'):
select id, name from units order by name;
-- ID del turno de prueba (el que usaste para probar):
select id, opened_at, closed_at, status from shifts order by opened_at desc limit 5;


-- ---------- PASO 1: PREVIEW (no borra nada) ----------
-- Reemplaza 'TEST' por el nombre de tu mesa y <TEST_SHIFT_ID> por el id del turno.
with test_comandas as (
  select id from comandas where unit_id = (select id from units where name = 'TEST')
)
            select 'comandas'                 as tabla, count(*) from test_comandas
  union all select 'comanda_items'            as tabla, count(*) from comanda_items where comanda_id in (select id from test_comandas)
  union all select 'payments'                 as tabla, count(*) from payments      where comanda_id in (select id from test_comandas)
  union all select 'cash_movements (turno)'   as tabla, count(*) from cash_movements where shift_id = '<TEST_SHIFT_ID>';


-- ---------- PASO 2: DELETE (descomenta TODO el bloque y córrelo junto) ----------
/*
begin;

  -- 1) items (no tienen cascade) → primero
  delete from comanda_items
   where comanda_id in (select id from comandas where unit_id = (select id from units where name = 'TEST'));

  -- 2) comandas → CASCADE borra payments y comanda_events automáticamente
  delete from comandas
   where unit_id = (select id from units where name = 'TEST');

  -- 3) movimientos de caja del turno de prueba
  delete from cash_movements where shift_id = '<TEST_SHIFT_ID>';

  -- 4) el turno de prueba
  delete from shifts where id = '<TEST_SHIFT_ID>';

commit;
*/

-- NOTA: si creaste productos/insumos desechables nombrados 'TEST_...', se borran aparte
-- (y solo si ya no los referencia ninguna venta). Avísame y te dejo esas líneas.
-- NOTA: si alguna venta de prueba tocó membresías, podría bloquear el borrado de su
-- comanda (FK sin cascade en membership_benefit_usage / customer_memberships). Improbable
-- en pruebas; si pasa, me dices y lo resolvemos.
