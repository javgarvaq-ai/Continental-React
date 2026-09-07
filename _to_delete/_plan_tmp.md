## Plan — Sesión 2026-09-06 (noche): que el sistema concilie solo — PENDIENTE DE APROBACIÓN, NO CODEADO

### Por qué

La auditoría de hoy (`tasks/conciliacion_bancaria_2026-09-06.md`) cerró sin faltante, pero costó tres rondas y tres archivos externos. **La causa raíz es una sola: el ledger modela UNA cuenta llamada `bank`, y en la realidad el dinero del lado bancario vive en dos lugares distintos** — la cuenta de Mercado Pago del negocio, y el dinero de Getnet que pasa por la cuenta personal de Javi antes de llegar ahí. Como el sistema los colapsa en uno, ningún saldo del sistema se puede comparar contra ningún estado de cuenta real.

De ahí salen los 5 huecos, todos derivados:

| # | Hueco | Costo medido |
|---|---|---|
| 1 | No se guarda qué terminal cobró cada venta | Hubo que inferirla por la comisión (4.06% vs 2.17%) |
| 2 | La comisión nunca se asienta | "Saldo banco" inflado ~$10,000 y creciendo +$130 por cada $3,500 de venta con tarjeta |
| 3 | Los gastos "banco" no dicen de qué cuenta salieron | $10,052.77 salieron de la cuenta personal y el sistema los cargó a Mercado Pago |
| 4 | El reenvío Getnet → Mercado Pago no existe como movimiento | Las 25 transferencias de Javi son invisibles para el sistema |
| 5 | No hay pantalla que compare contra un estado de cuenta | Todo fue manual |

**Decisiones de Javi (2026-09-06):** cuentas reales + backfill del histórico · comisión calculada al vuelo (no asiento) · sí pantalla de conciliación.

### Diseño

**Modelo de ubicaciones — se parte `bank` en dos cuentas reales.** No se agrega ninguna columna a `cash_movements`: la ubicación **es** la cuenta.

| Ubicación | Qué representa | Contra qué se concilia |
|---|---|---|
| `drawer` | cajón (sin cambios) | conteo físico del turno |
| `house_safe` | caja fuerte / resguardo (sin cambios) | conteo físico |
| `mp` | cuenta Mercado Pago del negocio (era `bank`) | **estado de cuenta de Mercado Pago, directo** |
| `getnet` | dinero del negocio cobrado por Getnet que todavía no llega a Mercado Pago — esté aún en Getnet o ya en la cuenta personal sin reenviar | **saldo pendiente en la app de Getnet + lo que Javi trae sin reenviar** |

`getnet` NO es "la cuenta de BBVA" — es dinero del negocio en tránsito. Eso importa: la cuenta personal de Javi tiene dinero personal mezclado y modelarla completa sería incorrecto y además invasivo.

**Tasas de comisión** (medidas contra los estados de cuenta reales, no supuestas):

```
FACTOR_NETO = { mp: 0.9594,   // 3.5% + IVA = 4.06% — verificado en 341 de 353 liberaciones
                getnet: 0.9783 } // 2.17% — verificado exacto al centavo en 7 barridos
```

**Comisión al vuelo:** una venta con tarjeta aporta `tarjeta × FACTOR_NETO[terminal]` al saldo de su cuenta, y la diferencia se muestra como línea derivada "Comisión". No se crea ninguna fila, no se toca el RPC de cobro, es reversible con cambiar una constante. Misma decisión que se tomó en Costeo.

**Categorías nuevas de `cash_movements`:** solo una — `transferencia_getnet_a_mp` (transfer, source `getnet`, destination `mp`). Las demás categorías NO se duplican: en el formulario de movimientos, cuando la categoría es del lado bancario, aparece un selector "¿de qué cuenta salió?" con dos opciones, y eso escribe `source_location`. Un dropdown en vez de duplicar 6 categorías.

### ⚠️ Decisión abierta que necesito de Javi antes de la Fase 2

Para guardar la terminal en el cobro hay dos caminos:

- **(a) Agregar el parámetro al RPC `finalize_comanda_payment`.** Atómico: o se guarda la venta con su terminal, o no se guarda. Pero toca el RPC de cobro en producción, que es justo lo que evitamos en Costeo.
- **(b) Un `UPDATE` desde el frontend justo después de que el RPC regresa.** No toca el RPC. Riesgo: si ese update falla (red, cierre de app), la venta queda con terminal en NULL y hay que corregirla a mano.

**Mi recomendación: (a).** El dato es de dinero y la atomicidad importa; un NULL silencioso rompe justo la conciliación que estamos construyendo. Es un parámetro nuevo con default, aditivo, sin cambiar lógica existente. Pero es tu llamada — dime cuál antes de que codee la Fase 2.

---

### Fase 0 — Preparar el backfill (SOLO LECTURA, sin código)
> Regla aprendida: confirmar el estado real de los datos con Javi ANTES de escribir SQL de corrección (`tasks/lessons.md`).

- [ ] Generar la clasificación propuesta de las 460 ventas con tarjeta → `mp` o `getnet`, usando el emparejamiento ya hecho contra las 353 liberaciones de Mercado Pago (308 empatan al centavo; el resto por residuo diario). Entregable: lista de folios por terminal, con los casos dudosos marcados aparte.
- [ ] Generar la clasificación propuesta de los gastos "banco" → pagados desde `mp` o desde `getnet`, emparejando cada salida del ledger contra las salidas reales del estado de cuenta de Mercado Pago. Los ~15-25 sin contraparte son los candidatos a `getnet`. Entregable: lista revisable, **Javi confirma antes de tocar nada**.
- [ ] Preparar el alta de las 25 transferencias Getnet → Mercado Pago (fechas y montos exactos, ya extraídos del estado de cuenta).

