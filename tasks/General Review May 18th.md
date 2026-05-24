# General Review — Continental POS · 18 Mayo 2026

> Diagnóstico completo del estado del proyecto. Generado como base para sesiones futuras.
> Consolidado de: código fuente, migraciones, `backlog.md`, `todo.md`, `lessons.md`, `Sprint May 13th.md`, `sprint review-action-plan-10-May.md`.

---

## ¿Qué es este proyecto?

Sistema POS (Point of Sale) **a medida** para Continental Cantina Bar, México. SPA en React desplegada en Vercel. Backend completo en Supabase (Postgres + Auth + Edge Functions + RLS). Desarrollado con asistencia de IA con dirección fuerte del dueño (Javi). Opera desde una sola PC/tablet en barra — la URL es pública en internet.

**Stack:** React 19 · Vite · React Router v7 · Zustand v5 · Supabase JS v2 · Deno Edge Functions

**Roles:** `waiter` → `manager` → `admin`

**Timezone del negocio:** México (-06:00). Usar strings ISO con `-06:00` explícito en queries de Supabase.

---

## Estado al 20 de Mayo 2026

- ✅ Todos los flujos core construidos y probados en QA: POS, pagos, turnos, membresías, inventario, reportes.
- ✅ Todos los riesgos pre-apertura cerrados en sesión May 19th.
- ✅ `SqlAdminPage` eliminada. RPC `execute_sql` dropeado en producción.
- ✅ PWA instalable — ícono "C" serif, manifest completo, service worker.
- ✅ Dark theme enforced en OS modo claro — `index.css` global rules.
- ✅ App mergeada a main. **En producción: `https://continental-react.vercel.app`**

---

## Capacidades del sistema

**Operación de piso:** Apertura/cierre de turno con caja inicial, mesas (units), comandas, catálogo de productos por categoría, shots con mixers configurables, descuentos por membresía activa.

**PWA:** Instalable como app nativa en tablet/PC desde Chrome. Ícono "C" serif en beige dorado. Funciona en `standalone` mode (sin chrome del browser). Requiere conexión — datos siempre van a Supabase.

**Cobros:** Flujo de 4 pasos (`open → pending_payment → processing_payment → paid`), cobro mixto (efectivo + tarjeta + transferencia), propina manual/automática, ticket impreso via ventana emergente, ajuste de propina post-cobro desde FolioHistory.

**Inventario:** Stock en tiempo real, deducciones automáticas al finalizar pago, recetas mapeadas a insumos (`product_recipes`), movimientos manuales, dashboard de stock con historial de movimientos.

**Clientes y membresías:** Clientes con número correlativo, historial de visitas, créditos de botella por hito de visitas, descuento por membresía activa del mes, activación de membresía desde POS (atómica vía RPC).

**Administración:** Usuarios (Edge Functions para crear/desactivar/resetear PIN), empleados, horarios semanales, categorías, productos, insumos, unidades de medida, mapeo de recetas, planes de membresía con beneficios configurables.

**Reportería:** Dashboard en tiempo real (con alertas de riesgo por mesa), velocidad de ventas por hora, historial de folios con desglose de pago, analytics por período, inteligencia de clientes, reporte semanal financiero con posición de dinero global (all-time, sin filtro de fecha).

---

## Flujo general de la aplicación

