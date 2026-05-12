# Project Tasks (TODO)

## Fase 1 — Completada ✅
Ver historial — 5 fixes aplicados y commiteados (2026-05-08).

---

## Fase 2 — Hardening MVP ✅

### HP-2: Status guards en transiciones de comanda ✅
- [x] `comandaCheckout.js` → `reopenComanda`: `.eq('status', safePreviousStatus)` + rowCount check
- [x] `comandaCheckout.js` → `startPayment`: `.eq('status', 'pending_payment')` + rowCount check
- [x] `comandas.js` → `cancelComanda`: `.eq('status', 'open')` + rowCount check
- [x] `useShift.js` → `handleConfirmCloseShift`: `.eq('status', 'open')` + rowCount check

### HP-3: FK en comanda_events.comanda_id ✅
- [x] Migración `20260508200003_hp3_comanda_events_fk.sql`

### HP-6: Soft-delete de comanda_items ✅
- [x] Migración `20260508200004_hp6_comanda_items_soft_delete.sql` — CHECK `status IN ('active','cancelled')`
- [x] `products.js` → `decreaseCartItem`: UPDATE `status='cancelled'` en lugar de DELETE (item y mixers)

### HP-1: RPC present_bill_atomic ✅
- [x] Migración `20260508200005_phase2_rpcs.sql` — función SQL atómica con guard de status='open'
- [x] `comandaCheckout.js` → `presentBill`: llama RPC en lugar de dos calls separados

### CRIT-3 paso 1: verify_pin RPC ✅
- [x] Migración `20260508200005_phase2_rpcs.sql` — pgcrypto + `verify_pin` SECURITY DEFINER
- [x] `auth.js`: usa `supabase.rpc('verify_pin')`, sin bcrypt en cliente, sin SELECT a users

### adjust_inventory_stock RPC ✅
- [x] Migración `20260508200005_phase2_rpcs.sql` — `adjust_inventory_stock` con UPDATE...RETURNING
- [x] `inventoryAdmin.js`: llama RPC en lugar de SELECT + UPDATE + INSERT separados

---

## Quick fixes pre-apertura ✅
- [x] MP-5: Timezone fix en WeeklyReportPage — usa fecha local en lugar de UTC
- [x] MP-10: Mensaje claro cuando el turno ya está abierto (error 23505 → texto útil para el cajero)
- [x] Print popup bloqueado: `printTicket` acepta `onBlocked` callback; cuenta, pagado y reprint muestran aviso visible en UI

## RLS Review + User Management RPCs ✅ (2026-05-10)

### Problemas encontrados y resueltos:
- [x] `users_insert` / `users_update` policies eran completamente abiertas — cualquier cliente anon podía mutar usuarios directamente
- [x] `pin_hash` era mutable vía REST desde el cliente (crítico)
- [x] `usersAdmin.js`: `createUser` y `resetUserPin` hasheaban el PIN en cliente con bcryptjs y enviaban el hash por la red
- [x] `SetupAdminPage.jsx`: mismo patrón de bcrypt en cliente

### Solución:
- [x] Migración `20260510000001_user_management_rpcs.sql`:
  - RPC `create_user(p_name, p_role, p_pin)` — SECURITY DEFINER, hashea PIN con pgcrypto server-side
  - RPC `reset_user_pin(p_user_id, p_pin)` — SECURITY DEFINER, mismo patrón
  - RPC `update_user_active(p_user_id, p_active)` — SECURITY DEFINER para consistencia
  - DROP POLICY `users_insert` y `users_update` — ya no se necesitan
- [x] `usersAdmin.js` reescrito para llamar RPCs, sin bcryptjs
- [x] `SetupAdminPage.jsx` actualizado para llamar `create_user` RPC
- [x] `bcryptjs` eliminado del proyecto (`npm uninstall bcryptjs`) — ya no se usa en ningún archivo

### Acciones requeridas en producción:
1. `supabase db push` para aplicar migración `20260510000001`
2. Verificar creación/reset de usuarios en la UI de administración

---

## Fase 3 — Polish pre-apertura ✅ (2026-05-10)

- [x] Admin safety guard: `UsersAdminPage` bloquea desactivar al último admin activo
- [x] HP-7 + HP-8: Migración `20260510000002_schema_cleanup.sql`:
  - DROP trigger `trg_assign_comanda_folio` + función `assign_comanda_folio` (secuencia avanzaba 2x por INSERT)
  - DROP índices duplicados: `customer_memberships_unique`, `product_recipes_product_inventory_uidx`, `ux_product_recipes_product_inventory`, `ux_product_allowed_mixers_unique`, `shifts_one_open_at_a_time`
  - DROP CHECK duplicado: `inventory_movements_type_check`
  - DROP RLS policies redundantes `allow_public_*` en 6 tablas
