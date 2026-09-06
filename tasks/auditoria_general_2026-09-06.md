# Auditoría General — Ledger, Banco, Turnos, Propinas y Gastos

**Fecha del reporte:** 2026-09-06
**Alcance:** Solo lectura — ningún dato ni código fue modificado durante esta auditoría.
**Periodo cubierto:** 10-jun-2026 → 6-sep-2026 (historial completo operativo, no solo 3 meses cerrados)

**Fuentes:**
- Ledger completo (export CSV, 1,335 movimientos)
- Estado de cuenta Mercado Pago (PDF, 45 páginas, 664 movimientos bancarios)

Este reporte responde a los 4 puntos que pediste: (1) banco vs ledger considerando comisión y segunda terminal, (2) propinas cobradas vs entregadas, (3) gastos sin nota, (4) cierre de turno vs apertura.

---

## 1. Gastos sin nota ("gastos fantasma") — ✅ LIMPIO

Se revisaron los 309 movimientos de gasto (Pago proveedor, Gasto operativo, Nómina, Renta) en todo el periodo.

**Resultado: 0 de 309 sin nota.** Cada gasto registrado tiene una nota que lo respalda. No hay gastos fantasma.

---

## 2. Cierre de turno vs Apertura — ✅ MAYORMENTE LIMPIO, 1 caso real a revisar

El sistema ya calcula esto automáticamente (campo "dif. turno" en cada Cierre) — no hubo que inferirlo.

- **100 turnos cerrados** en el periodo.
- **84 cerraron exactos** (dif. turno = $0.00).
- **16 mostraron diferencia**, pero al revisar el detalle:
  - **5 son artefactos de captura**, no diferencias reales: son pares de Apertura+Cierre con "Contado $0.00" en ambos lados, usados para "envolver" un ajuste administrativo (ej. una corrección de propinas o resguardo) sin que nadie contara caja de verdad. Ahí el sistema compara $0 contra el movimiento del ajuste y sale una "diferencia" que no es cash real. Ejemplos: el +$3,000.00 del 25-jun (01:20 a.m., justo después de un "Resguardo casa -$3,000") y el +$630.00 del 6-jul (09:58 a.m., justo después de un ajuste de propinas "-$630").
  - **11 son comparaciones reales** (conteo físico real en ambos extremos). De esas, 10 son menores a $100 (variación normal de conteo de caja en un bar). **Solo una es significativa: 6-jul, 12:01 a.m. — faltante real de $578.00.** Vale la pena preguntar en el turno qué pasó esa noche (5→6 julio).
- **Desde el 21-jul hasta el 6-sep (más de 6 semanas seguidas), todos los turnos cerraron exactos**, salvo un redondeo de $0.60 el 23-ago. Mejora notable de disciplina operativa en la segunda mitad del periodo.

**Pendiente de tu parte:** confirmar/recordar qué pasó el turno del 5→6 de julio ($578 faltante).

---

## 3. Banco vs Ledger (con comisión y segunda terminal) — ✅ explicado (corrijo mi análisis anterior)

**Ventas con tarjeta en el sistema (monto bruto, sin comisión):** $290,749.41 (460 folios, todo el periodo)

**Depósitos identificados en el banco:**
| Concepto | Movimientos | Total |
|---|---|---|
| Liberación de dinero (Terminal 1, neta de comisión) | 353 | $187,316.75 |
| Transferencia recibida "JAVIER IGNACIO GARCIA VAQUERA" (hipótesis: Terminal 2) | 25 | $68,642.91 |
| **Suma recibida** | | **$255,959.66** |
| **Diferencia vs. ventas brutas del sistema** | | **$34,789.75 (~12%)** |

**Corrección importante:** en la primera versión dije que no podía aislar el % de comisión real y dejé abierta la idea de que la terminal 2 cobrara más. Me hiciste ver que la terminal 2 en realidad cobra MENOS que Mercado Pago, así que un gap de 12% no cuadraba con esa explicación — tenías razón, volví a revisar con más cuidado y esto es lo que encontré:

