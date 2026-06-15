# Auditoría del flujo de dinero — Continental POS

**Fecha:** 2026-06-14
**Alcance:** Solo lectura. Diagnóstico y recomendaciones. **No se modificó nada de código.**
**Síntoma reportado:** El corte muestra MENOS efectivo del que físicamente hay en caja.

---

## TL;DR (la conclusión primero)

La aritmética del corte en el código **es correcta y consistente**. No hay una resta de más, ni un campo olvidado, ni propinas que se "pierdan" del cálculo. El fondo inicial se suma, los movimientos se aplican bien por tipo.

El faltante que ves es **operativo, no de cálculo**, y tiene una causa principal muy concreta:

> **Cuando un cliente paga en efectivo y deja la diferencia como propina ("quédate con el cambio"), si el cajero NO captura esa propina en el campo "Propina", el sistema asume que ese sobrante fue *cambio devuelto*. Registra menos efectivo del que realmente quedó en el cajón. Resultado: caja esperada < caja física.**

Esto está agravado por un detalle de diseño: el cálculo automático de propina **está apagado para pagos en efectivo** (`usePayment.js:21`), así que cualquier sobrante de un pago en efectivo se interpreta como cambio por defecto.

El resto del documento explica todo el flujo, las pantallas, y lista bugs/inconsistencias secundarias con ubicación exacta.

---

## 1. Mapa de archivos — dónde vive cada pieza

| Pieza | Frontend | Backend (Supabase) |
|---|---|---|
| **Fondo inicial / apertura de turno** | `pages/LoginPage.jsx` (120-138), `services/auth.js` → `createShift` (58-66) | tabla `shifts.starting_cash` |
| **Ventas / cobro de comanda** | `hooks/usePayment.js`, `services/comandaCheckout.js` → `confirmPayment` (104-168) | RPC `finalize_comanda_payment` (migración `20260513000005`) → tabla `payments` |
| **Matemática de pago (pura)** | `utils/payments.js` → `computePaymentBreakdown` | — |
| **Movimientos de caja (entradas/salidas)** | `hooks/useShift.js` → `handleCashMovementSubmit` (88-118), `components/CashMovementPanel.jsx`, `config/cashMovements.js`, `services/shifts.js` → `addCashMovement` (223-249) | tabla `cash_movements` |
| **Propinas** | `usePayment.js` → `getPaymentSummary` (14-30); RPC al cobrar | `payments.tip_amount`, `comandas.tip_total`; corrección admin: RPC `adjust_payment_tip` (`20260517000001`) |
| **Corte / cierre de turno** | `components/ShiftPanel.jsx`, `components/CashCounter.jsx`, `hooks/useShift.js`, `services/shifts.js` → `getShiftSummary` (28-100) + `closeShift` (193-216) | tabla `shifts` (campos `expected_cash`, `cash_counted`, `difference`, etc.) |
| **Ledger** | `pages/LedgerPage.jsx`, `services/ledger.js`, `utils/ledger.js` | lee `payments` + `cash_movements` + `shifts` |
| **Pantallas admin** | `pages/CashMovementsAdminPage.jsx`, `pages/ShiftHistoryPage.jsx`, `pages/WeeklyReportPage.jsx` (`calcGlobal`), `pages/AnalyticsPage.jsx`, `pages/DashboardPage.jsx` | — |

---

## 2. El flujo completo de dinero, tal como está hoy

### 2.1 Fondo inicial del turno
- Al iniciar sesión, si no hay turno abierto, `LoginPage` pide el monto del fondo y llama `createShift({ startingCash })` → escribe **solo** `shifts.starting_cash`. (`services/auth.js:58-66`)
- **Decisión de diseño (documentada en `utils/ledger.js:13-17`):** la apertura NO crea un `cash_movement` por el fondo. El cajón se "ancla" al `starting_cash` de cada turno.
- Hay restricción de **un solo turno abierto a la vez** (índice único; el código maneja el error `23505` en `LoginPage.jsx:139`).

### 2.2 Ventas y métodos de pago
Toda la lógica de cobro vive en `usePayment.getPaymentSummary` (`hooks/usePayment.js:14-30`):

```
totalRecibido   = efectivo + tarjeta + transferencia
totalConPropina = totalCuenta + propina
pendiente       = max(totalConPropina − totalRecibido, 0)
cambio          = efectivo > 0 ? max(totalRecibido − totalConPropina, 0) : 0
```

