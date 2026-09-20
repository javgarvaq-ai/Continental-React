# Auditoría de Panel Admin — Continental POS (2026-09-18)

Revisión exhaustiva de solo lectura del repositorio (~29k líneas entre `src/` y `supabase/migrations/`), enfocada en cálculos de dinero, bugs de pantallas admin, features sugeridos y candidatos a eliminación. Todo lo afirmado aquí se verificó con `grep`/lectura directa sobre el repo; donde no se pudo confirmar contra la base (el sandbox no consulta Supabase) se marca como **"verificar"** con la query sugerida.

---

## 🧮 1. Alertas de Cálculos y Matemáticas

**Lo que está bien:** el núcleo del cobro es sólido. `computePaymentBreakdown` es la única fuente de verdad compartida entre `usePayment` y `comandaCheckout`; el check `|totalPaid − totalDue| > 0.009` absorbe el ruido de coma flotante; `finalize_comanda_payment` es idempotente por `status='processing_payment'` + `ROW_COUNT`; el corte de caja (`getShiftSummary`) suma bien y las propinas en efectivo sí quedan dentro de `expectedCash` hasta que salen por `propinas_entregadas`. La deducción de inventario está centralizada en el RPC y escribe siempre en `inventory_movements`. No se encontró dinero que se pierda en el flujo principal.

Los problemas están en los **reportes**, y dos de ellos son graves:

### 1.1 🔴 "Utilidad neta" del Cierre Mensual resta dos veces las propinas
- `src/config/cashMovements.js:56` — `propinas_entregadas` tiene `movementNature: 'expense'`.
- `src/pages/MonthlyReportPage.jsx:97` — `revenue = total_paid − tip_amount` (ventas **sin** propina). Correcto.
- `src/pages/MonthlyReportPage.jsx:176` — `netUtility = revenue − COGS − totalExpenses`, y `totalExpenses` incluye `propinas_entregadas`.

Resultado: la propina nunca entró como ingreso pero su entrega sí sale como gasto. Con ~$12,700/mes de propinas entregadas (38,306 en 3 meses según la conciliación), la utilidad mensual está **subestimada en ~$12–13k cada mes**. La gráfica anual (`getYearlyMonthSummaries`, `reports.js:642`) y la de "Últimas 4 semanas" (`getWeeklySummary`, `reports.js:593`) arrastran lo mismo en la barra roja de "Gastos operativos".

**Fix:** excluir `propinas_entregadas` del gasto operativo en los tres lugares (o darle `movementNature: 'tip_payout'` y filtrar por naturaleza). Mostrarla aparte como "Propinas entregadas vs cobradas" — eso sí es útil.

### 1.2 🔴 Reporte semanal y mensual usan definiciones distintas de "utilidad" y "margen"
- `WeeklyReportPage.jsx:297` — `netUtility = totalSales − COGS − gastos` donde `totalSales = total_paid` **con propina** (línea 200). Aquí las propinas "se cancelan" (entran en ventas, salen en gastos) — resultado correcto por accidente, pero **"Margen %" (línea 73 del render) se calcula sobre ventas con propina → margen inflado ~10%**.
- `MonthlyReportPage.jsx` — ventas sin propina, gastos con propina → utilidad subestimada.

El mismo mes da dos utilidades distintas según la pantalla. Hay que definir una sola fórmula (`ventas sin propina − COGS − gastos sin propinas entregadas − comisión de tarjeta`) y usarla en las dos. Dashboard y Analytics también muestran `total_paid` con propina como "Ingresos" — no está mal si se etiqueta, pero hoy nada dice "incluye propina".