- [x] MP-7: `useShift.fetchShiftPanelData` filtra comandas abiertas solo por status (sin filtro `opened_at` que podía dejar escapar comandas fantasma)
- [x] MP-12: `membership.js` ya no usa fallback silencioso `milestoneVisits = 4` — si el beneficio existe pero `milestone_visits` no está configurado, devuelve `membershipWarning` descriptivo

**Acciones requeridas en producción:**
1. `supabase db push` para aplicar migraciones `20260510000001` y `20260510000002`

---

## Diferido (Fase 4)
- CRIT-3 paso 2: tightening RLS en shifts/comandas (users ya protegido con RPCs)
- HP-5: membership processing dentro de finalize_comanda_payment — muy invasivo, requiere reescritura del RPC core

---

## Review / Resultados Fase 2

Implementado 2026-05-08. 6 bloques en 6 archivos de código + 3 migraciones nuevas:

| Fix | Archivos | Tipo |
|-----|----------|------|
| HP-2 | comandaCheckout.js, comandas.js, useShift.js | Service + hook |
| HP-3 | migration 03 | DB schema |
| HP-6 | migration 04 + products.js | DB schema + service |
| HP-1 | migration 05 + comandaCheckout.js | DB RPC + service |
| CRIT-3 p1 | migration 05 + auth.js | DB RPC + service |
| adjust_inventory | migration 05 + inventoryAdmin.js | DB RPC + service |

**Acciones requeridas en producción:**
1. Aplicar migraciones 03, 04, 05 al proyecto Supabase remoto (`supabase db push` o Studio)
2. Verificar que `pgcrypto` esté habilitado en el proyecto (ya viene activado por defecto en Supabase)
3. Probar login con PIN en dev antes de merge a main

---

## POS Action Plan — May 11th Review

### T2: Fix membership reactivation — drop total unique index ✅ (2026-05-11)
- [x] Migración `20260511000002_fix_membership_unique_index.sql`
  - DROP CONSTRAINT `customer_memberships_customer_month_unique` (total, bloqueaba reactivación mismo mes)
  - El índice parcial `one_active_membership_per_customer_month` (WHERE status='active') queda intacto

**Acción requerida en producción:**
1. `supabase db push` para aplicar migración `20260511000002`

### R4: verify_pin rate limiting ✅ (2026-05-11)
- [x] Migration `20260511000003_verify_pin_rate_limit.sql`
  - Added `failed_pin_attempts integer NOT NULL DEFAULT 0` to `users`
  - Added `locked_until timestamptz NULL` to `users`
  - Recreated `verify_pin` RPC: 5 wrong attempts → 15 min lockout; correct PIN resets counter
  - No frontend changes needed

**Action required in production:**
1. `supabase db push` to apply migration `20260511000003`

### R3: activate_membership atomic RPC ✅ (2026-05-11)
- [x] Migration `20260511000004_activate_membership_rpc.sql`
  - New RPC `activate_membership(p_customer_id, p_plan_id, p_comanda_id)`
  - Wraps customer_memberships INSERT + comanda_items INSERT/UPDATE in one transaction
  - Full rollback if either step fails — no more $0 memberships
- [x] `src/services/membership.js` — `activateMembership` now calls RPC, then fetches full membership row
- [x] `src/hooks/useCustomer.js` — removed separate `getProductById` + `addNormalProductToComanda` calls; removed unused import

**Action required in production:**
1. `supabase db push` to apply migrations `20260511000002`, `20260511000003`, `20260511000004`

---

## Supabase Auth Migration — Phase 2 Security (planned 2026-05-11)

### Context
App is deployed on Vercel (public internet). Supabase anon key is in the bundle.
Current RLS is USING(true) — anyone with the anon key can read/write all data.
Goal: proper Supabase Auth so every DB request requires a real session.
Auth UX is unchanged — staff still tap name + enter PIN.

### Architecture decisions
- Per-employee Supabase Auth accounts (Option A)
- Email format: `{user_id}@continental.bar` (UUID prefix, no collision risk)
- Default temp PIN for existing users: `000000` (dummy data, admin resets after)
- User management (create/reset/deactivate) → Supabase Edge Functions (hold service role key server-side)
- `pin_hash` column → make nullable, stop populating (Supabase Auth owns passwords now)
- `failed_pin_attempts` + `locked_until` → drop (Supabase Auth has built-in rate limiting)
- `verify_pin` RPC → drop (replaced by supabase.auth.signInWithPassword)

