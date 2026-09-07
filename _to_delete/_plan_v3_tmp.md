## Plan — Sesión 2026-09-07 v3: terminal por venta y comisión exacta — APROBADO EL ALCANCE, FASE 0 HECHA

> **v3 (2026-09-07):** Javi cuestionó el tamaño del plan v2 y tenía razón. Esta versión lo reduce a lo que de verdad paga. Reemplaza a la v2 completa.
>
> **Lo que se cayó de la v2:** la pantalla de conciliación `/admin/conciliacion`, la tabla `reconciliations`, el formulario de captura de saldos, y la revisión folio por folio de las 460 ventas.
> **Lo que ya se había caído en la v2** (por el cambio de proceso de Javi): partir `bank` en dos cuentas, la categoría de reenvío Getnet→MP, el selector de cuenta en los gastos y el backfill de ~25 gastos.
> **Lo que queda:** capturar la terminal, arreglar la leyenda del Ledger, y dos renglones informativos.

### Por qué se hace esto (y por qué es chico)

No es para buscar dinero: la auditoría cerró con residuo de $324.76 (0.11%) y **no falta nada**. Son dos razones concretas:

**1. La leyenda del Ledger miente hoy, y el error crece.**

| | |
|---|---|
| BANCO que muestra el Ledger | $23,089.61 |
| Leyenda "Real estimado (− comisión MP)" | $11,445.55 |
| → comisión que asume la leyenda | $11,644.06 |
| Comisión real (MP $7,926.89 + Getnet $1,986.76) | **$9,913.65** |
| **Error de la leyenda** | **$1,730.41** |

`estimateBankNet()` aplica 4.06% a *toda* la tarjeta, incluyendo lo cobrado con Getnet al 2.17%. El saldo real del banco es **$13,175.96**, no $11,445.55. **El error crece $18.90 por cada $1,000 vendidos con Getnet.** Esto no es una función nueva: es un número que ya está en pantalla y está mal.

**2. La terminal por venta es el único dato que se pierde para siempre si no se captura.** Todo lo demás se puede hacer en diciembre igual de bien. Hoy se pudo inferir porque Mercado Pago publica línea por línea y las dos terminales tienen tasas distintas — el día que Getnet cambie su tarifa a 4%, esa inferencia deja de funcionar y el histórico nuevo queda ciego.

### Diseño

**El modelo de saldos NO se toca.** BANCO sigue siendo bruto, como hoy — Javi quiere seguir viendo el total cobrado con tarjeta. Lo único que cambia es que la leyenda de abajo pasa de estimada a exacta.

```
FACTOR_NETO = { mp: 0.9594,      // 3.5% + IVA = 4.06% — verificado en 341 de 353 liberaciones
                getnet: 0.9783 } // 2.17% — verificado exacto al centavo en 7 barridos
```

Sin filas nuevas, sin tocar el RPC de cobro, reversible cambiando una constante.

### ⚠️ Única decisión pendiente de Javi (bloquea la Fase 2)

Para guardar la terminal en el cobro:

- **(a) Parámetro nuevo en el RPC `finalize_comanda_payment`.** Atómico: o se guarda la venta con su terminal, o no se guarda. Toca código de pago en producción.
- **(b) `UPDATE` desde el frontend después de que el RPC regresa.** No toca el RPC. Si falla (red, cierre de app), la venta queda en NULL y hay que corregirla a mano.

**Recomendación: (a).** Es dato de dinero; un NULL silencioso rompe justo lo que se está construyendo. El parámetro es aditivo, con default, sin cambiar lógica existente.

---

### Fase 0 — Clasificación del histórico — ✅ HECHA 2026-09-07 (solo lectura)

- [x] Cada venta con tarjeta del ledger comparada contra las 353 "Liberación de dinero" del estado de cuenta de Mercado Pago (una por venta, mismo día, netas de 4.06%).
- [x] **Regla base:** `folio <= 572` → `mp` (285 folios, $180,440.50) · `folio >= 573` → `getnet` (175 folios, $110,308.91). El corte es limpio: última venta con tarjeta antes del 25-jul es el folio 572, primera después es el 574.
- [x] **24 excepciones** en 9 días de la era Getnet que también cobraron por Mercado Pago, identificadas folio por folio. Los 9 días cierran al centavo.
- [x] **Resultado:** `mp` 309 folios $196,144.27 · `getnet` 151 folios $94,605.14 · suma 460 folios $290,749.41 ✓ (cuadra con Cierre Mensual).
- [x] **Control:** (mp bruto − $1,030 de SPEI de junio) × 0.9594 = $187,192.63 vs $187,316.75 de liberaciones reales = **−$124.12 (0.07%)**, el mismo residuo ya medido en la auditoría.
- [x] Entregable: `tasks/backfill_card_terminal_2026-09-07.sql` — clasificación documentada en comentarios + SQL por bloques + 3 bloques de verificación + rollback.