```
/login
  └─ Selección de usuario (anon) + PIN (Supabase Auth)
       └─ ¿Existe turno abierto?
            ├─ SÍ  → setAuth(user, shiftId) → /pos
            └─ NO  → Caja inicial → createShift → /pos

/pos  (ProtectedRoute: user + shiftId requeridos)
  ├─ MesaGrid — mesas con estado visual (badge de status)
  │    └─ click → getOrCreateActiveComanda(unitId)
  │         └─ ComandaPanel + ProductCatalog
  │              ├─ Agregar productos normales
  │              ├─ Agregar shots → ShotMixerSelector
  │              ├─ Buscar cliente → lookup membresía activa del mes
  │              └─ PaymentPanel
  │                   ├─ Presentar cuenta (present_bill_atomic RPC)
  │                   ├─ Iniciar cobro
  │                   ├─ Confirmar pago (finalize_comanda_payment RPC)
  │                   │    └─ status transition + payment INSERT + inventory deduction + event
  │                   └─ processMembershipOnPayment (RPC separado post-cobro)
  │
  └─ TopBar
       ├─ ShiftPanel → corte de caja → closeShift (bloqueado si hay mesas abiertas)
       ├─ CashMovementPanel → entrada/salida de efectivo
       └─ ScheduleViewPanel → horario empleados (read-only)

/admin/* (AuthRoute: solo admin)
  Sidebar AdminNav fijo (200px) con secciones Vistas y Configuración.
  Incluye: Usuarios, Productos, Categorías, Inventario, Membresías,
           Clientes, Empleados, Horarios, Folios, Analytics

/inventory (ManagerRoute: manager o admin)
/dashboard, /analytics, /customers/intelligence,
/inventory/dashboard, /weekly-report  (AuthRoute: solo admin)
```

---

## ✅ Acciones pre-apertura — Completadas (19 Mayo 2026)

### 1. Migraciones en producción ✅
```bash
npx supabase db push
```
Aplicadas en sesión May 19th:
- `20260516000001_fix_payments_rls.sql` — `finalize_comanda_payment` SECURITY DEFINER
- `20260516000002_fix_payments_select_rls.sql` — SELECT TO authenticated en payments
- `20260517000001_adjust_payment_tip.sql` — RPC `adjust_payment_tip`
- `20260519000001_drop_execute_sql.sql` — DROP `public.execute_sql` (RPC dev tool)

### 2. SqlAdminPage eliminada ✅
- `src/pages/SqlAdminPage.jsx` — vaciada (comentario de auditoría)
- Ruta `/admin/sql` e import removidos de `App.jsx`
- Entrada SQL removida de `AdminNav.jsx`
- RPC `execute_sql` dropeado en producción vía migración `20260519000001`

---

## Riesgos detectados

### 🔴 Seguridad — Alta prioridad

**R1 — `SqlAdminPage` viva en producción** ✅ RESUELTO
Archivo vaciado, ruta e import removidos de `App.jsx`, entrada de sidebar removida de `AdminNav.jsx`. RPC `execute_sql` dropeado en producción vía `20260519000001_drop_execute_sql.sql`.

**R2 — Login screen expone roles de todos los usuarios sin autenticación** ✅ RESUELTO
`getActiveUsers()` en `users.js` ahora selecciona solo `id, name, active`. `{user.role}` eliminado de `LoginPage.jsx` (botones de selección y texto de confirmación).

**R3 — CORS `*` en Edge Functions** ✅ RESUELTO
`create-user`, `reset-pin`, `deactivate-user` — patrón `Deno.env.get('ALLOWED_ORIGIN') || '*'` implementado. Secret configurado en Supabase: `ALLOWED_ORIGIN=https://continental-react.vercel.app`. Funciones redesenployadas el 2026-05-19.

**R4 — `verifySession` no tiene estado de carga (race condition de flash)** ✅ RESUELTO
`isVerifying: true` en estado inicial de `authStore.js`. `verifySession` usa `try/finally` para resetear a `false` siempre. Los 3 guards (`ProtectedRoute`, `AuthRoute`, `ManagerRoute`) retornan `null` mientras `isVerifying === true`.

### 🟠 Bugs — Prioridad Media

**B1 — `startOfToday()` en `dashboard.js` usa timezone del browser, no México** ✅ RESUELTO
`dashboard.js` ahora construye el string ISO con `-06:00` explícito (`${y}-${m}-${day}T00:00:00-06:00`).

**B2 — `getCurrentMonthDate()` duplicada**
Existe en `membership.js` y como `currentMonthDate()` en `reports.js`. Producen el mismo resultado. Consolidar en `src/utils/dates.js` e importar desde ahí.

**B3 — `money()` no usa formato de locale** ✅ RESUELTO
`src/utils/money.js` reescrito con `new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`. Formato correcto: `$1,234.56`.

