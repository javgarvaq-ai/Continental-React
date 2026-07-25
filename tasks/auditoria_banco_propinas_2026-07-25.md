# Auditoría Banco + Propinas — junio y julio 2026

**Fecha:** 2026-07-25
**Alcance:** Solo lectura. Cruce del estado de cuenta real de Mercado Pago (1-jun a 24-jul) contra el Ledger del sistema (10-jun a 25-jul) y contra `payments`/`cash_movements`/`shifts` de Supabase. **No se modificó código ni datos** (las correcciones de captura las hizo Javi directo en el admin durante la sesión).
**Fuentes:** estado de cuenta MP de junio (PDF, 247 movimientos) y de julio (xlsx, 230 movimientos), `ledger_2026-06-01_2026-07-25.csv`, y los bloques de `tasks/verificacion_banco_propinas_2026-07-25.sql`.

---

## TL;DR — no falta dinero

Después de cruzar los dos meses completos, **todo cuadra**. Los números:

| Concepto | Resultado |
|---|---|
| **Ventas con tarjeta** — ¿llegó a MP todo lo marcado como banco en el POS? | ✅ Sí. Comisión implícita **4.13%** vs 4.06% esperada de MP Point |
| **Salidas del banco** — ¿salió dinero sin registrarse? | ✅ Diferencia neta **$452.04** sobre $149,409.45 (0.3%) |
| **Propinas** | ✅ **$57.03** de diferencia sobre $11,001.42 cobradas (0.5%) |
| **Nómina** | ✅ Sin pagos duplicados |

El síntoma que originó la auditoría (el Ledger mostraba ~$1,567 más que el banco real, cuando lo normal son ~$200) **no era dinero faltante**: eran ventas de tarjeta del 24 y 25 de julio que todavía no se liberaban al momento de la revisión. Ver sección 4.

---

## 1. Ventas con tarjeta — confirmado limpio

La pregunta de fondo era: ¿las comandas marcadas como "banco" en el POS realmente corresponden a dinero que entró a Mercado Pago?

| | Monto |
|---|---|
| Ventas registradas como banco en el sistema, jun 1 – jul 24 (bruto) | $180,440.50 |
| Liberaciones realmente recibidas en Mercado Pago | $172,993.56 |
| **Comisión implícita** | **4.13%** |
| Comisión esperada MP Point (3.5% + 16% IVA) | 4.06% |

La diferencia de 0.07% (~$126 sobre $180 mil) se explica sola con las ventas del 24-jul aún no liberadas al corte. **Ninguna venta se perdió, ninguna comanda quedó mal marcada, y MP no está cobrando de más.** La constante `CARD_COMMISSION_RATE` de `utils/ledger.js` está bien calibrada.

Dato colateral: `payments.transferencia` está en **$0 todo el periodo** — el 100% de lo que el Ledger llama "Banco" en folios es tarjeta.

---

## 2. Salidas del banco — cuadran dentro de $452

| | Monto |
|---|---|
| Banco real descontó (1-jun a 24-jul, excluyendo una transferencia revertida el mismo día) | $149,409.45 |
| Sistema registró como salida de banco (incluyendo capturas hechas el 25-jul que corresponden a movimientos de días previos) | $149,861.49 |
| **Diferencia neta** | **$452.04** |

Ese residuo se compone de erratas de captura menores ya identificadas (ver sección 3) y de la cuenta abierta con Liz. No hay ninguna salida de banco sin explicación.

### 2.1 Los tres patrones que hacían parecer que no cuadraba

**a) Heineken se paga en 2+ transferencias reales, el sistema captura una sola.** El banco descuenta por separado a "Cerveza Heineken"/"Heineken Cerveza" y a "Heineken Logistica"; el POS registra un solo movimiento con el total. Ocurre en el 100% de los pagos de Heineken de ambos meses. Ejemplos: 03-jul $2,760.01 = $2,384.01 + $376.00; 14-jul $3,186.12 = seis transferencias; 30-jun $3,571.88 = $2,960.88 + $611.00.

**b) "Eduardo Ibarra" en el banco = "Negro" en las notas del sistema.** Es el socio encargado de compras. El banco muestra una transferencia consolidada a su nombre; el POS captura los renglones individuales de lo que compró. Ejemplos:

| Banco | Sistema (mismo día) |
|---|---|
| Ibarra $580.00 (17-jun) | Cacahuates $210 + Topo Chico $370 |
| Ibarra $616.90 (18-jun) | desechables y botana negro $262.90 + cubetas walmart negro $354 |
| Ibarra $2,176.73 (19-jun) | Pago negro Torres V… $1,176.73 + Centenario y Bacardi negro $1,000 |
| Ibarra $1,274.00 (21-jun) | Centenario Plata Negro HEB $510 + Bacardi y Torres V Negro Sams $764 |
| Ibarra $2,983.00 (25-jun) | botellas buchanans 12 negro $1,228 + vinos robert… $1,755 |

**c) Transferencias a "Javier Vaquera" = fondeo para pagar en efectivo.** MP no tiene cajeros, así que Javi se transfiere a su cuenta personal para retirar y pagar. Cada una corresponde a gastos ya capturados:

| Banco | Sistema |
|---|---|
| $2,500 (06-jul) | Nómina Javier $1,500 + Comida Liz anticipo $1,000 |
| $1,748 (06-jul) | Pago Peñafiel $1,248 + Pago Peñafiel $500 |
| $10,272 (10-jul) | Renta "Permiso provisional Julio" $10,300 (dif. $28, comisión de retiro) |
| $7,300 (11-jul) | Nómina Gus $2,110 + Memo $3,600 + Alexis $500 + Javier $1,000 (dif. ~$90) |

