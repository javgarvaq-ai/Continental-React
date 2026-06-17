## Fix — Nombre de mesa en reportes — 2026-06-17

### Objetivo
Mostrar el nombre ingresado al abrir una mesa en todos los reportes, cuando no hay cliente asignado.

### Análisis
- Al crear la comanda, `customer_name` ya guarda el nombre escrito al abrir la mesa (sea cliente o texto libre).
- Los reportes usan `customers?.name` via join por `customer_id` — si no hay cliente, ese join da null y no se muestra nada, aunque `customer_name` sí tenga el dato.
- **Sin migración, sin cambios de lógica/flujo.** Solo exponer el campo ya existente en los selects y ajustar el display.

### Cambios (solo lectura / display)
- [ ] `services/tickets.js` → `searchComandas`: agregar `customer_name` al select.
- [ ] `services/dashboard.js` → `getOpenTables` y `getRecentPayments`: agregar `customer_name` al select de comandas.
- [ ] `pages/FolioHistoryPage.jsx`: mostrar `customers?.name || customer_name` (en lugar de solo `customers?.name`).
- [ ] `pages/DashboardPage.jsx`: mismo cambio en las dos cards (mesas abiertas y últimos cobros).

### Garantías
- Sin migración, sin cambio de esquema.
- Sin alterar lógica de cobro, apertura, asignación de clientes ni ningún otro flujo.
- Si hay cliente → muestra nombre del cliente (mismo comportamiento actual). Si no → muestra el nombre de mesa escrito al abrir.

### Verificación
- [ ] `@babel/parser` en los 4 archivos editados — sintaxis OK.
- [ ] Smoke visual (Javi): FolioHistory muestra nombre de mesa en folios sin cliente; Dashboard lo mismo.

### Mensaje de commit sugerido
`fix(reports): mostrar nombre de mesa cuando no hay cliente asignado`

---

## Plan — Fase 1: Reporte de margen por producto — 2026-06-16 (HECHA, falta probar con datos reales)

> ### Resultado Fase 1 ✅
> - `services/reports.js`: `getProductSalesForPeriod` ahora calcula costo por línea (snapshot `unit_cost_at_sale` ?? costo en vivo) y hace **roll-up** del costo de mixers/cervezas al padre vía `source_shot_product_id`. Devuelve `cost/margin/marginPct/costMissing`. Test de roll-up en node ✓ (Trago=licor+mixers, Cubeta=suma de cervezas).
> - `pages/ProductSalesReportPage.jsx`: columnas Costo, Margen, Margen% + footer Utilidad bruta + CSV + group-by. "≈/sin costo" cuando falta costo de un componente.
> - Verificado: transform OK, eslint sin issues nuevos (iguales a HEAD), solo 2 archivos tocados. NO toca BD ni cobro.
> - Falta: Javi carga productos/insumos/recetas de ejemplo, cobra en mesa TEST, abre "Ventas por producto" y valida vs `verificacion_costeo`.
>


### Objetivo
En la pantalla "Ventas por producto" agregar **Costo, Margen $ y Margen %** por producto, más utilidad bruta total en el footer (cubre de paso la Fase 2 agregada).

### Fuente de costo (consistente con el snapshot)
Por cada línea de venta: costo unitario = `comanda_items.unit_cost_at_sale` (snapshot congelado) **?? costo en vivo** (`utils/cost.js → computeProductCost`, solo si `complete`). Si ninguno → línea "sin costo".

### Cambios (2 archivos, solo lectura/UI — sin BD, sin tocar el cobro)
1. **`services/reports.js → getProductSalesForPeriod`** (único consumidor = la página, seguro extender):
   - Agregar `unit_cost_at_sale` al select de `comanda_items`.
   - Traer insumos para fallback en vivo: `products(id, manual_cost)` + `product_recipes(active)` + `inventory_items(id, unit_cost)` → mapa `costoVivoPorProductId` usando `computeProductCost`.
   - Por línea NO-gratis: `costo_linea = cantidad × (unit_cost_at_sale ?? costoVivo.complete ? costoVivo.cost : null)`. Acumular `cost` por producto; marcar `costComplete=false` si alguna línea quedó sin costo.
   - Devolver por producto: + `cost`, `margin = revenue − cost`, `marginPct`, `costComplete`.
2. **`pages/ProductSalesReportPage.jsx`**:
   - Columnas nuevas: Costo, Margen ($), Margen (%). Indicador "sin costo" cuando `costComplete=false`.
   - Footer: Costo total, **Utilidad bruta** y %.
   - Group-by-categoría suma costo/margen igual. CSV incluye las columnas nuevas.

### Decisiones / caveats (a confirmar)
- **Roll-up de componentes (CORREGIDO 2026-06-16):** las líneas `is_free_mixer` NO se excluyen del costo — su costo se SUMA al producto padre vía `source_shot_product_id` (trago = licor + mixers; cubeta = suma de cervezas). Revenue/unidades siguen igual que hoy (el padre lleva el precio). `is_free_benefit` (cortesías de membresía) sí se excluye del costo por ahora (no tiene padre; es regalo) — caveat.
- **Combos misma categoría** (beer packs): el override de unidades es solo para mostrar; el costo se calcula por la línea del producto. A validar con un combo en pruebas.
- Sin propina en ningún cálculo (margen es sobre la venta, no la propina).

### Verificación
- Test en node de la lógica de agregación de costo/margen (snapshot vs fallback, sin costo).
- esbuild/eslint de los 2 archivos (sin issues nuevos).
- Cuadre manual: margen = revenue − costo; spot-check contra `verificacion_costeo` en un periodo con ventas reales.

### Commit sugerido
`feat(reports): margen por producto (costo vs ventas) — Fase 1`

---

## Plan — Costeo de productos y margen real (COGS snapshot) — 2026-06-15 (Entrega 1 HECHA · Entrega 2 APROBADA → ejecutar 2026-06-16 con bar cerrado)

> ### ESTADO — Entrega 2 ESCRITA 2026-06-16 (aplicar + probar)
> Archivos listos: `supabase/migrations/20260616000001_cogs_snapshot_on_payment.sql` (columna + RPC), `tasks/rollback_cogs_snapshot_2026-06-16.sql` (manual, fuera de migrations), `tasks/verificacion_costeo_2026-06-16.sql`. Confirmado: RPC vigente es SECURITY DEFINER → bypassa RLS, snapshot escribe sin cambios de políticas. Falta: Javi corre `db push`, prueba en mesa TEST con las queries, limpia.
>
> ### ESTADO — cierre 2026-06-15 (retomar aquí mañana)
> - ✅ **Entrega 1 HECHA y migración aplicada en prod** (`db push` corrido por Javi). Probada en preview: flujo normal (login/POS/cobro/corte) sin romper + captura de costos (unit_cost / manual_cost, NULL = "sin costo") OK. Datos de prueba borrados con `tasks/limpieza_pruebas_2026-06-15.sql`.
> - 🔜 **Entrega 2 (snapshot de costo en el RPC de cobro): REVISADA y APROBADA. Ejecutar MAÑANA 2026-06-16 con el bar cerrado** (toca el camino del cobro).
>   - **Sin cambio de RLS** (confirmado): `comanda_items_update TO authenticated USING(true) WITH CHECK(true)` ya existe; el RPC sigue SECURITY INVOKER.
>   - Diseño: columna `comanda_items.unit_cost_at_sale numeric(12,4)` (nullable) + costeo dentro del loop de items que YA existe en `finalize_comanda_payment`, envuelto en `BEGIN .. EXCEPTION WHEN OTHERS THEN NULL` → **NO-FATAL, nunca rompe el cobro**. Precedencia: receta (todos los insumos con `unit_cost`) → `manual_cost` → NULL. **Cero cambios de frontend.** Incluir **migración de rollback** del RPC.
>   - Guarda costo de UNA unidad; el reporte hará `cantidad × unit_cost_at_sale`.
>   - Probar en **mesa TEST** (no hay staging; parche acordado). Verificar: receta=suma, manual=manual_cost, insumo sin costo=NULL, cobro pasa en todos, y que cambiar un costo DESPUÉS no altera el snapshot. Limpiar con el script.
> - **Nota inventario:** Javi puede cargar inventario real hoy; la Fase 2 NO lo afecta (solo lee costos y agrega columna a comanda_items). Las ventas de HOY quedarán con snapshot NULL (esperado; reporte usa costo en vivo de fallback). De mañana en adelante se congela.
> - Después de Entrega 2 → reportes: Fase 1 margen por producto, Fase 2 agregado ventas vs costo, Fase 3 por ticket.