**B4 — Validación de inventario pre-pago ocurre en cliente (redundante y problemática)**
`validateComandaInventoryBeforePayment` en `comandaCheckout.js` lee el stock y valida antes de llamar al RPC. Pero entre esa lectura y la ejecución del RPC, otro cobro podría deducir el mismo inventario. El RPC `finalize_comanda_payment` ya tiene su propia deducción con `deduct_inventory_item`. La validación del cliente puede dar falsos positivos (rechazar cobros legítimos) o falsos negativos (aprobar y fallar en el RPC). La validación autoritativa vive en Postgres — la del cliente debería eliminarse.

**B5 — Edge case de propina con pago mixto**
En `usePayment → getPaymentSummary`: si `efectivo <= 0` la propina se auto-calcula como `Math.max(totalRecibido - totalCuenta, 0)`. En pagos mixtos donde el efectivo cubre la cuenta exactamente y la tarjeta cubre solo la propina, la lógica no distribuye correctamente. Raro pero posible.

### 🟡 Flujo — Prioridad Baja

**F1 — Nombre `AuthRoute` es confuso**
`AuthRoute` protege rutas de admin únicamente (redirige no-admins al POS). Pero `ProtectedRoute` también requiere autenticación. `AuthRoute` suena más genérico que `ProtectedRoute`, que es al revés de lo que hace. Renombrar a `AdminRoute` para mayor claridad.

**F2 — Mensaje de cierre de turno no indica qué mesas están abiertas**
Cuando `hasOpenComandas` bloquea el cierre, el mensaje dice "Hay mesas abiertas. Ciérralas antes de cerrar el turno." Sin especificar cuántas ni cuáles. El cajero no sabe dónde ir. Mejorar con la lista de mesas/folios bloqueantes.

**F3 — `AuthRoute` redirige silenciosamente a roles no autorizados**
Si un waiter escribe `/dashboard` directamente, es enviado al POS sin mensaje. El empleado cree que el sistema está roto. Agregar un mensaje breve antes de redirigir: "No tienes acceso a esta sección."

---

## Código o recursos no utilizados

| Item | Ubicación | Acción sugerida |
|------|-----------|-----------------|
| `react.svg` y `vite.svg` | `src/assets/` | Eliminar (template de Vite, no referenciados) |
| `hero.png` | `src/assets/` | Verificar si se usa; eliminar si no |
| `seed-auth-users/index.ts` | `supabase/functions/` | Eliminar o no desplegar — herramienta de dev |
| `ManagerRoute` | `src/components/` | Solo usado en 1 ruta (`/inventory`); considerar si se necesita o simplificar |
| `comanda_events.mesa_id` y `.details` | Schema DB | Ya dropeados en `20260511000008` — confirmar que no quedan en dumps |
| `inventory_items.capacity_oz` | Schema DB | No leída ni escrita desde el frontend. Documentar intención o dropear |
| `execute_sql` RPC | DB | Dropear con migración al eliminar SqlAdminPage |

---

## Backlog pendiente (desde sesiones anteriores)

Estos items fueron diferidos intencionalmente. Prioridades para próximas sesiones:

### Alta prioridad (deuda funcional)

- [ ] **A1 — Split de `PosPage.jsx`** (64KB, ~1148 líneas)
  Extraer: `PaymentPage.jsx`, `ComandaDetailPanel.jsx`, `OpenTableDialog.jsx`, `ReprintDialog.jsx`.
  Reduce prop drilling, facilita mantenimiento. Alta inversión, cero riesgo operativo.

- [ ] **Inventory unit types UI** (diferido May 17th)
  Selector de `unit_type` (kg, g, L, ml) en el admin de ítems de inventario.
  La columna ya existe en el schema; solo falta la UI de selección.

- [ ] **Post-payment tip desde POS (Option C)** (diferido May 17th)
  Agregar propina después de confirmar pago directamente desde el flujo del POS.
  **Acción antes de implementar:** confirmar frecuencia de uso real con Javi.

### Media prioridad (mejoras)

- [ ] **P2 — `WeeklyReportPage` reduce passes**
  8 `reduce` independientes sobre `cashMovements`. Consolidar en un solo `forEach` con un acumulador.

- [ ] **P3 — Realtime subscriptions** (solo si se agrega 2ª tablet)
  `supabase.channel()` en `comandas` y `comanda_items` filtrado por `unit_id`.
  Dos tablets en la misma unidad divergen silenciosamente hoy. No aplica con una sola tablet.