Al confirmar (`comandaCheckout.confirmPayment`, líneas 104-168) se calcula el desglose con `computePaymentBreakdown` (`utils/payments.js:20-41`):

```
netCashApplied = max(efectivo − cambio, 0)   ← efectivo NETO que queda en cajón
totalPaid      = netCashApplied + tarjeta + transferencia
```

Y se guarda vía RPC `finalize_comanda_payment` (migración `20260513000005`, líneas 64-85):
- `payments.efectivo`     = `p_efectivo` = **`netCashApplied`** (neto, ya sin cambio) ✅
- `payments.tarjeta`      = tarjeta
- `payments.transferencia`= transferencia
- `payments.tip_amount`   = propina
- `payments.change_given` = cambio
- `comandas.tip_total`    = propina

**Punto clave:** `payments.efectivo` es el efectivo **neto** que realmente quedó en el cajón. El cambio ya está descontado ahí. Esto es correcto y es la base de por qué el corte **no** debe volver a restar el cambio.

### 2.3 Movimientos de caja (entradas/salidas manuales)
Definidos en `config/cashMovements.js`. Cada categoría fija: `type` (deposit/withdrawal), `movement_nature` (transfer/expense/owner_funding/adjustment), `source_location` y `destination_location`.

Modelo de ubicaciones: `drawer` (cajón), `house_safe` (caja fuerte), `bank` (banco), más destinos lógicos `expense`, `tips`, `owner`, `adjustment`.

**Para qué sirve cada uno y cómo se debe usar:**

| Categoría | Mueve | Efecto en cajón |
|---|---|---|
| `resguardo_casa` | cajón → caja fuerte | sale del cajón |
| `deposito_banco` | cajón → banco | sale del cajón |
| `regreso_resguardo` | caja fuerte → cajón | entra al cajón |
| `retiro_banco_a_caja` | banco → cajón | entra al cajón |
| `aportacion_socio` | socio → cajón | entra al cajón |
| `ajuste_ingreso` | ajuste → cajón | entra al cajón |
| `propinas_entregadas` | cajón → tips | sale del cajón |
| `pago_proveedor_caja`, `nomina_caja`, `renta_caja`, `gasto_operativo_caja` | cajón → expense | sale del cajón |
| `*_banco`, `*_resguardo` | banco/caja fuerte → expense | no toca el cajón |

**Diseño correcto:** los movimientos NO son para registrar ventas. Son para mover dinero entre ubicaciones (resguardo, depósitos al banco) y para registrar gastos/salidas pagados con efectivo de caja (proveedores, nómina, propinas entregadas a meseros, etc.).

### 2.4 Propinas (efectivo vs tarjeta)
- La propina se suma al total a cobrar (`totalConPropina`) y se reparte según cómo paga el cliente.
- **Propina en efectivo:** queda incluida dentro de `netCashApplied` → entra a `payments.efectivo` → **sí cuenta** en la caja esperada. (Además se guarda por separado en `tip_amount`, pero el corte usa `efectivo`, no `tip_amount`, así que **no hay doble conteo**.)
- **Propina en tarjeta/transferencia:** entra en `tarjeta`/`transferencia` → va al banco, **no al cajón**. Correcto que no cuente en efectivo esperado.
- Auto-cálculo de propina: en `getPaymentSummary` (línea 21) solo se activa **si `efectivo <= 0`** (es decir, pago 100% tarjeta/transferencia). Para efectivo, la propina queda en 0 salvo que el cajero la escriba. **Esta asimetría es la raíz del problema** (ver Sección 4).
- Corrección posterior: un admin puede ajustar la propina de un folio ya pagado vía `adjust_payment_tip` (migración `20260517000001`).

### 2.5 Qué muestra el Ledger y cómo lo construye
- `services/ledger.js` trae TODO el histórico hasta el fin del rango (sin límite inferior) para que el saldo de apertura sea exacto. Ordena DESCENDENTE para no perder lo más reciente por el tope de filas de Supabase (`getLedgerData`, comentario líneas 20-24).
- `utils/ledger.js` arma eventos cronológicos (apertura/cierre de turno + folios + movimientos), cada uno con delta por ubicación:
  - **Folio cobrado:** `drawerDelta = efectivo`, `bankDelta = tarjeta + transferencia` (líneas 90-97).
  - **Movimiento:** `delta(loc) = (dst===loc ? amount : 0) − (src===loc ? amount : 0)` (línea 106).
