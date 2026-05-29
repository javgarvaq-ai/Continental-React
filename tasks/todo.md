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

## Session 2 — Deep Review & Hardening (2026-05-11) ✅

Full backlog in `tasks/pos-action-plan.md`. Summary of what shipped:

### Supabase Auth migration ✅
Replaced custom PIN auth with Supabase Auth. App is now safe on Vercel (public internet).
- `20260511000005_supabase_auth_rls.sql` — added `users.email`, dropped pin RPCs, rewrote ~40 RLS policies to `TO authenticated`
- `20260511000006_fix_users_authenticated_select.sql` — bug fix: anon ≠ authenticated in Postgres; added authenticated SELECT policy on users
- Edge Functions deployed: `create-user`, `reset-pin`, `deactivate-user`, `seed-auth-users`
- Rewrote `auth.js`, `authStore.js`, `usersAdmin.js`, `PosPage.jsx`
- Secret: `SB_SERVICE_ROLE_KEY` (not `SUPABASE_` prefix — reserved by CLI)

### Bug fixes ✅
- `20260511000002` — dropped total membership unique constraint (blocked same-month reactivation)
- `20260511000003` — verify_pin rate limiting (superseded by Auth migration, but applied cleanly)
- `20260511000004` — `activate_membership` RPC: atomic membership + comanda charge; no more $0 bug
- `products.js` — `updateComandaPersonas` now accepts `processing_payment` status too
- `CustomersAdminPage` — membership status label handles all 3 states (active / cancelled / expired)
- `tickets.js` — `.maybeSingle()` on payments; no crash on cancelled comanda reprint
- `membership.js` — ilike wildcard input escaped before query

### T3 — Service layer refactor ✅
- Created `src/services/shifts.js` (5 functions)
- Added `getUserById` + `checkUsersExist` to `src/services/users.js`
- `useShift.js`, `authStore.js`, `SetupAdminPage.jsx` — zero direct Supabase DB calls outside services
- `SetupAdminPage` — removed broken `create_user` RPC call (dropped in auth migration)

### Quick wins ✅
- `20260511000007_add_missing_indexes.sql` — `comanda_items(comanda_id) WHERE active` + `comandas(cobrado_at) WHERE paid`
- Dead code removed: `getCustomerByNumber`, unused `import React` + null `Ticket()`, `useNavigate` in CustomersAdminPage, duplicate `getCurrentMonthDate`
- `Ticket.jsx` — print window closes after print (`onafterprint`)
- `useCustomer.handleSearchCustomer` — network error now surfaces as status message

### DB schema cleanup ✅
- `20260511000008_schema_cleanup.sql`:
  - `comanda_events` — dropped orphaned `mesa_id` + `details` columns (index auto-dropped)
  - `products.category_id` — removed `DEFAULT gen_random_uuid()` (was silently creating bad FKs)
  - `payments` — `efectivo`, `tarjeta`, `transferencia`, `total_paid` now `NOT NULL DEFAULT 0`
  - `users.updated_at` — new column with auto-update trigger `users_set_updated_at`

---

## Pre-apertura — Blockers ✅ (2026-05-12)

- [x] **S-2** `20260512000002_finalize_payment_idempotent.sql` — `finalize_comanda_payment` RPC ahora verifica `status = 'processing_payment'` antes de hacer cualquier cosa. Doble cobro por retry imposible. Frontend mapea `already_paid` → "Esta comanda ya fue cobrada. Recarga la página."
- [x] **B-1** PosPage — removidos `setGroupedProducts({})` de `handleBackToUnits` y `handleCancelMesa`. Catálogo persiste toda la sesión.
- [x] **B-2** WeeklyReportPage — semana por defecto ahora inicia en lunes (alineado con schedule de empleados).

**Acción requerida en producción:**
1. `supabase db push` para aplicar `20260512000001` (admin RLS), `20260512000002` (payment idempotent) y `20260512000003` (security fixes)

## Round C — QA findings ✅ (2026-05-12)