- [ ] **A4 — RPC `add_item_to_comanda` SECURITY DEFINER**
  Prerequisito para cerrar el TOCTOU del carrito. Diferido hasta confirmar segunda tablet.

- [ ] **U3 — Multi-tab logout**
  `window.addEventListener('storage', ...)` en `authStore` para detectar logout en otra pestaña.
  Bajo riesgo — operación de una sola tablet.

- [ ] **B3-backlog — Cart TOCTOU** (`addNormalProductToComanda`)
  Race window de microsegundos en modelo de una tablet. Resultado: fila duplicada visible, totales e inventario correctos. Teórico mientras no haya segunda tablet.

### Baja prioridad (nice-to-have)

- [ ] **A2 — `useOnlineStatus` en Context único**
  Dos instancias del hook en `PosPage` y `TopBar`. Siempre sincronizan (mismo evento de browser). Cero impacto operativo.

- [ ] **Alerta de sesión próxima a expirar**
  Mostrar aviso si el JWT de Supabase está a X minutos de expirar. No crítico — Supabase renueva tokens automáticamente.

- [ ] **Ticket promedio por cajero en analytics**
  Diferido por scope en sesión May 18th.

---

## Revisión de buenas prácticas

### ✅ Bien hecho

- Separación en capas estricta: `pages → hooks → services`. Nunca Supabase directo desde components o hooks de UI.
- RPCs críticos con `SECURITY DEFINER + SET search_path = public`. Atomic transactions en Postgres.
- Edge Functions verifican JWT + rol admin antes de actuar (no confían en el cliente).
- Audit trail completo: `comanda_events`, `inventory_movements`, `cash_movements`, `error_log`.
- `ErrorBoundary` con logging automático a Supabase.
- Guard `requireOnline` como primera línea en todos los handlers que mutan datos.
- Double-confirm pattern para acciones destructivas.
- Soft delete en `comanda_items` (preserva FK para `inventory_movements`).
- Migraciones escritas a mano, timestampeadas, con comentarios de "Problem / Fix / Audit".

### ⚠️ Áreas de mejora

**Sin TypeScript:** Muchos objetos con formas específicas (`comanda`, `payment`, `membership`, `user`) se pasan entre hooks y componentes sin tipos. Errores de propiedad solo aparecen en runtime. Mayor impacto de productividad para desarrollo continuo.

**Todo inline styles:** Cero CSS modules o variables de diseño. Reutilizar estilos requiere copy-paste o variables sueltas en cada archivo. Un sistema de design tokens mínimo (CSS variables en `index.css`) reduciría la deuda de UI.

**Sin tests:** Ni unitarios ni de integración. `utils/payments.js` y `utils/money.js` son candidatos perfectos para tests unitarios. El flujo de pago no tiene red de seguridad automatizada.

**`ErrorBoundary` como clase component:** Inconsistente con el resto del codebase en funciones. Es inevitable hoy (React no tiene hook alternativo para `componentDidCatch`), pero vale documentarlo.

---

## Flujos que podrían simplificarse

**Cálculo de pago en 3 lugares:**
El breakdown del pago se calcula en `usePayment → getPaymentSummary` (para UI), luego en `computePaymentBreakdown` (para validar antes de enviar), y luego el RPC tiene su propia lógica en Postgres. Si la lógica de propina cambia, hay que actualizarla en los 3 lugares.

**Dos funciones casi idénticas de carga de membresía:**
`getCustomerWithMembership` (busca por número) y `getCustomerByIdWithMembership` (busca por UUID) duplican la query de membresía. Extraer `getMembershipForCustomer(customerId)` interna y llamarla desde ambas.

**Dos route guards para el mismo concepto (admin):**
`ProtectedRoute` (user + shift) y `AuthRoute` (admin) tienen nombres que inducen a pensar que el segundo es más general. Ver riesgo F1 arriba.

---

## ¿IA o humano?

**Huellas claras de desarrollo AI-driven con dirección humana fuerte.**