- `computeRunningBalances` (145-161): el **cajón se RESETEA a `starting_cash` en cada apertura de turno**; caja fuerte y banco son acumulados. Por eso el saldo de cierre del cajón en el Ledger = la caja esperada del corte. Son la misma lógica.
- Muestra además un "banco neto" estimado descontando comisión MP (3.5% + IVA, solo display, solo tarjeta) — `estimateBankNet`, `utils/ledger.js:33-36`.

### 2.6 Fórmula EXACTA del efectivo esperado en el corte
En `services/shifts.js → getShiftSummary` (líneas 58-84):

```
totalEfectivo     = Σ payments.efectivo        (neto, por shift_id)
totalDeposits     = Σ cash_movements.amount  donde destination_location === 'drawer'
totalWithdrawals  = Σ cash_movements.amount  donde source_location      === 'drawer'

expectedCash = starting_cash
             + totalEfectivo
             + totalDeposits
             − totalWithdrawals
```

(`shifts.js:80-84`)

Y la diferencia en el cierre (`closeShift`, línea 194):
```
difference = cash_counted − expectedCash
```

`totalCambio` y `totalPropinas` **se calculan pero NO entran en `expectedCash`** — y eso es correcto, porque el cambio ya está descontado de `efectivo` y las propinas en efectivo ya están dentro de `efectivo`. **La fórmula es sólida.**

---

## 3. Pantallas de administración relacionadas con dinero

### 3.1 Corte de turno (`ShiftPanel.jsx`) — el panel del cierre
Muestra, desde `getShiftSummary`: Fondo inicial, Efectivo ventas, Cambio entregado (−, atenuado), Tarjeta, Transferencia, Propinas (informativo), Depósitos (+), Retiros (−), y **Caja esperada**. Luego permite contar físicamente y calcular la diferencia.
- **Uso operativo:** es el corte. Bloquea el cierre si hay mesas abiertas. Solo manager/admin pueden cerrar.
- ⚠️ Nota de UX (no es bug de cálculo): muestra "Cambio entregado −$X" y "Propinas $Y" como renglones, pero **ninguno de los dos se resta/suma** a la caja esperada (ya están reflejados dentro de "Efectivo ventas"). Visualmente parece que deberían aplicarse. Ver Sección 6.

### 3.2 Movimientos de Caja (`CashMovementsAdminPage.jsx`)
Lista cada movimiento con fecha, usuario, concepto, monto y tipo. Filtros por fecha y por tipo (todos/retiros/depósitos). Trae datos de `getCashMovements` con corte de día operativo a las 06:00.
- **Uso operativo:** auditoría de quién movió qué dinero y cuándo.
- ⚠️ Los totales "Entradas/Salidas" agrupan **solo por `type`** (`deposit`/`withdrawal`), líneas 87-93. Eso mezcla *transferencias de ubicación* (ej. `deposito_banco`, `resguardo_casa` son `withdrawal`) con *gastos reales*. Un depósito al banco se cuenta como "Salida" aunque el dinero siga siendo del negocio. Ver Sección 6.

### 3.3 Historial de Turnos (`ShiftHistoryPage.jsx`)
Lista turnos cerrados; al expandir muestra el desglose guardado en el cierre (`total_efectivo`, `total_tarjeta`, `total_transferencia`, `total_propinas`, `total_retiros`, `starting_cash`, `expected_cash`, `cash_counted`) y la **Diferencia de caja** con semáforo (faltante < −50, sobrante > +50, cuadrada en medio). Líneas 48-57, 79-88.
- **Uso operativo:** ver históricamente cuánto cuadró/descuadró cada turno y quién lo cerró.

### 3.4 Reporte Semanal — "Posición de dinero" (`WeeklyReportPage.jsx → calcGlobal`)
Calcula saldo acumulado por ubicación:
```
drawerBalance = cashSales + drawerIn − drawerOut        (línea 126)
bankBalance   = cardSales + transferSales + toBank − fromBankToDrawer − bankExpenses
```
- ⚠️ El `drawerBalance` aquí **NO incluye `starting_cash`** y es **acumulado de todo el histórico**, mientras que el corte y el Ledger anclan el cajón por turno e incluyen el fondo. Son tres formas distintas de ver el "cajón". Ver Sección 6.

