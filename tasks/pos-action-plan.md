# POS Action Plan — Deep Review May 11th

> Generated from full codebase review on 2026-05-11.
> Use this file as the working backlog. Mark each item with a status tag and leave inline notes as you go.
>
> **Status legend:**
> - `[ ]` → Pending
> - `[x]` → Done
> - `[~]` → In progress
> - `[!]` → Blocked / needs decision

---

## 🔥 Top 5 — Attack First

These are the highest-impact findings. Everything else can wait until these are resolved.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| T1 | Server-side role enforcement in admin RPCs (see 7.3 + 7.6) | 🔴 High | `[ ]` |
| T2 | Duplicate index blocks membership reactivation same month (see 3.8 + 5.2) | 🔴 High | `[x]` |
| T3 | useShift + authStore + SetupAdminPage bypass service layer — refactor to services/shifts.js + RPC close_shift (see 6.1) | 🔴 High | `[ ]` |
| T4 | verify_pin has no rate limiting — PIN brute-force trivial with anon key (see 7.4) | 🔴 High | `[ ]` |
| T5 | canEditPersonas allows processing_payment but service only accepts open — UX bug in hot path (see 3.1) | 🟡 Medium | `[x]` |

---

## 1. Unused / Dead Code

- `[ ]` **1.1** `src/services/customersAdmin.js:16–28` — `getCustomerByNumber` exported but has zero callers. **Fix:** Delete function.
  > _Notes:_

- `[ ]` **1.2** `src/components/Ticket.jsx:1,406–408` — `import React` unused (React 19 + Vite JSX runtime); `export default function Ticket()` is never imported anywhere. **Fix:** Remove import and the null default export — keep only `printTicket`.
  > _Notes:_

- `[ ]` **1.3** `src/pages/CustomersAdminPage.jsx:8,26` — `useNavigate` / `navigate` declared but never called. **Fix:** Remove or add a consistent "back to POS" button.
  > _Notes:_

- `[ ]` **1.4** `src/pages/CustomersAdminPage.jsx:20–23` — Local `getCurrentMonthDate()` duplicates `membership.js#getCurrentMonthDate()` exactly. **Fix:** Import from `services/membership.js`.
  > _Notes:_

- `[ ]` **1.5** `src/services/comandaCheckout.js:306` + `usePayment.js:337` — `confirmPayment` always returns `inventoryWarning: null`; the branch in `usePayment` never fires. **Fix:** Remove the field and the dead branch, or implement the real warning.
  > _Notes:_

- `[ ]` **1.6 (info)** DB `comandas.cuenta_by` — Written only by `present_bill_atomic`, never read from client. No action needed — document it.
  > _Notes:_

- `[ ]` **1.7** DB `comanda_events.mesa_id` + `details` — Never written or read from code; orphaned index `idx_comanda_events_mesa_id`. **Fix:** Migration — drop both columns and the index.
  > _Notes:_

- `[ ]` **1.8** DB `products` legacy columns — `inventory_type`, `base_unit`, `current_stock`, `parent_product_id`, `deduct_amount` all unused since `product_recipes` migration. **Fix:** Migration to drop them (verify no rows with non-default values first).
  > _Notes:_

- `[ ]` **1.9** DB `products.category_id` has `DEFAULT gen_random_uuid()` — creates a FK to a non-existent category if not supplied. Inert today but misleading. **Fix:** `ALTER TABLE products ALTER COLUMN category_id DROP DEFAULT;`
  > _Notes:_

- `[ ]` **1.10 (info)** DB `comandas.opened_at` duplicates `comanda_events.event_type='created'`. Useful for future reports. No action needed.
  > _Notes:_

---

## 2. Logic That Can Be Simplified

- `[ ]` **2.1** `src/services/comandaCheckout.js:234–306` — `finalize_comanda_payment` RPC receives redundant params: `p_tip_total` + `p_tip_amount` both get `safePropina`; `p_total_paid` + `p_total_aplicado` both get `totalPaid`; `p_cobrado_at` computed in JS when `NOW()` server-side is the truth. Pending from sprint-review. **Fix:** Refactor RPC + caller — one source for tip, total, and timestamp.
  > _Notes:_

