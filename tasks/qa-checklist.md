# Continental Cantina Bar POS — QA & Security Review
**Fecha:** 2026-05-12 | **Estado del código:** post-Supabase Auth migration, post-Round-B, post-T1

---

## PARTE 1 — FINDINGS (Issues Encontrados)

### Severidades: 🔴 Crítico · 🟡 Medio · 🟢 Menor

---

### SEGURIDAD

**S-1 🔴 `.env` contiene credenciales de producción — verificar que NO está en git**
- **Archivo:** `/.env`
- **Problema:** `.env` tiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` reales. Si el repo alguna vez es público, las keys quedan en el historial de git para siempre. El `anon key` en sí no es secreto (diseño de Supabase), pero el URL de proyecto sí identifica el tenant.
- **Fix:** Correr `git ls-files .env` — si aparece, removerlo del tracking (`git rm --cached .env`). Mover contenido a `.env.local` (ya está en `.gitignore` vía `*.local`). Si fue commiteado alguna vez: rotar el `anon key` en Supabase Dashboard.

**S-2 🔴 `finalize_comanda_payment` RPC sin guard de status — doble cobro posible**
- **Archivo:** `supabase/migrations/20260508191907_remote_schema.sql`
- **Problema:** El RPC hace `UPDATE comandas SET status='paid'` sin `WHERE status = 'processing_payment'`. Un retry por timeout o dos tablets confirmando al mismo tiempo insertan dos filas en `payments`, descuentan inventario dos veces, y registran dos `cobrado_at`.
- **Fix:** Agregar `AND status = 'processing_payment'` al UPDATE del RPC. Usar `GET DIAGNOSTICS affected_rows = ROW_COUNT`; si 0, retornar `{ ok: false, error: 'comanda_not_in_processing_payment' }` antes de tocar `payments` o inventario.

**S-3 🔴 RPC `activate_membership` no verifica que la comanda esté abierta**
- **Archivo:** `supabase/migrations/20260511000004_activate_membership_rpc.sql`
- **Problema:** Inserta en `customer_memberships` y en `comanda_items` sin verificar `comandas.status = 'open'`. Una sesión de UI desactualizada puede cobrar una membresía a una comanda ya en `pending_payment` o `paid`.
- **Fix:** Al inicio del RPC: `IF NOT EXISTS (SELECT 1 FROM comandas WHERE id = p_comanda_id AND status = 'open') THEN RETURN jsonb_build_object('ok', false, 'error', 'La comanda no está abierta.'); END IF;`

**S-4 🔴 `addFreeBenefitItemToComanda` en `membership.js` sin guard `assertComandaOpen`**
- **Archivo:** `src/services/membership.js`
- **Problema:** Las tres funciones mutantes de `products.js` ya tienen el guard de Round-B. Esta función que agrega beneficios gratis no lo tiene. Un waiter puede agregar un beneficio a una comanda en `pending_payment`.
- **Fix:** Agregar el mismo patrón de `assertComandaOpen` como primer paso de `addFreeBenefitItemToComanda`.

**S-5 🔴 `present_bill_atomic` RPC confía en el total enviado por el cliente**
- **Archivo:** `src/services/comandaCheckout.js` → `presentBill` → RPC `present_bill_atomic`
- **Problema:** Si dos tablets tienen la misma comanda abierta simultáneamente (sin real-time subscriptions), el Tablet A puede presentar la cuenta con un total que no incluye los items que Tablet B agregó. El RPC usa `p_total` del cliente para setear `final_total`. El cliente sale sub-cobrado.
- **Fix:** En el RPC, calcular `final_total` desde la DB: `SELECT SUM(unit_price * quantity) FROM comanda_items WHERE comanda_id = p_comanda_id AND status = 'active'`, en lugar de usar `p_total`.

**S-6 🟡 `anon` tiene EXECUTE en RPCs de membresía — nunca fue revocado**
- **Archivo:** `supabase/migrations/20260511000004_activate_membership_rpc.sql` (línea 100), `20260511000001_process_membership_rpc.sql`
- **Problema:** El grant es a `anon` pero el Auth migration luego re-granted a `authenticated`. El grant de `anon` nunca fue revocado. En práctica las tablas tienen RLS que bloquearía las escrituras, pero es un permiso innecesario.
- **Fix:** `REVOKE EXECUTE ON FUNCTION public.activate_membership(uuid, uuid, uuid) FROM anon;` y similar para `process_membership_on_payment`.

**S-7 🟡 Cualquier usuario autenticado puede INSERT/UPDATE en `shifts`**
- **Archivo:** `supabase/migrations/20260511000005_supabase_auth_rls.sql` — políticas de shifts
- **Problema:** `shifts_insert` y `shifts_update` son `USING(true)` para cualquier `authenticated`. Un waiter con sesión válida puede abrir un nuevo turno con `starting_cash` arbitrario via REST API.
- **Fix:** Agregar la misma verificación de rol que la migración `20260512000001` para `shifts_insert` y `shifts_update` → `role IN ('admin', 'manager')`.

**S-8 🟡 `create-user` Edge Function: error en `updateUserById` no hace rollback**
- **Archivo:** `supabase/functions/create-user/index.ts`
- **Problema:** El flujo crea auth user con email temporal, luego lo actualiza al email real. Si `updateUserById` falla (red), el auth user queda con email incorrecto y `public.users` no tiene la fila (porque la secuencia falla antes). El `deleteUser` de rollback solo se llama si el INSERT en `public.users` falla, no si `updateUserById` falla.
- **Fix:** Verificar el error de `updateUserById`; si falla, llamar `deleteUser` y retornar 500.

---

### BUGS DE CÓDIGO

**B-1 🔴 [YA CORREGIDO] `handleBackToUnits` y `handleCancelMesa` borraban el catálogo de productos**
- **Archivo:** `src/pages/PosPage.jsx`
- **Problema:** Round-B (fix 4.5) movió la carga del catálogo a un `useEffect([], [])` de sesión, pero `setGroupedProducts({})` seguía en `handleBackToUnits` y `handleCancelMesa`. Resultado: después de la primera mesa, el catálogo quedaba vacío para el resto de la sesión.
- **Status:** ✅ Corregido en esta sesión — los dos `setGroupedProducts({})` fueron eliminados.

**B-2 🔴 `WeeklyReportPage` semana empieza en domingo; el schedule en lunes**
- **Archivo:** `src/pages/WeeklyReportPage.jsx` línea ~11
- **Problema:** `today.getDay()` retorna 0 para domingo, causando que la semana "defecto" empiece ese mismo domingo. El schedule y los cálculos de nómina usan lunes como inicio de semana → reporte desalineado.
- **Fix:** `const diff = today.getDay() === 0 ? -6 : 1 - today.getDay();`

**B-3 🔴 `getReprintData` en `tickets.js` no filtra por `status='active'`**
- **Archivo:** `src/services/tickets.js`
- **Problema:** La query de `comanda_items` en el reprint no tiene `.eq('status', 'active')`. Los items cancelados (soft-deleted) aparecen en el ticket reimpreso. Totales incorrectos.
- **Fix:** Agregar `.eq('status', 'active')` al query de comanda_items en `getReprintData`.

**B-4 🟡 Cart no se recarga después de `handleReopenComanda`**
- **Archivo:** `src/hooks/usePayment.js`
- **Problema:** `handleReopenComanda` llama `onLoadUnits()` pero no `reloadCart(currentComanda.id)`. El `useEffect([currentComanda?.id])` en PosPage no se re-dispara porque el ID no cambió. El cart queda en su estado pre-reopen hasta que el waiter sale y vuelve a entrar a la mesa.
- **Fix:** Llamar `onReloadComanda(currentComanda.id)` dentro de `handleReopenComanda` después de que el status update sea exitoso.

**B-5 🟡 `InventoryPage.loadInventory` traga errores silenciosamente**
- **Archivo:** `src/pages/InventoryPage.jsx`
- **Problema:** `if (!error) { setItems(data || []) }` — si hay error, la página muestra lista vacía sin ningún mensaje explicativo.
- **Fix:** `else { setStatus('Error cargando inventario: ' + error.message) }`

**B-6 🟡 `createCustomer` + `assignCustomerToComanda` en dos pasos — cliente huérfano posible**
- **Archivo:** `src/hooks/useCustomer.js` — `handleCreateAndAssignCustomer`
- **Problema:** Si `createCustomer` tiene éxito pero `assignCustomerToComanda` falla (comanda cancelada por otro dispositivo, red caída), el cliente existe en la DB pero no está asignado. Además el contador de `customer_number` ya avanzó → gap en la numeración.
- **Fix:** Tolerable en el corto plazo (el gap en números es cosmético). Fix ideal: RPC server-side `create_and_assign_customer` atómico.

**B-7 🟡 `membershipWarning` reemplaza el mensaje de confirmación de cobro**
- **Archivo:** `src/hooks/usePayment.js` — `handleConfirmPayment`
- **Problema:** Si hay `membershipWarning` (e.g., config de milestone falta), el warning sobreescribe el mensaje de éxito del cobro. El waiter ve solo el warning y no ve la confirmación de que el cobro fue exitoso.
- **Fix:** Concatenar el warning al mensaje de éxito en lugar de reemplazarlo.

**B-8 🟢 `adjust_inventory_stock` RPC clampea a 0 sin error — log de movimientos incorrecto**
- **Archivo:** `supabase/migrations/20260508200005_phase2_rpcs.sql`
- **Problema:** `GREATEST(current_stock + delta, 0)` no informa al usuario que el stock se ajustó menos de lo pedido. El registro en `inventory_movements` muestra el delta pedido, no el real.
- **Fix:** Retornar error si stock resultante sería negativo (para ajustes manuales de admin). O registrar el delta real.

**B-9 🟢 `inventoryWarning` en `confirmPayment` — código muerto**
- **Archivo:** `src/hooks/usePayment.js` línea ~360; `src/services/comandaCheckout.js` línea ~306
- **Problema:** `confirmPayment` siempre retorna `inventoryWarning: null`. El branch `if (data?.inventoryWarning)` nunca se ejecuta.
- **Fix:** Remover el campo y el branch muerto.

---

### UX / CORRECTNESS

**U-1 🟡 Zona horaria: `getCurrentMonthDate()` usa hora local del browser vs Postgres UTC**
- **Archivo:** `src/services/membership.js`
- **Problema:** El browser computa el mes actual en hora local (Mexico UTC-6). Si el proyecto Supabase está en UTC, entre 00:00 y 05:59 UTC (que es aún día anterior en Mexico), el mes del cliente y el de la DB pueden diferir. Al último día del mes a las 11 PM Mexico, la DB ya está en el mes siguiente.
- **Fix:** Configurar el timezone del proyecto Supabase a `America/Mexico_City` en Dashboard → Project Settings → Database, o pasar el offset explícito al RPC.

**U-2 🟡 Sin indicador visible de "offline" en la cuadrícula de mesas**
- **Archivo:** `src/pages/PosPage.jsx`
- **Problema:** Cuando la red cae, los handlers muestran un mensaje de status breve que desaparece. No hay banner persistente. El mesero sigue viendo mesas normales y no entiende por qué sus acciones no funcionan.
- **Fix:** Mostrar un banner rojo fijo cuando `isOnline === false`.

**U-3 🟢 `doChangeUser` también llama `setGroupedProducts({})` — inofensivo pero redundante**
- **Archivo:** `src/pages/PosPage.jsx`
- **Detalle:** `doChangeUser` navega a `/login` que remonta `PosPage` y el `useEffect` de catálogo corre de nuevo. El clear es redundante pero no causa bug.

---

## PARTE 2 — QA CHECKLIST

### Convenciones:
- ✅ Resultado esperado correcto
- ⚠️ Resultado correcto con advertencia o limitación conocida
- 🐛 Bug conocido — puede fallar

---

### 1. Login / Logout / Sesión

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 1.1 | Login normal con turno abierto | waiter | Seleccionar usuario → PIN correcto → Ingresar | Navega directo a `/pos`. Cuadrícula de mesas visible. ✅ |
| 1.2 | Primer login del día — sin turno | admin/manager | PIN correcto → ver form de efectivo inicial → ingresar monto → Abrir turno | Turno creado. Navega a `/pos`. ✅ |
| 1.3 | Segundo dispositivo — turno ya abierto | cualquiera | PIN correcto | Navega directo a `/pos` sin mostrar form de turno. ✅ |
| 1.4 | PIN incorrecto | waiter | PIN equivocado | "PIN incorrecto". Sin navegación. Campo PIN limpio. ✅ |
| 1.5 | Demasiados intentos fallidos | waiter | 5+ PINs incorrectos en sucesión rápida | "Demasiados intentos fallidos. Intenta en unos minutos." ✅ |
| 1.6 | Usuario desactivado | waiter desactivado | Buscar en lista | El usuario no aparece en la lista (filtro `active=true`). ✅ |
| 1.7 | Cambiar usuario (clearUser) | waiter | TopBar → Cambiar usuario → Confirmar | Navega a `/login`. Turno sigue abierto. ✅ |
| 1.8 | Token de sesión expirado | waiter | Dejar app abierta horas, luego intentar acción | Si auto-refresh de Supabase funcionó → sin interrupción. Si expiró → la llamada falla con error de auth. ⚠️ No hay redirect automático a login. |

---

### 2. Turno

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 2.1 | Cerrar turno — todas las mesas libres | manager/admin | ShiftPanel → revisar resumen → ingresar efectivo contado → confirmar | Turno cerrado. Navega a `/login`. ✅ |
| 2.2 | Cerrar turno — con mesa abierta | manager/admin | ShiftPanel → intentar cerrar con comanda activa | "Hay mesas abiertas. Ciérralas antes de cerrar el turno." Sin cierre. ✅ |
| 2.3 | Dos managers cierran simultáneamente | manager + admin | Ambos confirman el cierre al mismo tiempo | Uno cierra. El otro recibe "El turno ya fue cerrado por otro usuario." ✅ |
| 2.4 | Resumen de turno — números correctos | manager | Abrir ShiftPanel después de varios pagos | Suma de pagos, movimientos de caja y efectivo esperado son correctos. ✅ |

---

### 3. Mesas — Abrir / Cerrar

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 3.1 | Abrir mesa libre sin cliente | waiter | Tap mesa → dialog vacío → Abrir mesa | Comanda creada. Catálogo de productos visible. Carrito vacío. ✅ |
| 3.2 | Abrir mesa con número de cliente válido | waiter | Tap mesa → ingresar número de cliente existente | Comanda creada con cliente y membresía asignados. ✅ |
| 3.3 | Número de cliente no encontrado | waiter | Tap mesa → número inexistente | "Cliente no encontrado." Botón "Continuar sin cliente" aparece. ✅ |
| 3.4 | Abrir mesa ya con comanda activa | waiter | Tap mesa ocupada | Comanda existente cargada directamente. Items del carrito visibles. ✅ |
| 3.5 | Dos tablets abren la misma mesa libre | 2 waiters | Tap simultáneo en la misma mesa libre | Una crea la comanda, la otra re-lee la existente. Ambas trabajan en la misma comanda. ✅ |
| 3.6 | Cancelar mesa vacía | manager | Mesa abierta vacía → cancelar → confirmar x2 | Comanda cancelada. Mesa libre en cuadrícula. ✅ |
| 3.7 | Waiter intenta cancelar mesa con items | waiter | Mesa con productos → cancelar | "No autorizado. Solo manager o admin puede cancelar mesa con productos." ✅ |
| 3.8 | Volver a mesas → catálogo sigue disponible | waiter | Abrir mesa → agregar item → volver → abrir otra mesa | **Catálogo visible en segunda mesa.** (Regresión B-1 corregida.) ✅ |

---

### 4. Productos — Agregar / Quitar

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 4.1 | Agregar producto nuevo al carrito | waiter | Tap producto en catálogo | Producto aparece con qty 1. ✅ |
| 4.2 | Agregar mismo producto de nuevo | waiter | Tap mismo producto | Qty incrementa a 2 (un UPDATE, no nuevo row). ✅ |
| 4.3 | Quitar producto qty 2 → 1 | waiter | Tap "-" en item con qty 2 | Qty baja a 1. DB UPDATE. ✅ |
| 4.4 | Quitar producto qty 1 → 0 (soft-delete) | waiter | Tap "-" en item con qty 1 | Item desaparece del carrito. DB `status='cancelled'` (no DELETE). ✅ |
| 4.5 | Agregar a comanda en `pending_payment` | — | Llamada directa al servicio (prueba técnica) | `assertComandaOpen` retorna error. Item no agregado. ✅ |

---

### 5. Shots y Mixers

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 5.1 | Shot con mixers configurados | waiter | Tap shot → selector aparece → elegir mixers → confirmar | Shot + mixers (unit_price=0) en carrito. Evento loggeado. ✅ |
| 5.2 | Shot sin mixers (`free_mixers_qty=0`) | waiter | Tap shot | Shot agregado directamente sin selector. ✅ |
| 5.3 | Elegir más mixers del permitido | waiter | Intentar seleccionar mixer adicional | Tap ignorado (guard en hook). Servicio también rechaza. ✅ |
| 5.4 | Quitar shot → mixers también se cancelan | waiter | Tap "-" en shot qty 1 | Shot y mixers vinculados → `status='cancelled'`. ✅ |

---

### 6. Ciclo de Cobro

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 6.1 | Presentar cuenta | waiter | Mesa con items → "Presentar cuenta" | Ticket cuenta imprime. Comanda → `pending_payment`. Cuadrícula recarga. ✅ |
| 6.2 | Iniciar cobro | waiter | Mesa en pending → "Iniciar cobro" | Comanda → `processing_payment`. ✅ |
| 6.3 | Confirmar pago en efectivo | waiter | Ingresar efectivo ≥ total → confirmar | RPC `finalize_comanda_payment` ejecuta. Payments row insertado. Inventario deducido. Ticket imprime. ✅ |
| 6.4 | Pago insuficiente | waiter | Ingresar efectivo < total → confirmar | "Faltan $X por cubrir." Sin llamada a API. ✅ |
| 6.5 | Pago mixto (efectivo + tarjeta) | waiter | Parcial efectivo + parcial tarjeta | Ambas cantidades registradas en payments. Ticket correcto. ✅ |
| 6.6 | Propina automática por exceso de efectivo | waiter | Total $200, ingresar $250, sin campo propina | Propina auto = $50. Cambio = $0. ✅ |
| 6.7 | Doble cobro (retry por timeout) | — | Segunda llamada al RPC de cobro (prueba técnica) | **⚠️ Sin S-2 corregido: second call inserta segundo payments row.** 🐛 |
| 6.8 | Reabrir comanda desde `pending_payment` | waiter | Comanda en pending → "Reabrir comanda" | Comanda → `open`. Evento loggeado. ✅ |
| 6.9 | Waiter intenta reabrir desde `processing_payment` | waiter | Comanda en processing → intentar reabrir | "No autorizado." ✅ |
| 6.10 | Manager reabre desde `processing_payment` | manager | Comanda en processing → reabrir | Comanda → `open`. ✅ |
| 6.11 | Carrito tras reabrir (cart stale) | manager | Reabrir → ver carrito | **⚠️ Carrito no se recarga automáticamente (B-4). Los items actuales se muestran hasta que manager salga y vuelva a entrar a la mesa.** 🐛 |
| 6.12 | Guard de transición — estado ya cambió | waiter | Dos tablets, una cambia estado antes de la otra | "La comanda ya no está en el estado esperado. Recarga la página." ✅ |

---

### 7. Tickets / Reimpresión

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 7.1 | Imprimir ticket de cuenta (presentar bill) | waiter | `handlePresentBill` | Ventana de impresión abre. Cierra tras imprimir. ✅ |
| 7.2 | Popup bloqueado por browser | waiter | Browser sin `--kiosk-printing` | Mensaje in-app: "El ticket no pudo imprimirse..." ✅ |
| 7.3 | Reimprimir folio pagado | cualquiera | Dialog reimpresión → folio de comanda pagada | Selector de tipo de ticket aparece. Ticket correcto imprime. ✅ |
| 7.4 | Reimprimir folio cancelado | cualquiera | Dialog → folio de comanda cancelada | "Esta comanda fue cancelada y no tiene ticket." Sin impresión. ✅ |
| 7.5 | Reimprimir folio activo | cualquiera | Dialog → folio de comanda abierta | Ticket de cuenta con items actuales imprime. ✅ |
| 7.6 | Reimprimir — items cancelados aparecen | cualquiera | Comanda que tuvo items removidos → reimprimir | **⚠️ Sin B-3 corregido: items con status='cancelled' aparecen en el ticket.** 🐛 |

---

### 8. Membresías

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 8.1 | Asignar cliente con membresía activa | waiter | Abrir mesa → buscar cliente por número → asignar | Membresía auto-detectada. Badge de membresía visible. Descuento aplicado. ✅ |
| 8.2 | Activar membresía nuevo mes | waiter | "+ Activar membresía" → seleccionar plan → confirmar | RPC atómico: membresía insertada + cargo en carrito. ✅ |
| 8.3 | Activar membresía duplicada (mismo mes) | waiter | Intentar activar segunda membresía mismo mes | "Este cliente ya tiene una membresía activa este mes." ✅ |
| 8.4 | Activar membresía sin comanda abierta (API directo) | — | Llamar RPC con comanda en pending_payment (prueba técnica) | **⚠️ Sin S-3 corregido: RPC no verifica status de comanda. Cargo se agrega a comanda en payment.** 🐛 |
| 8.5 | Agregar beneficio gratis | waiter | "🎁 Producto gratis" → seleccionar producto | Item con unit_price=0 en carrito. ✅ |
| 8.6 | Agregar mismo beneficio gratis dos veces | waiter | Intentar usar benefit product dos veces | "Ya se agregó ese producto gratis en esta visita." ✅ |
| 8.7 | Agregar beneficio a comanda en pending (API directo) | — | Prueba técnica | **⚠️ Sin S-4 corregido: sin guard en `addFreeBenefitItemToComanda`.** 🐛 |
| 8.8 | Cancelar membresía (doble confirm) | waiter | "Cancelar membresía" → esperar 3s → confirmar | status='cancelled'. Cargo removido del carrito. ✅ |

---

### 9. Movimientos de Caja

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 9.1 | Registrar retiro (nómina) | waiter/manager | TopBar → Mov. de caja → categoría → monto → nota → guardar | cash_movements row insertado. "Movimiento registrado." ✅ |
| 9.2 | Registrar ingreso | waiter/manager | Mismo flujo, tipo = ingreso | Row insertado con tipo correcto. ✅ |
| 9.3 | Movimiento offline | waiter | Red caída → intentar guardar | `requireOnline` bloquea. "Sin conexión." ✅ |

---

### 10. Administración de Usuarios

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 10.1 | Crear usuario waiter | admin | `/admin/users` → nombre, rol, PIN → crear | Edge Function crea auth account + public.users row. Lista recarga. ✅ |
| 10.2 | Waiter accede a `/admin/users` | waiter | URL directa en browser | `AuthRoute` redirige a `/pos`. ✅ |
| 10.3 | Manager accede a `/admin/users` | manager | URL directa | `AuthRoute` redirige (solo admin puede gestionar usuarios). ✅ |
| 10.4 | Desactivar usuario | admin | Lista → deactivate → doble confirm | Edge Function banea auth account. `users.active = false`. ✅ |
| 10.5 | Desactivar último admin activo | admin (único) | Intentar desactivarse | "No se puede desactivar al único administrador activo." Guard client-side. ✅ |
| 10.6 | Reactivar usuario | admin | Lista → reactivate | Ban removido. `users.active = true`. ✅ |
| 10.7 | Reset PIN | admin | Lista → reset PIN → nuevo PIN | `auth.admin.updateUserById` actualiza password. PIN nuevo funciona de inmediato. ✅ |
| 10.8 | Usuario desactivado intenta login | — | PIN correcto | No aparece en lista (filtro `active=true`). Acceso bloqueado. ✅ |

---

### 11. Administración — Catálogo

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 11.1 | Crear categoría | admin/manager | `/admin/categories` → nombre → guardar | Categoría creada. ✅ |
| 11.2 | Crear producto | admin/manager | `/admin/products` → nombre, precio, categoría → guardar | Producto creado. **⚠️ El catálogo del POS se carga una vez por sesión — las sesiones activas no verán el nuevo producto hasta recargar la página.** |
| 11.3 | Waiter intenta crear producto via REST API | waiter | POST a `/rest/v1/products` con JWT de waiter | RLS `products_insert` rechaza. `role='waiter'` no está en `('admin','manager')`. ✅ |
| 11.4 | Crear shot con mixers | admin/manager | Crear producto `is_shot=true`, `free_mixers_qty=2` → asignar mixers en `/admin/recipe-mappings` | Selector de mixers aparece en POS al tocar el shot. ✅ |
| 11.5 | Crear receta (product → inventario) | admin | `/admin/recipe-mappings` → vincular product a inventory_item con deduct_amount | En el próximo cobro, `finalize_comanda_payment` descuenta stock. ✅ |

---

### 12. Inventario

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 12.1 | Ver inventario | manager/admin | `/inventory` | Lista de inventory_items con stock actual. ✅ |
| 12.2 | Agregar stock (entrada) | manager/admin | Ítem → cantidad positiva → "Entrada" | `current_stock` aumenta. `inventory_movements` row insertado. ✅ |
| 12.3 | Ajuste que dejaría stock negativo | manager/admin | Ajuste negativo mayor al stock actual | RPC clampea a 0. **⚠️ Sin error al usuario (B-8). El log de movimientos muestra el delta pedido, no el real.** 🐛 |
| 12.4 | Inventario cargado con error de red | manager | Red caída → abrir `/inventory` | **⚠️ Lista vacía sin mensaje de error (B-5).** 🐛 |

---

### 13. Reporte Semanal

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 13.1 | Waiter intenta acceder a `/weekly-report` | waiter | URL directa | `ManagerRoute` redirige a `/pos`. ✅ |
| 13.2 | Ver reporte semana actual | manager/admin | `/weekly-report` → rango por defecto | Totales de ventas, pagos, movimientos de caja. ✅ |
| 13.3 | Inicio de semana incorrecto (domingo) | manager | Ver qué día inicia la semana por defecto | **⚠️ Inicia en domingo. Debería ser lunes para alinearse con el schedule (B-2).** 🐛 |
| 13.4 | Rango personalizado overnight | manager | Sábado noche → domingo madrugada | Pagos registrados a 01:00 AM (02:00 UTC) clasifican como "domingo UTC" aunque en Mexico es sábado noche. ⚠️ Posible desalineación de ~5 horas en zona fronteriza de día. |

---

### 14. Seguridad — Acceso No Autorizado

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 14.1 | Waiter → URL de admin | waiter | `/admin/categories` en browser | `AuthRoute` redirige a `/pos`. ✅ |
| 14.2 | Manager → URL de admin de usuarios | manager | `/admin/users` en browser | `AuthRoute` redirige (solo admin). ✅ |
| 14.3 | Waiter → POST a tabla de products via REST | waiter con JWT | `POST /rest/v1/products` | RLS bloquea: role='waiter'. HTTP 403. ✅ |
| 14.4 | Waiter → UPDATE en `shifts` via REST | waiter con JWT | `PATCH /rest/v1/shifts?id=eq.X` | **⚠️ Sin S-7 corregido: RLS permite (`USING(true)`). Update tiene éxito en la DB.** 🐛 |
| 14.5 | Waiter → UPDATE `comandas.status='paid'` directo | waiter con JWT | REST PATCH | RLS permite. No hay RPC → sin inventory deduction, sin payments row. **🐛 Sub-cobro total.** |
| 14.6 | Waiter → llamar `activate_membership` RPC directo | waiter con JWT | POST a `/rest/v1/rpc/activate_membership` con UUIDs válidos | RPC no verifica rol del caller. Membresía se activa. ⚠️ Requiere conocer UUIDs. |

---

### 15. Offline / Reconexión

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 15.1 | Red caída → tap mesa | waiter | `isOnline=false` → tap cualquier mesa | "Sin conexión." Status visible. Sin llamada API. ✅ |
| 15.2 | Red caída → "Presentar cuenta" | waiter | `requireOnline` guard | "Sin conexión." ✅ |
| 15.3 | Red cae después de "Iniciar cobro" | waiter | Comanda en processing → red cae → intentar confirmar | `requireOnline` bloquea. Comanda queda en processing hasta reconexión. ✅ |
| 15.4 | Sin indicador persistente offline | waiter | Red caída por >30 segundos | **⚠️ Cuadrícula de mesas se ve normal. Waiter no sabe por qué fallan las acciones (U-2).** 🐛 |

---

### 16. Condiciones de Carrera

| # | Escenario | Rol | Pasos | Resultado esperado |
|---|-----------|-----|-------|--------------------|
| 16.1 | Dos tablets agregan items a la misma comanda | 2 waiters | Tablet A y B agregan items simultáneamente | DB tiene todos los items. Cada tablet ve solo sus items (sin real-time). Ninguna pierde datos. ✅ |
| 16.2 | Tablet A presenta cuenta con cart desactualizado | 2 waiters | Tablet B agrega item, Tablet A no recargó y presenta cuenta | **⚠️ Sin S-5 corregido: `final_total` toma el total del cliente (Tablet A). El item de Tablet B no se incluye en el total de la cuenta. Sub-cobro.** 🐛 |
| 16.3 | Dos managers cierran turno simultáneamente | 2 managers | Ambos confirman al mismo tiempo | Guard `.eq('status','open')`: uno cierra, el otro ve "El turno ya fue cerrado." ✅ |
| 16.4 | Doble cobro (timeout + retry) | waiter | Confirma pago, timeout, reintenta | **⚠️ Sin S-2 corregido: segundo RPC call inserta segundo payments row.** 🐛 |

---

## PARTE 3 — RESUMEN PRIORIZADO (Antes de Go-Live)

| # | Finding | Severidad | Esfuerzo | Tipo |
|---|---------|-----------|----------|------|
| S-2 | `finalize_comanda_payment` sin guard de status — doble cobro | 🔴 | Bajo | Migration |
| S-5 | `present_bill_atomic` confía en total del cliente — sub-cobro con 2 tablets | 🔴 | Medio | Migration |
| S-3 | `activate_membership` RPC sin guard de comanda abierta | 🔴 | Bajo | Migration |
| S-4 | `addFreeBenefitItemToComanda` sin `assertComandaOpen` | 🔴 | Trivial | Servicio |
| B-1 | ~~Catálogo se borraba al volver de una mesa~~ | ✅ | — | Corregido |
| B-2 | WeeklyReport semana inicia en domingo, debería ser lunes | 🔴 | Trivial | Página |
| B-3 | `getReprintData` incluye items cancelados en reimpresión | 🟡 | Trivial | Servicio |
| B-4 | Cart no se recarga tras reabrir comanda | 🟡 | Trivial | Hook |
| S-7 | `shifts` INSERT/UPDATE abiertos a cualquier autenticado | 🟡 | Bajo | Migration |
| S-8 | `create-user` Edge Function rollback incompleto | 🟡 | Bajo | Edge Function |
| B-5 | `InventoryPage` trage errores de carga silenciosamente | 🟡 | Trivial | Página |
| S-1 | Verificar que `.env` no esté en git | 🔴 | Trivial | DevOps |
| U-1 | Timezone: browser vs Postgres UTC en membresías | 🟡 | Bajo | Config Supabase |
| U-2 | Sin banner de offline | 🟡 | Bajo | UX |
| S-6 | `anon` EXECUTE grants en RPCs nunca revocados | 🟡 | Trivial | Migration |
| B-7 | membershipWarning reemplaza mensaje de cobro | 🟡 | Trivial | Hook |

---

*Generado automáticamente por revisión de código + auditoría de seguridad — 2026-05-12*