### 1.3 🔴 Tope de 1000 filas: la gráfica anual se rompe en ~4 semanas
- `reports.js:642` `getYearlyMonthSummaries` trae **todos los pagos del año** sin paginar y sin `.order()`. El ritmo actual es ~780 pagos en 2026 (~7.7/día); cruza los 1000 alrededor del **15 de octubre**. A partir de ahí Supabase corta en silencio y filas *arbitrarias* desaparecen: la gráfica anual y los totales por mes quedarán bajos sin ningún error.
- `reports.js:182` `getProductSalesForPeriod` — el query de `comanda_items` de un mes completo probablemente ya esté cerca del tope (230 comandas × 4–5 líneas). Este alimenta COGS del mensual y "Ventas por producto". **Verificar:** `SELECT count(*) FROM comanda_items ci JOIN comandas c ON c.id=ci.comanda_id WHERE c.status='paid' AND c.cobrado_at >= '2026-08-01T06:00-06:00' AND c.cobrado_at < '2026-09-01T06:00-06:00' AND ci.status='active';` — si da >800, ya está en zona de riesgo.
- `reports.js:677` `getMonthlyReportData`, `reports.js:39` `getWeeklyReportData`, `services/tickets.js:81` `searchComandas` (`limit = 2000` no sirve: el tope del servidor es 1000; el "100 → 2000" del 28-jun fue un no-op arriba de 1000), y el bug ya documentado de `getLedgerData` ordenando por `created_at`.

**Fix:** mover `fetchAllPages` de `services/ledger.js` a un helper común y usarlo en todos los reads de reportes, siempre con `.order('id')`. Para el anual y "ventas por producto" lo correcto es agregar server-side (una función SQL `monthly_summary(year)` y otra `product_sales(start,end)` con `GROUP BY`) — 12 filas en lugar de miles.

### 1.4 🟠 `adjust_payment_tip` deja `total_paid` inconsistente
`20260517000001_adjust_payment_tip.sql` cambia `tip_amount` y `comandas.tip_total`, pero **no toca `payments.total_paid`** ni `efectivo/tarjeta`. Después de editar una propina de $50 a $100 en Folios: `total_paid` sigue incluyendo $50 → "Ventas sin propina" del mes (`total_paid − tip_amount`) baja $50 aunque la venta no cambió. Además el RPC **no escribe `comanda_events`** — no hay rastro de quién cambió qué propina.

**Fix:** en el RPC, `total_paid = total_paid − old_tip + new_tip` (o derivar ventas de `comandas.final_total` en vez de `total_paid − tip`) e insertar un evento `tip_adjusted` con `{old, new, by}`.

### 1.5 🟠 Ruido de coma flotante persistido en la base
Las columnas de dinero son `numeric` **sin escala** (`payments.efectivo/tarjeta/total_paid`, `comandas.final_total`, `shifts.difference`, `cash_movements.amount`). Guardan lo que JS mande, incluido `0.009999999999990905`:
- `hooks/usePayment.js:22` — propina automática = `totalRecibido − totalCuenta` sin redondear (probado: total $293.67 + tarjeta $293.68 → `0.009999999999990905`).
- `services/shifts.js:201` — `difference = cashCounted − expectedCash` sin redondear; `money(-2.27e-13)` imprime **"-$0.00"** (probado con `Intl`), que es lo que se ve como "dif. turno −$0.00" en el Ledger.
- `comandaCheckout.confirmPayment` sí redondea `cambio` pero no `propina` ni `total`.

**Fix (barato, definitivo):** migración `ALTER COLUMN ... TYPE numeric(12,2)` en las columnas de dinero (Postgres redondea al escribir) + un `round2()` en `getPaymentSummary` y `closeShift`. Sin esto, cualquier `SUM()` en SQL o export CSV muestra colas de decimales.

### 1.6 🟡 Descuentos de membresía no reconcilian con "Ventas por producto"
El descuento vive solo en `payments.total_paid` (menor) y en `membership_benefit_usage.discount_amount_saved`; `comanda_items.unit_price` queda a precio de lista. Por eso "Ventas por producto" (suma de `unit_price × qty`) **siempre será mayor** que las ventas del Cierre Mensual por el total de descuentos del periodo, y nadie lo explica en pantalla. Bastaría una línea "Descuentos de membresía: −$X" leída de `membership_benefit_usage` en ambas pantallas para que cuadre.

