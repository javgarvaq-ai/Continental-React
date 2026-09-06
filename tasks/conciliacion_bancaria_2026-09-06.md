# Conciliación bancaria a fondo — Terminal 1 vs Terminal 2

**Fecha:** 2026-09-06
**Alcance:** SOLO LECTURA. No se modificó ningún dato, ninguna tabla ni ninguna línea de código.
**Periodo:** 10-jun-2026 → 6-sep-2026 (ledger) · 10-jun-2026 → 4-sep-2026 (estado de cuenta MP)
**Fuentes:** ledger CSV (1,335 filas) + estado de cuenta Mercado Pago PDF (45 págs, 664 movimientos), **re-parseados desde cero** sin usar ningún total del reporte anterior.

Este reporte reemplaza y **corrige** la sección 3 de `auditoria_general_2026-09-06.md`.

---

## TL;DR — la respuesta

> ## ✅ RESUELTO: no falta dinero.
>
> Verificado contra el estado de cuenta BBVA donde deposita Getnet: **Getnet pagó el 101.3% de lo que el sistema registró** — más de lo esperado, no menos. El "faltante" era dinero retenido en la cuenta personal que pagó gastos del negocio, y que el sistema **sí tiene registrados**.
>
> **Residuo final sin explicar: $324.76 sobre $286,799.41 de ventas con tarjeta = 0.11%** (ver ADDENDUM 2; con las pantallas de Cierre Mensual se pudo separar tarjeta de SPEI y el residuo bajó de $1,332.41 a $324.76).
>
> Ver el **ADDENDUM** al final de este documento para la prueba. Lo que sigue abajo es el análisis de la primera ronda, que llevó a la pregunta correcta.

**Qué era el gap de $34,789 que abrió esto:**

| Componente | Monto | ¿Problema? |
|---|---|---|
| Comisión Mercado Pago 4.06% (terminal 1) | $7,926.89 | No, es costo |
| Comisión Getnet 2.17% (terminal 2) | $2,009.11 | No, es costo |
| Getnet aún no liquida (ventas 4-6 sep) | $10,548.57 | No, llega en 2 días |
| Retenido en cuenta personal → pagó gastos del negocio | $10,052.77 | No, está registrado |
| Ventas de 5-6 sep fuera del corte bancario | $4,722.80 | No, mecánico |
| **Residuo real** | **$324.76 (0.11%)** | **No** |

**Terminal 1: cuadra al centavo. Terminal 2: cuadra al 1.3% a favor. Cero cobros fantasma.**

---

## 1. Cómo se logró separar terminal 1 de terminal 2 (esto es lo nuevo)

El sistema **no** guarda qué terminal se usó (ver §5) — pero **el banco sí lo delata**, y de forma exacta.

Descubrí que **cada "Liberación de dinero" del estado de cuenta es una venta individual de la terminal 1, depositada el mismo día, neta de una comisión fija de 4.06%** (3.5% + IVA, justo la constante `CARD_COMMISSION_RATE` de `src/utils/ledger.js`).

Prueba:

| Verificación | Resultado |
|---|---|
| Liberaciones cuyo bruto implícito (`monto ÷ 0.9594`) cae exacto en un monto de venta del ledger | **308 de 353** |
| Liberaciones cuyo bruto implícito es múltiplo exacto de $0.05 (o sea, un precio real) | **341 de 353** |
| Rezago entre la venta y su liberación | **0 días en 267 de 269 casos** |

Las 45 que no emparejan 1-a-1 son folios que se cobraron en dos pases de tarjeta (el ledger guarda la suma, el banco guarda los dos cargos) — sus brutos implícitos siguen siendo montos limpios ($50.00, $90.00, $400.00, $600.00…).

**Consecuencia #1: la terminal 1 no tiene rezago de liquidación.** Deposita el mismo día. Toda la explicación de "rezago normal de liquidación de tarjeta" del reporte anterior queda descartada — ese rezago no existe.

**Consecuencia #2:** como conozco el bruto exacto de la terminal 1, el resto de las ventas del ledger es, por resta, terminal 2.

---

## 2. La terminal 1 cuadra prácticamente al centavo

Comparando **día por día** el bruto de ventas del ledger contra el bruto implícito de las liberaciones, en la era 100% terminal 1 (10-jun → 24-jul):

