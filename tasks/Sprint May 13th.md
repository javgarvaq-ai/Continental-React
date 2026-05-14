# Sprint May 13th — Plan de Ejecución (refinado)

**Origen:** Deep Code & DB Review (2026-05-13) **filtrado** contra estado real del repo.
**Auditoría hecha el 2026-05-13** verificando archivo por archivo cuáles items del review siguen vivos. Los items "Already resolved" se omiten aquí (Sesiones 2-3 del 10-12 de mayo ya los cerraron).
**Deployment:** Vercel — el bar opera desde una sola PC en barra, pero la app es alcanzable desde cualquier IP con la URL. Decisiones de seguridad asumen internet público.
**Regla de oro:** No tocar código hasta aprobar este plan. Migraciones las corre Javi en su terminal.

---

## Objetivo del sprint

Cerrar los items que el bar puede sentir el primer día de operación pública y dejar el resto priorizado. Tres ejes: **integridad financiera** (B3, B5), **UX hot-path** (B6/B9, alinear horario), y **deuda técnica visible** (A3/A4/A5).

---

## Fase 0 — Pre-launch (antes de abrir al público)

### [ ] 0.1 · B3 — `adjust_inventory_stock` falla en vez de cap a 0

- **Por qué primero:** el ajuste de stock negativo silenciosamente se queda en 0 y registra un `quantity_change` que miente. Reportes mensuales basados en `inventory_movements` quedan inflados.
- **Archivo:** `supabase/migrations/<nuevo>_adjust_inventory_strict.sql`. Re-crear la función con el patrón de `deduct_inventory_item` (línea 735): `WHERE current_stock >= p_amount`, devolver `{ ok:false, error:'insufficient_stock', current_stock }` si NOT FOUND. Mantener `SET search_path = public, extensions`.
- **Cliente:** `inventoryAdmin.adjustInventoryStock` — surface error a admin con stock real.
- **Verificación:** intentar restar 50 de un item con stock 30 → error claro; movement no se inserta; stock queda en 30.

### [ ] 0.2 · B5 — Ticket de pagado respeta `membershipWarning`

- **Por qué:** cliente paga, no recibe beneficio (warning legítimo: membresía ya existía, cupo agotado, etc.) y aun así el ticket imprime "MEMBRESÍA" → conflicto al reclamar.
- **Archivos:** `src/hooks/usePayment.js` líneas 286-336, `src/components/Ticket.jsx`.
- **Acción:** si `membershipResult?.membershipWarning` viene set, pasar `membershipInfo: null` al `printTicket` y mostrar `setStatus` en rojo con el warning antes de `onBackToUnits`. Que el cajero lo lea explícitamente.
- **Verificación:** forzar el warning (membresía duplicada del mismo mes) → ticket sale sin sección de membresía + status visible.

### [ ] 0.3 · B6 + B9 — Apertura de mesa con cliente nuevo atómica

- **Por qué:** `doOpenTable` hace `getOrCreateActiveComanda` → `assignCustomerToComanda` en dos calls. Si el segundo falla, queda mesa abierta con `customer_name` y sin `customer_id`. Cliente quedó creado por `handleCreateAndAssignCustomer` antes, consumiendo `customer_number`.
- **Archivos:** `supabase/migrations/<nuevo>_open_comanda_with_customer.sql`, `src/services/comandas.js`, `src/pages/PosPage.jsx` líneas 352-385.
- **Acción:** parámetro opcional `p_customer_id uuid` en `get_or_create_active_comanda` (o RPC nueva `open_comanda_with_customer(unit_id, customer_id, user_id)`) que crea la comanda + setea `customer_id` + `customer_name` en una sola transacción. Cliente: `getOrCreateActiveComanda({ unitId, customerId? })`.
- **Verificación:** abrir mesa con cliente nuevo en red lenta → si la transacción falla, no queda customer huérfano ni comanda inconsistente.

### [ ] 0.4 · C7 — Alinear semana de `getWeekStart` a domingo