### Objetivo
Capturar el costo de cada producto y compararlo contra las ventas para ver el margen real ($ y %) por producto, por periodo y por ticket. El costo se **congela al momento de la venta** (snapshot): cambiar un costo solo afecta ventas nuevas, no las pasadas.

### Decisiones (Javi, 2026-06-15)
- **Fuente de costo:** manual. Capturado por Javi en las pantallas admin.
- **Nivel (híbrido):** costo por **insumo** (`inventory_items.unit_cost`) como motor vía recetas (actualizas la botella → todos sus shots se recostean) + costo manual por **producto** (`products.manual_cost`) como fallback para productos SIN receta.
- **Exactitud histórica:** **snapshot al vender** (COGS congelado por línea). Si la venta se hizo sin costo cargado, se guarda NULL y el reporte usa costo actual como estimación (fallback en vivo) hasta congelarla.
- **Entregables:** 3 reportes, por fases (por producto → total ventas vs costo → por ticket).

### Modelo de datos (1 migración a mano, 3 columnas)
- `inventory_items.unit_cost numeric(12,4)` NULL — costo por unidad del insumo (por oz / por unit). NULL = "no capturado" (distinto de 0 real).
- `products.manual_cost numeric(12,2)` NULL — costo directo para productos sin receta.
- `comanda_items.unit_cost_at_sale numeric(12,4)` NULL — **snapshot**: costo de UNA unidad del producto al momento de la venta. Reporte: costo de línea = `quantity × unit_cost_at_sale`.

### Lógica de costo (regla de precedencia)
`computeProductCost(product, recetasActivas, insumosPorId)`:
1. ¿Tiene recetas activas y TODOS sus insumos tienen `unit_cost`? → costo = Σ(`deduct_amount × insumo.unit_cost`), `complete=true`.
2. ¿Sin receta pero con `manual_cost`? → costo = `manual_cost`, `complete=true`.
3. ¿Receta con algún insumo sin costo, o nada capturado? → `complete=false` (se trata como "sin costo" → snapshot NULL).
Va en `utils/cost.js` (función pura, testeable sin BD, patrón de `utils/payments.js`).

### Cambio en el RPC de cobro `finalize_comanda_payment` (la pieza delicada)
- Ese RPC YA recorre `comanda_items` y sus `product_recipes` para descontar inventario. **Enganchar ahí**: por cada item, acumular el costo de la receta (`deduct_amount × inventory_items.unit_cost`); si no hay receta, usar `products.manual_cost`.
- Si el costo queda **completo** → `UPDATE comanda_items SET unit_cost_at_sale = <costo unitario>`. Si **incompleto** (algún insumo sin costo) → dejar NULL.
- Garantía: NO cambia nada de lo que se cobra (efectivo/tarjeta/total/propina). Solo agrega un dato de costo. El cobro funciona idéntico aunque no haya costos cargados.

### Captura de costos (UI admin)
- `pages/InventoryItemsAdminPage.jsx` + `services/inventoryAdmin.js`: campo `unit_cost`. Helper opcional: capturar "precio de botella" y derivar costo/oz (precio ÷ `capacity_oz`).
- `pages/ProductsAdminPage.jsx` + `services/productsAdmin.js`: campo `manual_cost` (visible/relevante para productos sin receta).

### Reportes (por fases)
- **Fase 1 — Margen por producto** (`ProductSalesReportPage` + `services/reports.js`): extender `getProductSalesForPeriod` para conservar `productId` y traer `unit_cost_at_sale`. Costo de línea = `qty × (unit_cost_at_sale ?? costoEnVivo(product))`. Por producto: precio, costo, margen $ y %, unidades, revenue, costo total, utilidad total. Marcar "sin costo" donde aplique.
- **Fase 2 — Total ventas vs costo:** sumar lo de Fase 1 → ventas (sin propina) − COGS = utilidad bruta + %.
- **Fase 3 — Por ticket:** margen por folio cruzando sus `comanda_items` (usa snapshot).

### Casos especiales contemplados
- **Mixers/benefits gratis:** `unit_price=0` (revenue 0) pero costo real → margen negativo visible, no oculto.
- **Override de unidades de mixer para display** (`reports.js:213-243`): el costo debe usar unidades REALMENTE consumidas, no las ajustadas para display. Manejar explícito.
- **Líneas sin costo (snapshot NULL):** fallback a costo en vivo; opción futura de "congelar" con un backfill.
- **Descuentos:** se usa el `unit_price` real cobrado (ya está en `comanda_items`).

### Workflow Supabase (según CLAUDE.md)
- ANTES de tocar nada de Supabase: leer `.agents/skills/supabase/SKILL.md` y `.agents/skills/supabase-postgres-best-practices/SKILL.md`.
- Migración escrita a mano en `supabase/migrations/AAAAMMDDHHMMSS_add_cost_tracking.sql`. **Javi** corre `npx supabase db push` en su terminal (yo NO en el sandbox).
- RLS: agregar columnas no cambia políticas. Verificar que las políticas de UPDATE de `inventory_items`/`products` permitan al admin; `comanda_items.unit_cost_at_sale` se escribe dentro del RPC (SECURITY DEFINER) → ok.

### Orden de ejecución
- **Fase 0 (cimientos):** migración (3 columnas) + `utils/cost.js` + captura UI (insumos + productos) + modificar RPC para snapshot. Resultado: ya puedes cargar costos y cada venta nueva guarda su costo.
- **Fase 1:** reporte margen por producto.
- **Fase 2:** agregado ventas vs costo.
- **Fase 3:** por ticket.
(Una fase a la vez, con su verificación, y check-in antes de la siguiente.)

### Verificación (antes de marcar cada fase)
- `utils/cost.js`: pruebas en node con casos (receta completa, receta con insumo sin costo, sin receta con manual_cost, nada) → assert costos y `complete`.
- Migración: parsea SQL; revisar que las columnas son NULL y no rompen inserts existentes.
- RPC: smoke en staging — una venta con costos cargados escribe `unit_cost_at_sale`; una sin costo deja NULL; el cobro (efectivo/tarjeta/total/propina) es idéntico antes vs después.
- Reportes: cuadrar utilidad = ventas − COGS; revisar caso de producto gratis (margen negativo).

