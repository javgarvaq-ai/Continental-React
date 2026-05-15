-- ─────────────────────────────────────────────────────────────────────────────
-- D3 — Convert customers.customer_number from text to integer
--
-- Problem: column is text, so lexicographic sort mis-orders values when
-- numbers have different digit lengths (e.g. "9" > "1000"). All current values
-- are zero-padded to 4 digits ("0001") so the bug is latent, but as the
-- customer list grows past 9 entries it will surface in the admin list sort.
--
-- Fix: cast to integer. Display formatting (zero-padding to 4 digits) moves
-- fully into the UI layer via String(n).padStart(4, '0').
--
-- JS callers updated alongside this migration:
--   - membership.js: parseInt before .eq('customer_number', ...)
--   - customersAdmin.js: filter uses padded string for .includes() search
--   - useCustomer.js, usePayment.js, CustomersAdminPage.jsx, PosPage.jsx:
--     all display sites add String(n).padStart(4, '0')
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.customers
    ALTER COLUMN customer_number TYPE integer
    USING customer_number::integer;
