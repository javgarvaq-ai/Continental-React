# Lessons Learned

## Project Context

**What this is:** Custom POS system for Continental Cantina Bar, a bar in Mexico. Owner: Javi (javgarvaq@gmail.com).

**Tech stack:** React 19 + Vite + React Router v7 + Zustand v5 + Supabase (backend/DB)

**Deployment:** Vercel (public internet). The app is live online. Security decisions must assume any endpoint is reachable from the internet.

**Auth:** Supabase Auth — `signInWithPassword(email, password)`. Employees don't have real emails; internal email format is `{user_id}@continental.bar`. The PIN is the password. Auth tokens are managed by the Supabase client SDK (localStorage via `supabase-js`). There is no custom PIN verification anymore — `verify_pin`, `create_user`, `reset_user_pin`, `update_user_active` RPCs were all dropped in the Supabase Auth migration.

**User management (admin operations):** Three Edge Functions handle user lifecycle server-side. They verify the caller's JWT + admin role before acting:
- `create-user` — creates Supabase Auth account + inserts into `public.users` (matched UUID)
- `reset-pin` — calls `auth.admin.updateUserById` to change password
- `deactivate-user` — sets `ban_duration: '876000h'` or `'none'` + updates `users.active`

All Edge Functions use `SB_SERVICE_ROLE_KEY` (not `SUPABASE_SERVICE_ROLE_KEY` — the `SUPABASE_` prefix is reserved by Supabase CLI and will be rejected).

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
- **No git or Supabase CLI commands in bash sandbox.** The sandbox is isolated — it has no access to the real repo or Supabase CLI config. Commands like `git push`, `supabase db push`, `supabase migration new`, `supabase functions deploy` must be run by the user in their own terminal.

---

## Supabase

- **Project URL:** `kgjypmzhrqgmsdqoctyl.supabase.co`

### RLS setup
All tables have RLS **enabled**. Since the migration to Supabase Auth, policies are scoped to the `authenticated` role (not `anon`). This means only users with a valid Supabase Auth session can read or write data.

**`anon` vs `authenticated` are separate Postgres roles.** A policy `TO anon` does NOT cover authenticated users and vice versa. Exception: the `users_select` policy on `public.users` remains `TO anon` so the login screen can fetch the employee list before a session exists. All other policies are `TO authenticated`.

**Is the anon key being public a problem?** No — this is Supabase's intended design. The anon key is safe to expose in the frontend. What protects data is RLS policies. The `service_role` key must never be in the frontend (it bypasses RLS entirely).

**Intentional policy gaps (by design):**
- `cash_movements` — no UPDATE/DELETE (immutable audit trail)
- `customers`, `shifts`, `customer_memberships` — no DELETE (soft deletes via status/active flags)
- `membership_benefit_usage` — no UPDATE/DELETE (immutable usage records)

### Adding RLS to new tables
When creating a new table, enable RLS and add a permissive policy for the `authenticated` role:

```sql
ALTER TABLE your_new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "your_new_table_authenticated"
  ON your_new_table
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

If the table needs to be readable on the login screen (before auth), also add a `TO anon FOR SELECT` policy. Keep it SELECT-only.

### anon SELECT exception pattern (login screen)
The `users` table has two SELECT policies: one `TO anon` (for the employee list on the login screen) and one `TO authenticated` (for all post-login reads). Both use `USING (true)`. This is the only table that needs this split — all others are `TO authenticated` only.

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

## auth.js — Supabase Auth Login Flow

`loginWithPin({ userId, pin })` in `src/services/auth.js`:
1. Fetches the user row from `public.users` by `id` + `active = true` (uses the `TO anon` SELECT policy, so it works before sign-in).
2. Calls `supabase.auth.signInWithPassword({ email: user.email, password: pin })`.
3. Strips `email` before returning the user object — callers and Zustand store never see the internal email.

Error mapping: `'invalid login credentials'` → `'PIN incorrecto'`, `'banned'` → deactivated message.

`logout()` calls `supabase.auth.signOut()`. Both `clearAuth` and `clearUser` in `authStore` also call `signOut()`.

**Never re-add bcryptjs or custom PIN hashing.** `bcryptjs` was fully removed. PIN auth is now Supabase Auth only.

## authStore — No More localStorage for User

The user object is **not** stored in localStorage anymore. `verifySession` uses `supabase.auth.getSession()` to check for a live session, then re-reads the user row from `public.users`. `shiftId` is still stored in localStorage (it is not sensitive).

## Comanda Status Transition Guards

Every `UPDATE comandas SET status = X` must include `.eq('status', expectedPreviousStatus).select('id')`. After the call, check `updated.length === 0` — if so, another tablet already changed the state. Surface a clear message: `"La comanda ya no está en estado X. Recarga la página."` Same pattern applies to shifts UPDATE.

## Soft-Delete comanda_items

Never `DELETE` from `comanda_items`. Always `UPDATE { status: 'cancelled' }`. This preserves the FK reference in `inventory_movements.comanda_item_id` and the full audit trail. The `status IN ('active','cancelled')` CHECK constraint is now enforced in DB. All reads already filter `.eq('status', 'active')`.

## Supabase SECURITY DEFINER functions — search_path must include 'extensions'

In Supabase, pgcrypto (and other extensions) live in the `extensions` schema, not `public`. Any SECURITY DEFINER function that calls `crypt()`, `gen_salt()`, or other pgcrypto functions **must** use `SET search_path = public, extensions`. Using only `SET search_path = public` causes a "function not found" error at runtime even though the extension is installed.

## Adding NOT NULL to an Existing Column (live table)

Never do a one-step `ALTER COLUMN ... SET NOT NULL` on a table that may have existing NULL rows — it will fail. Always two steps:
1. `UPDATE table SET col = 0 WHERE col IS NULL;`
2. `ALTER TABLE table ALTER COLUMN col SET DEFAULT 0; ALTER TABLE table ALTER COLUMN col SET NOT NULL;`

## DROP COLUMN Auto-Drops Associated Indexes

In Postgres, dropping a column automatically drops any index whose only column is the one being dropped. You do not need a separate `DROP INDEX` statement. If the index covers multiple columns, it stays (with the column removed from it).

## updated_at Trigger Pattern

When adding an `updated_at` audit column to an existing table:
```sql
ALTER TABLE your_table ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE your_table SET updated_at = created_at WHERE updated_at IS NULL; -- back-fill

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS your_table_set_updated_at ON your_table;
CREATE TRIGGER your_table_set_updated_at
    BEFORE UPDATE ON your_table
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```
`set_updated_at()` is reusable — attach the same function to any table that needs it.

## Patterns to Avoid

- Never introduce `window.alert / confirm / prompt` — all feedback goes through React state (`setStatus`).
- Never run git or Supabase CLI commands from the bash sandbox.
- Don't add a second logo or duplicate branding elements — one logo, top-right of POS header.

---

## Features Built

### Session 1 (2026-05-08/10)
- Replaced all browser dialogs with in-app UI across entire codebase
- ComandaPanel + PaymentPanel UI rewrite
- Logo integration (transparent PNG processing via PIL)
- Employee check-in/out module with inline edit + time log history
- Weekly schedule system: `employee_schedule_shifts` table, admin editor, visual grid, actual hours entry, pay summary
- `ScheduleViewPanel` — read-only schedule modal accessible from POS TopBar for all roles
- `hourly_rate` field on employees with daily rate reference and weekly pay calculation

### Session 2 (2026-05-11)
- Supabase Auth migration — replaced custom PIN auth; all RLS policies require authenticated session
- Edge Functions: `create-user`, `reset-pin`, `deactivate-user`, `seed-auth-users`
- `activate_membership` RPC — atomic membership + comanda charge in one transaction
- `verify_pin` rate limiting migration (then superseded by Supabase Auth)
- Service layer refactor: `services/shifts.js`, `getUserById` + `checkUsersExist` in `users.js`
- DB schema cleanup: orphaned columns dropped, payments NOT NULL, users.updated_at trigger, missing indexes added