### 1.7 🟡 Nómina: el cierre puede pagar $0 a quien la pantalla le mostró un monto
`ScheduleAdminPage.jsx:439-441` — el resumen usa `plannedHrs` como respaldo cuando no hay horas reales (`weeklyPay = billableHrs × rate`), pero `handleCloseWeek` (`:376`) inserta `totalPay = actualHrs × rate`. Empleado sin horas confirmadas: la tabla dice "$1,200 (estimado)", el snapshot guarda **$0**. Además las checadas en un día **sin turno programado** nunca entran (`pendingSuggestedCells` itera `shifts`, no `logSummary`): horas trabajadas fuera de horario se pierden de la nómina sin aviso.

### 1.8 🟡 Rangos de fecha inconsistentes
`reports.js:4` `daysAgo()` corta a medianoche local, no a las 06:00 operativas → Analytics ("7/14/30 días") y `getTopCategoriesRevenue` incluyen madrugadas del día anterior que el resto del sistema asigna al día previo. `buildHourlyDistribution` (`:144`) usa `getHours()` del navegador (bien en la PC del bar, mal si se abre desde otro huso).

---

## 🚨 2. Bugs y Problemas en Pantallas Admin

| # | Archivo | Problema | Solución |
|---|---|---|---|
| 2.1 🔴 | `pages/WeeklyReportPage.jsx:352` | Botón **"Cargar" está roto**: `onClick={loadPeriod}` pasa el `MouseEvent` como `overrideStart` (`:250`), `overrideStart \|\| startDate` lo toma como fecha → query con `"[object Object]T06:00:00-06:00"` → "Error pagos: invalid input syntax…". Los botones "Este turno / Hoy / Esta semana" solo cambian estado y dependen de "Cargar" → **el filtro de fechas del Reporte financiero nunca ha funcionado**; solo sirven los 4 botones de semana. | `onClick={() => loadPeriod()}` |
| 2.2 🔴 | `pages/ComandaEventsPage.jsx:35-52` | Filtros "Pagadas" y "Cuentas" buscan `paid`/`presented`, pero los eventos reales se llaman `cobro_confirmed` y `cuenta_clicked` (RPCs). `opened`/`items_added` tampoco existen. Los filtros devuelven vacío y los eventos reales aparecen con clave cruda. | Alinear `EVENT_LABELS`/`EVENT_FILTERS` con: `created, cuenta_clicked, payment_started, cobro_confirmed, reopened_from_*, cancelled, item_decreased, shot_with_mixers_added, ticket_reprinted`. |
| 2.3 🟠 | `hooks/useShift.js:50` | `getOpenComandas()` ignora `error`. Si esa query falla (red), `openComandas` es `undefined` → `hasBlockingTables=false` → **se permite cerrar turno con mesas a medio cobro**, que es exactamente lo que el guard debía impedir. | Si `error`, abortar el cierre con mensaje. |
| 2.4 🟠 | `DashboardPage.jsx`, `AnalyticsPage.jsx:124-136`, `CustomerIntelligencePage.jsx`, `InventoryDashboardPage.jsx` | **Cero manejo de errores**: ningún `error` de los servicios se lee. Con sesión expirada o sin red muestran `$0.00` y listas vacías como si fuera real. | Mostrar el `error` (patrón de `LedgerPage`) y no pisar datos previos con vacíos. |
| 2.5 🟠 | `MonthlyReportPage.jsx:156-158` | `cogsRes.error` y `ledgerRes.error` se ignoran → COGS `$0` y "Utilidad" inflada sin aviso. | Tratar como `detailError`. |
| 2.6 🟠 | `pages/LedgerPage.jsx:199-212` | Export CSV sin comillas: `rowConcept()` mete `$1,602.50` y `formatDateTime()` mete `"18 sep, 14:05"` → **comas dentro de campos rompen columnas** (mismo problema que se documentó al parsear el ledger el 06-sep). Además la fecha no trae año. `ProductSalesReportPage.downloadVentasCsv` tiene el mismo riesgo con nombres de producto con coma. | Helper `csvCell(v) => '"' + String(v).replace(/"/g,'""') + '"'`, fecha ISO. |
| 2.7 🟡 | `MonthlyReportPage.jsx:64` vs `:210` | `YearChart` calcula `isFuture` con `now` ignorando el `year` seleccionado; los tabs sí lo consideran. En enero 2027, viendo 2026, las barras Oct–Dic quedan deshabilitadas/atenuadas. | Usar `year === now.getFullYear() && …` como en los tabs. |
| 2.8 🟡 | `pages/FolioHistoryPage.jsx:265`, `:76` | `searchComandas` y `getComandaItems` ignoran `error` → "sin resultados" cuando en realidad falló. | Mostrar error. |
| 2.9 🟡 | `store/authStore.js:44` | `verifySession` sale temprano si no hay `shiftId` → un admin que entró **sin abrir turno** pierde la sesión con F5 en cualquier pantalla admin (aunque el token de Supabase siga vivo). Está comentado como intencional, pero en la práctica es fricción diaria. | Verificar sesión de Auth aunque no haya turno; el turno solo lo exige `ProtectedRoute`. |
| 2.10 🟡 | `pages/ProductsAdminPage.jsx:47,119,151` | Sigue capturando **`manual_cost`**, que desde el 06-sep es campo muerto (nadie lo lee; el margen sale de `reference_cost` en Costeo). Dos pantallas para "costo" que no se hablan. | Quitar `manual_cost` de Productos (y la columna, cuando se quiera). |
| 2.11 🟡 | `pages/MembershipPlansAdminPage.jsx:127` | `discount_percentage` sin tope (>100 permitido; `Math.max(…,0)` lo tapa en silencio). Con dos beneficios `discount` en un plan, `computeMembershipDiscount` toma el primero sin avisar. `deleteBenefit` borra duro y cambia el descuento de membresías **ya activas** este mes. | Validar 1–100, un solo `discount` por plan, y soft-delete de beneficios. |
| 2.12 🟡 | `CategoriesAdminPage`, `UnitsAdminPage` | Archivar es irreversible desde la UI (solo se listan activos, no hay "reactivar"). Archivar una categoría con productos los manda a "Sin categoría" en el POS sin aviso. Archivar una mesa con comanda abierta no se valida. | Listar inactivos con toggle; validar antes de archivar. |
| 2.13 ⚪ | `UsersAdminPage`, `ProductsAdminPage`, `CategoriesAdminPage`, `RecipeMappingAdminPage`, `InventoryItemsAdminPage` | Mensajes mezclados inglés/español ("PIN must be exactly 6 digits", "Product created successfully", "Access denied. Admin only."). | Unificar en español. |

