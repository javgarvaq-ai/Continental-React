-- HP-6: Enforce that comanda_items.status can only be 'active' or 'cancelled'.
-- This supports soft-delete: instead of DELETE, the app sets status='cancelled'.
-- Existing rows all have status='active' so this constraint is safe to add.

ALTER TABLE comanda_items
  ADD CONSTRAINT comanda_items_status_check
  CHECK (status IN ('active', 'cancelled'));