### Step 1 — Migration: schema + RLS [ ]
File: `20260511000005_supabase_auth_rls.sql`
- [ ] Add `email text` column to `users`
- [ ] Make `pin_hash` nullable (transition period — stop writing it, drop later)
- [ ] Drop `failed_pin_attempts` + `locked_until` from `users` (Supabase Auth handles this)
- [ ] Populate `email` for all existing users: `UPDATE users SET email = id || '@continental.bar'`
- [ ] Drop `verify_pin` RPC (replaced by Supabase Auth)
- [ ] Drop old `create_user`, `reset_user_pin`, `update_user_active` RPCs (replaced by Edge Functions)
- [ ] Update ALL RLS policies:
  - `users` SELECT: keep anon (needed for employee list on login screen before auth)
  - `users` INSERT/UPDATE: drop (Edge Functions handle this with service role key)
  - All other tables: replace USING(true) → USING(auth.role() = 'authenticated')

### Step 2 — Supabase Edge Functions [ ]
Three functions in `supabase/functions/`:
- [ ] `create-user/index.ts` — verify caller is admin → create Supabase Auth user → insert into users table
- [ ] `reset-pin/index.ts` — verify caller is admin → update Supabase Auth user password
- [ ] `deactivate-user/index.ts` — verify caller is admin → enable/disable Supabase Auth + update users.active

Each function: validates JWT from request header, checks caller role = admin in users table, then calls Supabase Admin API with service role key.

### Step 3 — Frontend changes [ ]
- [ ] `src/services/auth.js`
  - Replace `verify_pin` RPC call with `supabase.auth.signInWithPassword({ email: user.email, password: pin })`
  - Add `logout()` using `supabase.auth.signOut()`
  - Fetch user email from users table before signing in
- [ ] `src/store/authStore.js`
  - On app init: call `supabase.auth.getSession()` to restore session
  - Subscribe to `supabase.auth.onAuthStateChange()` for cross-tab sync
  - Remove manual localStorage user management (keep shiftId in localStorage — that's our data)
  - Keep `verifySession` for shift check + user active/role check (still our custom logic)
- [ ] `src/services/usersAdmin.js`
  - `createUser` → call Edge Function `create-user`
  - `resetUserPin` → call Edge Function `reset-pin`
  - `updateUserActive` → call Edge Function `deactivate-user`

### Step 4 — Seed existing users into Supabase Auth [ ]
- [ ] One-time script or Edge Function call that creates Auth accounts for all existing users
- [ ] Temp PIN: `000000` — admin resets from UsersAdminPage after migration

### Step 5 — Deploy + verify [ ]
- [ ] `npx supabase db push` (migration)
- [ ] `npx supabase functions deploy create-user`
- [ ] `npx supabase functions deploy reset-pin`
- [ ] `npx supabase functions deploy deactivate-user`
- [ ] `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`
- [ ] Test: login works, admin can create user, reset PIN, deactivate

### ⚠️ Important: all steps must be done in one session
After Step 1 (RLS migration), the app breaks until Step 3 (frontend) is done.
Do not push the migration without having the frontend changes ready to deploy immediately.

### Supabase Auth Migration — COMPLETED (2026-05-11)

#### Step 1 — Migration ✅
- [x] `20260511000005_supabase_auth_rls.sql`
  - Added `email` column to users, populated as `{id}@continental.bar`
  - Made `pin_hash` nullable
  - Dropped `failed_pin_attempts` + `locked_until`
  - Dropped `verify_pin`, `create_user`, `reset_user_pin`, `update_user_active` RPCs
  - Rewrote all RLS policies: users SELECT stays anon, everything else requires authenticated

#### Step 2 — Supabase Edge Functions ✅
- [x] `supabase/functions/create-user/index.ts`
- [x] `supabase/functions/reset-pin/index.ts`
- [x] `supabase/functions/deactivate-user/index.ts`
- [x] `supabase/functions/seed-auth-users/index.ts` (one-time seed)

#### Step 3 — Frontend ✅
- [x] `src/services/auth.js` — uses supabase.auth.signInWithPassword
- [x] `src/store/authStore.js` — uses getSession, clearAuth/clearUser are now async
- [x] `src/services/usersAdmin.js` — calls Edge Functions
- [x] `src/pages/PosPage.jsx` — clearAuth/clearUser awaited

#### Step 4 — Deploy (action required) ⏳
1. `npx supabase db push`
2. `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key_here`
3. `npx supabase functions deploy create-user`
4. `npx supabase functions deploy reset-pin`
5. `npx supabase functions deploy deactivate-user`
6. `npx supabase functions deploy seed-auth-users`
7. `npx supabase functions invoke seed-auth-users --no-verify-jwt`
8. Reset all user PINs from UsersAdminPage
9. git push → Vercel deploys automatically
10. Test: login, create user, reset PIN, deactivate user