- `[ ]` **2.2** `src/services/products.js:43–52` — `getProductsCatalog` builds `groupedProducts` then the client re-groups in a `useMemo`. Double pass. **Fix:** Return flat `products` and let the caller group, or return only `groupedProducts`.
  > _Notes:_

- `[ ]` **2.3** `src/services/membership.js:212–278` — `searchCustomerByQuery` does N+1 membership lookups (one per customer found, up to 5). **Fix:** Single `IN (ids)` query on `customer_memberships` + `groupBy` in JS.
  > _Notes:_

- `[ ]` **2.4** `src/pages/WeeklyReportPage.jsx:81–190` — 8 independent `reduce` passes over `cashMovements`. **Fix:** Single `forEach` with one accumulator object that produces all metrics.
  > _Notes:_

- `[ ]` **2.5** `src/services/comandaCheckout.js:252–268` — Payment math (`totalDue`, `totalReceived`, `netCashApplied`) duplicated in `usePayment.getPaymentSummary`. Risk of divergence. **Fix:** Extract to `utils/payments.js`.
  > _Notes:_

- `[ ]` **2.6** `src/hooks/useCustomer.js:53–59` — Membership discount calculated in 3 separate places (`useCustomer`, `usePayment.displayedTotal`, `Ticket.jsx`). **Fix:** Extract `computeMembershipDiscount(membership, cartTotal)` helper.
  > _Notes:_

- `[ ]` **2.7** `src/hooks/usePayment.js:13–29` — `netCashApplied` recalculated in `confirmPayment` and in the ticket. **Fix:** Return `netCashApplied` from `getPaymentSummary`.
  > _Notes:_

---

## 3. Potential Runtime Bugs

- `[x]` **3.1** `src/hooks/useComanda.js:53–54` — `canEditPersonas` allows `processing_payment` but `updateComandaPersonas` had a DB guard for `status='open'` only. UI showed buttons active but the update would fail with a misleading error. **Fix:** Updated `updateComandaPersonas` in `products.js` to `.in('status', ['open', 'processing_payment'])` + improved error message.
  > _Done 2026-05-11 — `src/services/products.js`. One-line service fix, no migration needed._

- `[ ]` **3.2** `src/hooks/useCustomer.js:127–167` — `createCustomer` succeeds but `assignCustomerToComanda` can fail → orphaned customer with a consumed `customer_number`, no rollback. **Fix:** RPC `create_and_assign_customer`, or document and allow manual re-assignment.
  > _Notes:_

- `[ ]` **3.3 🔴** `src/hooks/useCustomer.js:183–217` — `activateMembership` succeeds but `addNormalProductToComanda` (line 208) failure is silently ignored → membership active in DB, comanda has no charge, customer pays $0 for their membership. **Fix:** Include the comanda line INSERT inside the `activate_membership` RPC for atomicity.
  > _Notes:_

- `[ ]` **3.4** `src/hooks/useCustomer.js:81–94` — Error from `searchCustomerByQuery` is swallowed; network failure shows "Cliente no encontrado" misleadingly. **Fix:** Surface error via `setStatus`.
  > _Notes:_

- `[ ]` **3.5** `src/pages/PosPage.jsx:228–250` — Cancelled comanda prints a "cuenta" ticket if it exists. **Fix:** Validate `comanda.status !== 'cancelled'` before branching; show error if cancelled.
  > _Notes:_

- `[ ]` **3.6** `src/pages/PosPage.jsx:344–385` — `isNew=true` with `pendingCustomerData`: comanda is inserted with `customer_name` then a second `UPDATE` resets it with `customer_id`. If UPDATE fails → comanda with name but no `customer_id`. **Fix:** Pass `customerId` directly to `getOrCreateActiveComanda` (single INSERT with both fields).
  > _Notes:_

- `[ ]` **3.7** `src/components/Ticket.jsx:368–404` — `setTimeout().print()` doesn't wait for image/font load; no `printWindow.close()` after printing. **Fix:** Use `printWindow.onafterprint = () => printWindow.close()`.
  > _Notes:_

