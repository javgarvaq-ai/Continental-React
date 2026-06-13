# Continental POS — Revisión de oportunidades de mejora (2026-06-12)

Solo evaluación. No se ha tocado código. Findings ordenados por prioridad.

---

## 🔴 ALTO

### A1. Bug de FK ambigua sin arreglar en el Dashboard
**`src/services/dashboard.js:124-126`** (`getTopProductsToday`)
```js
.from('comanda_items')
.select('quantity, products(name)')   // ⚠️ sin hint de FK
```
`comanda_items` tiene **dos** FKs a `products` (`product_id` y `source_shot_product_id`). Es exactamente el mismo caso que ya arreglaste en `reports.js`/`tickets.js`/`membership.js` con `products:products!comanda_items_product_id_fkey`. Aquí quedó sin arreglar → PostgREST devuelve error "more than one relationship found" y el widget **"Top productos hoy" del Dashboard sale vacío**. Es el único caso restante de este patrón (verificado en todo `src/`).

### A2. El Reporte semanal NO usa el corte operacional de 06:00
**`src/services/reports.js:40-41`** (`getWeeklyReportData`)
```js
const startIso = `${startDate}T00:00:00-06:00`
const endIso   = `${endDate}T23:59:59-06:00`
```
Es el único reporte que sigue usando medianoche calendario en vez del corte 06:00. Todo lo demás (Folios `tickets.js:93`, Movimientos `shifts.js:140`, Turnos `shifts.js:175`, Eventos `reports.js:390`, Ventas por producto `reports.js:180`, Dashboard, Analytics) ya migró al corte operacional. Consecuencia: las ventas entre 00:00 y 06:00 se asignan a un día/semana distinto que en el resto del sistema, así que **el reporte financiero no reconcilia con Folios/Turnos/Movimientos**. Es el reporte de dinero, por eso es alto.

---

## 🟡 MEDIO

### M1. `getGlobalBalances` escanea las tablas completas sin filtro
**`src/services/reports.js:89-103`**
Trae **todas** las filas históricas de `payments` y `cash_movements` (sin fecha) cada vez que se abre el Reporte semanal, para calcular "Posición de dinero". Es correcto que el balance sea all-time, pero el patrón crece sin límite: en un bar activo son miles de filas que viajan al cliente y se suman en JS. Mejor: un RPC/aggregate en SQL que devuelva los totales ya sumados.

### M2. Agregaciones de ventas se hacen en el cliente con `.in(...)`
**`src/services/reports.js:179-247` (`getProductSalesForPeriod`), `:249-278` (`getTopCategoriesRevenue`), `:349-369` (`getTopConsumedItems`)**
Patrón: traer todos los IDs de comandas pagadas del rango → traer todos sus `comanda_items` con `.in('comanda_id', [...])` → agrupar en JS. Para rangos largos en un bar con volumen, esto baja mucha data y el array de `.in()` puede ser enorme. Candidato a RPC de agregación en SQL.

### M3. Reportes de negocio que faltan (la data ya existe)
- **Propinas por empleado**: `payments.tip_amount` + `comandas.cobrado_by/opened_by` → `users`. No hay vista. (Bar clásico: repartir propina.)
- **Clientes inactivos / en riesgo**: `customers` no tiene `last_visit`, pero se deriva de `comandas.customer_id` + `cobrado_at`. No hay "no vuelve desde hace N días". (CustomerIntelligence solo tiene top por visitas, nuevos del mes, créditos de botella.)
- **Mermas / varianza de inventario**: `product_recipes` (deducción esperada) vs ajustes manuales en `inventory_movements`. El InventoryDashboard muestra consumo y movimientos, pero no compara esperado vs contado.
- **Cancelaciones/voids por empleado**: `comanda_events` guarda los eventos con `user_id`, pero ComandaEventsPage solo muestra el log crudo, sin agregación (control de pérdidas/loss prevention).
- **Comparativa semana vs semana**: Analytics tiene tendencia de 14 días y día de la semana, pero no comparación período-vs-período anterior.

### M4. Límites inferiores de Analytics en medianoche calendario
**`src/services/reports.js:113, 254, 354`** — usan `daysAgo(n).toISOString()` (medianoche local) como cota inferior. `buildDailyRevenue` re-agrupa por día operacional, así que el impacto es solo en el día del borde (parcial), pero es inconsistente con la convención de 06:00 del resto. Menor pero del mismo tema que A2.

---

## 🟢 BAJO

### B1. `SECURITY DEFINER` en schema `public`
Todas las funciones `SECURITY DEFINER` están en `public`. Para los RPC llamados desde el cliente (`verify_pin`, `finalize_comanda_payment`, `activate_membership`, etc.) está bien porque deben ser invocables. Pero según `.agents/skills/supabase/SKILL.md` conviene: (a) mover funciones de trigger/util que NO se llaman como RPC (`assign_comanda_folio`, `set_updated_at`) a un schema privado, y (b) verificar que **todas** fijen `search_path` (ya se arregló `verify_pin` en su día; vale confirmar el resto — es un advisor común de Supabase). `execute_sql` ya fue eliminado (migración `20260519000001`). RLS: todas las tablas tienen RLS habilitado, incluida `error_log`. Sin tablas nuevas sin política.

### B2. `error_log` sin vista en la app
**`supabase/migrations/20260513000003`** — los crashes del ErrorBoundary se guardan pero solo se ven desde el dashboard de Supabase. Falta una pantalla admin simple para revisarlos.

### B3. Archivos muertos / cleanup
- **`src/pages/SqlAdminPage.jsx`** — vaciado intencionalmente tras QA; ya no está ruteado. Se puede borrar.
- **`src/pages/SetupAdminPage.jsx:73`** — apunta a `tasks/todo.md` para las instrucciones de bootstrap del primer admin; conviene mover esa nota a `README`/docs.

### B4. Placeholders en inglés con UI en español
Inconsistencia de idioma en inputs: `CategoriesAdminPage.jsx:129` "Category name", `CustomersAdminPage.jsx:228,285-287` "Customer name"/"Name"/"Phone"/"Email", `ProductsAdminPage.jsx:341` "Product name", `UsersAdminPage.jsx:227` "User name", `InventoryItemsAdminPage.jsx:109,155,177` "Capacity oz"/"Reason...". El resto de la UI está en español.

### B5. Queries sin `.limit()` (acotadas por fecha, OK por ahora)
**`shifts.js:120` (`getCashMovements`), `shifts.js:150` (`getShifts`)** — sin `.limit()`, pero filtradas por rango de fechas, así que hoy es seguro. Si se permiten rangos muy amplios, considerar un tope. (FolioHistory ya limita a 100, Eventos a 500, movimientos de inventario a 30.)

---

## ✅ Revisado y correcto (sin acción)
- **Protección de rutas** (`App.jsx`): `AuthRoute` = solo admin (todos los reportes financieros), `ManagerRoute` = admin/manager (Inventario), `ProtectedRoute` = sesión + turno (POS). `/setup-admin` es público pero redirige si ya hay usuarios. Consistente.
- **AdminNav + `paddingLeft: 216px`**: uniforme en las 23 páginas admin; POS e Inventory (manager) quedan fuera por diseño.
- **Otros joins de FK ambigua**: `shifts→users` (opener/closer) y `product_allowed_mixers→products` (mixer/shot) ya usan hints explícitos. Solo A1 quedó pendiente.
- **Defaults de fecha "hoy"** en todas las páginas usan `toLocalDateString(new Date())` (local), no `toISOString()` → sin bug UTC.
