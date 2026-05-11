# Principal Architect Audit & Action Plan — 10 May 2026

## Scope Reviewed
`PosPage.jsx` (1148 lines), `useComanda.js`, `useCustomer.js`, `useShift.js`, `authStore.js`, `comandas.js`, `comandaCheckout.js`, `products.js`, `membership.js`, all migrations through `20260510000002`. Full file tree cross-referenced.

---

## ⚡ Top 3 Immediate Concerns

### 1. N+1 query loop in the payment hot path
`validateComandaInventoryBeforePayment` (comandaCheckout.js L102–207) fires one SELECT to get all comanda items, then loops through every item that `requires_inventory` and fires a separate `product_recipes` query inside the loop. A comanda with 8 inventory-tracked items fires 9 round trips to Supabase before the payment RPC is even called.

**Fix:** Batch the recipe SELECT with `.in('product_id', inventoryProductIds)` once and group in JS.

### 2. `processMembershipOnPayment` is non-atomic — manual rollback is broken by design
Sequence in `membership.js` (L173–331):
1. SELECT customer visit_count + bottle_credits
2. UPDATE customer (new counts)
3. INSERT membership_benefit_usage rows
4. Manual rollback (revert customer) if INSERT fails

The rollback only covers one failure mode. Concurrent payments on the same customer (two tablets) both read the same `prevVisitCount`, both increment to the same `newVisitCount` — customer gets one visit instead of two. If the rollback itself fails, `visit_count` is incremented but the usage log is absent — silent inconsistency.

**Fix:** Move entirely into `finalize_comanda_payment` as a SQL transaction block.

### 3. `PosPage.jsx` is a 1148-line god component
Manages auth state, shift lifecycle, product catalog fetching, comanda state, customer state, payment flow, and renders all of it. Adding any new POS feature requires opening this file and understanding the full interaction surface. Makes targeted testing impossible.

**Fix:** Extract payment flow into `PaymentPage.jsx`, comanda detail into `ComandaDetailPanel.jsx`.

---

## Critical Debt

| Issue | File | Lines | Risk |
|-------|------|-------|------|
| Missing status guard on `assignCustomerToComanda` | `comandas.js` | L116–122 | Can assign customer to `pending_payment` comanda |
| Missing status guard on `updateComandaPersonas` | `products.js` | L393–405 | Can update headcount on paid comanda |
| Non-atomic shot+mixer write | `products.js` | L151–284 | Orphaned shot if mixer INSERT fails |
| SELECT→INSERT TOCTOU race | `products.js` | L71–112 | Duplicate line items under concurrent adds |
| Stale stock read before RPC | `comandaCheckout.js` | L246–249 | Inventory validation gives false confidence |
| localStorage session not re-validated on route change | `authStore.js` | — | Low risk (tablet only), but worth noting |

---

## Architectural Smells

- **Membership processing lives in JS, not SQL** — every other critical path uses SECURITY DEFINER RPCs; membership is the only exception and it's the most race-prone
- **`confirmPayment` passes redundant RPC params** — `p_tip_total` and `p_tip_amount` both receive `safePropina`; `p_total_paid` and `p_total_aplicado` both receive `totalPaid`; `p_cobrado_at` could be `NOW()` server-side
- **`getProductsCatalog` fires two sequential queries** — products then categories have no dependency; `Promise.all` cuts load time in half
- **No real-time subscriptions** — two tablets on the same unit diverge silently; Supabase realtime client is initialized but never wired up
- **Inconsistent service return shapes** — most functions return `{ data, error }`, some return only `{ error }`, one returns a raw Supabase response

---

## The Rewrite Verdict

**Do not rewrite. Fix it.**

The architectural skeleton is sound. Service layer separation is real and disciplined. The RPC pattern for critical paths is well-established. The migration history shows careful, incremental hardening. The debt is concentrated and identifiable, not systemic.

---

## 3-Step Prioritized Roadmap

### Step 1 — Current Sprint (data correctness, zero schema changes) ✅ (2026-05-10)
- [x] Fix missing status guard in `assignCustomerToComanda`
- [x] Fix missing status guard in `updateComandaPersonas`
- [x] Replace N+1 loop in `validateComandaInventoryBeforePayment` with batched query
- [x] Parallelize `getProductsCatalog` with `Promise.all`

### Step 2 — Next Sprint (atomic operations, DB migration required)
- [x] Move `processMembershipOnPayment` to standalone `process_membership_on_payment` RPC — migration `20260511000001`. SELECT FOR UPDATE on customer row eliminates TOCTOU race. JS wrapper in `membership.js` reduced from 160 → 35 lines.
- [x] Add stock guard inside payment path (RAISE EXCEPTION if deduction goes negative) — already present in `deduct_inventory_item` via `WHERE current_stock >= p_deduct_amount`; confirmed complete.
- [ ] Replace SELECT→INSERT/UPDATE in `addNormalProductToComanda` with atomic upsert — **pending schema decision: needs UNIQUE constraint on comanda_items (comanda_id, product_id, is_free_mixer, is_free_benefit) WHERE status='active'**
- [ ] Replace SELECT→INSERT/UPDATE in `addShotWithFreeMixers` with atomic upsert or RPC — **same schema decision required**

### Step 3 — Medium Term (architecture, no functional risk)
- [ ] Split `PosPage.jsx` — extract `PaymentPage.jsx` and `ComandaDetailPanel.jsx`
- [ ] Add Supabase realtime subscription on `comanda_items` filtered by `comanda_id`
- [ ] Normalize all service functions to `{ data, error }` return shape
- [ ] Clean up redundant params in `confirmPayment` / `finalize_comanda_payment` RPC interface

---

## Status

- **Step 1:** ✅ Complete (2026-05-10)
- **Step 2:** 🔄 Partial — membership RPC done, cart upserts pending schema decision
- **Step 3:** Not started