### Mensajes de commit sugeridos (por fase)
- F0: `feat(costing): unit_cost/manual_cost + snapshot COGS en cobro + captura admin`
- F1: `feat(reports): margen por producto`
- F2: `feat(reports): utilidad bruta ventas vs costo`
- F3: `feat(reports): margen por ticket`

---

### Estrategia de pruebas en prod (sin staging) — parche acordado (2026-06-15)
Contexto: una sola DB (prod); preview de Vercel apunta a prod. Aceptable AHORA porque **el inventario aún no está cargado** → las ventas de prueba no descuentan stock real. Son <10 escenarios y se borran.

**Cómo aislar lo de prueba (etiquetado):**
- Crear una **mesa de prueba** dedicada (ej. "TEST"). Toda comanda de prueba se abre ahí → `comandas.unit_id = <TEST>`. (comandas NO tiene shift_id; se filtran por mesa.)
- Hacer todas las pruebas dentro de un **turno conocido** (anotar su `shift_id`). `payments` y `cash_movements` se filtran por ese turno.
- Si se crean productos/insumos desechables, nombrarlos con prefijo `TEST_` para borrarlos por nombre.

**Script de limpieza (SELECT primero, luego DELETE; lo entrego probado).** Orden por FKs:
1. `ids = SELECT id FROM comandas WHERE unit_id = <TEST>`
2. `DELETE FROM comanda_items WHERE comanda_id IN (ids)`  (sin cascade)
3. `DELETE FROM comandas WHERE id IN (ids)`  → cascada borra `payments` y `comanda_events`; `inventory_movements.comanda_item_id` queda SET NULL
4. `DELETE FROM cash_movements WHERE shift_id = <TEST_SHIFT>`
5. `DELETE FROM shifts WHERE id = <TEST_SHIFT>`
6. (Opcional) limpiar `inventory_movements` huérfanos de la prueba y productos/insumos `TEST_`.
Javi corre el script en el SQL Editor de Supabase (no en el sandbox).

**Riesgo que SIGUE en pie (sin staging):** la migración y el cambio del RPC van directo a prod. Mitigaciones:
- Columnas **nullable y aditivas** → no rompen inserts/lecturas existentes.
- Costo en el RPC **no-fatal**: si el cálculo del costo falla o falta dato, guarda NULL y NUNCA aborta el cobro (el dinero real nunca se bloquea por el costeo). Distinto del descuento de inventario, que sí es fatal a propósito.
- Probar inmediato con las ventas etiquetadas; tener lista una migración de rollback del RPC a su versión previa.


### Resultado Entrega 1 (2026-06-15) ✅ — listo, falta que Javi aplique la migración
- [x] Migración `supabase/migrations/20260615000001_add_product_costing.sql`: `inventory_items.unit_cost` + `products.manual_cost` (nullable, aditivas). **Javi corre `npx supabase db push`.**
- [x] `utils/cost.js`: `computeProductCost` (híbrido, defensivo). 6 casos probados en node ✓.
- [x] `services/inventoryAdmin.js` + `InventoryItemsAdminPage.jsx`: captura/edición/display de `unit_cost`.
- [x] `services/productsAdmin.js` + `ProductsAdminPage.jsx`: captura/edición/display de `manual_cost`.
- [x] Verificación: transform esbuild OK (5 archivos); eslint sin issues NUEVOS (los 2-3 errores por página son preexistentes: navigate sin usar, loadProducts/useEffect — ya estaban en HEAD); cobro NO tocado.
- [ ] Pendiente Entrega 2: snapshot de costo en el RPC `finalize_comanda_payment` + pruebas en mesa TEST.
- NOTA: los campos de costo en la UI solo funcionan DESPUÉS de aplicar la migración (las columnas deben existir).


---

## Plan — Calculadora de denominaciones en apertura de turno + conexión con corte — 2026-06-14 (PENDIENTE DE APROBACIÓN)

### Objetivo
Agregar la misma calculadora de denominaciones (`CashCounter`) en la pantalla de fondo inicial (`LoginPage`, fase `new_shift`), y "conectarla" con la del corte/cierre: el conteo hecho al abrir viaja al turno y la calculadora del corte carga esa misma info como referencia.

### Decisiones (Javi, 2026-06-14)
- **Fondo inicial:** el total contado **autorrellena** el campo "Efectivo inicial de caja" (solo informativo, editable). Nada se guarda en BD hasta dar clic en "Abrir turno".
- **Conexión:** la calculadora del corte/cierre **carga la misma información** del conteo de apertura. Es solo una calculadora de referencia (no cambia la matemática del cierre, que sigue usando el campo "efectivo contado" tecleado).

### Restricción técnica (clave)
`CashCounter` persiste en `localStorage` con llave `cash-counter-${shiftId}` (`CashCounter.jsx:19`). En apertura **aún no existe `shiftId`**. Solución: usar llave temporal `cash-counter-opening` en apertura y **migrarla** a `cash-counter-${newShift.id}` al crear el turno. Así el corte (que lee `cash-counter-${shiftId}`) carga el mismo conteo.

### Implementación (2-3 archivos, solo UI/cliente — sin esquema, sin RLS, sin BD)

**1. `components/CashCounter.jsx` — generalizar (sin romper el uso actual)**
- [ ] Aceptar prop opcional `storageId` (fallback a `shiftId` para compatibilidad). La llave pasa a `cash-counter-${storageId ?? shiftId}`.
- [ ] Aceptar prop opcional `onTotalChange(total)` y llamarla cuando cambie el total (vía `useEffect` sobre `total`).
- [ ] Sin cambios para el caller actual (ShiftPanel sigue pasando `shiftId`): comportamiento idéntico.

**2. `pages/LoginPage.jsx` — fase `new_shift`**
- [ ] Botón "🧮 Contar efectivo" que abre la calculadora (modal overlay con el mismo estilo del corte, o sección expandible — a confirmar abajo).
- [ ] Montar `<CashCounter storageId="opening" onTotalChange={...} />`.
- [ ] Autollenado con flag de override manual (patrón `propinaManual` ya usado en `usePayment`): mientras el usuario no edite a mano, `startingCash` = total contado. Si teclea manualmente (`handleCashChange`), `startingCashManual = true` y deja de sobrescribirse. (Evita pisar un monto escrito a mano.)
- [ ] En `handleShiftSubmit`, tras `createShift` exitoso y antes de navegar: copiar `localStorage['cash-counter-opening']` → `localStorage['cash-counter-${newShift.id}']` y borrar la llave `opening`.
- [ ] Ajustar el texto guía ("Cuenta el efectivo… e ingresa el total antes de abrir").

**3. (Posible) `components/ShiftPanel.jsx`**
- [ ] Ninguno esperado: ya pasa `shiftId` a `CashCounter` (`ShiftPanel.jsx:220`) y leerá la llave migrada automáticamente. Verificar nada más.

### A confirmar contigo antes de codear
- **Formato de la calculadora en apertura:** ¿modal overlay (igual look del corte) o sección que se expande dentro de la tarjeta de login? (Yo recomiendo modal overlay para que se sienta "el mismo modal" que pediste.)

