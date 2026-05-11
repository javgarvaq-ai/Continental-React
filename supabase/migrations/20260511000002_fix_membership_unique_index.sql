-- Fix: drop the total unique constraint on (customer_id, month) in customer_memberships.
--
-- The total index blocked reactivation of a membership for a customer who already had a
-- cancelled or expired membership in the same month, causing a unique violation on INSERT.
--
-- The partial index one_active_membership_per_customer_month (WHERE status = 'active')
-- is the correct guard and remains in place — it only prevents two *active* memberships
-- for the same customer + month, which is the intended behavior.
--
-- Dropping the constraint also drops the underlying index since it was promoted via
-- "ADD CONSTRAINT ... USING INDEX ...".

ALTER TABLE public.customer_memberships
    DROP CONSTRAINT IF EXISTS customer_memberships_customer_month_unique;