- [x] **S-4** `membership.js` → `addFreeBenefitItemToComanda`: guard de comanda abierta agregado (mismo patrón que `assertComandaOpen` en products.js)
- [x] **B-4** `usePayment` → `handleReopenComanda`: ahora llama `onReloadComanda(currentComanda.id)` tras reabrir — cart refleja estado actual de inmediato
- [x] **B-5** `InventoryPage` → `loadInventory`: error de carga ahora muestra banner rojo en lugar de lista vacía silenciosa
- [x] **B-7** `usePayment` → `handleConfirmPayment`: `membershipWarning` se concatena al mensaje de éxito en lugar de reemplazarlo
- [x] **S-3** `20260512000003_security_fixes.sql` → `activate_membership` RPC: guard de comanda abierta al inicio del RPC
- [x] **S-6** `20260512000003_security_fixes.sql` → REVOKE EXECUTE en `activate_membership` y `process_membership_on_payment` de rol `anon`
- [x] **S-7** `20260512000003_security_fixes.sql` → `shifts_insert` y `shifts_update` restringidos a `role IN ('admin', 'manager')`
- [x] **B-3** Falso positivo — `getReprintData` en `tickets.js` ya tenía `.eq('status', 'active')`; no requería cambio

## Sprint May 13th — En progreso

### Fase 1 — Cluster A/B/C (deuda visible)

#### [x] A3 — Return shape `{ data, error }` uniforme ✅
- [x] `customersAdmin.js` — getAllCustomers, createCustomer, updateCustomer, getCustomerBenefitUsage
- [x] `unitsAdmin.js` — getAllUnits, createUnit, updateUnit, deactivateUnit
- [x] `inventoryAdmin.js` — getAllInventoryItems, createInventoryItem, updateInventoryItem, toggleInventoryItemActive
- [x] Callers already used `{ data, error }` destructuring — no caller changes needed

#### [x] A4 — Error handling ✅ (already done in previous sessions)
- [x] `InventoryPage` and `useCustomer` already surface errors correctly

#### [x] B10 — `processMembershipOnPayment` returns `{ data, error }` ✅
- [x] `membership.js` — now returns `{ data: { newVisitCount, ... }, error, warning }`
- [x] `usePayment.js` — destructures `{ data: mData, warning: mWarning }`, single `membershipWarning` variable

#### [x] B7 — `getNextCustomerNumber` order by number ✅
#### [x] D5 — Dead `inventoryWarning` branch removed ✅
#### [x] P8 — `getOpenComandasCount` HEAD count query ✅

### [x] 0.3 · B6+B9 — Apertura de mesa con cliente atómica ✅
- [x] `comandas.js` → `getOrCreateActiveComanda`: acepta `customerId` opcional, lo incluye en el INSERT
- [x] `PosPage.jsx` → `doOpenTable`: pasa `customerId` al crear comanda, eliminado `assignCustomerToComanda` separado
- [x] Verificado: customer_id y customer_name van en el mismo INSERT — atómico por diseño

### [x] 0.1 · B3 — `adjust_inventory_stock` cap a 0 ✅
- [x] Migración `20260513000001_fix_adjust_inventory_stock.sql` — ajuste negativo falla con `insufficient_stock` + stock real en lugar de silenciosamente capear a 0
- [x] `inventoryAdmin.js` → mensaje de error descriptivo con stock actual cuando `insufficient_stock`
- [x] **Javi debe correr:** `supabase db push`
### [x] 0.4 · C7 — Alinear semana a domingo en schedules ✅
- [x] `scheduleAdmin.js` → `getWeekStart` retorna domingo (`d.getDay()` días de retroceso)
- [x] `ScheduleAdminPage.jsx` + `ScheduleViewPanel.jsx` → DAYS/DAYS_FULL arrancan en 'Dom'
- [x] Migración `20260513000002_schedule_week_start_sunday.sql` — renumera `day_of_week` y retrocede `week_start` en datos existentes
- [x] **Javi debe correr:** `supabase db push`
### [x] 0.2 · B5 — Ticket de pagado respeta membershipWarning ✅
- [x] `usePayment.js` → `membershipInfo: null` cuando `membershipResult?.membershipWarning` está set — ticket no imprime sección de membresía que no fue otorgada

### [x] 0.5 · S5 — isAdmin check en EmployeesAdminPage y ScheduleAdminPage ✅
- [x] `EmployeesAdminPage.jsx` → import `useAuthStore` + `if (!isAdmin)` guard antes del render
- [x] `ScheduleAdminPage.jsx` → mismo patrón