### Alcance / garantías
- **Puramente cliente/UI.** No toca `createShift`, `finalize_comanda_payment`, RLS ni esquema. El `starting_cash` que se guarda sigue siendo el número del campo al dar "Abrir turno".
- La calculadora es un **asistente de conteo**; no altera `expectedCash` ni `difference`.
- Backward-compatible: el uso actual de `CashCounter` en el corte no cambia.

### Verificación (antes de marcar done)
- [ ] Build/lint sin errores (`npm run build` / eslint en sandbox — solo compila, no toca BD).
- [ ] Prueba manual del flujo (Javi en tablet): contar en apertura → ver autollenado del fondo → editar a mano (no se pisa) → abrir turno → abrir corte → la calculadora del corte muestra el mismo conteo.
- [ ] Confirmar que `cash-counter-opening` se borra tras migrar (no queda basura para el siguiente turno).
- [ ] Caso borde: abrir turno SIN usar la calculadora (teclear fondo directo) sigue funcionando igual.

### Mensaje de commit sugerido (al terminar)
`feat(shift): calculadora de denominaciones en apertura + conexión con corte`

### Resultado / Review (2026-06-14) ✅ — aprobado (modal overlay)
- [x] `components/CashCounter.jsx`: props `storageId` (prioridad sobre `shiftId`) y `onTotalChange(total)` vía `useEffect([total])`. Backward-compatible: el corte sigue pasando `shiftId` y funciona igual.
- [x] `pages/LoginPage.jsx`: import de `CashCounter` + const `OPENING_COUNT_ID='opening'`; estado `startingCashManual` y `counterOpen`; `handleCashChange` marca manual; `handleCounterTotal` autollena el fondo solo si no es manual; migración `cash-counter-opening` → `cash-counter-${newShift.id}` (y borrado del temporal) tras `createShift` exitoso; botón "🧮 Contar efectivo" + **modal overlay** (mismo look del corte) con `<CashCounter storageId="opening" onTotalChange={handleCounterTotal} />`.
- [x] Sin cambios en `ShiftPanel.jsx`: ya pasa `shiftId`, lee la llave migrada automáticamente.
- [x] **Verificación:** eslint sin errores (solo 1 warning preexistente ajeno al cambio); transform esbuild de ambos archivos OK. `vite build` no corre en el sandbox (binario nativo rolldown) — no es problema de código.
- [ ] Pendiente smoke en tablet (Javi): contar en apertura → autollenado → editar a mano no se pisa → abrir turno → corte carga el mismo conteo → llave `opening` borrada.

---

## Plan — Línea fija "Comida del día" en tickets — 2026-06-13 (pendiente de aprobación)

### Objetivo
En TODOS los tickets, agregar después de la lista de productos una línea que parezca un producto: nombre **"Comida del día"** y a la derecha **"$-"** (como si fuera su precio). Siempre, sin condición.

### Decisiones (Javi)
- Formato: nombre + `$-` a la derecha (sin cantidad ni "x"). El `$-` es "su precio".
- Alcance: **ambos** tickets — TICKET DE CONSUMO (cliente) y PAGADO (interno) — y reimpresiones.

### Implementación (1 archivo)
- [ ] `components/Ticket.jsx` → en `buildTicketHtml`, tras el `forEach` que arma `itemsHtml`, **append** un bloque `.item` estático:
  ```
  <div class="item">
    <div class="item-name">Comida del día</div>
    <div class="item-line"><span></span><span>$-</span></div>
  </div>
  ```
- Va dentro de `itemsHtml` (antes de `totalsHtml`), así aplica a `cuenta` y `pagado` por igual, y a reimpresiones (todo pasa por `buildTicketHtml`).

### Alcance / garantías
- **Puramente visual.** El `$-` no es número → NO afecta subtotal, total, propina ni lo cobrado. No toca cálculos ni datos.
- Sin esquema/RLS. Un solo archivo.

### Verificación
- [ ] Generar el HTML del ticket en node (cuenta y pagado) y assert: la línea "Comida del día" aparece exactamente 1 vez en cada tipo, y el total no cambia vs sin la línea.
- [ ] Smoke visual (Javi): imprimir/preview de cuenta y pagado.

### Resultado / Review (2026-06-13) ✅
- [x] `components/Ticket.jsx`: append de un bloque `.item` ("Comida del día" + `$-`) a `itemsHtml`, tras el `forEach` de productos. Nada más cambió (CSS, totales, pago, pie, impresión byte-idénticos).
- [x] `$-` es literal (no `${}`) → no afecta cálculos. Aplica a cuenta, pagado y reimpresiones (todo pasa por `buildTicketHtml`).
- [x] Sintaxis validada con `@babel/parser` (mount de bash quedó stale otra vez; archivo real correcto vía Read).
- [ ] Pendiente smoke visual de Javi (imprimir cuenta + pagado).

---

## Plan — Calculadora de conteo de efectivo (modal de turno) — 2026-06-14 (pendiente de aprobación)

### Objetivo
Tablita tipo Excel dentro del modal de turno (`ShiftPanel`) para contar efectivo: por cada denominación anotas cuántos billetes/monedas hay y te da subtotal por fila + total. Pura ayuda visual.

### Decisiones (Javi)
- **Una sola tabla editable** por turno (no apertura/cierre separados).
- **Solo localStorage**, asociada al turno (sin BD, sin migración). "Como una tablita de Excel."
- **Sin auto-llenar** el campo de cierre — es solo referencia para contar, no se integra con el cierre.

### Implementación
- [ ] `components/CashCounter.jsx` (nuevo): recibe `shiftId`. Filas de denominaciones MX (billetes 1000/500/200/100/50/20, monedas 10/5/2/1/0.50), input de cantidad por fila, subtotal por fila y **total** abajo. Estado en `localStorage` key `cash-counter-<shiftId>` (carga al montar, guarda en cada cambio). Botón "Limpiar".
- [ ] `components/ShiftPanel.jsx`: botón "🧮 Contar efectivo" en el step `review` (junto a "+ Movimiento de caja"); nuevo step `count` que muestra `<CashCounter shiftId={shiftId}/>` + "← Volver". Nueva prop `shiftId`.
- [ ] `pages/PosPage.jsx`: pasar `shiftId={currentShiftId}` a `<ShiftPanel>` (ya existe `currentShiftId`).

### Persistencia (clave del pedido)
- Key por `shiftId`: en la mañana la llenas → persiste; en la noche reabres y siguen los valores; al abrir un turno nuevo (otro id) arranca vacía.
- Nota: si se limpia el caché del navegador se pierde (aceptado — es solo ayuda). Atado a la tablet.
- (Opcional) limpiar la key al cerrar el turno; si no, queda huérfana e inofensiva (id único).

### Alcance / no-objetivos
- **Solo UI + localStorage.** No toca BD/RLS, ni el cierre, ni cobro, ni movimientos. No auto-llena "Efectivo contado".

### Edge cases
- Sin `shiftId` (raro, el modal se abre con turno abierto): usar fallback no persistente o deshabilitar guardado.
- Inputs: enteros ≥ 0; vacío = 0.

### Verificación
- [ ] Lint.
- [ ] Smoke (Javi): llenar → cerrar modal → reabrir = valores siguen; total correcto; recargar página = siguen; turno nuevo = vacía.