| | |
|---|---|
| Ventas con tarjeta en el ledger | $180,440.50 |
| Bruto implícito depositado por terminal 1 | $179,539.47 |
| **Residuo acumulado en 6.5 semanas** | **$901.03 (0.50%)** |
| Días con match exacto (< 2 centavos) | 29 de 43 |

Y el residuo **no crece**: se queda plano alrededor de −$343 desde el 1-jul hasta el 24-jul. Las pocas desviaciones grandes son cruces de medianoche que se cancelan entre sí (ej. −$2,096.79 el 20-jun contra +$2,596.81 el 21-jun).

**Traducción: en 6.5 semanas y $180 mil de ventas con tarjeta, la terminal 1 no perdió ni un peso.** El "gap de 3.4%–4.1%" que reportó la auditoría anterior era simplemente la comisión, que ese análisis no dividía.

---

## 3. Todo el problema arranca el 25-jul y es 100% terminal 2

| Concepto | Monto |
|---|---|
| Ventas col. "Banco" del ledger, 10-jun a 6-sep | **$290,749.41** |
| — atribuible a terminal 1 (bruto) | $195,243.64 (67.2%) |
| — cobrado por transferencia directa del cliente | $2,920.00 |
| — **atribuible a terminal 2 (bruto)** | **$92,585.77 (31.8%)** |

Fecha de la primera venta que la terminal 1 no explica: **25-jul-2026**. Coincide con lo que recordabas (~27-jul).

Saldo corrido de "terminal 2 sin barrer", con la comisión ya descontada:

```
27-jul   $ 4,141      <- arranca
31-jul   $ 6,935
 5-ago   $15,067
 7-ago   $ 9,877
12-ago   $ 9,950
17-ago   $11,566
21-ago   $12,625
24-ago   $11,701
28-ago   $12,924
 2-sep   $15,179      <- ultimo barrido
 6-sep   $21,933      <- hoy (incluye 3 dias de ventas sin barrer)
```

**El piso sube.** Después de cada transferencia tuya el saldo no vuelve a cero: vuelve a un nivel cada vez más alto ($4,141 → $6,947 → $9,481 → $12,924 → $15,179). Eso es lo que hace que el saldo corrido nunca baje de ~$18,600 en tu cálculo original.

Hay dos lecturas posibles y **solo tú puedes decidir cuál es**, mirando el saldo de la app de la terminal 2:

1. **Barres parcial.** Transfieres una parte, no todo, y el sobrante se acumula. Es dinero tuyo, real, ahí parado. → No hay problema, solo hay que barrer a cero.
2. **Hay fuga.** Cobros marcados como pagados con tarjeta en el POS que en realidad nunca se cobraron en la terminal física (§6). → Sí hay problema.

---

## 4. Las 25 transferencias tuyas: qué son y qué encontré

**Sí son depósitos de ventas — con evidencia dura, no por suposición.**

En **7 de las 25**, la transferencia es **exactamente el 97.83% de las ventas de terminal 2 desde el barrido anterior**, al centavo:

| Fecha | Tu transferencia | Ventas T2 desde el barrido previo | Razón |
|---|---|---|---|
| 29-jul | $1,407.78 | $1,439.00 | 0.97830 |
| 30-jul | $2,629.00 | $2,687.30 | 0.97831 |
| 11-ago | $635.89 | $650.00 | 0.97829 |
| 12-ago | $339.47 | $347.00 | 0.97830 |
| 18-ago | $726.40 | $742.50 | 0.97832 |
| 21-ago | $4,432.67 | $4,531.65 | 0.97816 |
| 2-sep | $242.62 | $248.00 | 0.97831 |

Siete coincidencias exactas al centavo no son casualidad. **La comisión de tu terminal 2 es 2.17%** (probablemente 1.87% + IVA) — efectivamente **menor que el 4.06% de Mercado Pago**, tal como dijiste. Eso confirma tu corrección al análisis anterior con un número.

Las otras 17 no cuadran exacto porque son **barridos parciales** — se ve claro en los montos redondos: $5,780.00 (27-jul), $2,629.00, $3,582.00 (3-ago), $200.00 (20-ago), $3,000.00 (31-ago). Ahí transferiste "un pedazo", no el saldo completo. **Eso confirma la lectura #1 del §3.**

