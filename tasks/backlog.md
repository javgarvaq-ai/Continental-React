# Continental POS — Backlog

> Consolidated from: `pos-action-plan.md`, `sprint review-action-plan-10-May.md`, `Sprint May 13th.md`
> Last updated: 2026-05-13
>
> **Priority legend:** 🔴 High · 🟡 Medium · 🟢 Low / nice-to-have
> **Status:** `[ ]` Pending · `[~]` In progress · `[x]` Done · `[!]` Blocked/decision needed

---

## 🧹 Dead Code & Cleanup

- [x] **D1 🟡** Drop 5 legacy `products` columns — `inventory_type`, `base_unit`, `current_stock`, `parent_product_id`, `deduct_amount`. Migration `20260513000004`. Note: `deduct_amount` on `product_recipes` is alive and untouched. All unused since `product_recipes` migration. **Before writing migration:** grep each column name across `src/` to confirm zero callers. Then single `ALTER TABLE products DROP COLUMN` migration.

- [ ] **D2 🟢** `inventory_movements.quantity` column name is ambiguous — could be read as "how many units" but actually means "resulting stock after movement". **Fix:** rename to `resulting_stock`. Migration required. Update all callers in `comandaCheckout.js` and any report queries.

- [!] **D3 🟡** `customers.customer_number` is `text` — lexicographic sort can mis-order (e.g. "9" > "1000"). Today B7 fixes ordering in JS, but the root problem is the column type. **Decision needed:** convert to `integer` + format to 4-digit string only in UI, or leave as text and document the padding convention. If converting: migration with `USING customer_number::integer`, update all `padStart` callers.

- [x] **D4 🟡** `finalize_comanda_payment` RPC has redundant params: `p_tip_total` and `p_tip_amount` both receive `safePropina`; `p_total_paid` and `p_total_aplicado` both receive `totalPaid`; `p_cobrado_at` is passed from JS when `NOW()` server-side is more accurate. **Fix:** simplify RPC signature (migration `20260513000005`) + update `comandaCheckout.js` callsite. Also dropped `p_cash_received` (computable as `p_efectivo + p_change_given` server-side).

- [x] **D5 🟢** `getProductsCatalog` in `products.js` builds `groupedProducts` server-side, then `PosPage` re-groups it in a `useMemo`. Double pass. **Fix:** service now returns flat `{ products, categories }`. Single `useMemo` in PosPage builds both `groupedProducts` and `productsById` in one pass.

---

## 🐛 Bugs

- [ ] **B1 🟡** `displayedTotal` in `usePayment.js` uses `cartTotal` when status is `open` but switches to `currentComanda.final_total` otherwise. If a waiter adds items to the cart and then enters the payment screen without the comanda transitioning, `final_total` is stale and the displayed total is wrong. **File:** `src/hooks/usePayment.js` lines 62–66. **Fix:** always derive from live `cartItems` sum + membership discount; never read `final_total` for display.

- [ ] **B2 🟡** `loadComandaView` only re-runs when `currentComanda.id` changes (the `useEffect` dep). Any mutation that doesn't call `reloadCart` after completing will leave the cart desynchronized. **File:** `src/pages/PosPage.jsx` lines 211–214. **Fix:** shared reload counter in PosPage that every mutation hook increments; `loadComandaView` depends on it.

- [ ] **B3 🟢** Cart TOCTOU — `addNormalProductToComanda` / `addShotWithFreeMixers` do SELECT → INSERT with no lock. Race window is microseconds on a single-tablet model so consequence is a duplicate display row (correct totals, correct inventory). **Deferred intentionally** — only relevant if a second tablet is added. Revisit when P3 (realtime) is implemented.

---

## 🏗️ Architecture & Refactors

- [ ] **A1 🟡** `PosPage.jsx` is 1148 lines. Manages auth state, shift lifecycle, catalog, comanda state, customer state, payment flow, and renders it all. **Fix:** extract `PaymentPage.jsx` (payment panel + confirm flow), `ComandaDetailPanel.jsx` (cart + items), `OpenTableDialog.jsx`, `ReprintDialog.jsx`. Reduces prop drilling significantly.

- [ ] **A2 🟢** `useOnlineStatus` called independently in `PosPage` and `TopBar` — two event listener instances. **Fix:** `src/context/OnlineStatusContext.jsx` provider, both components consume it. **Low risk if skipped** — both instances always agree since they listen to the same browser events.

- [ ] **A3 🟢** `loadComandaView` in `PosPage` is a plain `async function`, not wrapped in `useCallback`. It's referenced inside a `useEffect` but not listed in deps (safe today because of `currentComanda.id` dep, but fragile). **Fix:** `useCallback` with `[currentComanda?.id]` dep + add to `useEffect` deps array.

- [ ] **A4 🟡** `add_item_to_comanda` as a `SECURITY DEFINER` RPC — wraps `assertComandaOpen` + INSERT/UPDATE in one atomic server-side call, closing the TOCTOU window properly. **Prerequisite for B3 fix.** Defer until second tablet is confirmed.

- [x] **A5 🟡** Payment math (`totalDue`, `totalReceived`, `netCashApplied`) is duplicated in `usePayment.getPaymentSummary` and `comandaCheckout.confirmPayment`. Risk of divergence if one is updated without the other. **Fix:** extract to `src/utils/payments.js`, import in both.