### Resultado / Review (2026-06-14) ✅
- [x] `components/CashCounter.jsx` (nuevo): denominaciones MX, cantidad por fila, subtotal, total; persiste en `localStorage` key `cash-counter-<shiftId>`; botón "Limpiar".
- [x] `components/ShiftPanel.jsx`: botón "🧮 Contar efectivo" en step `review`, nuevo step `count` con `<CashCounter shiftId={shiftId}/>` + "← Volver", título maneja el step, recibe prop `shiftId`.
- [x] `pages/PosPage.jsx`: `shiftId={currentShiftId}` pasado a `<ShiftPanel>` (línea 547).
- [x] Sintaxis: CashCounter y ShiftPanel parsean OK con `@babel/parser`. PosPage = cambio trivial de 1 prop (parse por bash da falso "Unterminated JSX" por mount stale).
- Solo UI + localStorage. No toca BD/RLS, cierre, cobro ni movimientos. Sin auto-llenar.

---

## Fix — Ledger no mostraba movimientos recientes — 2026-06-14 ✅
**Bug (Javi):** el Ledger no agarraba nada después del ~10-11 jun; esos movimientos sí salían en Movimientos de Caja.
**Causa:** `getLedgerData` traía toda la historia ordenada **ascendente**; Supabase corta respuestas grandes por tope de filas → descartaba lo más **reciente**. (Movimientos sí los mostraba porque ordena descendente dentro de un rango.)
**Fix:** `services/ledger.js` → las 3 consultas (payments, cash_movements, shifts) ahora `order(..., { ascending: false })`. `sortEvents` reordena cronológicamente, el saldo corrido no cambia. Solo lectura, sin esquema. (Detalle/lección en `lessons.md`.)
**Verificar (Javi):** recargar `/admin/ledger` → deben aparecer los movimientos del 12-14 jun y el banco/cajón reflejar los gastos recientes.

---

## Cierre de día — 2026-06-13 ✅

Sesión tras 3 días de operación real. Todo lo de hoy es **solo lectura/UI, sin cambios de esquema ni RLS**.

Entregado:
1. **Scripts de verificación de conteo** → `tasks/verificacion_conteo_2026-06-13.sql` (12 bloques SELECT para reconciliar el POS contra los reportes del admin; corte operacional 06:00). NO es migración, no se pushea — se corre a mano en el SQL Editor.
2. **Diagnóstico Analytics vs Reporte** ($19,804 vs $18,014 = propinas): Analytics suma `total_paid` (incluye propina); Reporte suma `final_total` (sin propina). Es de definición, no de conteo. Decidido: "ventas sin propina" en todo (pendiente de implementar — backlog).
3. **Vista Ledger** (`/admin/ledger`, admin-only): feed cronológico folios + movimientos con saldo corrido por ubicación (cajón anclado por turno; banco/caja fuerte acumulados). Archivos: `utils/ledger.js`, `services/ledger.js`, `pages/LedgerPage.jsx`, ruta en `App.jsx`, botón en `AdminNav.jsx`.
4. **Banco neto estimado** (comisión MP): línea bajo el saldo de Banco = bruto − (tarjeta × 3.5% × 1.16). Solo display.
5. **POS — navegación de categorías**: barra sticky con scroll-spy + scroll-to-top al agregar (con fix para combos `is_shot` vía efecto, por el scroll anchoring).

Backlog / pendiente:
- Implementar "ventas sin propina" en Analytics/Dashboard/horas/día-semana (decidido, no hecho).
- Smoke test en tablet de: Ledger (cuadre banco/caja fuerte vs Reporte; cajón vs cierre), barra de categorías, scroll-to-top normales y combos.
- `STICKY_BAR_OFFSET=64` — ajustar si la barra hace wrap y tapa el header.

Lecciones capturadas en `lessons.md`: ShotMixerSelector inline + scroll anchoring · comisiones MP Point/Tap ≠ Checkout · sandbox bash mount stale (verificar con @babel/parser) · convención starting_cash del Ledger.

---

## Plan — Navegación de categorías + subir al agregar (POS) — 2026-06-13 (pendiente de aprobación)

### Contexto (verificado en código)
- `components/ProductCatalog.jsx`: render de categorías (orden alfabético) con header + grid de botones de producto. Componente sin hooks hoy.
- `pages/PosPage.jsx`: rejilla 2 columnas `1.3fr 1fr` (catálogo | comanda). **No hay contenedor con scroll propio: scrollea la ventana** (carrito sube/baja con la página).
- `handleAddProduct` (hook) es el handler de agregar. Shots abren modal de mixers (`shotSelectorState.open`).

### Decisiones (Javi, 2026-06-13)
- Barra de categorías **sticky** (pegada arriba al hacer scroll) con **resaltado de la categoría actual**.
- Al agregar un producto: **subir al inicio siempre**.

### Pasos
- [ ] `components/ProductCatalog.jsx`:
    - Importar `useRef` (+ `useEffect` si se hace scroll-spy).
    - Mapa de refs por categoría (`sectionRefs`) en cada `<div>` de sección.
    - **Barra sticky** arriba de la lista: `position: sticky; top: 0; z-index`, fondo sólido (cubre productos al pasar), `flex-wrap`. Un botón por categoría (mismo orden alfabético, color de `getCategoryColor`). Click → `sectionRefs[cat].scrollIntoView({ behavior:'smooth', block:'start' })`.
    - `scrollMarginTop` en cada header de categoría = alto de la barra, para que no quede tapado por la barra al saltar.
    - **Resaltado de categoría activa**: `IntersectionObserver` ligero que marca cuál sección está visible y resalta su botón. (Si añade demasiada complejidad al implementar, lo dejo como mejora aparte — la navegación funciona sin esto.)
    - La barra y la navegación quedan **siempre activas**, aunque la comanda no esté `open` (los botones de producto sí siguen deshabilitados como hoy).
- [ ] `pages/PosPage.jsx`:
    - Envolver el `onAddProduct` que recibe `ProductCatalog`: nuevo handler que llama `handleAddProduct(product)` y luego `window.scrollTo({ top: 0, behavior: 'smooth' })`. Mantiene `ProductCatalog` sin acoplarse a `window`.

### Alcance / no-objetivos
- **Solo UI/navegación.** No toca lógica de carrito, cobro, ni datos. Sin esquema/RLS.
- No cambio el scroll de ventana a contenedor propio (fuera de alcance; sería más invasivo).

### Edge cases a cuidar
- Barra sticky tapando el header al saltar → `scrollMarginTop`.
- Shots: el tap abre modal; el scroll-to-top igual ocurre (inofensivo, el modal es overlay fijo).
- Muchas categorías → la barra hace wrap (revisar en ancho de tablet).
- Comanda no `open`: navegación de categorías funciona; agregar sigue deshabilitado (no dispara scroll).

### Verificación
- [ ] Lint de los 2 archivos (sin issues nuevos vs patrón existente).
- [ ] Smoke test manual (Javi en la tablet/navegador): saltar a categorías, confirmar que el header no queda tapado, y que al agregar desde el fondo sube al inicio.

