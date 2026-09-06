-- ─────────────────────────────────────────────────────────────────────────────
-- Costeo manual — Fase 1: costo de referencia, independiente de receta/manual_cost.
--
-- Decisión 2026-09-06: el costo de receta (product_recipes + inventory_items)
-- deja de usarse como fuente de margen/COGS. Javi captura manualmente un costo
-- de referencia por producto, con nota libre, completamente separado de:
--   - `manual_cost` (fallback del modelo híbrido viejo — se deja intacta, sin
--     uso una vez que los reportes migren a Fase 2, no se borra todavía)
--   - `product_recipes` / `inventory_items` (quedan 100% para descuento de
--     stock, sin ningún rol en costeo)
--
-- Aditivo y NULLABLE: no afecta inserts, lecturas ni el cobro existentes.
-- No crea tablas/vistas/funciones nuevas → no cambia RLS ni Data API.
-- `products` ya tiene RLS + política de UPDATE para admin; agregar columnas
-- no requiere políticas nuevas.
--
--   products.reference_cost      → costo de referencia manual, para margen/COGS.
--                                   NULL = sin capturar.
--   products.reference_cost_note → nota libre de referencia (ej. "incluye hielo").
-- ─────────────────────────────────────────────────────────────────────────────

alter table "public"."products"
  add column if not exists "reference_cost" numeric(12,2);

alter table "public"."products"
  add column if not exists "reference_cost_note" text;

comment on column "public"."products"."reference_cost" is
  'Costo de referencia manual, capturado por Javi — fuente única de margen/COGS desde 2026-09-06. Independiente de manual_cost y de product_recipes. NULL = sin capturar.';

comment on column "public"."products"."reference_cost_note" is
  'Nota libre de referencia sobre el costo (ej. qué incluye). Solo informativa, no participa en ningún cálculo.';

-- Seed: copiar manual_cost -> reference_cost donde ya exista, para no volver a
-- teclear ~100 productos desde cero. Solo llena filas con reference_cost NULL
-- (idempotente — no pisa nada si esta migración se corre más de una vez).
update "public"."products"
set "reference_cost" = "manual_cost"
where "manual_cost" is not null
  and "reference_cost" is null;
