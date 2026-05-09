# Lessons Learned

## Project Context

**What this is:** Custom POS system for Continental Cantina Bar, a bar in Mexico. Owner: Javi (javgarvaq@gmail.com).

**Tech stack:** React 19 + Vite + React Router v7 + Zustand v5 + Supabase (backend/DB)

**Auth:** Custom PIN-based system — users have `pin_hash` in the `users` table, verified with bcryptjs. This is NOT Supabase Auth. No `auth.uid()` available at the app level.

**Roles:** `waiter` / `manager` / `admin`
- `ProtectedRoute` — requires logged-in user + open shift
- `AuthRoute` — admin only
- `ManagerRoute` — manager or admin

**Bar operating hours:** ~11:00–02:00 (overnight). Schedule grids, time slots, and report ranges should reflect this.

**Timezone:** Mexico (-06:00). Used in ISO strings for Supabase date queries (e.g. `T00:00:00-06:00`).

---

## Architecture Rules

- **Service layer pattern:** All Supabase calls must go in `src/services/`. Hooks and pages never call Supabase directly.
- **No browser dialogs:** Never use `window.alert`, `window.confirm`, or `window.prompt`. Use `setStatus()` for messages and double-confirm pattern for destructive actions.
- **Double-confirm pattern:** First click arms the button (turns red, shows warning text, 3s timeout), second click fires the action.
- **No git commands in bash sandbox.** The sandbox is isolated and won't affect the real repo.

---

## Supabase

- **Project URL:** `kgjypmzhrqgmsdqoctyl.supabase.co`

### RLS setup
All tables have RLS **enabled**. Every table has explicit permissive policies (`USING (true)` / `WITH CHECK (true)`) granting the `anon` or `public` role unconditional access to the operations that table supports.

**Is the anon key being public a problem?** No — this is Supabase's intended design. The anon key is safe to expose in the frontend. What protects data is RLS policies. The `service_role` key is the one that must never be in the frontend (it bypasses RLS entirely).

**Why policies are all `USING (true)`:** The app uses custom PIN auth, not Supabase Auth, so `auth.uid()` is always null. Row-level user filtering isn't possible without a refactor to Supabase Auth. For an internal bar POS this is an acceptable tradeoff.

**Intentional policy gaps (by design):**
- `cash_movements` — no UPDATE/DELETE (immutable audit trail)
- `customers`, `shifts`, `customer_memberships` — no DELETE (soft deletes via status/active flags)
- `membership_benefit_usage` — no UPDATE/DELETE (immutable usage records)

### Adding RLS to new tables
When creating a new table, **do not** just `DISABLE ROW LEVEL SECURITY`. Instead, enable RLS and add a permissive policy matching the pattern used by `employees` and `employee_time_logs`:

```sql
ALTER TABLE your_new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_your_new_table"
  ON your_new_table
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
```

---

## Infrastructure / Deployment

- **Auto-print (receipt printer):** Add `--kiosk-printing` to Chrome shortcut Target field on the bar computer. This bypasses the print dialog and sends directly to the default printer.

---

## requireOnline Pattern

`requireOnline(isOnline, setStatus)` must be the **first line** of every async handler that mutates data in Supabase (payments, shifts, comandas, memberships, cart items, cash movements). It's already imported in all hooks. If you add a new mutating handler, add the guard immediately — before any early returns.

The `isOnline` prop must be threaded from PosPage (via `useOnlineStatus()`) into every hook that owns mutating handlers: `usePayment`, `useShift`, `useComanda`, `useCustomer`.

## Membership Status Values

`customer_memberships.status` allows: `'active'`, `'expired'`, `'cancelled'`. All three are valid in the DB CHECK constraint. Use `'cancelled'` for manual cancellation by staff, `'expired'` for month-end expiry.

## Supabase Duplicate Key Error Code

When handling race conditions on INSERT, catch Postgres error code `'23505'` (unique violation). Supabase surfaces this as `error.code === '23505'`. On that case, re-read the existing row rather than surfacing the raw DB error to the user.

## auth.js — Pin Hash Handling

`loginWithPin` fetches `pin_hash` for bcrypt.compare, then strips it before returning: `const { pin_hash: _discard, ...safeUser } = user`. The caller and localStorage never see the hash. Do not change `select` back to `'*'`.

## Comanda Status Transition Guards

Every `UPDATE comandas SET status = X` must include `.eq('status', expectedPreviousStatus).select('id')`. After the call, check `updated.length === 0` — if so, another tablet already changed the state. Surface a clear message: `"La comanda ya no está en estado X. Recarga la página."` Same pattern applies to shifts UPDATE.

## Soft-Delete comanda_items

Never `DELETE` from `comanda_items`. Always `UPDATE { status: 'cancelled' }`. This preserves the FK reference in `inventory_movements.comanda_item_id` and the full audit trail. The `status IN ('active','cancelled')` CHECK constraint is now enforced in DB. All reads already filter `.eq('status', 'active')`.

## verify_pin RPC — bcrypt in DB

`auth.js` no longer uses `bcryptjs` at all — login calls `supabase.rpc('verify_pin', { p_user_id, p_pin })`. The RPC uses pgcrypto's `crypt()` after normalizing `$2b$` → `$2a$` (bcryptjs vs pgcrypto prefix difference). `bcryptjs` is still used only in `usersAdmin.js` and `SetupAdminPage.jsx` to **create** hashes when setting/resetting PINs.

## Supabase SECURITY DEFINER functions — search_path must include 'extensions'

In Supabase, pgcrypto (and other extensions) live in the `extensions` schema, not `public`. Any SECURITY DEFINER function that calls `crypt()`, `gen_salt()`, or other pgcrypto functions **must** use `SET search_path = public, extensions`. Using only `SET search_path = public` causes a "function not found" error at runtime even though the extension is installed. This applies to all future RPCs that use pgcrypto.

## Patterns to Avoid

- Never introduce `window.alert / confirm / prompt` — all feedback goes through React state (`setStatus`).
- Never run git commands from the bash sandbox.
- Don't add a second logo or duplicate branding elements — one logo, top-right of POS header.

---

## Features Built (this session)

- Replaced all browser dialogs with in-app UI across entire codebase
- ComandaPanel + PaymentPanel UI rewrite
- Logo integration (transparent PNG processing via PIL)
- Employee check-in/out module with inline edit + time log history
- Weekly schedule system: `employee_schedule_shifts` table, admin editor, visual grid, actual hours entry, pay summary
- `ScheduleViewPanel` — read-only schedule modal accessible from POS TopBar for all roles
- `hourly_rate` field on employees with daily rate reference and weekly pay calculation