- **Por qué:** tu semana laboral empieza domingo; reports tiene picker (no urgente) pero `ScheduleAdminPage` y `ScheduleViewPanel` arrancan defaults en lunes → vista de horarios sale desfasada al abrir.
- **Archivos:** `src/services/scheduleAdmin.js` líneas 4-11, `src/components/ScheduleViewPanel.jsx` línea 7, `src/pages/ScheduleAdminPage.jsx` línea 16. Cambiar constantes `DAYS = ['Dom', 'Lun', ...]` y el cálculo de `getWeekStart` para arrancar en domingo.
- **Verificación:** hoy es miércoles → la vista debe arrancar en domingo de esta semana, no en lunes.

### [ ] 0.5 · S5 — `isAdmin` check en `EmployeesAdminPage` y `ScheduleAdminPage`

- **Por qué:** RLS ya bloquea writes a nivel DB (cubierto por `20260512000001`), pero la página renderiza UI de admin a no-admins que rebote y se vea roto. Defensa en profundidad + UX limpio.
- **Archivos:** `src/pages/EmployeesAdminPage.jsx`, `src/pages/ScheduleAdminPage.jsx`. Patrón ya en otras páginas admin: `if (currentUser?.role !== 'admin') return <AccessDenied />`.
- **Verificación:** manager intenta ir a `/admin/empleados` → pantalla "Acceso denegado", no crash.

---

## Fase 1 — Esta semana (deuda visible)

### Cluster A — Normalización de services

#### [x] 1.A.1 · A3 — Return shape `{ data, error }` uniforme ✅
- `customersAdmin.js`, `unitsAdmin.js`, `inventoryAdmin.js` — all functions now use explicit `const { data, error } = await supabase...; return { data, error }`. Callers already destructured correctly, no changes needed there.

#### [x] 1.A.2 · A4 — Error handling ✅ (already done in previous sessions)
- `InventoryPage` and `useCustomer.handleSearchCustomer` already surface errors via `setStatus`.

#### [x] 1.A.3 · B10 — `processMembershipOnPayment` retorna `{ data, error }` ✅
- `membership.js` — returns `{ data: { newVisitCount, earnedBottleCredit, newBottleCreditsAvailable, membershipWarning }, error, warning }`. RPC errors surface as `warning` (not `error`) to avoid failing the payment.
- `usePayment.js` — destructures `{ data: mData, warning: mWarning }`, single `membershipWarning` variable drives ticket suppression and success message.

### Cluster B — Bugs y race conditions

#### [x] 1.B.1 · B7 — `getNextCustomerNumber` order by number ✅
- `customersAdmin.js` — `.order('customer_number', { ascending: false })` instead of `created_at`.

#### [x] 1.B.2 · B12 — `getReprintData` → `.maybeSingle()` ✅ (done in Session 2)

#### [x] 1.B.3 · D5 — Dead `inventoryWarning` branch removed ✅
- `comandaCheckout.js` — return simplified to `{ error: null }`.

#### [ ] 1.B.4 · A5 — `useOnlineStatus` en context único ⏸ PENDING (next sprint)
- Low risk: both instances listen to the same browser events, always stay in sync. No operational impact. Defer until after launch.

### Cluster C — Performance fácil

#### [x] 1.C.1 · P5 — Catálogo se carga una vez por sesión ✅ (done in Session 3)

#### [x] 1.C.2 · P8 — `fetchShiftPanelData` count en vez de SELECT ✅
- `shifts.js` — `getOpenComandasCount` now uses `{ count: 'exact', head: true }`. `useShift.js` callsite updated to use `count` instead of `data.length`.

---

## Fase 2 — Backlog cercano (próximo sprint)

