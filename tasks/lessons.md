# Lessons Learned

## Project Context

**What this is:** Custom POS system for Continental Cantina Bar, a bar in Mexico. Owner: Javi (javgarvaq@gmail.com).

**Tech stack:** React 19 + Vite + React Router v7 + Zustand v5 + Supabase (backend/DB)

**Deployment:** Vercel (public internet). The app is live online. **Operationally** it runs from a single PC at the bar (one cashier tablet behind the bar), but **technically** the URL is reachable from any IP on the internet, and the JS bundle (including the Supabase `anon` key) is downloadable by anyone with the link. Concurrent load is therefore tiny (1-2 simultaneous sessions max), so when trading off, **favor security and audit trail over performance/concurrency tricks**. Security decisions must assume any endpoint is reachable from the internet; do NOT assume LAN isolation.

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

### Session 4 — Dashboard features + AdminNav (2026-05-18)
- Dashboard risk alerts: client-side classification using `opened_at` + `final_total` (≥3h AND ≥$3,000). No DB changes needed.
- Sales velocity: two parallel queries on `payments` bucketed by current vs. previous hour using `HH:00` ISO strings
- AdminNav sidebar: `position: fixed; width: 200px; height: 100vh`. All 16 admin pages just need `paddingLeft: '216px'` on their outer wrapper — no logic changes, no new components
- TopBar role guard: always verify UI visibility matches route guard (`AuthRoute` vs `ManagerRoute`) — buttons visible to wrong roles leak intent even if the route is protected

### Session 3 — QA (2026-05-16/17)
- RLS audit: `payments` missing `TO authenticated` SELECT policy (silent empty returns everywhere), `finalize_comanda_payment` not SECURITY DEFINER (RLS blocked INSERT)
- Browser color bleed: `color-scheme: light dark` in index.css lets OS apply white backgrounds; fix = `color-scheme: dark` + hardcoded backgrounds
- Scroll wheel on number inputs: `onWheel={(e) => e.target.blur()}` prevents accidental value changes
- Customer unlink from comanda: `UPDATE SET customer_id = null, customer_name = null` — distinct from `cancelMembershipOnComanda` which is destructive
- Reporting architecture: period data (filterable) vs. global running balances (always all-time) must be loaded independently
- FK ambiguity in PostgREST joins (see lesson below)
- `adjust_payment_tip` RPC: post-payment tip correction updates both `payments.tip_amount` and `comandas.tip_total` to keep reports consistent

---

## PostgREST Ambiguous FK — Silent Empty Results

When a table has **two foreign keys pointing to the same target table**, a PostgREST join without an explicit FK hint will fail silently. The query returns `error` (non-null), `data` is null. If the caller does `data || []`, it gets an empty array with no visible error.

**Example:** `comanda_items` has two FKs to `products`:
- `comanda_items_product_id_fkey` (on `product_id`)
- `comanda_items_source_shot_product_id_fkey` (on `source_shot_product_id`)

**Wrong (ambiguous):**
```javascript
.select('*, products ( name )')
```

**Correct (explicit FK hint):**
```javascript
.select('*, products:products!comanda_items_product_id_fkey ( name )')
```

**Rule:** Whenever a table has multiple FKs to the same target, always use the `!fk_name` hint. Check for this when "Sin productos" or similar empty joins appear with no network error in the browser.

---

## RLS Audit Checklist — Lessons from payments table

The remote schema dump (`20260508191907_remote_schema.sql`) created many policies as `TO anon`. After the Supabase Auth migration (session 2), most tables were updated to `TO authenticated` via `20260511000005`. But `payments` was missed entirely — it had no SELECT policy for `authenticated` and the INSERT was `TO anon` only.

**Symptoms of missing `TO authenticated` SELECT:** query returns 0 rows, no error, no network failure. Very hard to detect in QA without real data.

**Symptoms of missing `TO authenticated` INSERT:** "new row violates row-level security policy" — visible error.