### Fase 1 — Migración + backfill (solo datos, sin UI)
- [ ] `supabase/migrations/2026MMDDHHMMSS_add_payments_card_terminal.sql`: `payments.card_terminal text` con `CHECK (card_terminal IN ('mp','getnet'))`, nullable.
- [ ] Javi corre `tasks/backfill_card_terminal_2026-09-07.sql` bloque por bloque.
- [ ] **Verificación (en el propio SQL, bloques 6-8):** reparto final exacto (309/151), cero ventas sin terminal, y día por día `mp_bruto × 0.9594` = liberaciones de ese día en el estado de cuenta.

### Fase 2 — Capturar la terminal en el cobro
- [ ] Selector de 2 botones en el modal de cobro, visible solo cuando `tarjeta > 0`. Default: la última terminal usada (`localStorage`), para que no sea un clic extra en cada venta.
- [ ] Guardado por la vía (a) o (b) según lo que decida Javi arriba.
- [ ] **Verificación:** cobrar con cada terminal en producción y confirmar el valor en la fila de `payments`.

### Fase 3 — Leyenda exacta + dos renglones informativos
- [ ] `src/utils/ledger.js`: `estimateBankNet()` deja de recibir un total único de tarjeta y pasa a recibir el desglose por terminal, aplicando `FACTOR_NETO` de cada una. **`bankDelta` no cambia** — el saldo sigue siendo bruto.
- [ ] Fallback cuando `card_terminal` es NULL: usar `mp` (comportamiento actual) y marcarlo visualmente para que se corrija.
- [ ] `src/pages/LedgerPage.jsx`: la leyenda pasa de "Real estimado (− comisión MP)" a **"Real (− comisión): $X"** con desglose MP/Getnet en tooltip. Dos renglones nuevos debajo: **"Getnet en tránsito (estimado)"** y **"Esperado en Mercado Pago"** — con eso Javi compara contra la app cuando quiera, sin pantalla nueva.
- [ ] `src/pages/MonthlyReportPage.jsx`: misma corrección de la leyenda.
- [ ] Radio de impacto verificado con `grep -rn` sobre el filesystem real: solo `utils/ledger.js`, `LedgerPage.jsx` y `MonthlyReportPage.jsx`. **No se toca** `config/cashMovements.js` ni `WeeklyReportPage.jsx`.
- [ ] **Verificación:** con los datos al 6-sep, la leyenda debe dar **$13,175.96** (hoy dice $11,445.55).

### Riesgos y cómo se acotan
- **Riesgo bajo por diseño:** no se toca el modelo de saldos ni las categorías de movimientos. El cambio más profundo es una fórmula de display.
- **Ventas con `card_terminal` en NULL** (si Javi elige la vía (b) y falla un update) calcularían comisión de Mercado Pago cuando quizá fueron Getnet. Se mitiga con el fallback marcado visualmente.
- **La regla de operación de Javi** (transferir siempre el monto completo de Getnet; los retiros salen siempre de Mercado Pago) no la fuerza el código. Los dos renglones informativos del Ledger son el detector, no el candado — decisión consciente para no sobre-ingenierizar.

### Aplazado a propósito (no es que falte, es que no paga hoy)
- **Pantalla de conciliación `/admin/conciliacion` + tabla `reconciliations`.** Se reevalúa si los dos renglones del Ledger no alcanzan.
- **Reclasificar los $10,052.77 de gastos históricos** pagados desde la cuenta personal. Con la regla de operación nueva no vuelve a pasar; el registro del periodo es `tasks/conciliacion_bancaria_2026-09-06.md`.
- **Los $910 de depósitos de efectivo** que nunca llegaron a Mercado Pago. Hilo suelto del histórico.
- **Bug latente de paginación de `getLedgerData`** (ordena por `created_at`, que no es único; cruza las 1,000 filas ~nov-2026). Independiente de este plan, pero conviene antes de esa fecha.

### Ya cerrado, sin trabajo pendiente
- **Faltante de $578 del 5→6 julio** — ✅ resuelto 2026-09-06. Propinas cobradas $1,116.75 vs entregadas $1,116.00 ($486 esa noche + $630 de ajuste a la mañana siguiente). Eran propinas que salieron del cajón antes del conteo; quedan $52 registrados de más. Nada que corregir.

---