- [ ] **2.1 · A6** Split de `PosPage.jsx` (1148 líneas) en `PaymentPage`, `ComandaDetailPanel`, `OpenTableDialog`, `ReprintDialog`. Reducir prop drilling.
- [ ] **2.2 · P6** Subscripciones realtime de `comandas` y `comanda_items` filtradas por unidad. Hoy 2 tablets divergen silenciosamente entre cobros. Sólo aplica si llegan a usar más de una tablet — confirmar antes de invertir.
- [ ] **2.3 · D-A2** Convertir `assertComandaOpen` + INSERT/UPDATE en `products.js` a RPC `add_item_to_comanda` SECURITY DEFINER. Cierra el TOCTOU. Si no, dejar como está (race window pequeño, guard funcional).
- [ ] **2.4 · D6** Drop columnas legacy de `products`: `inventory_type`, `base_unit`, `current_stock`, `parent_product_id`, `deduct_amount`. Verificar con `Grep` que ningún caller las lee.
- [ ] **2.5 · C6** Decidir: convertir `customer_number` a `int` (más estricto, mejor sort) o documentar formato esperado en el schema.
- [ ] **2.6 · U2** ErrorBoundary loguea a tabla `error_log` en Supabase. Sin Sentry de momento — empieza simple: una tabla con `created_at`, `error_message`, `stack`, `user_id`, `route`.
- [ ] **2.7 · U5** Deduplicar submit en `CashMovementPanel`: disable button mientras `isSubmittingCash`, ya existe el state — solo aplicarlo.
- [ ] **2.8 · A7** Memoizar `loadComandaView` con `useCallback` + agregar a deps del `useEffect` en `PosPage`.

---

## Fase 3 — Nice-to-have / backlog razonable

- [ ] **3.1 · P3** Eliminar N+1 en `searchCustomerByQuery` por nombre — un solo IN de membresías.
- [ ] **3.2 · P4** Un solo reduce en `WeeklyReportPage` para todos los agregados.
- [ ] **3.3 · S7** Escapar `%` / `_` en `searchCustomerByQuery`.
- [ ] **3.4 · S8** Lista blanca de errores conocidos surface al cajero; el resto → "Error interno".
- [ ] **3.5 · U1** Notificar al cajero cuando print falla más allá del popup bloqueado.
- [ ] **3.6 · U3** Variantes visuales en `setStatus` (info / warning / error).
- [ ] **3.7 · U4** Listener de `storage` event en `authStore` (logout multi-tab).
- [ ] **3.8 · B15** Race window en `addNormalProductToComanda` — postergado intencionalmente; solo aplica si llega 2ª tablet.

---

## Verificación de cierre del sprint

1. **Smoke test E2E del flujo del bar:** login → abrir turno → abrir mesa con cliente nuevo (B6) → agregar items → activar membresía → presentar cuenta → editar personas en cobro → cobrar → reimprimir folio paid y cancelled → cerrar turno.
2. **B3 happy + sad path:** ajuste negativo dentro de stock → OK; ajuste mayor a stock → error claro, sin movement insertado.
3. **B5:** simular warning (membresía pre-existente) → ticket sin sección de membresía + status visible.
4. **S5:** waiter intenta entrar a `/admin/empleados` y `/admin/horarios` → access denied.
5. **C7:** abrir `ScheduleAdminPage` un miércoles → defaults muestran domingo→sábado de esta semana.
6. **Grep final:** `supabase\.from\|supabase\.rpc` en `src/{hooks,pages,store,components}` → 0 hits.

---

## Review

**Sprint closed 2026-05-13.** All remaining open items migrated to `tasks/backlog.md`.

### Migrations applied this sprint
- `20260513000001_fix_adjust_inventory_stock.sql` — B3: strict stock check, rejects insufficient
- `20260513000002_schedule_week_start_sunday.sql` — C7: renumbers day_of_week, shifts week_start to Sunday

### Commits
- `fix: fase 0 pre-launch — apertura de mesa atómica, inventory stock strict, semana desde domingo, ticket membership guard, admin page guards`
- `fix: B7 customer number ordering, D5 dead inventoryWarning branch, P8 open comandas HEAD count`
- `refactor: A3 explicit service return shapes, B10 processMembership { data, error }, B7/D5/P8 cleanup`
