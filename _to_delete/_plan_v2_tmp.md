## Plan — Sesión 2026-09-06 (noche) v2: que el sistema concilie solo — PENDIENTE DE APROBACIÓN, NO CODEADO

> **v2 (2026-09-06):** Javi rechazó el modelo de dos cuentas y propuso algo mejor — cambiar el **proceso** en vez de modelar el desorden. Esta versión reemplaza a la v1 por completo. Lo que se cae: partir `bank`, la categoría de reenvío, el selector de cuenta en gastos y el backfill de ~25 gastos. Lo que se queda: terminal por venta, comisión al vuelo, pantalla de conciliación.

### Por qué

La auditoría de hoy (`tasks/conciliacion_bancaria_2026-09-06.md`) cerró sin faltante, pero costó tres rondas y tres estados de cuenta. La causa raíz era que la cuenta personal de Javi funcionaba de hecho como una segunda cuenta del negocio: Getnet depositaba ahí, y de ahí salían tanto los reenvíos a Mercado Pago como $10,052.77 de gastos del negocio.

### La decisión de fondo: se arregla el proceso, no el modelo

**Regla de operación nueva (Javi, 2026-09-06):**
1. **Siempre transferir a Mercado Pago el monto COMPLETO que deposita Getnet.** Sin descontar nada.
2. **Los retiros (sueldo, efectivo para nóminas) salen SIEMPRE de Mercado Pago**, nunca descontados de la transferencia de Getnet.

Con esas dos reglas la cuenta personal deja de ser una cuenta del negocio y pasa a ser un tubo de paso. Un tubo no se modela: **el sistema sigue con UNA sola cuenta bancaria (Mercado Pago)**, y la única diferencia contra el estado de cuenta real es el **delay de liquidación de Getnet** — 1 día hábil, o el fin de semana. Eso no es un descuadre: es una partida de conciliación normal, conocida y acotada, que se limpia sola.

**Qué pasa si Javi rompe la regla** (se descuenta un retiro, o se le olvida transferir): la pantalla de conciliación de la Fase 4 lo detecta, porque la diferencia contra Mercado Pago va a exceder lo que explica el delay. Ese es el guardián — no hace falta un candado en el código.

### Lo que SÍ hay que construir

**1. Terminal por venta (`payments.card_terminal`).** No se puede quitar aunque ya no haya dos cuentas: sin ella el sistema no sabe si aplicar 4.06% o 2.17% de comisión, ni puede calcular cuánto de Getnet viene en tránsito.

**2. Comisión al vuelo.** Tasas medidas contra los estados de cuenta reales, no supuestas:

```
FACTOR_NETO = { mp: 0.9594,      // 3.5% + IVA = 4.06% — verificado en 341 de 353 liberaciones
                getnet: 0.9783 } // 2.17% — verificado exacto al centavo en 7 barridos
```

Una venta con tarjeta aporta `tarjeta × FACTOR_NETO[card_terminal]` al saldo del banco, y la diferencia se muestra como línea derivada "Comisión". **No se crea ninguna fila, no se toca el RPC de cobro, es reversible cambiando una constante.** Misma decisión que se tomó en Costeo. Hoy el ledger registra la tarjeta en bruto y el saldo está inflado ~$10,000, creciendo +$130 por cada $3,500 de venta con tarjeta.

**3. Pantalla de conciliación.** Tres entradas (saldo de Mercado Pago, pendiente que muestra Getnet, efectivo contado) y el sistema dice si la diferencia es la esperada.

### ⚠️ Decisión abierta que necesito de Javi antes de la Fase 2

Para guardar la terminal en el cobro hay dos caminos:

- **(a) Agregar el parámetro al RPC `finalize_comanda_payment`.** Atómico: o se guarda la venta con su terminal, o no se guarda. Pero toca el RPC de cobro en producción, que es justo lo que se evitó en Costeo.
- **(b) Un `UPDATE` desde el frontend justo después de que el RPC regresa.** No toca el RPC. Riesgo: si ese update falla (red, cierre de app), la venta queda con terminal en NULL y hay que corregirla a mano.

**Recomendación: (a).** El dato es de dinero y la atomicidad importa; un NULL silencioso rompe justo la conciliación que se está construyendo. Es un parámetro nuevo con default, aditivo, sin cambiar lógica existente.

---

### Fase 0 — Preparar el backfill de terminal (SOLO LECTURA, sin código)
> Regla aprendida: confirmar el estado real de los datos con Javi ANTES de escribir SQL de corrección (`tasks/lessons.md`).

- [ ] Generar la lista de folios por terminal para las 460 ventas con tarjeta del histórico, usando el emparejamiento ya hecho contra las 353 liberaciones de Mercado Pago (308 empatan al centavo; el resto por residuo diario). Marcar aparte los casos dudosos.
- [ ] Javi revisa y aprueba la lista antes de que se escriba un solo `UPDATE`.

### Fase 1 — Migración + backfill de terminal (solo datos, sin UI)
- [ ] `supabase/migrations/2026MMDDHHMMSS_add_payments_card_terminal.sql`: `payments.card_terminal text` con `CHECK (card_terminal IN ('mp','getnet'))`, nullable.
- [ ] `UPDATE` por bloques con las listas aprobadas en Fase 0 (por `folio`, vía `comandas`). Lo corre Javi en el SQL Editor.
- [ ] **Verificación:** por día operativo, `SUM(tarjeta) WHERE card_terminal='mp'` × 0.9594 debe dar las liberaciones de ese día en el estado de cuenta de Mercado Pago. Si un día no cuadra, el backfill de ese día está mal.

