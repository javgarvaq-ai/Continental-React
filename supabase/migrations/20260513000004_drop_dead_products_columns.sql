-- Migration: 20260513000004_drop_dead_products_columns
-- Drops 5 legacy columns from `products` that have been unused since the
-- product_recipes migration. Verified zero callers in src/ before dropping.
--
-- Columns dropped:
--   inventory_type    — replaced by product_recipes.inventory_item_id
--   base_unit         — replaced by inventory_items.unit_type
--   current_stock     — replaced by inventory_items.current_stock
--   parent_product_id — FK self-reference, never used in any query
--   deduct_amount     — replaced by product_recipes.deduct_amount
--
-- Note: deduct_amount on product_recipes is ALIVE and NOT touched here.

-- Drop the self-referencing FK constraint before dropping the column
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_parent_product_id_fkey;

ALTER TABLE products
    DROP COLUMN IF EXISTS inventory_type,
    DROP COLUMN IF EXISTS base_unit,
    DROP COLUMN IF EXISTS current_stock,
    DROP COLUMN IF EXISTS parent_product_id,
    DROP COLUMN IF EXISTS deduct_amount;