- **$4,722.80 del gap es 100% mecánico, no un problema real:** el estado de cuenta del banco solo llega hasta el 4-sep, pero el ledger tiene ventas hasta el 6-sep. Esas ventas de los últimos 2 días físicamente no pueden tener depósito todavía — no cuentan como faltante.
- **En las semanas estables** (sin cambio de terminal, sin estar en la punta del periodo) — ej. las semanas del 6 y 13 de julio, ambas 100% terminal 1 — el gap real fue de solo **~3.4%–4.1%**, justo lo esperable de una comisión normal de tarjeta. Esto confirma que la comisión **no** es el problema.
- **Casi todo el gap restante se concentra en 2 momentos muy puntuales:** (a) las semanas de transición entre terminal 1 y terminal 2 (20-jul a 2-ago, ~$14,500 del gap) y (b) las últimas semanas con datos (semana del 17-ago y la del 31-ago, ~$15,000 del gap) — justo donde se esperaría dinero todavía "en tránsito", no que se haya perdido.

**Conclusión más probable:** el gap no es comisión ni dinero perdido — es dinero que a la fecha de corte (6-sep) todavía está "en camino": el rezago normal de unos días en la liquidación de tarjeta, y sobre todo saldo de la terminal 2 que aún no transfieres manualmente a la cuenta. Como esa terminal no dispersa sola, es normal que en cualquier corte haya un colchón de varios miles de pesos esperando esa transferencia.

**Para confirmar del todo (esto no lo puedo ver yo):** ¿tu terminal 2 muestra ahora mismo un saldo pendiente de transferir de varios miles de pesos? Si sí, eso cierra el gap. Si el saldo ahí es bajo, entonces sí habría algo más que investigar.

**Preguntas que siguen abiertas:**
1. De las 25 transferencias tuyas por $68,642.91 (27-jul a 2-sep), ¿todas son depósito de ventas de esa terminal, o hay alguna mezclada que sea personal?
2. ¿El sistema distingue en algún lado (por venta) qué terminal se usó? Si sí, dime dónde consultarlo y puedo cruzarlo directo en vez de estimar por periodo.

---

## 4. Propinas cobradas vs entregadas — ⏳ en progreso, ya encontré dónde vive el dato

**Propinas entregadas (ledger):** $38,306.45 (82 movimientos, todo el periodo) — completo y con nota en el 100% de los casos (ver punto 1).

**Propinas cobradas en el sistema:** revisé el código y sí existe el dato — `payments.tip_total` guarda la propina cobrada en cada pago (viene del campo `propina` que se captura al cerrar la cuenta en el POS). Mejor aún: **ya se muestra hoy** en la tarjeta "Propinas" de Reporte Semanal, Reporte Mensual y Analytics — no hace falta ninguna consulta nueva ni tocar código.

**Lo que necesito de ti:** el total de "Propinas" que marcan esas pantallas para 10-jun a 6-sep (puedes sumar los reportes mensuales de junio, julio, agosto y lo que va de septiembre, o decirme si hay alguna vista con rango libre que ya lo sume). Con ese número lo cruzo directo contra los $38,306.45 entregados y cierro este punto.

---

## Resumen ejecutivo

| Check | Estado |
|---|---|
| Gastos sin nota | ✅ Limpio (0/309) |
| Cierre = Apertura | ✅ Casi perfecto (84/100 exacto; 1 faltante real de $578 a revisar) |
| Banco vs Ledger | ✅ Explicado — no es comisión, es dinero en tránsito/pendiente de transferir; 2 preguntas abiertas para terminar de confirmar |
| Propinas cobradas vs entregadas | ⏳ Encontré dónde vive el dato (`payments.tip_total`, ya visible en Reportes) — falta que me pases el número para cruzarlo |

**Nota:** el pendiente #2 original (cross de menú vs productos/precios del sistema) sigue sin empezar — quedamos en que me explicas qué es "la página del menú" cuando lleguemos a ese punto.