### Resultado / Review (2026-06-13) ✅
- [x] `components/ProductCatalog.jsx` reescrito: `useRef`/`useState`/`useEffect`; barra **sticky** (`top:0`, `flex-wrap`) con botón por categoría (color + resaltado activo); `IntersectionObserver` para scroll-spy; `sectionRefs` + `scrollIntoView` al hacer click; `scrollMarginTop = 64px` en cada sección para que la barra no tape el header. Botones de producto sin cambios (mismo `disabled`).
- [x] `pages/PosPage.jsx`: `onAddProduct` ahora envuelve `handleAddProduct` + `window.scrollTo({top:0,behavior:'smooth'})`. 3 líneas, sin tocar el hook.
- [x] **Sintaxis validada con `@babel/parser`** (JSX/ESM): ProductCatalog.jsx OK. Edit de PosPage es un handler inline trivial, confirmado por lectura.
- ⚠️ **Entorno:** igual que antes, el mount de bash tiene copias stale → `eslint` por consola da "Unterminated JSX" falso. Archivos reales completos y válidos.
- [ ] **Pendiente smoke test (Javi):** (1) la barra se queda pegada al hacer scroll; (2) al picar una categoría salta y el título no queda tapado; (3) `STICKY_BAR_OFFSET=64` se ve bien — si la barra hace wrap a 2 líneas y tapa el header, subir ese valor; (4) al agregar desde el fondo, sube al inicio.

### Fix scroll-to-top en combos (2026-06-13) ✅ (corregido 2x)
**Bug:** al picar un combo del fondo no subía al inicio.
**Causa raíz real:** `ShotMixerSelector` NO es modal — es una sección **inline arriba del catálogo** (PosPage línea ~949, antes del grid). Al tocar un combo, el selector aparece arriba y hay que subir para elegir mixers. El `window.scrollTo` en el tap no funcionaba porque al insertarse la sección arriba, el **scroll anchoring** del navegador lo contrarresta.
**Fix definitivo (`PosPage.jsx`, solo UI):**
- [x] Wrapper de `onAddProduct`: scroll-to-top en el tap **solo para productos normales** (`!product.is_shot`) — ahí no se inserta nada arriba, funciona directo.
- [x] **`useEffect` que observa `shotSelectorState.open`**: cuando se abre el selector, hace `window.scrollTo(top)` **después del render** (post-commit), así no pelea con el scroll anchoring y sube de forma confiable hasta el selector.
- [x] Revertido el scroll en `onConfirm` (innecesario: tras confirmar ya estás arriba).
- [x] Sintaxis validada con `@babel/parser`.

---

## Plan — Banco neto estimado (comisión Mercado Pago) — 2026-06-13 (pendiente de aprobación)

### Objetivo
En la tarjeta de **Banco** del Ledger, mostrar debajo del saldo bruto una línea más chica con el **dinero real estimado** después de descontar la comisión de la terminal sobre los cobros con tarjeta.

### Fórmula (decidida y verificada en fuente oficial MP)
`banco_real = saldoBanco − (ventasTarjetaAcumuladas × RATE × (1 + IVA))`
- Mercado Pago **Point / Tap** (cobro presencial directo): **3.5% + 16% IVA, SIN cargo fijo**. (El cargo fijo de $4/transacción es solo de Link de pago y Checkout — confirmado con Javi y página oficial.)
- Tasa efectiva ≈ **4.06%**.
- **Solo aplica a tarjeta** (`payments.tarjeta`). Transferencias (SPEI) y depósitos de efectivo al banco entran completos.
- Sobre el **acumulado** de ventas con tarjeta que forma el saldo, no solo el rango visible.
- El % depende del plazo de disposición en MP (al instante 3.5% / 14 días ~3.2%). Se deja como constante editable.

### Pasos
- [ ] `src/utils/ledger.js` → constantes `CARD_COMMISSION_RATE = 0.035`, `CARD_COMMISSION_IVA = 0.16`; trackear `cardSalesCumulative` en `computeRunningBalances` (sumar `payment.tarjeta`) y exponerlo en cada fila + en `closing`/`opening`. Helper `estimateBankNet(bankBalance, cardSalesCumulative)`.
- [ ] `src/pages/LedgerPage.jsx` → en la `BalanceCard` de Banco, línea secundaria "Real estimado (− comisión MP): $X" usando `closing.bankBalance` y `closing.cardSalesCumulative`.
- [ ] Test puro: verificar que `estimateBankNet` descuenta correctamente y que solo afecta tarjeta (no transferencia).

### Alcance
- **Solo display.** No cambia el saldo principal del banco ni ninguna lógica de cobro/movimientos. Sin esquema/RLS.
- Es un **estimado**; la comisión exacta la define el estado de cuenta de MP.

### Resultado / Review (2026-06-13) ✅
- [x] `src/utils/ledger.js` → constantes `CARD_COMMISSION_RATE = 0.035`, `CARD_COMMISSION_IVA = 0.16`; helper `estimateBankNet(bank, cardSales)`; `computeRunningBalances` acumula `cardSalesCumulative` (suma `payment.tarjeta`); `sliceWithOpening` expone `cardSalesCumulative` en opening/closing.
- [x] `src/pages/LedgerPage.jsx` → `BalanceCard` acepta prop `sub`; tarjeta de Banco muestra "Real estimado (− comisión MP): $X" cuando hay ventas con tarjeta.
- [x] **Test:** 7/7 OK (tasa, IVA, `estimateBankNet` descuenta 4.06%, solo tarjeta — transferencia NO se descuenta, banco real = bruto − tarjeta×4.06%). Core invariantes del ledger siguen 15/15.
- ⚠️ **Nota de entorno:** el mount de bash quedó con copias truncadas/stale de los 2 archivos editados (problema de sync del sandbox), por lo que `eslint` por bash reporta errores de parseo FALSOS. Los archivos reales (vistos por la herramienta de archivo) están completos y válidos; la lógica se verificó con una copia byte-idéntica. **Javi: confirma el build/run en tu máquina** (lo estás probando ya).

---

## Plan — Vista Ledger multi-ubicación (pendiente de aprobación) — 2026-06-13

### Objetivo
Pantalla admin "Ledger": vista cronológica unificada de **folios cobrados + movimientos de caja**, con **saldo corrido por ubicación** (cajón / caja fuerte / banco). Responde de un vistazo "¿cuánto dinero hay y cómo fue quedando?". Filtrable por ubicación → al filtrar "cajón" se convierte en el cuadre de caja de la noche.

### Principio rector
**Reusar EXACTAMENTE el modelo de saldos que ya existe en `WeeklyReportPage.calcGlobal`** para que los saldos del ledger cuadren al peso con la sección "Posición de dinero" que ya tienes. No inventar un modelo nuevo. Signos por ubicación:
- **drawer (cajón)**: `+ payments.efectivo`, `+ movs destino=drawer`, `− movs origen=drawer`
- **house_safe (caja fuerte)**: `+ movs destino=house_safe`, `− movs origen=house_safe`
- **bank (banco)**: `+ payments.tarjeta + payments.transferencia`, `+ movs destino=bank`, `− movs origen=bank` (incluye gastos de banco)

### Modelo de eventos
Cada evento se normaliza a un delta por ubicación `{ drawerΔ, houseΔ, bankΔ }`:
- **Folio cobrado (payment)**: `drawerΔ = +efectivo`, `bankΔ = +(tarjeta+transferencia)`. Un folio puede tocar dos ubicaciones (parte en cash, parte en tarjeta) → en el feed es UNA línea que sube dos saldos.
- **Movimiento (cash_movement)**: aplica `source_location`/`destination_location` de `config/cashMovements.js`. Una transferencia (ej. `resguardo_casa`) es UNA línea: `drawerΔ=−monto`, `houseΔ=+monto`. Los gastos (`expense`) y `propinas_entregadas` salen de su ubicación hacia un sumidero (no tienen saldo propio).