### Seguridad y rutas (lo que sí protege y lo que no)

Las rutas (`AuthRoute`/`ManagerRoute`) están bien: esperan `isVerifying`, leen `role` de `public.users` (no de metadata), y las Edge Functions de usuarios re-verifican el rol con `service_role`. La protección real está en RLS, y ahí hay tres huecos:

**2.14 🔴 RPCs `SECURITY DEFINER` sin chequeo de rol y (muy probablemente) ejecutables por `anon`.** `adjust_payment_tip`, `adjust_inventory_stock`, `deduct_inventory_item`, `finalize_comanda_payment` y `present_bill_atomic` viven en `public`, bypassean RLS y solo tienen `GRANT … TO authenticated` **sin `REVOKE FROM anon, public`** (las de 2026-07 y 2026-09 sí hacen el revoke; las viejas no). En Supabase los `DEFAULT PRIVILEGES` dan `EXECUTE` a `anon` en toda función nueva de `public`, y el comentario de `20260512000003:113` ("RLS blocks any real damage") es falso para `SECURITY DEFINER`. Si se confirma, **cualquiera con la anon key del bundle (pública) puede cambiar propinas o stock sin iniciar sesión**. Verificar: `SELECT proname, proacl FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef;` — si `proacl` es NULL o contiene `anon=X`, está expuesto. Fix: `REVOKE ALL … FROM public, anon` en todas, y en las administrativas (`adjust_payment_tip`, `adjust_inventory_stock`) validar `(SELECT role FROM users WHERE id = auth.uid()) IN ('admin','manager')` adentro.

