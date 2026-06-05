# Pre-Launch Audit — Continental POS

**Date:** 2026-05-31
**Scope:** Read-only audit. No code was changed.
**Method:** Static analysis of `src/`, `supabase/`, task docs. Findings verified against current code (line numbers checked).

---

## TL;DR

The codebase is in good shape for launch. Architecture is clean and consistent: a uniform `{ data, error }` service layer, all Supabase calls confined to `src/services/`, atomic `SECURITY DEFINER` RPCs for money-critical flows, RLS scoped to `authenticated`, and `requireOnline` guards on every mutating handler. The migration history shows real, honest hardening.

There are **no critical, launch-blocking defects in the code itself.** The one genuinely launch-day-relevant bug is the waiter/shift-open flow (B-1 below). Most remaining items are medium/low polish and dead code. Several findings overlap with `diagnostico_2026-05-25.md` and remain **unfixed** as of today — they are flagged accordingly.

> **Note on error handling:** No service uses `try/catch`, and that is *correct here* — the Supabase JS client returns `{ data, error }` and does not throw on query failure. The audit confirmed that callers check the `error` branch consistently. So "Supabase calls without try/catch" is not a defect in this project. The real error-handling gaps are narrower and listed below.

---

## Severity legend

🔴 Critical · 🟡 Medium · 🟢 Low

---

## 1. Pending TODOs & Technical Debt

A full sweep for `// TODO`, `// FIXME`, `// HACK`, `// temp`, `// pending`, `// WIP`, `// BUG`, `mock`, `dummy`, `hardcoded`, `provisional` across `src/` and `supabase/functions/` returned **zero** inline markers. The code does not carry leftover TODO comments.

Pending work lives in the task docs instead. Items still open:

| ID | Source | Severity | Item |
|----|--------|----------|------|
| B3 | `backlog.md` | 🟢 | Cart TOCTOU in `addNormalProductToComanda` / `addShotWithFreeMixers` — SELECT→INSERT with no lock. Deferred intentionally (single-tablet model). Only matters with a 2nd tablet. |
| A1 | `backlog.md` | 🟡 | `PosPage.jsx` is ~1,148 lines — extract `PaymentPage`, `ComandaDetailPanel`, dialogs. Maintainability debt, not a bug. |
| A2 | `backlog.md` | 🟢 | `useOnlineStatus` instantiated twice (PosPage + TopBar) — two listener sets. Low risk (they always agree). |
| A4 | `backlog.md` | 🟡 | `add_item_to_comanda` as `SECURITY DEFINER` RPC — prerequisite to close B3 properly. Deferred. |
| P2 | `backlog.md` | 🟢 | `WeeklyReportPage` runs ~8 separate `reduce` passes over cash movements. Collapse to one pass. |
| P3 | `backlog.md` | 🟡 | No realtime subscriptions — two tablets diverge silently between charges. Only relevant with 2nd tablet. |
| — | `diagnostico_2026-05-25.md` | 🟡 | Several diagnostic items below are still unfixed (B-1, M-2, M-3, M-4). |

Deferred Phase-4 items in `todo.md` (CRIT-3 step 2 RLS tightening, HP-5 membership-in-finalize) are documented as intentional deferrals.

---

## 2. Error Handling

🟡 **Offline detection relies on `navigator.onLine`, which does not detect a dead internet link.**
`src/hooks/useOnlineStatus.jsx:4` and `src/utils/requireOnline.js`.
`navigator.onLine` only reports whether the device has a *local* network connection — it returns `true` even when WiFi is up but the internet (or Supabase) is unreachable. So if the connection drops mid-operation, `requireOnline` passes, the Supabase call hangs until timeout, and the user sees a generic error. Impact is contained because `finalize_comanda_payment` is idempotent (guards on `status='processing_payment'`), so a retry after reconnect is safe. Worth a more explicit "no response from server" message on timeout. **Severity: Medium.**

🟡 **Non-atomic status-change + audit-event in `reopenComanda` and `startPayment`.**
`src/services/comandaCheckout.js` — `reopenComanda` (status UPDATE then separate `comanda_events` INSERT) and `startPayment` (same pattern).
The status UPDATE and the `comanda_events` INSERT are two separate calls. If the network drops *between* them, the comanda status has already changed but the function returns an error to the user. The comanda is left in the new state while the UI reports failure — a confusing mismatch and a gap in the audit trail. The money-critical path (`confirmPayment`) does *not* have this problem — it is a single atomic RPC. **Severity: Medium** (audit-trail integrity; non-financial).