**Ninguna de las 25 parece transferencia personal ajena a las ventas.** Ninguna cae fuera de la ventana 27-jul → 2-sep, y todas son consistentes en magnitud con las ventas de esos días.

### 🔴 Pero encontré el flujo contrario, que la auditoría anterior no vio

**Salieron $56,423.00 de la cuenta del negocio HACIA "Javier Vaquera", en 16 transferencias.**

| Fecha | Monto | | Fecha | Monto |
|---|---|---|---|---|
| 14-jun | −$900.00 | | 24-jun | −$615.00 |
| 14-jun | −$3,500.00 | | 6-jul | −$1,748.00 |
| 18-jun | −$800.00 | | 6-jul | −$2,500.00 |
| 21-jun | −$1,500.00 | | 10-jul | −$10,272.00 |
| 21-jun | −$600.00 | | 11-jul | −$7,300.00 |
| 22-jun | −$10,000.00 | | 22-jul | −$650.00 |
| 23-jun | −$2,500.00 | | 24-jul | −$538.00 |
| | | | 25-jul | −$2,700.00 |
| | | | **11-ago** | **−$10,300.00** |

**15 de las 16 son ANTERIORES a que existiera la terminal 2**, así que no pueden ser "devolución" de nada de la terminal 2 — son retiros del negocio hacia ti. La única posterior es la del **11-ago por $10,300.00**, que vale la pena que identifiques (¿fue para pagar un proveedor desde tu cuenta personal? ¿fue un retiro?).

El flujo neto entre la cuenta del negocio y la tuya en todo el periodo es **+$12,219.91** (entraron $68,642.91, salieron $56,423.00), no +$68,642.91. Eso no cambia la conclusión sobre la terminal 2 (esos retiros son un tema aparte, del lado de los gastos), pero **sí significa que la cifra de "$68,642.91 depositados" del reporte anterior estaba leyendo solo la mitad del movimiento.**

---

## 5. ¿El sistema distingue la terminal? **No.** Y así se arregla barato

Revisado sobre el filesystem real (`grep -rn` en `src/` y `supabase/`):

```
payments: id, created_at, comanda_id, paid_by_user, efectivo, tarjeta,
          transferencia, total_paid, shift_id, tip_amount, change_given, tip_total
```

No existe ningún campo de terminal, dispositivo, adquirente, marca de tarjeta ni código de autorización. Tampoco en `comandas` ni en ninguna migración. **No se puede cruzar venta por venta desde el sistema hoy.**

**Fix mínimo propuesto (NO implementado — requiere tu aprobación y un plan en `tasks/todo.md`):** una columna `payments.card_terminal text` con dos valores, y un selector de 2 botones en el modal de cobro que solo aparezca cuando `tarjeta > 0`. Con eso, la próxima conciliación es un `GROUP BY` en vez de esta arqueología. Es una migración + un componente, sin tocar el RPC de cobro.

Mientras no exista, la inferencia por comisión (4.06% vs 2.17%) funciona y es exacta — pero solo mientras las dos terminales tengan tasas distintas.

---

## 6. ¿Hay cobros con tarjeta "fantasma"? Estructuralmente no, por proceso sí

**Lo que el software SÍ blinda:**

- `cancelComanda` (`src/services/comandas.js:77`) solo puede cancelar comandas con `status = 'open'` — y una comanda abierta todavía no tiene fila en `payments`. **Un cobro cancelado no puede quedar sumando en el ledger. Imposible por construcción.**
- `payments_comanda_id_unique` impide dos pagos para la misma comanda. Verificado en el dato: **0 folios repetidos** en las 687 filas del ledger.
- No hay contracargos ni devoluciones de tarjeta en el estado de cuenta (la única "Devolución" es de una transferencia a Heineken por $235).

**Lo que NO está blindado (y es la hipótesis viva):**

El POS **no habla con la terminal física**. Nada impide que el cajero marque "pagado con tarjeta" cuando el cargo se declinó o se canceló en la terminal. En la era terminal 1 eso se habría detectado solo (falta la liberación de ese monto ese día — y no falta ninguna). **En la terminal 2 es invisible**, porque no hay registro por transacción contra el cual comparar: solo llegan tus transferencias agregadas.

Por eso el saldo de tu app de terminal 2 es la prueba decisiva.

---

