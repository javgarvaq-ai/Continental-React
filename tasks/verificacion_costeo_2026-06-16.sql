-- ============================================================
-- VERIFICACIÓN snapshot de costo (Entrega 2) — 2026-06-16
-- Correr en el SQL Editor de Supabase, tras aplicar la migración
-- 20260616000001 y hacer ventas de prueba en la mesa TEST.
-- ============================================================

-- ---------- PASO 0: ¿qué costo "en vivo" tiene cada producto hoy? ----------
-- Úsalo para decidir qué cobrar de prueba y saber qué snapshot esperar.
with prod_cost as (
  select p.id as product_id, p.name, p.manual_cost,
         count(pr.id)                              as n_recetas,
         bool_or(ii.unit_cost is null)             as algun_insumo_sin_costo,
         sum(pr.deduct_amount * ii.unit_cost)      as suma_receta
  from products p
  left join product_recipes pr on pr.product_id = p.id and pr.active = true
  left join inventory_items ii on ii.id = pr.inventory_item_id
  group by p.id, p.name, p.manual_cost
)
select name,
       case when n_recetas > 0
            then case when algun_insumo_sin_costo then null else suma_receta end
            else manual_cost end                    as costo_unit_esperado,
       case when n_recetas > 0
            then case when algun_insumo_sin_costo then 'receta INCOMPLETA -> NULL'
                      else 'receta' end
            when manual_cost is not null then 'manual'
            else 'sin costo -> NULL' end             as fuente
from prod_cost
order by fuente, name;


-- ---------- PASO 1: tras las ventas de prueba, revisar el snapshot ----------
-- Compara el costo congelado (snapshot) contra el costo en vivo recalculado.
-- 'OK' = coinciden (incluido NULL = NULL). 'REVISAR' = no coinciden.
with prod_cost as (
  select p.id as product_id,
         count(pr.id)                         as n_recetas,
         bool_or(ii.unit_cost is null)        as algun_sin_costo,
         sum(pr.deduct_amount * ii.unit_cost) as suma_receta,
         p.manual_cost
  from products p
  left join product_recipes pr on pr.product_id = p.id and pr.active = true
  left join inventory_items ii on ii.id = pr.inventory_item_id
  group by p.id, p.manual_cost
),
vivo as (
  select product_id,
         case when n_recetas > 0
              then case when algun_sin_costo then null else suma_receta end
              else manual_cost end as costo_unit_vivo
  from prod_cost
)
select c.folio,
       p.name,
       ci.quantity,
       ci.unit_cost_at_sale                              as snapshot_unit,
       v.costo_unit_vivo                                 as esperado_vivo,
       (ci.quantity * ci.unit_cost_at_sale)              as costo_linea,
       case when ci.unit_cost_at_sale is not distinct from v.costo_unit_vivo
            then 'OK' else 'REVISAR' end                 as match
from comanda_items ci
join comandas c on c.id = ci.comanda_id
join products  p on p.id = ci.product_id
join vivo      v on v.product_id = ci.product_id
where c.unit_id = (select id from units where name = 'TEST')
  and ci.status = 'active'
order by c.folio desc, p.name;


-- ---------- PASO 2: prueba de INMUTABILIDAD (snapshot no cambia) ----------
-- 1) Anota el snapshot_unit de algún producto del PASO 1.
-- 2) Cambia su costo: en Admin sube el unit_cost del insumo (o el manual_cost).
-- 3) Vuelve a correr el PASO 1: el snapshot_unit de la venta vieja debe seguir
--    IGUAL (no cambia); solo cambiaría 'esperado_vivo'. Eso prueba que el costo
--    quedó congelado al vender.
