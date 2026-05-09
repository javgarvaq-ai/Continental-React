-- CRIT-1: Add 'cancelled' as a valid status for customer_memberships.
-- Previously the CHECK only allowed 'active' | 'expired', so any attempt to
-- set status = 'cancelled' from the app silently failed in DB.

ALTER TABLE customer_memberships
  DROP CONSTRAINT IF EXISTS customer_memberships_status_check;

ALTER TABLE customer_memberships
  ADD CONSTRAINT customer_memberships_status_check
  CHECK (status IN ('active', 'expired', 'cancelled'));