- [ ] **A6 🟢** Membership discount computed in 3 separate places: `useCustomer`, `usePayment.displayedTotal`, `Ticket.jsx`. **Fix:** `computeMembershipDiscount(membership, cartTotal)` helper in `src/utils/membership.js`, imported by all three.

---

## ⚡ Performance

- [x] **P1 🟡** N+1 in `searchCustomerByQuery` — for results by name, fires one `customer_memberships` SELECT per customer found (up to 5 round trips). **File:** `src/services/membership.js` lines 212–278. **Fix:** collect all `customer_id`s from the name query, then single `.in('customer_id', ids)` on memberships, group in JS.

- [ ] **P2 🟢** `WeeklyReportPage` runs 8 independent `reduce` passes over `cashMovements` to compute different aggregates. **File:** `src/pages/WeeklyReportPage.jsx` lines 81–190. **Fix:** single `forEach` with one accumulator object producing all metrics.

- [ ] **P3 🟡** No realtime subscriptions — two tablets on the same unit diverge silently between cobros (comanda items, status changes). Supabase realtime client is initialized but never wired up. **Only relevant if second tablet confirmed.** Fix: `supabase.channel()` subscription on `comandas` and `comanda_items` filtered by `unit_id`.

---

## 🔒 Security

- [x] **S1 🟢** RPC error strings are inserted directly into `new Error(result.error)` and rendered in the status toast. A long or malformed payload from the DB could overflow the toast layout. **File:** `src/services/comandaCheckout.js` line 14. **Fix:** truncate to 200 chars before wrapping in `Error`.

- [x] **S2 🟢** `S8` — build a whitelist of known user-facing error messages (e.g. `already_paid`, `insufficient_stock`, `comanda_not_open`); map them to clean Spanish strings; anything else → "Error interno. Contacta al administrador." **Files:** `comandaCheckout.js`, `membership.js`. Utility: `src/utils/rpcErrors.js`.

---

## 🎨 UX

- [x] **U1 🟡** `ErrorBoundary` catches JS crashes but logs nothing. Migration `20260513000003` (error_log table). `src/services/errors.js` (logError). `ErrorBoundary.jsx` calls it fire-and-forget in componentDidCatch. **Fix:** on `componentDidCatch`, insert a row into a `error_log` Supabase table (`created_at`, `error_message`, `stack`, `user_id`, `route`). Simple: one migration + one `supabase.from('error_log').insert(...)` call in the boundary. No Sentry needed yet.

- [ ] **U2 🟢** `setStatus` has no visual variants — everything renders the same. A warning looks identical to an error. **Fix:** accept `{ message, type: 'info' | 'warning' | 'error' }` shape; render with distinct background colors. Requires updating all `setStatus(string)` callsites to `setStatus({ message, type })` — wide change, do in one pass.

- [ ] **U3 🟢** Multi-tab logout — if another tab signs out, this tab doesn't know until the next `verifySession` runs (next navigation). **Fix:** `window.addEventListener('storage', ...)` in `authStore` watching for the Supabase session key being cleared, then call `clearAuth()`. **Low risk** — bar runs from one tablet.

- [ ] **U4 🟢** Print fail notification — today if the print popup is blocked, a status message appears but it disappears when `onBackToUnits` fires. **Fix:** persist the "impresión bloqueada" warning in a separate state that survives the panel reset, or show it as a modal the cashier must dismiss.

---

## 🗄️ Database Schema

- [ ] **DB1** — same as D2 above (`inventory_movements.quantity` rename).
- [ ] **DB2** — same as D3 above (`customer_number` type decision).

---

## 📋 QA Checklist (before going live)

Run these manually with dummy data before the first real shift:

1. **Full E2E flow:** login → open shift → open table with new customer → add items → activate membership → present bill → edit personas in payment → pay → reprint paid folio → reprint cancelled folio → close shift.
2. **B3 — Stock guard:** try subtracting more than available → clear error, no movement recorded, stock unchanged.
3. **B5 — Membership warning:** trigger with a duplicate membership same month → ticket prints without membership section, warning visible in status.
4. **S5 — Access guard:** log in as waiter → navigate to `/admin/empleados` and `/admin/horarios` → "Acceso denegado" shown, no crash.
5. **C7 — Schedule week:** open `ScheduleAdminPage` → week defaults to Sunday–Saturday of current week, not Monday–Sunday.
6. **Payment math:** pay with mixed efectivo + tarjeta → verify cambio, totals, and ticket all agree.
7. **Reprint folio cancelled:** cancel a comanda → try to reprint → clear error message, no ticket printed.

---

## 🚫 Intentionally Deferred

| Item | Reason |
|------|--------|
| Split `PosPage.jsx` (A1) | High effort, zero operational risk. Post-launch. |
| Realtime subscriptions (P3) | Only needed with 2+ tablets. Confirm before investing. |
| `add_item_to_comanda` RPC (A4) | Prerequisite for realtime. Same gate. |
| Cart TOCTOU (B3) | Single-tablet model makes it theoretical. |
| `useOnlineStatus` context (A2) | Two instances, zero divergence risk. |
| Multi-tab logout (U3) | One-tablet operation. |