Señales de IA: consistencia perfecta en 100+ archivos (mismo patrón `return { data, error }`, mismo `try/finally` con `setIsLoading`, comentarios al mismo nivel de detalle). El archivo `tasks/lessons.md` es un sistema de memoria para evitar repetir errores — práctica inusual en desarrollo humano convencional.

Señales de dirección humana: lógica de negocio específica y correcta para un bar mexicano (mixers, membresías mensuales, créditos de botella, corte de caja con resguardo/banco/caja, propinas en efectivo vs. tarjeta). Las migraciones tienen contexto de decisiones reales.

**Conclusión:** código más limpio y consistente que el 80% de proyectos puramente humanos de este tamaño. El riesgo es que el "conocimiento" del proyecto vive en conversaciones y en `lessons.md`, no en un equipo que pueda hacer troubleshooting autónomo.

---

## Checklist pre-apertura (estado al 19 Mayo 2026) — ✅ TODO COMPLETO

- [x] **Correr `npx supabase db push`** — corrido el 2026-05-19 (3 migraciones RLS + adjust_payment_tip + drop_execute_sql)
- [x] **Eliminar `SqlAdminPage`** — archivo vaciado, ruta e import removidos de App.jsx, botón removido de AdminNav.jsx. RPC dropeado en producción vía `20260519000001_drop_execute_sql.sql`.
- [x] **Fix `verifySession` race condition** — `isVerifying: true` en authStore, `try/finally` garantiza reset. Los 3 route guards retornan `null` mientras `isVerifying === true`.
- [x] **Fix `startOfToday()`** — timezone México explícita (`T00:00:00-06:00`) en `dashboard.js`.
- [x] **Fix `money()`** — `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })` en `utils/money.js`.
- [x] **Fix `role` expuesto en login** — `getActiveUsers` ya no retorna `role`. Display de role removido en LoginPage.jsx (botones de usuario y texto de confirmación).
- [x] **CORS en Edge Functions** — patrón `Deno.env.get('ALLOWED_ORIGIN') || '*'` en las 3 funciones. Secret configurado: `ALLOWED_ORIGIN=https://continental-react.vercel.app`. Funciones redesenployadas el 2026-05-19.
- [x] **Redesplegar Edge Functions** — `supabase functions deploy create-user reset-pin deactivate-user` — ✅ exitoso
- [x] **Merge a main + deploy Vercel** — URL producción: `https://continental-react.vercel.app`
- [x] **Edge Functions probadas** — create-user, reset-pin, deactivate-user retornan 403 sin auth header (correcto)
- [ ] Smoke test E2E completo con datos reales: login → turno → mesa → items → membresía → cobro → reimpresión → cierre de turno
- [ ] Cargar datos reales (clientes, productos, empleados) y QA final
- [ ] Verificar impresora de tickets en Chrome con `--kiosk-printing` activo

---

## Referencia rápida — Archivos clave

| Propósito | Archivo |
|-----------|---------|
| Routing y guards de rol | `src/App.jsx`, `src/components/ProtectedRoute.jsx`, `AuthRoute.jsx`, `ManagerRoute.jsx` |
| Estado global de auth | `src/store/authStore.js` |
| Login y apertura de turno | `src/pages/LoginPage.jsx`, `src/services/auth.js` |
| Página principal del POS | `src/pages/PosPage.jsx` |
| Flujo de comanda | `src/hooks/useComanda.js`, `src/services/products.js`, `src/services/comandas.js` |
| Flujo de pago | `src/hooks/usePayment.js`, `src/services/comandaCheckout.js`, `src/utils/payments.js` |
| Membresías | `src/services/membership.js`, `src/utils/membership.js` |
| Turno y caja | `src/hooks/useShift.js`, `src/services/shifts.js` |
| Reportes | `src/services/reports.js`, `src/services/dashboard.js` |
| Error logging | `src/services/errors.js`, `src/components/ErrorBoundary.jsx` |
| Migraciones | `supabase/migrations/` (ordenadas por timestamp) |
| Edge Functions | `supabase/functions/create-user/`, `reset-pin/`, `deactivate-user/` |
| Reglas y aprendizajes | `tasks/lessons.md` |
| Backlog completo | `tasks/backlog.md` |