---

## Pending — Next Session

### Round B — Runtime bugs ✅ (2026-05-12)
- [x] **6.3 🔴** `addNormalProductToComanda` / `addShotWithFreeMixers` / `decreaseCartItem` — added `assertComandaOpen` internal guard in `products.js`; rejects writes if comanda is not `open`
- [x] **3.5** Cancelled comanda can print a ticket — `handleReprintFolioSubmit` in PosPage now checks `comanda.status === 'cancelled'` before the else print branch and shows a clear error
- [x] **4.5** Product catalog re-fetched on every comanda switch — catalog now loaded once at session start via dedicated `useEffect([], [])` in PosPage; `loadComandaView` now only fetches the cart

### T1 — Server-side role enforcement ✅ (2026-05-12)
- [x] **7.6 🔴** `20260512000001_admin_role_rls.sql` — restricted INSERT/UPDATE/DELETE on 12 admin-only tables to `role IN ('admin', 'manager')` via subquery on `public.users`. SELECT stays open (waiters read products/categories). `employees`, `employee_schedule_shifts`, `employee_time_logs` split from `FOR ALL` into separate SELECT (open) + write (admin/manager) policies.

**Action required in production:**
1. `supabase db push` to apply migration `20260512000001`

---

## QA Session — 2026-05-16/17

### RLS fixes ✅
- [x] `20260516000001_fix_payments_rls.sql` — `finalize_comanda_payment` ahora es SECURITY DEFINER. Root cause: función corría como `authenticated` pero `payments` solo tenía INSERT policy `TO anon`. Ahora el RPC corre como owner (postgres) y bypasea RLS.
- [x] `20260516000002_fix_payments_select_rls.sql` — DROP `payments_select` (TO anon) + DROP `payments_insert` + CREATE `payments_select` TO authenticated. Fix silencioso: Dashboard, Analytics, ShiftPanel, FolioHistory y reprint retornaban 0 filas sin error.

### UI/UX fixes ✅
- [x] `src/index.css` — `color-scheme: dark` (eliminado `light dark`), background hardcodeado `#0f0f0f`, color `#e2e8f0`
- [x] `PosPage.jsx` — root div con `background: #0f0f0f`, `color: #e2e8f0`, `minHeight: 100vh` — fix de paneles blancos en navegadores con modo claro del OS
- [x] `PaymentPanel.jsx` — `onWheel={(e) => e.target.blur()}` en los 4 inputs numéricos (efectivo, tarjeta, transferencia, propina) — evita cambios accidentales con scroll
- [x] `PosPage.jsx` + `useCustomer.js` + `comandas.js` — botón "✕ Quitar cliente" en comanda abierta; `removeCustomerFromComanda` setea `customer_id = null, customer_name = null`

### Reporting restructure ✅
- [x] `App.jsx` — `/weekly-report` movido de `ManagerRoute` a `AuthRoute` (solo admin)
- [x] `AdminNav.jsx` — botón `💰 Reporte` agregado (entre Analytics y Clientes)
- [x] `services/reports.js` — nueva función `getGlobalBalances()` — carga pagos y movimientos de caja SIN filtro de fecha (saldos históricos acumulados)
- [x] `WeeklyReportPage.jsx` — reescrito: AdminNav en header, filtros rápidos (Este turno / Hoy / Esta semana), dos cargas independientes: `loadPeriod()` (filtrable) y `loadGlobal()` (siempre all-time). Sección "Posición de dinero" usa solo datos globales.

### FolioHistory fixes ✅
- [x] `tickets.js` → `getComandaItems` — FK hint explícito `products!comanda_items_product_id_fkey`. Fix del "Sin productos": dos FKs de `comanda_items` a `products` hacían que PostgREST fallara silenciosamente y retornara error → `[]`.
- [x] `tickets.js` — nueva función `adjustPaymentTip({ paymentId, tipAmount })`
- [x] `20260517000001_adjust_payment_tip.sql` — RPC SECURITY DEFINER que actualiza `payments.tip_amount` y sincroniza `comandas.tip_total`. Guards: tip ≥ 0, pago existe, comanda debe ser `paid`.
- [x] `FolioHistoryPage.jsx` → `DetailPanel` — propina editable inline (botón "editar" → input + Guardar/✕). Al guardar, refresca la lista.