### Fase 1 — Migración de esquema (solo datos, sin UI)
- [ ] `supabase/migrations/2026MMDDHHMMSS_card_terminal_y_cuentas.sql`:
  - `payments.card_terminal text` con `CHECK (card_terminal IN ('mp','getnet'))`, nullable.
  - Sin CHECK nuevo en `cash_movements.source_location` / `destination_location` (hoy no tienen constraint; agregarlo obligaría a migrar todo el histórico en el mismo paso).
- [ ] Backfill de `payments.card_terminal` con las listas aprobadas en Fase 0.
- [ ] **Verificación:** por día operativo, `SUM(tarjeta) WHERE card_terminal='mp'` × 0.9594 debe dar las liberaciones de ese día en el estado de cuenta. Si un día no cuadra, el backfill de ese día está mal.

### Fase 2 — Capturar la terminal en el cobro
- [ ] Selector de 2 botones en el modal de cobro, visible solo cuando `tarjeta > 0`. Default: la última terminal usada (se guarda en `localStorage`), para que no sea un clic extra en cada venta.
- [ ] Guardado por la vía (a) o (b) según lo que decida Javi arriba.
- [ ] **Verificación:** cobrar con cada terminal en producción y confirmar que la fila de `payments` trae el valor correcto.

### Fase 3 — Ledger con cuentas reales y comisión neta
- [ ] `src/utils/ledger.js`: `LEDGER_LOCATIONS = ['drawer','house_safe','mp','getnet']`. Una venta con tarjeta aporta `tarjeta × FACTOR_NETO[card_terminal]` a la cuenta de su terminal; `transferencia` (SPEI del cliente) va siempre a `mp`. Se expone la comisión como dato derivado por evento y acumulado.
- [ ] `src/config/cashMovements.js`: `bank` → `mp` en las 6 categorías existentes; alta de `transferencia_getnet_a_mp`; selector de cuenta de origen en el formulario.
- [ ] `src/pages/LedgerPage.jsx`: 4 columnas de saldo en vez de 3. `estimateBankNet()` se elimina — deja de ser una estimación de pantalla, ahora el saldo ya es neto.
- [ ] `src/pages/WeeklyReportPage.jsx` y `MonthlyReportPage.jsx`: los filtros por `source_location === 'bank'` pasan a `['mp','getnet'].includes(...)`; quitar `estimateBankNet`.
- [ ] Radio de impacto verificado con `grep -rn` sobre el filesystem real: son exactamente esos 5 archivos, ninguno más.
- [ ] **Verificación:** el saldo `mp` del sistema al 4-sep-2026 debe dar **$2,657.40** (el saldo real del estado de cuenta de Mercado Pago). Ese es el test de aceptación de toda la fase.

### Fase 4 — Backfill del histórico de movimientos
- [ ] SQL guiado (bloque por bloque, lo corre Javi) que reclasifica los gastos aprobados en Fase 0 de `bank` → `mp` / `getnet`, y da de alta las 25 transferencias Getnet → Mercado Pago.
- [ ] Los `bank` que queden sin reclasificar pasan a `mp` (es la mayoría).
- [ ] **Verificación:** repetir el test de la Fase 3 y además que el saldo `getnet` al 6-sep sea ≈ **$21,900** (lo que Getnet debía tener pendiente + lo no reenviado, según la auditoría).

### Fase 5 — Pantalla de conciliación (`/admin/conciliacion`)
- [ ] Formulario: fecha de corte + saldo real de cada cuenta (lo que Javi ve en la app de Mercado Pago, en la de Getnet y el conteo de caja).
- [ ] Salida por cuenta: saldo del sistema · saldo real capturado · diferencia · desglose de las partidas conocidas que la explican.
- [ ] Guardar cada corte en una tabla `reconciliations` para tener historial y ver si la diferencia crece.
- [ ] **Verificación:** cargar el corte del 4-sep-2026 con los datos de la auditoría y ver que la pantalla reproduce el residuo de $324.76 sin ayuda mía.

### Riesgos y cómo se acotan
- **Se toca el modelo del ledger, que es la vista de dinero de todo el negocio.** Por eso la Fase 3 tiene un test de aceptación numérico contra un estado de cuenta real, no un "se ve bien".
- **El backfill mueve datos históricos.** Todo va en SQL por bloques que corre Javi, con SELECT de confirmación antes de cada UPDATE, y la clasificación se aprueba en Fase 0 antes de escribir una sola línea de UPDATE.
- **Fase 2 puede tocar el RPC de cobro** — depende de la decisión abierta de arriba. Si Javi elige (b), el RPC no se toca en ningún punto del plan.
- **Deuda aparte, no incluida aquí:** el bug latente de paginación de `getLedgerData` (ordena por `created_at`, que no es único; cruza las 1,000 filas ~nov-2026). Es independiente de este plan pero conviene arreglarlo antes de esa fecha.

### Lo que este plan NO resuelve
- Los **$910 de depósitos de efectivo** registrados en el ledger que nunca llegaron a Mercado Pago. Es un hilo suelto del histórico, no un problema de modelo — se revisa aparte.
- El **faltante de $578 del 5→6 de julio** — va por su lado, con `tasks/diagnostico_faltante_578_2026-07-05.sql`.

---
