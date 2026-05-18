-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: payments table SELECT policy missing for authenticated role
--
-- Problem:
--   The remote schema dump created payments_select and payments_insert with
--   TO anon only. The previous auth RLS migration (20260511000005) covered
--   every other table but missed payments entirely.
--
--   Result: authenticated users (all staff) cannot SELECT from payments
--   directly. This silently breaks:
--     - DashboardPage    — getTodayPaymentStats, getRecentPayments
--     - AnalyticsPage    — getPaymentsForPeriod (daily revenue, hourly, etc.)
--     - ShiftPanel       — shift totals summary
--     - FolioHistoryPage — payment breakdown in comanda detail rows
--     - tickets.js       — reprint: fetches last payment for 'pagado' ticket
--
--   All of the above do direct .from('payments').select(...) as authenticated.
--   They return 0 rows with no error — hard to detect in QA without real data.
--
-- Fix:
--   Add SELECT policy for authenticated. No UPDATE/DELETE policies needed —
--   no client code mutates payments directly (all writes go through the
--   finalize_comanda_payment SECURITY DEFINER RPC).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;

-- SELECT: all authenticated staff can read payment records
CREATE POLICY "payments_select" ON public.payments
    FOR SELECT TO authenticated USING (true);

-- INSERT: intentionally removed — all payment inserts go through the
-- finalize_comanda_payment SECURITY DEFINER RPC which bypasses RLS.
-- A direct insert policy here would let any authenticated user bypass
-- the function's guards (idempotency check, status transition, inventory).