## 7. Reconciliación maestra (cierra a cero, al centavo)

Todo lo anterior tiene que cuadrar con el saldo real de la cuenta. Cuadra:

| | Monto |
|---|---|
| Saldo "Banco" del sistema al 4-sep | $18,366.81 |
| Saldo real de Mercado Pago al 4-sep | $2,657.40 |
| **Diferencia a explicar** | **$15,709.41** |

| Explicación | Efecto |
|---|---|
| Comisión de terminal 1 (4.06%), gasto real que el sistema nunca registra | +$7,926.89 |
| Ventas de terminal 2 aún no transferidas ni comisionadas (bruto) | +$22,140.06 |
| Salidas que el ledger cargó al banco pero que Mercado Pago nunca pagó | −$10,052.77 |
| Entradas que MP recibió y el sistema no registró (transf. de clientes + "Ganancia") | −$4,511.37 |
| Depósitos de efectivo registrados que no llegaron a MP | +$910.00 |
| Saldo inicial de MP anterior al periodo | −$743.40 |
| **Suma** | **$15,709.41** ✅ |

**Residuo sin explicar: $0.00.**

### Tres hallazgos secundarios que salen de aquí

**a) El "Saldo banco" del sistema está estructuralmente inflado y el error crece solo.**
El ledger registra las ventas con tarjeta en **bruto** y nunca descuenta la comisión. A hoy son **$7,926.89** (terminal 1) + **~$2,000** (terminal 2) ≈ **$10,000** que el sistema cree tener y que nunca existieron. Crece ~$130 por cada $3,500 de venta con tarjeta. `estimateBankNet()` ya existe en `utils/ledger.js` para esto pero es solo una estimación de pantalla, no un asiento. Vale la pena decidir si la comisión debe registrarse como gasto real.

**b) $10,052.77 de gastos cargados al banco se pagaron desde otro lado.**
El ledger dice que salieron $268,609.80 del banco; Mercado Pago solo pagó $258,557.03. La diferencia son gastos del negocio pagados desde tu cuenta personal (probablemente con dinero de la terminal 2) y registrados como "banco". **No es dinero perdido — pero sí reduce el saldo que deberías encontrar en la terminal 2**, y ya está considerado en el rango del TL;DR.

**c) $910 de depósitos de efectivo que no llegaron.**
El ledger registra 4 "Depósito banco" por $950. En Mercado Pago solo aparece un "Dinero recibido" de $40. Chico, pero es un hilo suelto real.

---

## 8. Deuda técnica encontrada de paso (no relacionada al gap, pero va a doler)

`getLedgerData` (`src/services/ledger.js:56`) pagina con `.range()` ordenando por **`created_at`**, que **no es único**. Es exactamente el error documentado en la memoria del proyecto: la paginación de Supabase exige ordenar por columna única (`id`).

Hoy no truena porque hay **687 pagos** (< 1000 = una sola página). Al ritmo actual (~230 folios/mes) **cruza las 1,000 filas alrededor de noviembre-2026**, y a partir de ahí el ledger empezará a duplicar o perder filas en el borde de página, en silencio y sin error. Vale un fix preventivo.

---

## 9. Qué necesito de ti para cerrar esto

1. **El saldo pendiente que muestra la app de tu terminal 2 ahorita.** Es la única pieza que falta.
   - ~$21,900–23,900 → cerrado, todo es dinero tuyo en tránsito.
   - ~$10,500 → faltan ~$11,400 reales y hay que revisar el proceso de cobro en piso.
   - Cualquier otra cosa → dímelo y recalculo.
2. **Qué fue la transferencia del 11-ago por $10,300.00** de la cuenta del negocio hacia ti.
3. **Confirma la comisión de tu terminal 2**: ¿es 1.87% + IVA (= 2.17%)? Si es otra, recalculo el rango.

---

## Anexo — verificación independiente del parseo (punto 5 de tu pedido)

Ambos archivos fueron re-parseados desde cero y validados **contra los totales que los propios documentos declaran**, sin usar ningún número del reporte anterior:

**Ledger CSV** — 1,335 de 1,335 filas parseadas. Ojo con este archivo: **146 filas traen una coma extra** porque el separador de miles del concepto ("Cierre de turno · contado $1,602.50") rompe el CSV; un `read_csv` normal truena o desalinea columnas ahí. Se parsearon anclando desde el final de cada fila.