### Pendientes de producción ⚠️
```
npx supabase db push
```
Aplica estas 3 migraciones nuevas:
- `20260516000001_fix_payments_rls.sql`
- `20260516000002_fix_payments_select_rls.sql`
- `20260517000001_adjust_payment_tip.sql`

### Diferidos para próxima sesión
- Inventory unit types (kg, g, L, ml) — UI de selección de unidades en admin de inventario
- Post-payment tip (Option C): agregar propina después de confirmar pago desde POS — frecuencia de uso a confirmar antes de implementar

---

## Session May 18th — Dashboard features + AdminNav redesign ✅

### Dashboard risk alerts ✅
- [x] `src/services/dashboard.js` → `getOpenTables()` — añadido `final_total` al SELECT
- [x] `src/services/dashboard.js` → nueva función `getSalesVelocity()` — consultas paralelas: hora actual (HH:00 → ahora) y hora previa (HH-1:00 → HH:00). Retorna `{ currentHour, prevHour, currentHourLabel, prevHourLabel }`
- [x] `src/pages/DashboardPage.jsx` — constantes `RISK_HOURS = 3` y `RISK_AMOUNT = 3000`, helper `isAtRisk(table)`, estado `velocity`, MetricCard de velocidad con flecha de tendencia, filas de mesa en riesgo con fondo ámbar + ⚠️ + texto amarillo
- [x] **Reglas de riesgo:** mesa abierta ≥ 3 horas Y consumo ≥ $3,000

### Inventory note en dashboard ✅
- [x] `src/services/reports.js` → `getRecentInventoryMovements` — añadido `note` al SELECT
- [x] `src/pages/InventoryDashboardPage.jsx` — columna "Nota" en tabla de movimientos (truncada con ellipsis a 180px)

### TopBar fix ✅
- [x] `src/components/TopBar.jsx` — botón "Reporte semanal" movido a bloque `{isAdmin && ...}` (antes visible para managers; ruta es admin-only)

### AdminNav redesign ✅
- [x] `src/components/AdminNav.jsx` — rediseñado de barra horizontal scrolleable a sidebar vertical fijo (200px), dos secciones: **Vistas** y **Configuración**, botones ancho uniforme, activo en azul, dev en ámbar, sin cambios de lógica ni rutas
- [x] 16 páginas admin — añadido `paddingLeft: '216px'` al div exterior (solo el branch con AdminNav), offset para el sidebar

### Pendientes de producción ⚠️
```
npx supabase db push
```
Aplica estas 3 migraciones (de la sesión anterior, aún pendientes):
- `20260516000001_fix_payments_rls.sql`
- `20260516000002_fix_payments_select_rls.sql`
- `20260517000001_adjust_payment_tip.sql`

### Diferidos
- ~~Inventory unit types (kg, g, L, ml)~~ → completado sesión 2026-05-23
- Post-payment tip (Option C): agregar propina post-pago desde POS
- Ticket promedio por cajero (deferred por scope)

---

<<<<<<< HEAD
## Session May 19th — Pre-launch hardening ✅ (2026-05-19)

Revisión completa del proyecto usando `tasks/General Review May 18th.md` como base. Todos los riesgos y bugs pre-apertura cerrados. App mergeada a main y desplegada en producción.

### Security fixes ✅

- [x] **R4 — Race condition `verifySession`** — `isVerifying: true` en estado inicial de `authStore.js`; `verifySession` usa `try/finally` para garantizar reset a `false`. Los 3 guards (`ProtectedRoute`, `AuthRoute`, `ManagerRoute`) retornan `null` mientras `isVerifying === true` — sin flashes de redirect al recargar.
- [x] **R2 — Login expone roles (information leak)** — `getActiveUsers()` en `src/services/users.js` ya no selecciona `role`. Campo `{user.role}` eliminado de botones de selección y texto de confirmación en `LoginPage.jsx`.
- [x] **R1 — SqlAdminPage eliminada** — archivo vaciado (comentario de auditoría), ruta `/admin/sql` e import removidos de `App.jsx`, entrada de SQL removida de `AdminNav.jsx`. Migración `20260519000001_drop_execute_sql.sql` creada para dropear `public.execute_sql(text)` y `public.execute_sql(query text)`.
- [x] **R3 — CORS `*` en Edge Functions** — patrón `Deno.env.get('ALLOWED_ORIGIN') || '*'` implementado en `create-user`, `reset-pin` y `deactivate-user`. Secret configurado: `ALLOWED_ORIGIN=https://continental-react.vercel.app`. Las 3 funciones redesenployadas.