- `[x]` **3.8 🔴** `src/services/membership.js:105–116` — `customer_memberships_customer_month_unique` (total index) blocks reactivation for same month if previous membership was cancelled/expired. **Fix:** Drop the total index — the partial `one_active_membership_per_customer_month` is the correct one. (See also 5.2)
  > _Done 2026-05-11 — migration `20260511000002_fix_membership_unique_index.sql`. Dropped total constraint; partial index remains._

- `[ ]` **3.9** `src/hooks/usePayment.js:312–334` — If `membershipResult` has a `membershipWarning`, status is overwritten but the ticket prints as if everything was fine. **Fix:** Don't print, or print an alternate ticket on warning.
  > _Notes:_

- `[ ]` **3.10** `supabase/migrations/…phase2_rpcs.sql:135–145` — `adjust_inventory_stock` silently caps at 0 with `GREATEST(current_stock - p_amount, 0)`, making `inventory_movements.quantity_change` inaccurate. **Fix:** Return an error if stock would go negative (same pattern as `deduct_inventory_item`).
  > _Notes:_

- `[ ]` **3.11** `src/store/authStore.js:4–15` — `loadFromStorage()` runs once at `create`. If another tab logs out, this tab doesn't know until refresh. **Fix:** `addEventListener('storage', ...)` to sync across tabs.
  > _Notes:_

---

## 4. Data Flow Issues

- `[ ]` **4.1** `src/pages/PosPage.jsx:193–201` — `loadComandaView` only re-runs when `currentComanda.id` changes. Any mutation hook that doesn't call `reloadCart` silently desynchronizes the cart. **Fix:** Shared reload counter in PosPage; every mutation increments it.
  > _Notes:_

- `[ ]` **4.2** `src/services/units.js:22–57` — `MesaGrid` based on a one-time snapshot; no realtime. Two tablets can try to open the same table simultaneously. DB protects with `one_open_comanda_per_unit` but UX is broken. **Fix:** Supabase realtime subscription on `comandas` (already mentioned in step 3 roadmap).
  > _Notes:_

- `[ ]` **4.3** `src/hooks/useShift.js:22–101` — Shift summary calculated client-side; if the payments query returns partial data (RLS/network), a wrong total gets saved with no warning. **Fix:** Move to RPC `close_shift` server-side (linked to 6.1).
  > _Notes:_

- `[ ]` **4.4** `src/hooks/usePayment.js:62–66` — `displayedTotal` uses `cartTotal` when `open` but `currentComanda.final_total` otherwise. If waiter adds products then goes to checkout, `final_total` is frozen while `cartTotal` silently changes. **Fix:** Ensure `cartItems` is re-read when reopening or when status changes.
  > _Notes:_

- `[ ]` **4.5** `src/pages/PosPage.jsx:197–201` — `loadComandaView` re-fetches the full product catalog every time a comanda changes. Wasted RTT. **Fix:** Move `getProductsCatalog` to `loadUnits` (once per session) with `deps: []`.
  > _Notes:_

- `[ ]` **4.6** `src/services/inventoryAdmin.js` — No auto-refresh after `adjust_inventory_stock`. Second tab modifying stock is invisible. **Fix:** Realtime subscription or invalidation flag.
  > _Notes:_

- `[ ]` **4.7** `src/services/membership.js:263–275` — `currentCustomer` caches `visit_count` + `bottle_credits_available` at assignment time; `processMembershipOnPayment` updates DB but the header shows stale values until back to units. **Fix:** OK for UX — document this behavior.
  > _Notes:_

---

## 5. Database Schema Issues

- `[ ]` **5.1** `comanda_items` — Missing index on `(comanda_id, status)` for frequent joins in `validateComandaInventoryBeforePayment` and `getActiveCartItems`. **Fix:** `CREATE INDEX comanda_items_comanda_status_idx ON comanda_items (comanda_id, status) WHERE status='active';`
  > _Notes:_

