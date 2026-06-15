-- ─────────────────────────────────────────────────────────────────────────────
-- Costeo de productos — Entrega 1: captura de costo manual.
--
-- Aditivo y NULLABLE: no afecta inserts, lecturas ni el cobro existentes.
-- No crea tablas/vistas/funciones nuevas → no cambia RLS ni Data API.
-- Las tablas ya tienen RLS y políticas de UPDATE para admin; agregar columnas
-- no requiere políticas nuevas.
--
--   inventory_items.unit_cost  → costo por unidad del insumo, en su unit_type
--                                (por oz o por unit). NULL = sin capturar.
--                                Motor de costo vía product_recipes.
--   products.manual_cost       → costo directo de un producto SIN receta
--                                (fallback del modelo híbrido). NULL = sin capturar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table "public"."inventory_items"
  add column if not exists "unit_cost" numeric(12,4);

alter table "public"."products"
  add column if not exists "manual_cost" numeric(12,2);

comment on column "public"."inventory_items"."unit_cost" is
  'Costo por unidad del insumo (en su unit_type: oz/unit). NULL = sin capturar. Base para costear productos vía product_recipes.';

comment on column "public"."products"."manual_cost" is
  'Costo directo del producto cuando NO tiene receta (product_recipes). NULL = sin capturar.';