### Bug fixes ✅

- [x] **B1 — `startOfToday()` timezone** — `dashboard.js` ahora construye el string ISO con `-06:00` explícito en lugar de usar `setHours(0,0,0,0)` del browser.
- [x] **B3 — `money()` locale** — `src/utils/money.js` reescrito con `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`. Formato correcto: `$1,234.56`.

### QA bug fix (encontrado en sesión) ✅

- [x] **Customer number crash** — `getNextCustomerNumber()` retorna un integer de Postgres. `setNewNumber(next)` almacenaba el integer en state. El botón de crear llamaba `!newNumber.trim()` → `TypeError: d.trim is not a function` al teclear en el campo de Nombre. Fix: campo `customer_number` marcado `readOnly` (no hay razón para editarlo manualmente), `setNewNumber(String(next))` para almacenar como string. Input con estilo visual de deshabilitado (`background: '#0a0a0a', color: '#555', cursor: 'not-allowed'`), label actualizado a "(automático)". Botón de crear: condición `disabled` solo verifica `!newName.trim()`.

### Producción ✅

- [x] `npx supabase db push` — aplica las 3 migraciones RLS pendientes de sesión May 16/17 + `20260519000001_drop_execute_sql.sql`
- [x] `supabase functions deploy create-user reset-pin deactivate-user` — Edge Functions redesenployadas con CORS actualizado
- [x] `supabase secrets set ALLOWED_ORIGIN=https://continental-react.vercel.app` — secret configurado
- [x] Merge a main + deploy exitoso en Vercel — URL producción: `https://continental-react.vercel.app`
- [x] Edge Functions probadas con Supabase Studio: create-user, reset-pin y deactivate-user retornan 403 sin auth header (correcto)

### Diferidos (backlog)
- Inventory unit types (kg, g, L, ml) — UI en admin de inventario
- Post-payment tip desde POS (Option C) — confirmar frecuencia con Javi antes de implementar
- Split de `PosPage.jsx` (A1) — 64KB, alta inversión cero riesgo operativo
- Realtime subscriptions (P3) — solo si se agrega 2ª tablet

---

## Session May 20th — PWA + dark theme enforcement ✅ (2026-05-20)

### PWA (Progressive Web App) ✅

- [x] `npm install vite-plugin-pwa -D` — plugin instalado
- [x] `vite.config.js` — `VitePWA` configurado: manifest completo, `registerType: 'prompt'` (no auto-update mid-shift), workbox cachea solo el shell (JS/CSS/HTML/íconos), datos de Supabase siempre van a red
- [x] **Manifest:** `name: 'Continental POS'`, `short_name: 'Continental'`, `display: 'standalone'`, `orientation: 'landscape'`, `start_url: '/login'`, `theme_color: '#0f0f0f'`
- [x] **Íconos generados** con Python/Pillow — "C" serif en beige dorado (`#ddd0bc`) sobre fondo oscuro (`#0f0f0f`) con borde y sombra sutil, inspirado en el logotipo de Continental:
  - `public/icon-192.png` — ícono PWA
  - `public/icon-512.png` — ícono PWA (maskable)
  - `public/apple-touch-icon.png` — iOS/iPadOS 180×180
  - `public/favicon-32.png` — favicon browser
- [x] `index.html` — título actualizado a "Continental POS", `lang="es"`, `theme-color`, `apple-touch-icon`, favicon
- [x] Mergeado a main y desplegado en Vercel

### Dark theme enforcement (cross-OS) ✅

Fixes para que la app se vea correcta en PCs con OS en modo claro (light mode).