**Checklist when adding a new table or RPC:**
1. Does the table need SELECT for authenticated staff? → Add `TO authenticated` SELECT policy.
2. Does the table get written by client code directly? → Add INSERT/UPDATE `TO authenticated`.
3. Does the table get written by an RPC only? → Make the RPC `SECURITY DEFINER`, do NOT add an INSERT policy — this prevents clients bypassing the function's guards.

---

## RAISE EXCEPTION en RPC llega como rpcError, no rpcResult

Cuando un RPC de Postgres usa `RAISE EXCEPTION '%', msg`, la excepción llega en el **branch `rpcError`** de `supabase.rpc(...)`, no como `rpcResult.ok = false`. Si el código solo maneja `rpcResult?.ok === false`, el error se pierde o muestra el string raw al usuario.

**Patrón correcto:**
```js
const { data: rpcResult, error: rpcError } = await supabase.rpc('mi_funcion', params)

if (rpcError) {
    const msg = friendlyRpcError(rpcError.message, 'Error genérico.')
    return { error: new Error(msg) }
}

if (rpcResult && !rpcResult.ok) {
    return { error: new Error(friendlyRpcError(rpcResult.error, 'Error genérico.')) }
}
```

Siempre manejar ambos branches. `RAISE EXCEPTION` → `rpcError`. `RETURN jsonb_build_object('ok', false, 'error', '...')` → `rpcResult`.

---

## product_recipes — Multi-ingrediente ya funciona en DB

La tabla `product_recipes` soporta múltiples filas por `product_id`. El RPC `finalize_comanda_payment` itera **todas** las filas activas de cada producto y deduce inventario por cada una. No hay límite de un ingrediente por producto — la DB y el RPC ya lo manejan correctamente.

Para recetas multi-ingrediente: simplemente agregar una fila en `product_recipes` por cada ingrediente, apuntando al `inventory_item_id` correspondiente.

---

## Ingredientes puros no deben ser products

Si un ítem nunca se vende standalone (ej. Fanta Roja como ingrediente de Cubanito), debe existir **solo** como `inventory_item`, no como `product`. Crear productos innecesarios hace que aparezcan en el catálogo del POS.

El modelo correcto:
- `inventory_items` → stock físico (Fanta Roja, Boost, Tequila, etc.)
- `products` → lo que se vende con precio (Cubanito, Margarita, Fanta Roja standalone si aplica)
- `product_recipes` → linkea un `product_id` a uno o más `inventory_item_id`

Si algo no se vende solo → solo `inventory_item`. No necesita ser `product`.

---

## Reporting: Period Data vs. Global Balances

Running cash/bank/safe balances are **always historical and accumulative** — they should never be filtered by a date range. Only revenue and expense metrics belong inside a period filter.

Pattern used in `WeeklyReportPage`:
- `loadPeriod()` → `getWeeklyReportData({ startDate, endDate })` — ingresos, egresos, utilidad
- `loadGlobal()` → `getGlobalBalances()` — no date filter, all-time — caja, resguardo, banco

Both loads fire in parallel on mount. The "Posición de dinero" section always shows global data regardless of what period the user selects.

---

## ShotMixerSelector es inline (NO modal) y vive ARRIBA del catálogo

Al tocar un producto `is_shot` (combos: Cerveza 3x2, Cubeta), `handleAddProduct` NO agrega: llama `openShotMixerSelector` y abre `ShotMixerSelector`, que es una `<section>` **inline renderizada antes del grid de productos** en `PosPage` (no un overlay `position:fixed`). El alta real ocurre en `handleConfirmShotMixers`.

Implicaciones para cualquier feature de scroll/foco en el POS:
- Cualquier lógica de "al agregar producto" debe contemplar los DOS caminos: alta directa (`handleAddProduct`, no-shot) y alta vía confirmación de mixers (`handleConfirmShotMixers`, shot).
- **Scroll anchoring:** al insertar el selector arriba del contenido visible, el navegador reajusta `scrollTop` para mantener fija la parte visible, lo que **cancela un `window.scrollTo` llamado en el mismo tap**. Solución: disparar el scroll en un `useEffect` que observe `shotSelectorState.open` (post-render), no en el handler del click.