🟢 **`verifySession` has no offline path.**
`src/App.jsx:34-36` → `authStore.verifySession`.
If Supabase is unreachable on first load, session verification can fail silently and dump the user at `/login` with no explanation. A "Sin conexión" banner would be clearer. (Also noted in the prior diagnostic.) **Severity: Low.**

✅ **What's correct:** `confirmPayment` validates `totalReceived >= totalDue` and `|totalPaid - totalDue| <= 0.009` *before* calling the RPC, and handles **both** the `rpcError` branch (RAISE EXCEPTION) and the `rpcResult.ok === false` branch. All comanda status transitions use `.eq('status', expected).select('id')` + rowcount check. Shift close uses the same guard. This is solid.

---

## 3. Missing Validations

🟡 **`/setup-admin` route has no guard.**
`src/App.jsx:43` — `<Route path="/setup-admin" element={<SetupAdminPage />} />`, no `AuthRoute`/`ProtectedRoute`.
The page self-redirects to `/login` if users exist (`SetupAdminPage.jsx:28`), but the gate is client-side. The only real exposure window is when the DB has zero users; the residual risk is low, but it is an unnecessary public surface. Recommend removing the route entirely after the bootstrap admin is created. (Carried over from `diagnostico_2026-05-25.md`, still present.) **Severity: Medium.**

🟡 **`handleCashChange` allows multiple decimal points.**
`src/pages/LoginPage.jsx:76` — `e.target.value.replace(/[^0-9.]/g, '')`.
Input like `100.50.25` is accepted into state. On submit, `Number('100.50.25')` → `NaN`, which *is* caught by `handleShiftSubmit` ("Ingresa un monto válido"), so there is no bad data risk — only a confusing display. Fix is one line: `.replace(/(\..*)\./g, '$1')`. (Still present since prior diagnostic.) **Severity: Low.**

🟢 **Service-layer functions trust caller validation.**
e.g. `src/services/productsAdmin.js` `createProductAdmin` does `name.trim()` and `Number(price)` with no guard — a null name would throw, an invalid price would insert `NaN`.
In practice every admin page validates before calling (e.g. `ProductsAdminPage.jsx:91` `!newName.trim()`, `:96` price NaN/negative check), and DB CHECK/NOT NULL constraints are the backstop. So this is defense-in-depth, not an active bug. **Severity: Low.**

✅ PIN input is correctly constrained (`replace(/\D/g,'').slice(0,6)`), starting-cash submit validates `isNaN`/negative, and admin forms validate required fields before hitting the service.

---

## 4. Performance

🟢 **`WeeklyReportPage` multi-pass aggregation** — `src/pages/WeeklyReportPage.jsx` (backlog P2). ~8 `reduce` passes over the same `cashMovements` array; collapse into one `forEach`. Negligible at bar data volumes. **Severity: Low.**

🟡 **No realtime sync between tablets** — backlog P3. Supabase realtime client is initialized but never wired up. Only matters if a second tablet is added; today's single-tablet model makes this a non-issue. **Severity: Medium (conditional).**

🟢 **Re-render hygiene is reasonable.** `PosPage.jsx` uses `useMemo`/`useCallback` in 6 places (catalog grouping, payment summary, etc.). No obvious unnecessary-re-render hotspots found. The known double-pass grouping (D5) and N+1 in customer search (P1) were already fixed per the backlog. **No action.**

---

## 5. Security

🟡 **Employee roster is readable by anonymous clients (by design).**
RLS `users_select` policy is `TO anon` so the login screen can list employees before a session exists. Anyone with the URL can `GET /rest/v1/users?select=id,name` and enumerate employee UUIDs, then attempt PIN brute-force via Supabase Auth. Supabase Auth's native rate limiting mitigates this. This is a **conscious design tradeoff**, not a defect — documented in `lessons.md`. To eliminate the exposure later, move the login roster behind a `SECURITY DEFINER` RPC returning only `id, name`. **Severity: Medium (accepted risk).**

🟢 **`tasks/todo.md` path leaked in public HTML.**
`src/pages/SetupAdminPage.jsx:73` renders the literal string `tasks/todo.md` as setup guidance. Visible only on the unguarded `/setup-admin` page when no users exist. Cosmetic info leak. **Severity: Low.**