### 3.5 Analytics / Dashboard
- ⚠️ Inconsistencia ya conocida (documentada en tu memoria de proyecto y `tasks/todo.md:90`): Analytics suma `payments.total_paid` (**incluye propina**) mientras el Reporte de ventas suma `comandas.final_total` (**sin propina**). La diferencia (~$1,790) son propinas. Decisión tomada: "ventas sin propina" en todas las pantallas — **pendiente de implementar**. *Esto es un tema de definición de "ventas", no afecta el corte de efectivo.*

---

## 4. Diagnóstico: por qué el corte muestra menos de lo que hay

Revisé las cinco hipótesis que pediste:

| Hipótesis | Resultado |
|---|---|
| Transacciones que se restan cuando no deberían | ❌ No encontrado. El cambio no se resta dos veces (ya viene neto en `efectivo`). |
| Campos que no se suman al esperado | ❌ No. Fondo + efectivo + depósitos − retiros está completo. |
| Propinas/métodos de pago fuera del cálculo | ❌ No. Propina en efectivo va dentro de `efectivo`; tarjeta/transferencia correctamente excluidos del cajón. |
| Fondo inicial: ¿se suma, excluye o resta? | ✅ **Se SUMA** correctamente (`shifts.js:81`). |
| Movimientos por tipo (entrada/salida) | ✅ Correctos. `destination=drawer` suma, `source=drawer` resta (`shifts.js:76-77`). |

**Entonces, ¿de dónde sale el faltante?** No del cálculo, sino de **cómo se capturan los pagos en efectivo con propina**.

### Causa principal: propina de efectivo no capturada ("quédate con el cambio")

Ejemplo. Cuenta = $300. El cliente paga con un billete de $500 y dice "quédate con el cambio" ($200 de propina).

- **Si el cajero captura propina = $200:** `cambio = 0`, `netCashApplied = 500`. Se guarda `efectivo = 500`. La caja esperada sube $500. ✅ **Cuadra.**
- **Si el cajero NO captura la propina (lo más común):** el sistema calcula `cambio = 500 − 300 = $200` (`usePayment.js:27`), `netCashApplied = 300`. Guarda `efectivo = 300`. **Pero físicamente nunca devolvió esos $200** (se quedaron como propina en el cajón). → La caja esperada queda **corta por $200**. **Físico > esperado.** ⬅️ **Tu síntoma exacto.**

Y como el auto-cálculo de propina está deshabilitado para efectivo (`usePayment.js:21`, condición `efectivo <= 0`), el sistema **siempre** asume que el sobrante de un pago en efectivo es cambio a devolver, nunca propina. Por eso el sesgo es sistemático y siempre en la misma dirección (faltante).

### Causas secundarias posibles (todas operativas, mismo signo)
1. Aportación de efectivo al cajón sin registrar `aportacion_socio`.
2. `starting_cash` capturado más bajo que el fondo físico real al abrir.
3. Un retiro/depósito registrado en el sistema pero el efectivo **aún no** se sacó físicamente del cajón.
4. (Signo contrario, lo menciono para descartar) Propinas en efectivo que se entregan al personal **sin** registrar `propinas_entregadas` → eso causaría físico < esperado y *parcialmente compensa* lo anterior. El neto que observas (físico > esperado) indica que domina la propina-no-capturada.

---

## 5. Flujo operativo correcto (día a día)

**Al abrir turno**
1. Cuenta el efectivo del fondo y captúralo EXACTO como "fondo inicial". Si después metes más fondo, regístralo como `aportacion_socio` o `ajuste_ingreso`, no lo metas "a mano" sin registrar.

**Al cobrar (lo más importante)**
2. **Pago en efectivo con propina ("quédate con el cambio"): SIEMPRE escribe la propina en el campo Propina.** Regla simple: el campo **Cambio** debe reflejar lo que *realmente* le devuelves al cliente. Si no devuelves nada, el cambio debe ser $0 y la diferencia va en Propina.
3. Si el cliente sí se lleva su cambio, no captures propina: déjalo calcular el cambio normal.
4. Propina con tarjeta: captúrala como propina; entra al banco, no al cajón. Correcto.

**Durante el turno**
5. Toda salida de efectivo del cajón (pagar proveedor, nómina, entregar propinas a meseros, llevar dinero a resguardo o al banco) **regístrala como movimiento de caja** con la categoría correcta. Si sacas físicamente el dinero, regístralo en el momento (no antes, no después).
6. Toda entrada de efectivo al cajón que no sea una venta (regreso de resguardo, retiro del banco, aportación de socio) también como movimiento.

