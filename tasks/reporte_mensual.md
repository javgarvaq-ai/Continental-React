# Reporte Mensual Continental Bar — Instrucciones

Cuando el usuario diga "haz el reporte mensual de [mes]", lee este archivo completo y pide los datos en el orden exacto que aparece aquí. No empieces a trabajar sin tener todos los archivos necesarios confirmados.

---

## Paso 1 — Datos del ledger (reporte financiero)

Pedir al usuario que exporte desde Supabase el ledger del mes:

```sql
-- Ajustar fechas según el mes a reportar
SELECT *
FROM cash_movements
WHERE created_at >= '2026-MM-01'
  AND created_at < '2026-MM-01' -- primer día del mes siguiente
ORDER BY created_at;
```

Exportar como CSV. El archivo tiene estas columnas:
`Fecha, Concepto, Cajon, Caja fuerte, Banco, Saldo cajon, Saldo caja fuerte, Saldo banco, Nota`

**⚠️ Quirk de parsing:** El campo `Fecha` contiene una coma (ej. `"10 jun, 06:25 p.m."`). El CSV estándar lo parte en dos columnas. Para parsearlo correctamente:
```python
parts = line.split(',')
fecha = parts[0].strip() + ',' + parts[1].strip()
# resto de columnas: parts[2:]
```

**⚠️ Parsing de montos:** Algunas celdas tienen texto mezclado (ej. `"Contado $1,602.50 · dif. turno..."`). Usar:
```python
import re
def parse_amount(s):
    m = re.search(r'-?\d+\.?\d*', str(s).replace(',', ''))
    return float(m.group()) if m else 0.0
```

---

## Paso 2 — Verificaciones antes de calcular

Antes de generar el reporte, revisar con el usuario:

1. **Pagos duplicados de nómina:** Verificar que cada empleado tenga máximo un pago por semana. Si hay dos pagos en la misma semana, confirmar cuál es el correcto antes de seguir.
2. **Movimientos banco→caja el mismo día:** Si hay un "Retiro banco→caja" seguido de un "Nómina banco" por el mismo monto el mismo día, probablemente es un error de captura — confirmar con el usuario.
3. **Semana operacional:** Domingo 06:00 como inicio de semana (horario México -06:00). Fecha UTC en el ledger = fecha local -6h.

---

## Paso 3 — Categorías de gastos

Clasificar las filas del ledger por `Concepto` y `Nota` con estos keywords:

| Categoría | Keywords |
|-----------|----------|
| Nómina | nomina, nómina |
| Renta | renta, arrendamiento |
| Botellas y licores | whisky, tequila, vodka, ron, licor, botella, oviedo |
| Cerveza | cerveza, modelo, corona, pacifico, indio |
| Comida / cocina | comida, liz, cocina, alimentos |
| Refrescos y aguas | refresco, agua, peñafiel, penafiel |
| Botanas y snacks | botana, snack, papas, cacahuate |
| Jugos y concentrados | jugo, concentrado, jarabe, mara |
| Limpieza | limpieza, jabón, cloro, servilleta |
| Desechables | desechable, vaso, popote, cuchara |
| Agua potable | garrafón, garrafon |
| Contador | contador, contabilidad |
| Publicidad | publicidad, facebook, instagram, ads |
| Streaming y digital | netflix, spotify, internet, streaming |
| Recolección de basura | basura, recolección, recoleccion |
| Permiso provisional | permiso, licencia |
| Propinas pagadas | propina |
| Préstamo Juan | prestamo, préstamo, juan |
| Proveedores varios | proveedor, retiro vaquera (error conocido → categorizar aquí) |

**Nota "retiro vaquera":** En jun-jul 2026 hubo un retiro de $1,500 etiquetado como "retiro vaquera" que fue un error de captura de mesero — compra de bar. Categorizar como Proveedores varios.

---

## Paso 4 — Nómina semanal

Desglosar nómina por empleado y semana. Empleados actuales:
- Memo, Gus, Javier, Alexis, Negro (pueden variar)

Semanas: domingo a sábado. S1 = primera semana completa del mes o desde el inicio del periodo.

**Pagos banco de nómina:** En julio 2026 hubo fechas donde Javier retiró efectivo del banco y registró pagos de los 4 empleados como "nómina banco" directamente. Eso es válido — el dinero salió del banco una sola vez. No duplicar.

---

## Paso 5 — Cálculos del reporte

```
Ventas netas = efectivo + banco - comisión terminal (3.5% del banco, estimado)
Ventas sin propinas = ventas netas - propinas recibidas
Gastos operativos = suma de todas las categorías EXCEPTO Préstamo Juan
Utilidad operativa = ventas sin propinas - gastos operativos
Resultado después de deuda = utilidad operativa - préstamo Juan (si hubo pago ese mes)
```