### Saldo inicial (opening balance) — clave para que el saldo corrido sea REAL
Para que el "saldo corrido" sea absoluto y no relativo al rango:
- v1: traer todos los eventos **hasta el fin del rango**, computar saldos cronológicamente, **mostrar solo las filas dentro del rango**, y el "saldo inicial" mostrado = saldo de cada ubicación justo antes de la primera fila del rango. Exacto y sin queries extra.
- Nota de performance (NO implementar ahora): hoy hay pocos datos; a futuro, si crece, optimizar con una query server-side de saldo inicial o snapshot. Mantener simple por ahora (CLAUDE.md: simplicity first).

### DECISIÓN RESUELTA — fondo inicial (2026-06-13)
**Hallazgo (código):** `services/auth.js → createShift` solo inserta `starting_cash` en `shifts`; **NO** genera ningún `cash_movement` por el fondo. El fondo vive solo en el turno.
**Implicación:** `calcGlobal` (Posición de dinero) NO incluye `starting_cash` → su saldo de **cajón está subestimado por el monto del fondo**. (Bug menor preexistente del reporte viejo; NO lo arreglamos en este alcance, solo se documenta.)
**Decisión:** el ledger **ancla el saldo del cajón por turno**: cada turno abre el cajón en su `starting_cash`, el saldo corre con los eventos de ESE turno, y al cierre se ve esperado vs contado (`expected_cash` / `cash_counted` / `difference`, que ya existen). **Banco y caja fuerte corren acumulados** entre turnos (no se resetean).
**Pendiente menor (confirmar al ver datos reales, no bloqueante):** cómo se traspasa el cajón entre turnos (¿el fondo/efectivo se deja, se retira, o se deposita al cerrar?). Afecta solo la continuidad visual cajón entre segmentos de turno, no la correctitud dentro de cada turno.

### Pasos (archivos)
- [ ] `src/utils/ledger.js` (nuevo) — funciones **puras** (testeables, sin side effects):
    - `buildLedgerEvents(payments, cashMovements)` → eventos `{ ts, kind, label, folio?, category?, drawerDelta, houseDelta, bankDelta, note, user }` ordenados por `ts`.
    - `computeRunningBalances(events)` → agrega saldos corridos por ubicación.
    - `sliceWithOpening(events, startIso, endIso)` → `{ opening:{drawer,house,bank}, rows, closing:{...} }`.
    - Replicar signos de `calcGlobal` con cuidado (idealmente, en un paso posterior, refactorizar `calcGlobal` para que ambos compartan estas funciones y no diverjan).
- [ ] `src/services/ledger.js` (nuevo) — `getLedgerData({ startDate, endDate })`: trae `payments` (created_at, efectivo, tarjeta, transferencia, tip_amount, comanda_id, comandas(folio)) y `cash_movements` (campos completos + users(name)) **hasta endDate**, con corte operacional 06:00-06:00 (igual que el resto de servicios).
- [ ] `src/pages/LedgerPage.jsx` (nuevo) — patrón de `WeeklyReportPage`/`CashMovementsAdminPage`: `AdminNav`, presets de rango (Este turno / Hoy / Esta semana / custom), 3 tarjetas de saldo arriba (inicial → final por ubicación), filtro por ubicación, tabla cronológica (fecha, descripción/folio, ±cajón, ±caja fuerte, ±banco, saldo corrido, usuario/nota), export CSV. Reusar `money()`, estilos `sectionCard`.
- [ ] `src/App.jsx` → ruta `/admin/ledger` con `AuthRoute` (**admin-only**, confirmado: `AuthRoute` redirige a `/pos` si `role !== 'admin'`).
- [ ] `src/components/AdminNav.jsx` → botón "📒 Ledger" en sección Vistas (junto a Reporte/Movimientos). El menú admin solo lo ven admins.

**Requisito de acceso (Javi, 2026-06-13):** vista NUEVA de reporte, **solo admin** — NO va dentro de Movimientos. Movimientos (`CashMovementPanel` en POS) lo usan también managers; por eso el ledger va aparte con `AuthRoute`, no `ManagerRoute`. Reevaluar dar acceso a manager más adelante si se decide.

### Verificación (no marcar done sin probar)
- [ ] **Invariante 1 (banco + caja fuerte)**: saldo final del ledger (all-time) para `house_safe` y `bank` == `calcGlobal` (houseBalance / bankBalance). Idéntico. (El **cajón** NO debe cuadrar con calcGlobal: diferirá por el fondo — eso es lo esperado, ver decisión resuelta.)
- [ ] **Invariante 2 (cajón, lo importante)**: para cada turno, saldo final del cajón del ledger == `expected_cash` de ese turno (`getShiftSummary`). Este es el cuadre real.
- [ ] Test unitario de `utils/ledger.js` con datos sintéticos: pago mixto (efectivo+tarjeta), transfer cajón→caja fuerte, `propinas_entregadas`, `aportacion_socio`. Verificar deltas y saldos corridos.
- [ ] Cuadrar contra los 3 días reales y comparar saldos vs "Posición de dinero" del Reporte.

### Alcance
- **Sin cambios de esquema ni RLS.** Toda la data ya existe (`payments`, `cash_movements`, `config/cashMovements.js`).
- Solo lectura. No toca el flujo de cobro ni el de movimientos.

### Resultado / Review (2026-06-13) ✅
Implementado. Archivos:
- [x] `src/utils/ledger.js` (nuevo) — puro: `buildLedgerEvents`, `sortEvents`, `computeRunningBalances` (cajón anclado por turno: resetea a `starting_cash` en cada `shift_open`; house/bank acumulan), `sliceWithOpening`, `buildLedger`.
- [x] `src/services/ledger.js` (nuevo) — `getLedgerData`: trae payments + cash_movements + shifts **sin cota inferior** (toda la historia hasta `endIso`, corte operacional 06:00) para que el saldo inicial y el seeding del cajón sean exactos. **Nota:** `payments.paid_by_user` NO tiene FK a `users` → no se hace ese join (habría dado "no relationship"); las filas de folio no muestran usuario.
- [x] `src/pages/LedgerPage.jsx` (nuevo) — presets (Este turno / Hoy / Semana), 3 tarjetas de saldo (inicial→final), filtro por ubicación, tabla con saldo corrido, export CSV, marcadores de apertura/cierre de turno.
- [x] `src/App.jsx` — ruta `/admin/ledger` con `AuthRoute` (admin-only).
- [x] `src/components/AdminNav.jsx` — botón "📒 Ledger" (entre Movimientos y Turnos).

**Verificación:**
- [x] Test puro (`/tmp/ledger.test.mjs`, no versionado): 15/15 OK. Escenario: turno fondo $2000, folio mixto (efectivo+tarjeta), `resguardo_casa`, `aportacion_socio`, `propinas_entregadas`.
- [x] **Invariante 2 (cajón == expected_cash):** cierre cajón = $1650 = `starting_cash + efectivo + depósitos − retiros`. ✓
- [x] **Invariante 1 (house/bank == calcGlobal):** house $1000 y banco $300 idénticos a la fórmula de `calcGlobal`. ✓ (El cajón difiere de `calcGlobal` por el fondo, como se documentó — el ledger es el correcto.)
- [x] Slice a media historia: saldos iniciales correctos (cajón $2500, banco $300). ✓
- [x] Lint: el único error (`set-state-in-effect` en `useEffect(()=>{load()},[load])`) es **preexistente e idéntico** al de `CashMovementsAdminPage`/`ProductSalesReportPage`; se mantiene el patrón por consistencia. No introduce categorías nuevas de issues. Build no se corre en sandbox (falla por binding nativo de rolldown, no relacionado).