**Al cerrar**
7. Usa la calculadora de denominaciones (Contar efectivo) para contar billete por billete.
8. Captura el efectivo contado. La diferencia debería ser ~$0. Si hay sobrante recurrente → casi seguro son propinas de efectivo no capturadas (punto 2).

**Para conciliar cuando no cuadre:** usa el Ledger (`/admin/ledger`) filtrando "Este turno" → el saldo de cierre del cajón debe igualar la caja esperada del corte. Y tienes `tasks/verificacion_conteo_2026-06-13.sql` para reconciliar a mano.

---

## 6. Bugs, inconsistencias y mejoras sugeridas (con ubicación)

> Nada de esto se modificó. Es para que decidas qué corregir.

### A. (Diseño / raíz del síntoma) Auto-propina apagada para efectivo
- **Ubicación:** `src/hooks/usePayment.js:21` — `if (efectivo <= 0 && !paymentData.propinaManual)`.
- **Problema:** todo sobrante de efectivo se asume cambio, nunca propina. Induce el faltante sistemático.
- **Sugerencia:** cuando hay efectivo y `totalRecibido > totalConPropina`, mostrar al cajero una pregunta explícita "¿el sobrante ($X) es cambio o propina?" antes de confirmar, o un toggle. No cambia la matemática; cierra el agujero operativo.

### B. (UX, no cálculo) El panel de corte muestra renglones que confunden
- **Ubicación:** `src/components/ShiftPanel.jsx:146` ("Cambio entregado") y `:149` ("Propinas").
- **Problema:** se muestran como si afectaran la caja esperada, pero ya están reflejados dentro de "Efectivo ventas". Riesgo: que alguien "arregle" restando el cambio → doble resta.
- **Sugerencia:** etiquetar claramente como "(informativo, ya incluido en efectivo)" o moverlos a una sección aparte.

### C. (Reporte) Totales Entradas/Salidas mezclan transferencias de ubicación con gastos reales
- **Ubicación:** `src/pages/CashMovementsAdminPage.jsx:87-93` (suma por `type`) y render `:222-231`.
- **Problema:** `deposito_banco` y `resguardo_casa` son `withdrawal` y se cuentan como "Salida" aunque el dinero siga siendo del negocio (solo cambió de lugar). Infla las "salidas".
- **Sugerencia:** separar por `movement_nature` (`transfer` vs `expense`) o por destino, no solo por `type`.

### D. (Inconsistencia entre pantallas) "Posición de dinero" del cajón no incluye el fondo
- **Ubicación:** `src/pages/WeeklyReportPage.jsx:126` — `drawerBalance = cashSales + drawerIn − drawerOut` (sin `starting_cash`, acumulado total).
- **Problema:** difiere del cajón del Ledger (anclado por turno + fondo) y de la caja esperada del corte. Tres números distintos para "el cajón" pueden confundir al conciliar.
- **Sugerencia:** documentar en la UI qué representa cada uno, o unificar el criterio del cajón.

### E. (Definición de "ventas") Analytics incluye propina; Reporte no
- **Ubicación:** documentado en `tasks/todo.md:90` y tu memoria de proyecto.
- **Estado:** decisión tomada ("ventas sin propina" en todo), **pendiente de implementar**. No afecta el corte de efectivo, pero sí la lectura de ventas.

### F. (Robustez, menor) `finalize_comanda_payment` confía en el `netCashApplied` calculado en el cliente
- **Ubicación:** `src/services/comandaCheckout.js:149` pasa `p_efectivo: netCashApplied`; la RPC (`20260513000005:64-85`) lo guarda tal cual.
- **Observación:** hay validación de consistencia en el cliente (`comandaCheckout.js:130-140`), pero el neto de efectivo se confía al front. No causa tu síntoma; es una nota de defensa en profundidad para futuro.

---

## Veredicto

El motor de cálculo del dinero está **bien construido y es internamente consistente** (corte, Ledger y RPC concuerdan). El faltante en caja **no es un bug de conteo**: es una propina de efectivo que el sistema, por defecto, trata como cambio cuando no se captura. La corrección de mayor impacto y menor esfuerzo es **operativa** (capturar siempre la propina en efectivo) y, si quieres blindarlo, el cambio de diseño del punto **A**.