**2.15 🟠 Los RPCs reciben `p_user_id` del cliente en lugar de `auth.uid()`.** `finalize_comanda_payment`, `present_bill_atomic`, `adjust_inventory_stock` aceptan quién "hizo" la acción como parámetro → la atribución del audit trail es falsificable por cualquier sesión. Fix: ignorar el parámetro y usar `auth.uid()`; validar además que `p_shift_id` esté `open` (hoy un tablet con turno viejo en `localStorage` cobra contra un turno cerrado y el corte del turno nuevo no lo ve).

**2.16 🟠 `comandas` y `comanda_items` son 100% editables por cualquier `authenticated`** (`20260511000005:117-146`, `USING (true)`): un mesero vía REST puede poner `status='paid'` sin pago, o cambiar `unit_price`/`quantity` de una comanda **ya cobrada** (reescribe el historial de ventas). Los guards de transición son solo del lado del cliente. Fix mínimo: policy de UPDATE en `comanda_items` restringida a `EXISTS (SELECT 1 FROM comandas c WHERE c.id = comanda_id AND c.status = 'open')`, y un trigger en `comandas` que rechace `status → 'paid'` fuera del RPC (o `WITH CHECK (status <> 'paid')` en la policy de UPDATE, ya que el RPC es DEFINER y no pasa por ella).

**2.17 🟡 Fuerza bruta de PIN.** `users` es legible por `anon` (incluye `email` y `role`) y el password es un PIN de 6 dígitos, con la app pública en internet. Supabase limita intentos por IP, pero 1M de combinaciones con IPs rotadas es alcanzable. Mitigación barata: activar CAPTCHA/attack protection en Auth, o exponer solo `id, name` al login mediante una vista y mover `email` a un RPC.

---

## 💡 3. Features Sugeridos

Ordenados por valor para la operación real, no por vistosidad:

1. **Anular / reembolsar un folio pagado (no existe).** Hoy `cancelComanda` solo cancela `open`; un cobro equivocado no tiene salida más que SQL a mano (ya pasó: `correccion_pago_efectivo_tarjeta_2026-08-04.sql`). Un RPC `void_payment(comanda_id, reason)` que revierta inventario, escriba un `cash_movement` de devolución y deje evento — admin-only. Es el hueco operativo más grande.
2. **Una sola fórmula de utilidad, con comisión de tarjeta.** Ya existe `cardCommission()` exacto por terminal; hoy solo aparece como leyenda del Ledger. Restarla en la utilidad mensual/semanal da el número real que hoy se calcula a mano en cada conciliación.
3. **Días de cobertura en inventario** (backlog 4+5+6): `stock ÷ consumo diario 28d`, reemplaza el semáforo que hoy pinta igual media botella que veinte (`InventoryDashboardPage.jsx:11-23`). Sin migración.
4. **Alertas en el Dashboard, no métricas nuevas:** ventas con tarjeta sin terminal (`cardSalesUnknownTerminal` ya existe), comandas abiertas >3h con >$X (`isAtRisk` ya existe pero solo colorea), checadas abiertas >16h (`isStaleOpenLog` ya existe), turno abierto >14h. Todo ya está calculado; solo falta juntarlo en un bloque "Atención hoy".
5. **Horas pico por día de semana** (heatmap 7×24 sobre `payments.created_at` con corte operativo). Analytics tiene hora y día por separado; el cruce es lo que sirve para asignar personal, y encaja directo con Horarios.
6. **Conciliación Getnet asistida** (la que se aplazó, en versión mínima): lista de depósitos esperados = ventas `getnet` × 0.9783 agrupadas por día, con checkbox "llegó". Una tabla `reconciliations(date, terminal, expected, received, note)` y ya. Es lo que hoy se hace con PDF y coordenadas.
7. **Filtro "sin terminal" en Folios + corrección inline** de `card_terminal` (reusa `set_payment_card_terminal`). Hoy el aviso sale en el POS pero no hay dónde arreglarlo.
8. **Audit de ajustes**: eventos para `tip_adjusted`, `card_terminal_set`, `inventory_adjusted` y `time_log_edited` visibles en Eventos (hoy `edited_by` de checadas no se muestra en ningún lado).
9. **UX admin:** vista de nómina lista para imprimir/PDF por semana; recordar el último rango de fechas por pantalla; "Mensual" abriendo en el mes anterior si se está en los primeros 5 días del mes; reactivar categorías/mesas/insumos archivados.