**d) Captura tardía (hasta 13 días).** Muchos gastos se capturan en lote días después. El 22-jul entre 9:39–9:49am se capturaron pagos reales del 16, 18 y 19 de julio. Gastos del 30-jun se capturaron el 1-jul. Esto no afecta el dinero, pero sí hace que el Ledger se vea descuadrado en cortes cortos.

---

## 3. Correcciones de captura hechas durante esta auditoría

| Fecha real | Concepto | Monto | Estado |
|---|---|---|---|
| 13-jul | Vinos Robert (48 cocas) | $570.00 | ✅ Capturado. Estaba mal como "coca cola regular de vidrio 48 $540" el 14-jul — error de dedo en monto y fecha |
| 22-jul | Super avenida abarr (limones y tortillas) | $72.62 | ✅ Capturado como gasto operativo (banco) |
| 05-jul | Adelanto comida Liz | $399.00 | Pendiente de capturar como Pago proveedor (banco) |
| 18-jul | Adelanto comida Liz | $380.00 | Pendiente de capturar como Pago proveedor (banco) |

**Nota sobre Liz:** se le transfiere para comida pero también se le adelanta/presta, y se le va descontando. Por eso los montos no cuadran 1 a 1 mes con mes. En el periodo auditado: sistema registró $2,660 bajo notas "Comida Liz", banco muestra $1,399 a "Lizeth Perez" + $380 a "Lizeth Rodriguez". El remanente queda como cuenta abierta — **no es un descuadre del negocio, pero no hay registro formal del saldo prestado.** Ver recomendación en sección 5.

---

## 4. Por qué el Ledger mostraba $1,567 de más

Al momento de la revisión el Ledger mostraba Banco $16,040.33, con "Real estimado (− comisión MP)" de $8,647.64, contra un disponible real en Mercado Pago de ~$7,080.58.

Descomposición de los ~$8,960 de diferencia bruta:

- **~$7,393** — comisión de tarjeta acumulada (el sistema cuenta la venta bruta; MP libera neto). Es justo lo que la app ya estima y resta.
- **~$2,000** — ventas de tarjeta del 24 y 25 de julio **aún no liberadas** al momento de la captura.
- **−$452** — el residuo de la sección 2.

Lo normal es ver ~$200 a favor del banco; ese día se vio $1,567 al revés porque la revisión se hizo un sábado a media tarde, después de dos noches fuertes, con más ventas pendientes de liberar de lo habitual. **Conforme se liberen esos pagos, el estimado converge solo.**

---

## 5. Propinas y nómina

**Propinas:** $11,001.42 cobradas por el sistema vs $11,058.45 entregadas en efectivo — **$57.03 de diferencia en todo julio (0.5%)**. Los saltos grandes turno a turno (+$800 el 4-jul, −$630 el 6-jul) son pagos de propina retrasados 1-2 turnos, documentados con nota, que se cancelan solos en 3 días. El −$77 del 21-jul es la contraparte exacta del +$77 de sobrante físico de ese turno.

**Nómina:** la secuencia del 24/25-jul (nomina_caja −$538 → ajuste_ingreso +$538 → nomina_banco −$538) es una **corrección bien hecha**, no un pago duplicado. Neto: $538 pagados una sola vez. No se cruzó contra `payroll_records` (esa consulta no se corrió).

---

## 6. Recomendaciones

Ninguna es urgente — el dinero está bien. Son de trazabilidad:

1. **Capturar Heineken en 2 renglones** (cervecera + logística) en vez de uno consolidado. Hoy es imposible auditar Heineken transferencia por transferencia.
2. **Usar el nombre real del proveedor en la nota**, o al menos incluirlo junto al apodo ("Negro / Eduardo Ibarra"). Buscar "Ibarra" en el sistema no encuentra nada, y eso costó tiempo en esta auditoría.
3. **Capturar el mismo día** cuando se pueda. La captura en lote hace que el Ledger se vea descuadrado en cortes cortos aunque a fin de mes cuadre.
4. **Revisar la nota del 07-jul**: dice "cerveza bohemia obscura" pero el dinero fue a cuentas de Heineken.
5. **Considerar registrar el saldo de adelantos a Liz** en algún lado. Hoy los adelantos se capturan como gasto de proveedor, lo que infla el costo de comida del mes aunque sea dinero que se va descontando. No amerita cambio de código por ahora; basta con llevar el saldo aparte.

---

## Notas técnicas

- El archivo de julio venía con extensión `.csv` pero era un `.xlsx` (ZIP/Office), con campos separados por `;` y números con coma de miles. Se reconstruyó con `openpyxl` y se verificó contra el resumen del propio archivo (`INITIAL + CREDITS + DEBITS = FINAL`, exacto al centavo).
- El de junio venía en PDF (17 páginas). Se transcribieron los 247 movimientos y se validó el saldo corrido línea por línea: **0 errores**, cierre exacto en $25,564.52.
- **Lección de método (ver `tasks/lessons.md`):** el primer intento de reconciliación reportó ~$6,284 faltantes. Era falso. Dos errores: (a) comparar junio-contra-junio cuando los gastos de fin de mes se capturan en el mes siguiente, y (b) un matcher que no probaba el patrón "una transferencia del banco = varios renglones del sistema". Para reconciliar hay que probar **ambas direcciones** de agregación y usar ventana de fechas amplia, y siempre validar contra el agregado antes de reportar un faltante.