- [x] **`src/components/ProductCatalog.jsx`** — `<section>` sin `background` explícito aparecía blanco en OS modo claro. Agregado `background: '#0f0f0f', color: '#e2e8f0'`.
- [x] **`src/pages/WeeklyReportPage.jsx`** — root `<div>` sin `background` ni `minHeight`. Agregado `background: '#111', minHeight: '100vh', boxSizing: 'border-box'`.
- [x] **`src/index.css`** — 4 reglas globales para enforcement de dark theme independiente del OS:
  - `body { color: #e2e8f0 }` — texto base claro heredable
  - `h1–h6 { color: #e2e8f0 }` — sobreescribe `var(--text-h)` que en OS claro vale `#08060d` (casi negro)
  - `th, td { background-color: transparent; color: inherit }` — UA stylesheet del browser ponía fondo blanco a celdas de tabla en modo claro
  - `input, select, textarea { color-scheme: dark }` — fuerza controles de formulario a renderizarse con defaults oscuros

### Diferidos
- Smoke test E2E con datos reales antes de apertura
- Inventory unit types (kg, g, L, ml)
- Post-payment tip desde POS (Option C)
- Split de `PosPage.jsx` (A1)
- Realtime subscriptions (P3)
=======
## Session May 23rd — QA + Hardening ✅

### F2 — Open shift close shows table names ✅
- [x] `src/services/shifts.js` → `getOpenComandas()` — reemplaza `getOpenComandasCount()`; retorna `id` + `units(name)` de comandas en estados `open/pending_payment/processing_payment`
- [x] `src/hooks/useShift.js` → `handleConfirmCloseShift` — extrae nombres de unidades y muestra: `"Mesas abiertas: Mesa 1, Mesa 2. Ciérralas antes de cerrar el turno."`

### F3 — Access denied redirect desde rutas protegidas ✅
- [x] `src/components/AuthRoute.jsx` → `<Navigate to="/pos" replace state={{ accessDenied: true }} />`
- [x] `src/components/ManagerRoute.jsx` → mismo patrón
- [x] `src/pages/PosPage.jsx` → `useLocation` + `useEffect` detecta `location.state?.accessDenied` → muestra "No tienes acceso a esa sección.", limpia state con `navigate('/pos', { replace: true, state: {} })`

### S-8 — Edge Function create-user rollback ✅
- [x] `supabase/functions/create-user/index.ts` → captura error de `updateUserById`; si falla, hace rollback con `deleteUser` y retorna 500
- [x] **Javi debe correr:** `supabase functions deploy create-user`

### B-4 — Eliminada validación de inventario client-side + fix rpcError ✅
- [x] `src/services/comandaCheckout.js` → removida función `validateComandaInventoryBeforePayment` (~130 líneas) y su llamada en `confirmPayment`
- [x] Mismo archivo → rama `rpcError` ahora usa `friendlyRpcError(rpcError.message, ...)` en lugar de mensaje raw — `insufficient_stock` ahora muestra "Inventario insuficiente. Verifica el stock antes de continuar."

### Inventory unit types expansion ✅
- [x] `supabase/migrations/20260523000001_inventory_unit_types.sql` — DROP + recrear CHECK constraint con `['unit','oz','kg','g','L','ml']`
- [x] `src/pages/InventoryItemsAdminPage.jsx` — ambos selects (crear + editar) tienen las 6 opciones
- [x] **Javi debe correr:** `npx supabase db push`

### Design gap — Multi-ingredient drinks (evaluación, sin código) ✅
- Confirmado: `product_recipes` ya soporta múltiples rows por `product_id` → cobro deducta todos los ingredientes correctamente
- Confirmado: ingredientes puros (Fanta Roja, Boost) deben ser solo `inventory_items`, NO `products` — así no aparecen en el catálogo del POS
- No se requieren cambios de código ni migraciones

### Pendientes de producción ⚠️
```
npx supabase db push
supabase functions deploy create-user
```
Migraciones pendientes de sesiones anteriores + hoy:
- `20260516000001_fix_payments_rls.sql`
- `20260516000002_fix_payments_select_rls.sql`
- `20260517000001_adjust_payment_tip.sql`
- `20260523000001_inventory_unit_types.sql`

### Diferidos
- Post-payment tip (Option C): agregar propina post-pago desde POS
- B5: Propina edge case con pago mixto (medium risk)
- `getCurrentMonthDate()` deduplicación (low risk)
- QA smoke test pendiente: 2-shift simulation en curso — auditoría de números al terminar
>>>>>>> dev