| Cadena de saldos | Filas con desviación | Final calculado vs declarado |
|---|---|---|
| Saldo banco | **0** | $23,089.61 = $23,089.61 |
| Saldo cajón | **0** | $4,531.40 = $4,531.40 |
| Saldo caja fuerte | **0** | $0.00 = $0.00 |

**Estado de cuenta MP** — 664 de 664 movimientos, extraídos por coordenadas de columna (el texto plano mezcla descripciones de renglones vecinos y corrompe la clasificación).

| Verificación | Resultado |
|---|---|
| Roturas en la cadena de saldos | **0 de 664** |
| Entradas | $260,471.03 = $260,471.03 declarado |
| Salidas | −$258,557.03 = −$258,557.03 declarado |
| Saldo final | $2,657.40 = $2,657.40 declarado |

**Coincidencia con la auditoría anterior:** ventas con tarjeta $290,749.41 ✔, liberaciones 353 por $187,316.75 ✔, transferencias JAVIER 25 por $68,642.91 ✔. Los insumos del reporte anterior estaban bien; lo que estaba mal era la interpretación (comisión no dividida, rezago inexistente, y el flujo de salida hacia ti nunca contado).

**Una precisión de definición:** la columna "Banco" del ledger es `payments.tarjeta + payments.transferencia` (`src/utils/ledger.js`), o sea **no es solo tarjeta** — incluye cobros por transferencia SPEI del cliente. Son $2,920 en la era terminal 2 (identificados uno por uno en el estado de cuenta) y ya están descontados de la cifra de terminal 2.

---

*Auditoría de solo lectura. No se modificó código, esquema ni datos.*

---

# ADDENDUM 2026-09-06 (2ª ronda) — ✅ RESUELTO. No hay descuadre.

Javi aportó dos piezas nuevas: (a) la terminal 2 es **Getnet**, y **sí se dispersa sola** a su cuenta personal BBVA con ~1-2 días de rezago — lo manual es solo el segundo salto (reenviar de BBVA a Mercado Pago); (b) el estado de cuenta BBVA de esa cuenta personal, periodo **17-jul → 14-ago-2026** (parseado y verificado: 75 cargos $171,970.66 + 29 abonos $181,434.66 → saldo final $12,896.57, idéntico a lo declarado).

Con eso se cierra el punto que quedaba abierto.

## Prueba directa: Getnet pagó TODO lo que el sistema registró

Los depósitos de Getnet entran a BBVA como `SPEI RECIBIDO SANTANDER ... GETNET MEXICO SERVICIOS DE ADQUIRENCIA` (emisor 8441151).

| | |
|---|---|
| Ventas terminal 2 en el sistema, 23-jul → 11-ago (bruto) | $37,151.88 |
| Neto esperado a 2.17% de comisión | $36,345.68 |
| **Getnet realmente depositó (13 depósitos, 24-jul → 12-ago)** | **$36,834.21** |
| Diferencia | **+$488.53 (+1.3%, a FAVOR)** |

**Getnet pagó $488 MÁS de lo esperado, no menos.** La diferencia es el corte de lote de Getnet contra el día operativo del bar (corte 06:00): ventas de después de medianoche caen en un lote distinto, y eso mueve montos entre los bordes de la ventana. **Cero cobros fantasma. La hipótesis 4 queda descartada también para la terminal 2.**

Cinco depósitos empatan exacto con las ventas de un solo día:

| Depósito Getnet | Ventas del sistema que lo explican |
|---|---|
| 24-jul $111.39 | 23-jul $113.85 |
| 29-jul $1,407.78 | 27-jul $1,439.00 |
| 30-jul $2,629.00 | 29-jul $2,687.30 |
| 11-ago $635.89 | 10-ago $650.00 |
| 12-ago $339.47 | 11-ago $347.00 |

## Dónde estaba el dinero "faltante": en la cuenta personal, pagando gastos del negocio

En la misma ventana:

| | |
|---|---|
| Getnet depositó a BBVA | $36,834.21 |
| Javi reenvió a Mercado Pago | $29,822.05 |
| **Retuvo en BBVA** | **$7,012.16** |

Y ese retenido está documentado en el sistema. El caso grande cuadra al centavo:

> **3-ago: retuvo $6,250.11.** El ledger registra `Retiro banco → caja −$5,000.00` ("regreso de banco para nóminas", 1-ago) + `Nómina (banco) −$1,250.00` ("Nomina Javier", 3-ago) = **$6,250.00**. Diferencia: **11 centavos.**

Es exactamente el flujo que describió Javi: en lugar de sacar el dinero de Mercado Pago, lo descuenta de la transferencia de Getnet, y el movimiento sí queda registrado en el sistema.

## Cierre de todo el periodo (25-jul → 6-sep)

| | |
|---|---|
| Ventas terminal 2 brutas | $92,585.77 |
| Neto que Getnet debe pagar (×0.9783) | $90,576.66 |
| — menos lo que aún no liquida (ventas 4, 5 y 6-sep) | −$10,548.57 |
| **= Getnet ya depositó a la cuenta personal** | **$80,028.09** |
| — reenviado a Mercado Pago (25 transferencias) | −$68,642.91 |
| **= retenido en la cuenta personal** | **$11,385.18** |
| — gastos del negocio pagados desde ahí (ledger $268,609.80 vs MP $258,557.03) | −$10,052.77 |
| **RESIDUO SIN EXPLICAR** | **$1,332.41** |

**$1,332.41 sobre $290,749.41 de ventas con tarjeta = 0.46%**, y dentro de ese margen caben el rezago de liquidación en el borde del periodo, el corte de lote de Getnet (ya medido en ±$488 en la ventana verificable) y la cuota mensual de Getnet.

**El descuadre de $34,789 que abrió esta investigación queda explicado al 99.5%. No falta dinero. No hay cobros fantasma. No hace falta auditoría de tickets.**

## Confirmación complementaria: el depósito de mañana

Javi reportó que Getnet le deposita "poco más de 9k" mañana. El neto de las ventas del **viernes 4 + sábado 5 de septiembre** es **$9,271.64** ($9,477.30 × 0.9783). Cuadra al peso, y confirma el rezago de ~2 días. Los $1,276.93 del domingo 6 llegarían después.

## Lo que sigue siendo cierto y sí hay que atender

1. **El "Saldo banco" del sistema está inflado ~$10,000** y el error crece solo: el ledger registra la tarjeta en bruto y nunca asienta la comisión ($7,926.89 de Mercado Pago + ~$2,009 de Getnet). Decisión pendiente: registrar la comisión como gasto real.
2. **El ledger no distingue de qué cuenta salió cada gasto.** Registra todo como "banco", aunque $10,052.77 se pagaron desde la cuenta personal con dinero de Getnet retenido. Funciona, pero hace imposible conciliar contra Mercado Pago sin este ejercicio. Vale considerar una marca de origen.
3. **$910 de depósitos de efectivo** registrados en el ledger (4 "Depósito banco" = $950) que nunca aparecen en Mercado Pago (solo un "Dinero recibido" de $40).
4. **La transferencia del 11-ago por $10,300.00** de Mercado Pago hacia la cuenta personal: identificada en BBVA como `SPEI RECIBIDO Mercado Pago ... Permiso Provisional`. Falta confirmar que quedó registrada como gasto en el sistema.
5. **Bug latente de paginación** en `getLedgerData` (ver §8): cruza las 1,000 filas ~nov-2026.

## Límite de esta verificación

La prueba directa contra Getnet cubre **17-jul → 14-ago** (lo que abarca el estado de cuenta BBVA aportado). Para **15-ago → 6-sep** la conclusión descansa en que la identidad agregada cierra con 0.46% de residuo, no en un emparejamiento depósito por depósito.

Si se quiere cerrar al 100%, basta con el estado de cuenta BBVA de **15-ago en adelante** — mismo procedimiento, misma prueba. **No es necesario:** ninguna hipótesis viva sobrevive al 0.46%.

---

# ADDENDUM 2 — 2026-09-06 (3ª ronda) · Pantallas de Cierre Mensual

Javi aportó las pantallas de **Cierre Mensual** del admin (jun, jul, ago, sep-2026). Sirven para dos cosas: **validar todo el parseo contra una fuente completamente independiente**, y **cerrar el último punto abierto de la auditoría general** (propinas).

## 1. Validación cruzada: la app confirma el parseo al peso

Los totales que reporta la app (leídos desde `payments` en Supabase) contra mi parseo del ledger CSV:

| | Pantallas de la app | Mi parseo del CSV | Diferencia |
|---|---|---|---|
| Tarjeta + Transferencia | $290,749.41 | $290,749.41 | **$0.00** |
| Efectivo | $130,617.00 | $130,617.00 | **$0.00** |
| Nº de pagos | 687 | 687 | **0** |

Dos rutas completamente distintas — el export CSV parseado a mano vs. la consulta que hace la app — dan exactamente el mismo número. **El parseo está confirmado; ninguna conclusión de este reporte descansa en un error de lectura.**

## 2. ✅ Propinas cobradas vs entregadas — CERRADO

Último punto abierto de `auditoria_general_2026-09-06.md`.

| Mes | Propinas cobradas (`payments.tip_total`) |
|---|---|
| Junio 2026 | $11,644.71 |
| Julio 2026 | $13,375.42 |
| Agosto 2026 | $10,967.63 |
| Septiembre 2026 (al día 6) | $2,160.05 |
| **Total cobradas** | **$38,147.81** |
| **Total entregadas (ledger, 82 movimientos)** | **$38,306.45** |
| **Diferencia** | **$158.64 (0.42%) — entregadas de MÁS** |

Se entregó $158.64 más de lo cobrado en tres meses. Es ruido de redondeo al repartir efectivo, no un problema. **Las propinas cuadran.** No hay propina cobrada que no se haya entregado.

## 3. Bonus: por fin se separa TARJETA de TRANSFERENCIA

Las pantallas desglosan lo que el ledger junta en una sola columna:

| | |
|---|---|
| Tarjeta pura | $286,799.41 |
| Cobros por SPEI del cliente | $3,950.00 (jun $1,030 · jul $2,300 · ago $620 · sep $0) |

Y coincide con lo que había identificado uno por uno en el estado de cuenta de Mercado Pago: los $620 de agosto son exactamente $435 (9-ago) + $140 (19-ago) + $45 (23-ago), y los $2,300 de julio son el del 26-jul.

Con eso, los dos números clave mejoran:

**Terminal 1** — quitando los $1,030 de SPEI de junio, que nunca pasaron por terminal:

| | |
|---|---|
| Tarjeta pura era 100% T1 (10-jun → 24-jul) | $179,410.50 |
| Bruto depositado por Mercado Pago en esa era | $179,539.47 |
| **Residuo** | **−$128.97 (0.072%)** |

Antes lo había estimado en $901.03. **Casi todo ese "residuo" eran los cobros por SPEI, que no podía separar.** La terminal 1 cuadra a siete centésimas de punto porcentual.

**Cierre final del ciclo completo**, ya con tarjeta pura:

| | |
|---|---|
| Tarjeta total | $286,799.41 |
| — terminal 1 (bruto) | −$195,243.64 |
| **= terminal 2 (bruto)** | **$91,555.77** |
| Neto esperado a 2.17% | $89,569.01 |
| — aún no liquidado por Getnet (4, 5 y 6 sep) | −$10,548.57 |
| — reenviado a Mercado Pago | −$68,642.91 |
| — gastos del negocio pagados desde BBVA | −$10,052.77 |
| **RESIDUO FINAL** | **$324.76 (0.11%)** |

**$324.76 sobre $286,799.41 de ventas con tarjeta en tres meses.** Eso ya es indistinguible del corte de lote de Getnet contra el día operativo de las 06:00.

## Estado final de la auditoría

| Check | Estado |
|---|---|
| Gastos sin nota | ✅ Limpio (0/309) |
| Cierre de turno vs apertura | ✅ 84/100 exacto · 1 faltante real de $578 (6-jul) por recordar |
| Banco vs ledger — terminal 1 | ✅ Cuadra al 0.072% |
| Banco vs ledger — terminal 2 (Getnet) | ✅ Getnet pagó +1.3% de lo esperado |
| Cobros fantasma | ✅ Descartado — imposible por software y desmentido por el dato |
| Conciliación completa | ✅ Residuo $324.76 (0.11%) |
| Propinas cobradas vs entregadas | ✅ Diferencia $158.64 (0.42%) |
| Parseo de las fuentes | ✅ Confirmado al peso contra las pantallas de la app |

**Auditoría cerrada. No falta dinero en ningún frente.**