**Propinas — conciliación de timing:**
Las propinas del turno del último día del mes se pagan el día siguiente (ya en el mes siguiente). Ajustar:
```
Propinas económicas del mes = propinas ledger del mes
  - propinas del turno del día 30/31 pagadas el 1 del mes siguiente
  + propinas del turno del último día del mes anterior pagadas el día 1 de este mes
```

---

## Paso 6 — Generar PDF

Usar ReportLab (Platypus). Secciones del reporte:

1. **Encabezado** — "Continental Bar · Reporte Financiero · [Mes] [Año]"
2. **Resumen ejecutivo** — tabla comparativa mes actual vs mes anterior (si hay datos)
3. **Ventas e ingresos** — efectivo / banco bruto / comisión / banco neto / propinas
4. **Gastos por categoría** — tabla con columnas: categoría, mes anterior, mes actual, dif $, dif %
5. **Nómina semanal** — grid semanas × empleados + resumen por empleado
6. **Observaciones** — notas relevantes del mes (gastos únicos, correcciones, pendientes)

Guardar en `D:\React\continental-react\reporte_financiero_[mes]_[año].pdf`

Script de referencia: análisis Jun-Jul 2026 en `tasks/` o pedir regenerar desde cero.

---

## Paso 7 — Análisis de clientes

Pedir al usuario que corra esta query en Supabase y exporte como CSV:

```sql
SELECT
  u.name        AS mesa,
  c.customer_name,
  c.folio,
  c.final_total,
  c.tip_total,
  c.opened_at
FROM comandas c
JOIN units u ON c.unit_id = u.id
WHERE c.status = 'paid'
  AND c.final_total IS NOT NULL
  AND c.final_total > 0
ORDER BY c.opened_at;
```

**⚠️ El status es `paid`, no `closed`.**

---

## Paso 8 — Clasificación de clientes

### Conocidos vs genéricos

**Genéricos** (descriptores, no personas): primer palabra = amigo/amiga/chavo/chava/señor/señora/morros/chica/pareja/hermana/primo/prima/entrada/chavos/otros/muchacho/don/compa/india/futbol/grupo/cafe/m1/ny/uni/carro/blanco/verde/pollo/pokemon

**Conocidos:** nombre propio consistente, apellido, o apodo recurrente (4+ visitas).

### Aliases conocidos (actualizar cada mes con nuevos)

| Alias en sistema | Nombre real |
|-----------------|-------------|
| abogado, abogadoi | Ricardo Rojas |
| pantoi, pamtoja | Pantoja |
| mauricio, mau | Mauricio De La Vega |
| martin | Martin del Hoyo |
| china | China Sarai |
| izela, isela, vicky izela | Izela |
| karla, karla t, arq karla | Karla |
| erick, eric, erik, calvillo | Erick / Erick Calvillo |
| monsterrat diaz, montserrat | Montserrat Diaz |
| claudia, claudia bernal | Claudia Bernal |
| randy, randy patron | Randy Patron |
| cesar4 | Cesar |
| jygasoft, jigasost | Jigasoft (empresa) |

**Regla:** Si el mismo cliente aparece con apodo nuevo, agregar aquí antes del siguiente reporte.

### Segmentación

| Segmento | Criterio |
|----------|----------|
| VIP | 10+ visitas en el periodo |
| Regular | 4–9 visitas |
| Ocasional | 2–3 visitas |
| Una visita | 1 visita |

---

## Paso 9 — Output del análisis de clientes

Generar:
1. **Excel** con hojas: Clientes Conocidos / Descriptivos Genéricos / Resumen
   → Guardar como `analisis_clientes_[mes]_[año].xlsx`
2. **Widget visual en chat** con: conciliación vs reporte mensual, barra conocidos/anónimos, cuadro de segmentación, top 10

---

## Checklist final antes de entregar

- [ ] Totales del ledger cuadran con suma de comandas (diferencia < 1%)
- [ ] Nómina: un pago por empleado por semana (sin duplicados)
- [ ] Propinas: timing ajustado correctamente
- [ ] Préstamo Juan separado de gastos operativos
- [ ] Comisión terminal 3.5% aplicada al banco (estimado — verificar contra estado de cuenta)
- [ ] Aliases de clientes actualizados con nuevos apodos detectados este mes
- [ ] PDF generado y guardado en el repo
- [ ] Excel de clientes generado y guardado en el repo

---

## Gastos recurrentes esperados cada mes

| Gasto | Monto aprox. | Notas |
|-------|-------------|-------|
| Renta | $10,000–$18,000 | Verificar si hay cambio |
| Contador | $1,500 | Fijo |
| Recolección de basura | $3,200 | Mensual recurrente |
| Permiso provisional | $10,300 | Solo mientras aplique — preguntar al usuario |

---

*Última actualización: agosto 2026 — basado en reporte Jun-Jul 2026*