✅ **Strong points (verified):**
- RLS enabled on all tables; policies scoped to `authenticated` (not `anon`), except the intentional login exception.
- Admin/manager authorization checked via subquery against `public.users`, **not** user-editable `user_metadata`.
- All admin routes wrapped in `AuthRoute` (admin) or `ManagerRoute`; `/pos` in `ProtectedRoute` (login + open shift). Route guards verified in `App.jsx`.
- `service_role` key lives only in Edge Function secrets; `.env` is gitignored and contains only `VITE_SUPABASE_URL` + the anon key (safe to ship).
- Edge Functions verify JWT + admin role before acting; `email` is stripped before reaching the client store.
- `execute_sql` dev RPC was created and then properly dropped (`20260519000001`) before launch.
- Immutable audit tables (`cash_movements`, `comanda_items` soft-delete, `membership_benefit_usage`).
- `bcryptjs` fully removed; PIN auth is Supabase Auth only.

---

## 6. Production Readiness

🟢 **Two `console` statements remain — both legitimate, neither needs removal.**
- `src/components/ErrorBoundary.jsx:15` — `console.error('POS crashed:', error, info)`. Correct use in an error boundary.
- `src/components/Ticket.jsx:392` — `console.warn(msg)` only as a *fallback* when no `onBlocked` callback is supplied for a blocked print popup.

No stray `console.log`, no `alert`/`confirm`/`prompt`, no mock/dummy/test data, no dev-mode flags found. The print path correctly surfaces messages through React state, per project convention.

🟢 **Dead code to remove (no behavioral impact):**

| File | Status |
|------|--------|
| `src/App.css` | Vite template styles (`.hero`, `.counter`, etc.). **Not imported anywhere.** Pure dead code. |
| `src/assets/react.svg` | Vite template. Zero references. |
| `src/assets/vite.svg` | Vite template. Zero references. |
| `src/assets/hero.png` | Zero references in `src/`. |
| `src/assets/LogotipoContinental_FNEGRO-01.png` | Zero references (`logo.png` is the one in use). |
| `src/pages/SqlAdminPage.jsx` | Intentionally emptied; not imported/routed. Safe to delete. |

🟢 **`useEffect` lint nit.** `src/App.jsx:34-36` — `useEffect(() => { verifySession() }, [])` with an empty dep array while `react-hooks/exhaustive-deps` is active. Works correctly (the Zustand action is stable) but should pass lint cleanly — add an eslint-disable comment with rationale, or pull the action ref out. **Severity: Low.**

🟢 **No catch-all route.** `App.jsx` has no `<Route path="*">` — an unknown URL renders nothing. A `<Navigate to="/login" replace />` fallback would be cleaner. **Severity: Low.**

---

## Priority Summary

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| B-1 | 🔴→🟡 | Waiter reaching shift-open form gets confusing RLS error (see note) | `LoginPage.jsx` ~106–117 |
| M-1 | 🟡 | `navigator.onLine` doesn't detect dead internet mid-op | `useOnlineStatus.jsx:4`, `requireOnline.js` |
| M-2 | 🟡 | Non-atomic status+event in `reopenComanda`/`startPayment` | `comandaCheckout.js` |
| M-3 | 🟡 | `/setup-admin` route unguarded | `App.jsx:43` |
| M-4 | 🟡 | Employee roster readable by `anon` (accepted) | RLS `users_select` |
| L-1 | 🟢 | `handleCashChange` allows multiple decimals | `LoginPage.jsx:76` |
| L-2 | 🟢 | `tasks/todo.md` path in public HTML | `SetupAdminPage.jsx:73` |
| L-3 | 🟢 | Dead code (App.css, 4 assets, SqlAdminPage) | see table |
| L-4 | 🟢 | `useEffect` exhaustive-deps lint nit | `App.jsx:34` |
| L-5 | 🟢 | No catch-all `*` route | `App.jsx` |

> **On B-1 severity:** The prior diagnostic rated this 🔴. The *bug* (a waiter login when no shift is open produces a confusing "Error abriendo turno" instead of a clear "ask an admin to open the shift" message) is real and **still unfixed** (`LoginPage.jsx` has no `user.role === 'waiter'` check before the `new_shift` phase). But security is intact — RLS correctly blocks the waiter from creating the shift. So it's a **UX defect, not a data/security defect.** It's the single most likely thing to cause confusion on opening day, hence top of the list.

---

## What I did *not* find (good news)

- No leftover TODO/FIXME/HACK comments anywhere.
- No `console.log` debug noise (the two `console` calls are intentional).
- No hardcoded test data, mock data, or dev-mode toggles.
- No `service_role` key or secrets in the client bundle.
- No money-critical flow lacking error handling — `confirmPayment` and `closeShift` are both atomic and double-checked.
- No unguarded admin routes (only `/setup-admin`, which is a bootstrap page).
