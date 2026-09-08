-- =====================================================================
-- VERIFICACION de la migracion 20260908000001_add_comandas_rp.sql
--
-- Esto NO cambia nada: son puros SELECT. Va aparte de la migracion para
-- que `supabase db push` no arrastre queries que nadie lee.
-- Correlo en el editor SQL de Supabase despues de aplicar la migracion.
--
-- Esperado:
--   - dos filas: rp_cortesia (boolean, NO, false) y rp_name (text, YES, null)
--   - con_rp = 0 y con_cortesia = 0  (todavia nadie ha capturado nada)
--   - la constraint y el indice deben aparecer
-- =====================================================================

-- ── BLOQUE 4: VERIFICACION ───────────────────────────────────────────
-- Debe devolver las dos columnas nuevas, y el conteo debe dar 0 / 0.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'comandas'
  and column_name in ('rp_name', 'rp_cortesia')
order by column_name;

select count(*) filter (where rp_name is not null)  as con_rp,
       count(*) filter (where rp_cortesia)          as con_cortesia
from public.comandas;

-- ── La constraint y el indice existen? ─────────────────────────
select conname as constraint_encontrada
from pg_constraint
where conname = 'comandas_rp_cortesia_requires_rp';

select indexname as indice_encontrado
from pg_indexes
where schemaname = 'public'
  and indexname = 'comandas_rp_name_cobrado_at_idx';