## Mercado Pago: comisiones Point/Tap ≠ Checkout/Link

Verificado en fuente oficial (2026): la terminal **Point** y **Tap** (cobro presencial) cobran **% + IVA, SIN cargo fijo** por transacción (al instante 3.5%, 14 días ~3.2%). El **cargo fijo de $4 MXN/transacción es solo de Link de Pago y Checkout** (cobro online). Los blogs de terceros mezclan ambos — siempre verificar en `mercadopago.com.mx/ayuda` y confirmar el plazo de disposición configurado. Constantes del estimado en `utils/ledger.js`: `CARD_COMMISSION_RATE`, `CARD_COMMISSION_IVA`. Solo aplica a tarjeta; SPEI y depósitos de efectivo entran completos.

## Verificación en el sandbox: el mount de bash puede quedar STALE

Tras editar archivos con las file-tools, el mount de bash (`/sessions/.../mnt/...`) a veces queda con una **copia truncada/desactualizada** del archivo. Síntomas: `wc -l` da menos líneas de las reales, `node`/`eslint` reportan errores FALSOS de "Unexpected end of input" / "Unterminated JSX contents". La herramienta `Read` SÍ ve el archivo real y completo.

Para verificar sintaxis sin depender del mount stale:
- Copiar el contenido autoritativo a `outputs/` (mount fresco) y parsear con `@babel/parser` (`{sourceType:'module',plugins:['jsx']}`) — disponible en node_modules. `esbuild`/`typescript` NO están instalados; `@babel/parser`, `@babel/core`, `acorn-jsx` sí.
- Para lógica pura (no-JSX), importar la copia `.mjs` desde `outputs/` y correr asserts con `node`.
- NO confiar en `eslint`/`node` corridos sobre el path del proyecto cuando el mount está stale.

## Supabase corta respuestas grandes → ordenar DESCENDENTE al traer "toda la historia"

`getLedgerData` traía payments/cash_movements/shifts **sin cota inferior** (toda la historia, para el saldo inicial) y ordenados **ascendente**. Supabase aplica un tope de filas por respuesta; con orden ascendente, lo que se descarta es **lo más reciente** → el Ledger se quedaba en los primeros días y no mostraba movimientos nuevos (que en `Movimientos de Caja` sí salían, porque esa consulta pide **descendente** dentro de un rango).

**Regla:** cuando una consulta pueda traer muchas filas y te importa lo reciente, **ordena `ascending: false`** (y reordena en cliente si necesitas cronológico — `sortEvents` ya lo hace). Para datos verdaderamente grandes, paginar con `.range()`. Nunca asumas que un `.select()` sin límite trae todas las filas.

Síntoma diagnóstico: una vista muestra datos viejos y "se corta" en una fecha fija sin importar el rango seleccionado → casi siempre es el tope de filas + orden ascendente.

## Ledger view — convención del fondo de caja (starting_cash)

`createShift` (`services/auth.js`) solo escribe `shifts.starting_cash`; **no** crea un `cash_movement` por el fondo. Por eso:
- `calcGlobal` (Posición de dinero) NO incluye `starting_cash` → su saldo de cajón está subestimado por el fondo (bug menor preexistente, no corregido).
- El **Ledger** (`/admin/ledger`, `utils/ledger.js`) **ancla el cajón por turno**: resetea a `starting_cash` en cada apertura. Así el cierre del cajón == `expected_cash` del turno. Banco y caja fuerte corren acumulados y cuadran con `calcGlobal`.
- Modelo de ubicaciones reusa los signos de `calcGlobal`: drawer/house_safe/bank con `source_location`/`destination_location` de `config/cashMovements.js`.