- `[x]` **5.2 🔴** `customer_memberships` — Two conflicting unique indexes: total `customer_memberships_customer_month_unique` + partial `one_active_membership_per_customer_month`. The total one blocks reactivation. **Fix:** `DROP` the total index/constraint. The partial is correct.
  > _Done 2026-05-11 — resolved via migration in 3.8._

- `[ ]` **5.3** `comanda_events` — Orphaned index `idx_comanda_events_mesa_id` on unused column. **Fix:** Drop index.
  > _Notes:_

- `[ ]` **5.4** `payments` columns — `efectivo`, `tarjeta`, `transferencia`, `total_paid` are `numeric nullable` without default. **Fix:** `NOT NULL DEFAULT 0`.
  > _Notes:_

- `[x]` **5.5** `tickets.getReprintData` — Uses `.single()` on payments; fails if comanda was cancelled before payment. **Fix:** Use `.maybeSingle()`.
  > _Done 2026-05-11 — `src/services/tickets.js` line 39. One-char change, no migration needed._

- `[ ]` **5.6** `inventory_movements` — `quantity` (resulting stock) vs `quantity_change` (delta) naming is ambiguous. Future devs will invert them. **Fix:** Rename `quantity` → `resulting_stock`.
  > _Notes:_

- `[ ]` **5.7** `users` — No `updated_at` column. PIN changes and deactivations have no audit timestamp. **Fix:** Add `updated_at` with trigger.
  > _Notes:_

- `[ ]` **5.8** `shifts` — No index on `comandas.cobrado_at` even though `getWeeklyReportData` filters on it. **Fix:** `CREATE INDEX comandas_cobrado_at_idx ON comandas (cobrado_at) WHERE status='paid';`
  > _Notes:_

- `[ ]` **5.9** `customers.customer_number` is `text` — Lexicographic ordering can cause gaps/collisions if numbers go out of sequence. **Fix:** Use `integer` + format to string in UI only.
  > _Notes:_

---

## 6. Inconsistencies

- `[ ]` **6.1 🔴** Service layer bypass — Three files call Supabase directly, violating CLAUDE.md rules:
  - `src/store/authStore.js:50–77` (`verifySession`)
  - `src/hooks/useShift.js` (entire shift logic)
  - `src/pages/SetupAdminPage.jsx:19,71,88`
  
  **Fix:** Move to `src/services/auth.js` + `src/services/shifts.js` + RPC `close_shift`. `SetupAdminPage` should use `usersAdmin.createUser`.
  > _Notes:_

- `[ ]` **6.2** Inconsistent return shapes across services:
  - `products.js#addNormalProductToComanda` → `{ error }`
  - `comandas.js#getOrCreateActiveComanda` → `{ data, error }`
  - `customersAdmin.js#getAllCustomers` → raw Supabase response
  - `membership.js#processMembershipOnPayment` → custom object without `error`
  
  **Fix:** Normalize everything to `{ data, error }` (already identified in sprint-review step 3).
  > _Notes:_

- `[ ]` **6.3 🔴** Missing status guard — `addNormalProductToComanda`, `addShotWithFreeMixers`, `decreaseCartItem` don't verify `comanda.status='open'` before INSERT/UPDATE. UI blocks it but a direct service call or race condition can add items to a `pending_payment` comanda. **Fix:** Add `WHERE EXISTS (SELECT 1 FROM comandas WHERE id = comanda_id AND status='open')` or wrap in RPC `add_item_to_comanda`.
  > _Notes:_

- `[ ]` **6.4** Error logging — `InventoryPage` and `useCustomer.handleSearchCustomer` silently swallow errors. **Fix:** Surface all errors via `setStatus` per project convention.
  > _Notes:_

- `[x]` **6.5** `CustomersAdminPage.jsx:179` — `m.status === 'active' ? 'Activa' : 'Expirada'` didn't handle `'cancelled'` — showed "Expirada" for cancelled memberships. **Fix:** Map all three states explicitly with distinct colors (green / red / grey).
  > _Done 2026-05-11 — `src/pages/CustomersAdminPage.jsx` line 179. No migration needed._

