-- Expand inventory_items.unit_type CHECK constraint to include
-- common bar/kitchen units: kg, g, L, ml.
--
-- Before: only 'unit' and 'oz' were accepted.
-- After:  'unit', 'oz', 'kg', 'g', 'L', 'ml'
--
-- Existing rows are all 'unit' or 'oz' — no data migration needed.

ALTER TABLE inventory_items
  DROP CONSTRAINT inventory_items_unit_type_check;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_unit_type_check
  CHECK (unit_type = ANY (ARRAY['unit'::text, 'oz'::text, 'kg'::text, 'g'::text, 'L'::text, 'ml'::text]));