### Fase 2 — Capturar la terminal en el cobro
- [ ] Selector de 2 botones en el modal de cobro, visible solo cuando `tarjeta > 0`. Default: la última terminal usada (`localStorage`), para que no sea un clic extra en cada venta.
- [ ] Guardado por la vía (a) o (b) según lo que decida Javi arriba.
- [ ] **Verificación:** cobrar con cada terminal en producción y confirmar que la fila de `payments` trae el valor correcto.

### Fase 3 — Comisión neta en el ledger y los reportes
- [ ] `src/utils/ledger.js`: `bankDelta` de un pago pasa de `tarjeta + transferencia` a `tarjeta × FACTOR_NETO[card_terminal] + transferencia` (el SPEI del cliente llega íntegro, sin comisión). Exponer la comisión como dato derivado por evento y acumulado. Fallback cuando `card_terminal` es NULL: usar `mp` y marcarlo visualmente.
- [ ] `src/pages/LedgerPage.jsx`: la etiqueta "Banco" pasa a "Mercado Pago"; nueva línea/columna de comisión acumulada; **se elimina `estimateBankNet()`** — deja de ser una estimación de pantalla porque el saldo ya es neto.
- [ ] `src/pages/MonthlyReportPage.jsx`: quitar `estimateBankNet`, mostrar la comisión como costo del periodo.
- [ ] `src/pages/WeeklyReportPage.jsx`: revisar que los totales de tarjeta sigan siendo brutos donde deben serlo (ventas) y netos donde deben serlo (saldo).
- [ ] Radio de impacto verificado con `grep -rn` sobre el filesystem real: `utils/ledger.js`, `LedgerPage.jsx`, `WeeklyReportPage.jsx`, `MonthlyReportPage.jsx`. `config/cashMovements.js` ya **no** se toca en v2.
- [ ] **Verificación (test de aceptación de toda la fase):** el saldo bancario del sistema al 4-sep-2026, menos las ventas de Getnet aún no liquidadas a esa fecha, debe dar **$2,657.40** — el saldo real del estado de cuenta de Mercado Pago.

### Fase 4 — Pantalla de conciliación (`/admin/conciliacion`)
- [ ] Formulario: fecha de corte + tres saldos reales — **Mercado Pago**, **pendiente en Getnet**, **efectivo contado**.
- [ ] Salida: saldo del sistema vs saldo real, la diferencia, y el desglose de lo que la explica (ventas de Getnet en tránsito, principalmente).
- [ ] **Semáforo:** si la diferencia excede lo que explica el delay de Getnet, se marca en rojo con el monto. Ese es el guardián de la regla de operación nueva.
- [ ] Estimación de contraste: el sistema calcula por su cuenta las ventas de Getnet de los últimos N días y la muestra junto al número que Javi captura, para detectar si Getnet dejó de depositar.
- [ ] Guardar cada corte en una tabla `reconciliations` para tener historial y ver si la diferencia crece con el tiempo.
- [ ] **Verificación:** cargar el corte del 4-sep-2026 con los datos de la auditoría y ver que la pantalla reproduce el residuo sin ayuda externa.

### El histórico: hasta dónde va a cuadrar
- Los $10,052.77 de gastos que se pagaron desde la cuenta personal **NO se reclasifican**: bajo el modelo de una sola cuenta no hay dónde ponerlos, y con la regla de operación nueva no vuelve a pasar.
- Se define una **fecha de corte** a partir de la cual el sistema debe conciliar solo. Antes de esa fecha, el registro es `tasks/conciliacion_bancaria_2026-09-06.md`, que ya explica el periodo completo con residuo de $324.76 (0.11%).
- El backfill de `card_terminal` **sí** cubre todo el histórico, porque los reportes de comisión y margen hacia atrás lo necesitan.

### Riesgos y cómo se acotan
- **Se toca el cálculo de saldo del ledger, que es la vista de dinero de todo el negocio.** Por eso la Fase 3 tiene un test de aceptación numérico contra un estado de cuenta real, no un "se ve bien".
- **Las ventas con `card_terminal` en NULL** (si Javi elige la vía (b) y falla un update) calcularían comisión de Mercado Pago cuando quizá fueron Getnet. Se mitiga marcándolas visualmente en el ledger para que se corrijan.
- **La regla de operación depende de que Javi la cumpla.** El código no la fuerza. La pantalla de conciliación es el detector, no el candado — decisión consciente para no sobre-ingenierizar.
- **Deuda aparte, no incluida aquí:** el bug latente de paginación de `getLedgerData` (ordena por `created_at`, que no es único; cruza las 1,000 filas ~nov-2026).

### Lo que este plan NO resuelve
- Los **$910 de depósitos de efectivo** registrados en el ledger que nunca llegaron a Mercado Pago. Hilo suelto del histórico, se revisa aparte.
- El **faltante del 5→6 de julio** — ✅ **ya cerrado 2026-09-06**, no requiere trabajo. Propinas cobradas $1,116.75 vs entregadas $1,116.00 ($486 esa noche + $630 de ajuste a la mañana siguiente). El faltante de $578 fueron propinas que salieron del cajón antes del conteo; quedan $52 registrados de más. No hay corrección que hacer.

---