- `[ ]` **6.6** Week-start mismatch — `scheduleAdmin.js#getWeekStart` starts on Monday; `WeeklyReportPage.jsx:11` starts on Sunday. **Fix:** Unify to Monday.
  > _Notes:_

- `[ ]` **6.7 (low)** `requireOnline` not applied to read operations — reads can show empty UI with no explanation when offline. **Fix:** Document the convention or add a generic "Sin conexión" message on read failure.
  > _Notes:_

---

## 7. Security Concerns

- `[x]` **7.1** `src/services/membership.js:256` — User input fed directly to `ilike('%${trimmed}%')`. Supabase escapes injection but unescaped `%`/`_` let users match everything. **Fix:** `trimmed.replace(/[%_]/g, '\\$&')` before `ilike`.
  > _Done 2026-05-11 — `src/services/membership.js` line 213. One-liner on the trimmed variable._

- `[ ]` **7.2** `src/services/comandaCheckout.js:14` — RPC error string inserted directly into `new Error(result.error)` → rendered in toast. Long payloads could crash the toast. **Fix:** Truncate error messages to N chars before render.
  > _Notes:_

- `[ ]` **7.3 🔴** `src/store/authStore.js:17–25` — Full user object (including `role`) stored in `localStorage`. Attacker with local access edits JSON → elevates to admin until `verifySession` runs. Admin RPCs (`create_user`, `reset_user_pin`, `update_user_active`) accept any anon call with no server-side role check. **Fix:** Add `p_caller_id` param to admin RPCs + role check inside `SECURITY DEFINER` function.
  > _Notes:_

- `[ ]` **7.4 🔴** `verify_pin` RPC — No rate limiting. 6-digit PIN = 1M combinations, brute-forceable with anon key at network speed. **Fix:** Add `failed_pin_attempts` counter + temp lock on `users` table, or `pg_sleep(0.5)` on failure.
  > _Notes:_

- `[ ]` **7.5 (medium)** RLS open to anon — `comandas`, `comanda_items`, `payments`, etc. use `USING(true) WITH CHECK(true)`. Intentional for PIN-auth model on LAN. **Risk:** If tablet ever hits the internet, it's a full bypass. **Fix (long-term):** Supabase Auth sessions. **Fix (short-term):** Private LAN + reverse proxy. Document assumption in `lessons.md`.
  > _Notes:_

- `[ ]` **7.6 🔴** Admin service files — `recipeMappingsAdmin.js`, `categoriesAdmin.js`, `unitsAdmin.js`, `productsAdmin.js`, `customersAdmin.js`, `membershipAdmin.js`, `scheduleAdmin.js`, `employeesAdmin.js` — none gate writes with server-side role check. Client-side `isAdmin` can be bypassed. **Fix:** Move writes to `SECURITY DEFINER` RPCs with caller-role check (same pattern as 7.3).
  > _Notes:_

---

## ✅ Completed

| Item | Date | Notes |
|------|------|-------|
| T2 — Drop total membership unique constraint (3.8 + 5.2) | 2026-05-11 | Migration `20260511000002_fix_membership_unique_index.sql`. Partial index `one_active_membership_per_customer_month` remains. Requires `supabase db push` in prod. |
| T5 — canEditPersonas / updateComandaPersonas status mismatch (3.1) | 2026-05-11 | `src/services/products.js` — `.in('status', ['open', 'processing_payment'])` + improved error message. No migration needed. |
| R1 — Membership status label missing 'cancelled' (6.5) | 2026-05-11 | `src/pages/CustomersAdminPage.jsx` line 179 — mapped all 3 statuses with distinct colors. |
| R2 — `.single()` on payments crashes on cancelled comanda (5.5) | 2026-05-11 | `src/services/tickets.js` line 39 — changed to `.maybeSingle()`. |
| R5 — ilike wildcard not escaped in customer search (7.1) | 2026-05-11 | `src/services/membership.js` line 213 — escape `%` and `_` before ilike. |

---

*Last updated: 2026-05-11*