---

## 🗑️ 4. Candidatos a Eliminación

**Código muerto (borrar sin riesgo — verificado con grep real que nadie lo importa):**
- `src/services/dashboard_clean.js` — copia casi idéntica de `dashboard.js`, cero importadores.
- `src/pages/SqlAdminPage.jsx` — archivo vaciado, cero importadores.
- `src/utils/cost.js` (`computeProductCost`) — solo se menciona en un comentario; el modelo viejo de costeo ya no se usa.
- `getGlobalBalances` en `services/reports.js:100` — cero importadores desde que se quitó "Posición de dinero".
- `_to_delete/` (4 archivos) y `_plan_*_tmp.md`.
- En BD: `products.manual_cost`, `comanda_items.unit_cost_at_sale` (se sigue escribiendo en cada cobro y nadie lo lee — el bloque 3b de `finalize_comanda_payment` es trabajo muerto en el camino crítico; quitarlo sí toca el RPC, así que solo cuando se decida tocarlo), `users.failed_pin_attempts`/`locked_until` (de `verify_pin`, ya dropeado).
- `nomina_resguardo` en `MonthlyReportPage.EXPENSE_GROUPS` y `WeeklyReportPage.CATEGORY_LABELS` — categoría que no existe en `cashMovements.js`.
- `/setup-admin` + `SetupAdminPage` + `checkUsersExist`: solo muestra instrucciones que ya están en un comentario; ruta pública sin función.

**Duplicación que hay que consolidar (no borrar, unificar):**
- `toLocalDateString` en 7 páginas, `formatDateTime` en 5, `CATEGORY_LABELS` en 3, `MetricCard` en 4, y `WeeklyReportPage` reimplementa `opWeekSunday/addDaysStr` que ya existen en `reports.js`. Un `utils/dates.js` + `components/MetricCard.jsx` + `config/cashMovements.js` exportando las etiquetas elimina ~300 líneas y la posibilidad de que dos pantallas corten la semana distinto.
- Cuatro pantallas calculan "ingresos" cada una a su manera (Dashboard, Analytics, Semanal, Mensual). Un `utils/finance.js` con `summarizePayments(payments)` → `{ventas, propinas, efectivo, tarjeta, transferencia}` y `summarizeMovements(movs)` → `{gastos, propinasEntregadas, transferencias}` mata los bugs 1.1 y 1.2 de raíz.

**Funcionalidad que aporta poco y suma ruido:**
- **Analytics vs Reporte financiero vs Mensual**: tres pantallas de "cuánto vendí" con tres definiciones. Dejar **Mensual** como la pantalla financiera (ya es la más completa y verificada al peso) y reducir "Reporte financiero" a lo que solo él tiene (rango libre + gastos por categoría), o fusionarlo.
- **Velocidad de ventas "esta hora vs hora anterior"** en Dashboard: con 8 pagos/día es ruido estadístico casi siempre.
- **Semáforo de inventario por % de botella** — sustituir por cobertura (punto 3 de features), no coexistir.
- **Doble captura de costo** (`manual_cost` en Productos + `reference_cost` en Costeo): dejar solo Costeo.
- La línea fija "Comida del día $-" en `Ticket.jsx:74` si ya no aplica la promo (es un renglón hardcodeado en todos los tickets).

---

## Prioridad si solo se hacen cinco cosas

1. **1.3** — paginación/agregación de reportes (se rompe en semanas, ~15-oct).
2. **2.14** — revoke a `anon` + role check en RPCs (verificar primero con la query de `pg_proc`).
3. **1.1 + 1.2** — una sola fórmula de utilidad sin doble conteo de propinas.
4. **2.1** — botón "Cargar" del Reporte financiero.
5. **2.3** — cierre de turno con error de `getOpenComandas` ignorado.

No se modificó ningún archivo de código durante esta auditoría.