**Pendiente de validación con datos reales (Javi):** abrir `/admin/ledger`, rango de los 3 días, y confirmar que banco + caja fuerte cuadran con "Posición de dinero" del Reporte, y que el cajón de cada turno cuadra con su cierre.

---

## Session June 12th — Operational day cutoff ✅

- [x] `src/services/dashboard.js` → `startOfToday()`: corte ahora a las 06:00 local (-06:00) en vez de 00:00. Antes de las 6am, "hoy" sigue siendo la fecha de ayer. Afecta `getTodayPaymentStats`, `getTopProductsToday`, `getMembershipStatsToday` — ya no se pierden ventas nocturnas de un turno que cruza medianoche.
- [x] `src/services/reports.js` → nueva `operationalDateKey(timestamp)`: agrupa por "día operativo" (corte 06:00 local) en vez de día calendario UTC. `buildDailyRevenue` ahora usa esta función tanto para generar los buckets como para clasificar cada pago — corrige el bug de timezone (UTC vs -06:00) y evita que un turno nocturno se divida entre dos días en Analytics.
- [x] `src/services/reports.js` → `buildDayOfWeekStats`: mismo fix — usa `operationalDateKey()` (parseado en UTC) en lugar de `new Date(p.created_at).getDay()`. Corrige inconsistencia: "Día de la semana" mostraba ventas en Viernes que "Ingresos diarios" ya atribuía correctamente a Jueves (turno nocturno).
- Sin cambios de esquema ni RLS. `isoDate()` queda exportada pero sin uso (no se removió para no ampliar el alcance).

## Reporte "Ventas por producto" ✅ (2026-06-12)

- [x] `src/services/reports.js` → `getProductSalesForPeriod({ startDate, endDate })` + helper `addDaysToDateString`
- [x] `src/pages/ProductSalesReportPage.jsx` (nuevo) — filtros (rango fechas default ayer, búsqueda texto libre, categoría), tabla ordenable, toggle agrupar por categoría, totales, export CSV
- [x] `src/App.jsx` → ruta `/admin/product-sales`, admin-only (`AuthRoute`)
- [x] `src/components/AdminNav.jsx` → botón "🛒 Ventas"
- Lint: mismos patrones preexistentes (useCallback/useEffect) que `AnalyticsPage`/`WeeklyReportPage`, sin issues nuevos. Build falla en sandbox por binding nativo de rolldown faltante — no relacionado a estos cambios.
- [x] **Fix FK ambigua**: `comanda_items` tiene 2 FKs a `products` (ya documentado en lessons.md). `getProductSalesForPeriod` y `getTopCategoriesRevenue` usaban `products(...)` sin hint → error "more than one relationship was found". Ambas ahora usan `products:products!comanda_items_product_id_fkey(...)`. Esto también arregla silenciosamente la sección "Categorías" de Analytics, que probablemente devolvía vacío.

## Fix corte de día (medianoche → operacional 06:00) en Folios/Movimientos/Turnos/Eventos ✅ (2026-06-12)

- [x] `src/services/reports.js` → `addDaysToDateString` ahora exportada; `getComandaEvents` usa corte operacional (06:00-06:00, `lt` exclusivo) en vez de `T00:00:00`/`T23:59:59`.
- [x] `src/services/shifts.js` → `getCashMovements` y `getShifts`: mismo cambio de corte operacional.
- [x] `src/services/tickets.js` → `searchComandas`: mismo cambio + corrige bug adicional (faltaba el offset `-06:00`, las fechas se interpretaban sin timezone).
- [x] `CashMovementsAdminPage.jsx`, `ComandaEventsPage.jsx`, `FolioHistoryPage.jsx`, `ShiftHistoryPage.jsx` → helpers `today()`/`nDaysAgo()` cambiados de `toISOString().split('T')[0]` (fecha UTC) a fecha local México (`toLocalDateString`), igual que `ProductSalesReportPage`/`WeeklyReportPage`. Antes, entre 18:00-23:59 hora local "Hoy" apuntaba al día siguiente.
- Sin cambios de esquema/RLS. No se tocó nada más.

## Fix unidades de combos (3x2/Cubeta) en "Ventas por producto" ✅ (2026-06-12)

- [x] `getProductSalesForPeriod`: ya no filtra `is_free_mixer=false` en la query — trae también las filas mixer (cervezas seleccionadas para 3x2/Cubeta) junto con `product_id`, `source_shot_product_id` y categoría.
- [x] Calcula, por `source_shot_product_id`, cuántas filas mixer tienen la MISMA categoría que el combo (ej. "A. Cerveza" == "A. Cerveza" → cuenta; "N. Bebidas sin alcohol" != "J. Shots" → no cuenta).
- [x] Para la fila del combo (`is_free_mixer=false`), si existe ese conteo, lo usa como `units` en vez de la cantidad sumada. Ingresos sin cambio.
- [x] Filas mixer en sí (is_free_mixer=true) nunca generan su propia fila en el reporte — solo se usan para el conteo.
- Alcance: solo `getProductSalesForPeriod`. No toca Analytics/Dashboard/`getTopCategoriesRevenue`.
- Pendiente: validar en el reporte real que "Cerveza 3x2" pase de 3→9 y "Cubeta Especial 6" de 1→6, manteniendo el mismo $.

## Plan — Reporte "Ventas por producto" (pendiente de aprobación)

### Objetivo
Página admin-only para ver, en un rango de fechas custom, unidades vendidas e ingresos por producto y/o categoría, con búsqueda de texto libre para agrupar por palabra clave (ej. "trago", "caguama") sin importar categoría.

### Pasos
- [ ] `src/services/reports.js` → nueva `getProductSalesForPeriod({ startDate, endDate })`
  - Mismo patrón que `getTopCategoriesRevenue`: `comandas` (status `paid`, `cobrado_at` en rango, corte 6am operacional) → `comanda_items` (active, `is_free_mixer=false`, `is_free_benefit=false`) → `products(name, categories(name))`
  - Retorna array `{ productName, categoryName, units, revenue }` agregado por producto
- [ ] `src/pages/ProductSalesReportPage.jsx` (nuevo)
  - Filtros: rango de fechas (default = ayer), buscador de texto libre, selector opcional de categoría
  - Tabla: Producto · Categoría · Unidades · Ingresos, ordenable por click en encabezado
  - Toggle "Agrupar por categoría"
  - Fila de totales (respeta filtros activos)
  - Botón exportar CSV (client-side, blob, sin librerías nuevas)
- [ ] `src/App.jsx` → nueva ruta, `AuthRoute` (admin-only, igual que Reporte semanal — managers no entran)
- [ ] `src/components/AdminNav.jsx` → botón nuevo en sección "Vistas"

### Acceso
Admin-only (AuthRoute), igual que Reporte semanal.

### Default
Rango de fechas inicial = "ayer" (día operativo, corte 6am).

---

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
