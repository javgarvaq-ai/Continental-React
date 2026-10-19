# Reporte Mensual Continental Bar — Instrucciones

Cuando el usuario diga "haz el reporte mensual de [mes]", lee este archivo completo y pide los datos en el orden exacto que aparece aquí. No empieces a trabajar sin tener todos los archivos necesarios confirmados.

---

## Paso 1 — Datos para el informe financiero (actualizado 2026-10-18)

Scripts reproducibles en `tasks/analisis_financiero/`: `prep.py cobros.csv movimientos.csv FIN` → `build_pdf.py`. Pedir a Javi **dos consultas** en Supabase, cada una con el límite de filas en **"No limit"** (si no, el CSV llega cortado a 100 filas sin avisar):

```sql
-- 1) Cobros
SELECT to_char(p.created_at AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD HH24:MI') AS fecha_mx,
       p.efectivo, p.tarjeta, p.transferencia, p.total_paid, p.tip_amount, p.card_terminal, p.change_given
FROM payments p ORDER BY p.created_at;
```

```sql
-- 2) Movimientos de caja / banco
SELECT to_char(m.created_at AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD HH24:MI') AS fecha_mx,
       m.category, m.movement_nature, m.type, m.source_location, m.destination_location,
       m.amount, m.note, u.name AS usuario
FROM cash_movements m LEFT JOIN users u ON u.id = m.user_id ORDER BY m.created_at;
```

Mes = día operativo (fecha − 6 h). Un mes incompleto se marca con * y los fijos se prorratean.

---

## Paso 2 — Antes de calcular: pagos que no están en el sistema

1. **Pagos directos de socios** (Eduardo = "Negro", Javi) hechos con dinero propio: **se meten al sistema**, no solo al reporte. Cada pago = 2 movimientos con fecha real (si no se sabe, el 15 del mes): *Aportación socio → Banco* + el gasto desde banco, mismo monto. Saldo de banco neto = 0. Ejemplo: `tasks/pagos_directos_socios_2026-10-18.sql`. **No** meter pagos de antes de la apertura (inversión inicial).
2. **Antes de cargarlos, buscar duplicados** contra el sistema (mismo monto, notas parecidas, aportaciones de socio ya registradas). Ej. 18-oct: la nómina de $2,000 y los "préstamos" $3,000 de Eduardo ya estaban como aportaciones.
3. Revisar con `prep.py` la lista de gastos que caen en **"Otros"** y preguntar a Javi qué son antes del informe.

**Regla de Javi: el informe sale sin dudas.** Todo lo dudoso se pregunta y se resuelve ANTES de generar el PDF; el PDF solo trae datos confirmados (nada de "¿pendiente?", "confirmar si…").

---

## Paso 3 — Reglas de ingresos y gastos (confirmadas 2026-10-18)

- **Ingreso** = venta sin propina (`total_paid − tip_amount`). La propina cobrada se entrega completa (propinas_entregadas ≈ tip_amount) → ni ingreso ni gasto.
- **Comisión de tarjeta** exacta por terminal (`card_terminal`): Mercado Pago 4.06% (3.5% + IVA), Getnet 2.17% (1.87% + IVA). Va como gasto. MP es respaldo cuando falla Getnet.
- **Gasto operativo** = todo lo que salió de caja, caja fuerte o banco (`movement_nature = expense`), **clasificado por lo que dice la nota**, no por si se marcó operativo o proveedor.
- **Fijos al mes (devengados, no por fecha de pago):** renta **$18,000** (junio también: $10k pagados + $8k anticipados antes de abrir) · contador **$1,500** · luz CFE **bimestral, repartida** entre los meses que cubre el recibo (lo paga Javi). Mes incompleto → prorrateado.
- **Fuera de la operación (apartado propio):**
  - **Permiso provisional**: jul–ago $10,300 al mes; desde sep se paga por días (~$330/día). Incluye "permiso de funcionamiento Javier".
  - **Préstamo Juan**: $15,500 al mes (a veces la nota dice "Annabel", es la esposa de Juan, mismo préstamo). Jun–sep = 4 × 15,500 = $62,000 verificado.
- **No son gasto:** traspasos entre cuentas, aportaciones de socio, ajustes de corrección. Del arranque (14-jun): "Ajuste error de carga 2500 para caja chica", "Ingreso caja javier" $900, "Cambio caja negro" $1,000 → traspasos/ajustes.
- **Seguro anual** $4,000 cae completo en junio (se sabe que cada junio va).

### Categorías por nota (palabras clave, ver `RULES` en `prep.py`)
| Categoría | Ejemplos de nota |
|---|---|
| Cerveza | heineken (incl. logística), cerveza, tecate, cartones indio/ultra |
| Botellas y licores | oviedo, botellas, centenario, bacardi, **bacacha**, **controy** (vino), alameda, torres v |
| Refrescos, aguas y jugos | peñafiel, coca, topo chico, squirt, volt, zumos, concentrados, **aldo**, **r mar**, "retiro vaquera" |
| Hielo | yukon |
| Comida (cocina) | liz, carnitas, comida, boneless/pizza, **chicharrón de lonja y estilo Ramos** |
| Botanas | **chicharrón duro**, o chicharrón junto con palomitas/papas/cacahuate; palomitas, papas, botanas |
| Frutas y abarrotes | limón, fruta, tortillas, salsas, crema, aceite, sal de gusano |
| Desechables y limpieza | don pulcro, vasos, servilletas, copas, desechables |
| Servicios | basura (~$2,900–3,200), Total Play, YouTube, agua del local (~$380), garrafón, Getnet mensual |
| Otros fijos | seguro, publicidad/fotos, mantenimiento |

Compras de Memo ("cerveza memo", "memo aurrera") = compras del bar según la nota.

---

## Paso 4 — Nómina semanal

- Semana domingo–sábado. **La nómina se paga el sábado**: pagos de **domingo o lunes** cuentan para la semana anterior (Javi a veces espera el depósito de Getnet).
- Empleados por nota: Memo, Gus (Gustavo), Javier (Javi), Alexis (solo jun–jul), Negro.
- Correcciones conocidas (en `prep.py`): $2,450 del 26-sep era de **Gus** (nota corregida en BD); $538 del 24-jul duplicado, ya regresado a caja con ajuste → no cuenta.
- **Si no hay pago registrado, es que no hay** (decisión de Javi). La semana en curso no entra en promedios si falta algún pago; tampoco semanas de < 5 días.
- Mostrar: tabla semana × empleado, promedio total y **desde agosto**, 5 semanas más caras vs 5 de más venta, correlación nómina–venta, % de la venta.

---

## Paso 5 — Cálculos del reporte

```
Resultado operativo     = ingreso − gasto operativo (incluye compras y comisiones)
Después de temporales   = resultado operativo − permiso − préstamo
Costo de producto       = bebida + hielo + comida + botanas + abarrotes (compras del mes ≈ costo; sin inventario)
Variables               = costo de producto + desechables + comisiones   (≈ 44% de la venta ago–oct 2026)
Equilibrio diario       = fijos por día ÷ (1 − % variables)               (con y sin permiso+préstamo)
```
No reportar "utilidad" contable: los costos de inventario aún no están completos. La vista es **"de cada $100 que vendemos"**.

---

## Paso 6 — PDF (máximo 3 hojas)

`informe_financiero_[periodo].pdf` en la raíz del repo. Referencia: `informe_financiero_jun_oct_2026.pdf`.
1. **Resumen:** KPIs (resultado sin temporales, permiso+préstamo, equilibrio, venta diaria real) · tabla mes a mes · "De cada $100 que vendemos" · gráfica ingreso vs gasto · 5 conclusiones.
2. **Gastos:** categorías × mes + total + % venta · peso sobre la venta · comisiones y ahorro Getnet · **conclusiones de gastos** (solo confirmadas) · apartado permiso y préstamo (detalle de pagos).
3. **Nómina:** KPIs, tabla semanal por empleado (5 más caras sombreadas), conclusiones, gráfica de nómina % de venta.

`build_pdf.py` calcula las tablas solo; **los textos de conclusiones y KPIs de equilibrio se reescriben cada vez.**

---

## Paso 7 — Análisis de clientes (actualizado 2026-10-18)

Scripts reproducibles en `tasks/analisis_clientes/` (`classify.py` → `metrics.py` → `build_pdf.py`). Pedir a Javi que corra esta query en Supabase. **⚠️ Antes de correr: cambiar el límite de filas junto a "Run" a "No limit"** — por default exporta solo 100 filas y el CSV llega cortado sin avisar.

```sql
SELECT
  c.folio, u.name AS mesa, c.customer_name, c.customer_id,
  cu.customer_number, cu.name AS cliente_registrado,
  c.rp_name, c.rp_cortesia, c.personas,
  c.final_total, c.tip_total,
  to_char(c.opened_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') AS opened_mx
FROM comandas c
JOIN units u           ON u.id  = c.unit_id
LEFT JOIN customers cu ON cu.id = c.customer_id
WHERE c.status = 'paid' AND c.final_total > 0
ORDER BY c.opened_at;
```

- `final_total` = consumo **sin** propina (la propina va aparte en `tip_total`).
- Mes = día operativo (opened_at − 6 h). Junio arranca el 10 (apertura): comparar meses **por día operado**, no por total.
- `rp_name` estaba vacío en todas las cuentas a oct-2026; `personas` casi nunca se captura → no usarlos hasta que haya datos.

---

## Paso 8 — Clasificación de clientes (reglas confirmadas por Javi 2026-10-18)

### Tres grupos (no "conocidos vs genéricos")
| Grupo | Criterio |
|---|---|
| **Recurrente** | cliente con nombre que vino **2+ días distintos** en todo el historial |
| **Con nombre, 1 visita** | trae nombre pero vino un solo día (puede volverse recurrente) |
| **Genérico** | descriptor, no persona: señor/señora/señores, chavos/chavo/chava, chicas/chicos, pareja, morros, don, compa(s), amigos/amigas solos, mesa/barra, "entrada a la derecha", ropa o rasgos ("señor camisa roja", "chica azul", "blanco lentes"), basura de captura ("kk", "l", "h", "fgd", "se") |

Regla de Javi: **si trae nombre propio o apodo, es "con nombre"** aunque no sepamos quién es (ej. "andrea", "vale", "cesar").

### Consumo de socios y familia = clientes normales
Eduardo Ibarra, Javier Vaquera, Marco Ibarra, Fernanda Ibarra, papá de Javier, Liz, Memo, proveedores: **se cuentan como clientes** ("pedimos y pagamos como cualquier cliente"). Mencionar su peso en las conclusiones (~16% de la venta jun-oct).

### Redes ("amigos de X", "hermana de X", "compa X")
Cada una es un cliente con nombre **aparte** (no se suma a X), y además se reporta en una sección "Quién trae más gente" atribuida a X. **Gus es empleado.**

### Aliases (persona final ← nombres en el sistema)
| Persona | Nombres que se juntan |
|---|---|
| Ricardo Rojas (#9) | abogado, abogadoi, ricardo, ricar, ricard, ricarr, ricvha, "ricardo DD MM YY", sr jaime ricardo rojas (amigo, se cuenta como él) |
| Mauricio De La Vega (#5) | mau, mauricio, mau y juan |
| Montserrat Díaz (#15) | montserrat, monsterrat diaz, montse, montze, monse, momnste |
| Izela | isela, izela, vicky izela |
| Karla | karla, karla t — **"arq karla" es OTRA persona** |
| Pantoja | pantoja, pantoi, pamtoja |
| Randy Patrón | randy, randy patron |
| China Sarai | china, china sarai, china barra |
| Toño Kenworth | tono kenworth, tono, antonio kenworth, tono y nayeli |
| Juan Calvillo | juan calvillo, calvillo |
| Erick (distinto de Juan Calvillo) | erick, erik, eric, erick calvillo, erick poke |
| Claudia Bernal (#17) | claudia, claudia bernal |
| Jigasoft (empresa) | jygasoft, jigasost |
| Liz | liz, liz comida, loiz |
| Memo | memo, memo q |
| Tachi | tachi, tac |
| Pollo | pollo (cliente, no genérico) |
| Otros | peruzzi/peruzi · haydee/hayde/haydew · ceci/cecy/cecilia · zuli/zully · martin/martin del hoyo · alvaro/alvaro express · dulce/dulc arcoiris · baron/barron · sayo/sayos |

**Personas DISTINTAS (no juntar):** andrea ≠ Andrea Miranda ≠ arq andrea · cesar ≠ cesar de santos ≠ cesar de luna ≠ cesar4 · quezada ≠ marlene quezada · vale ≠ val ≠ vala ≠ valentina ≠ valeria.

**Regla:** si aparece un apodo nuevo de alguien, agregarlo aquí y en `MERGE` de `classify.py` antes del siguiente análisis.

---

## Paso 9 — Output del análisis de clientes

1. **Visuales en el chat:** KPIs, venta por día operado (recurrentes / 1 visita / genéricos), nuevos vs regresan por mes, top 10, redes.
2. **PDF de 2 hojas** → `informe_clientes_[periodo].pdf` en la raíz del repo:
   - Hoja 1: KPIs, tabla mes a mes, 5 conclusiones, gráfica de venta por día, quién trae más gente.
   - Hoja 2: top 30 (cliente · nombres consolidados · venta por mes · total · cuentas · días · última visita · estado) + clientes que están llegando (primera visita en los últimos ~3 meses con 3+ días).
   - Estado por última visita: Activo ≤14 días · Enfriándose 15–30 · Perdido >30.
3. Métrica clave a seguir cada mes: **% de nuevos con nombre que regresan otro día** (jun 47%, jul 36%, ago 19%, sep 18%).

Referencia: `informe_clientes_jun_oct_2026.pdf` (10-jun a 17-oct-2026).

---

## Checklist final antes de entregar

- [ ] CSVs exportados con "No limit" (contar filas)
- [ ] Pagos directos de socios del periodo cargados al sistema (sin duplicados)
- [ ] Gastos en "Otros" revisados con Javi; ninguna duda abierta en el PDF
- [ ] Préstamo: pagos del periodo = meses × $15,500
- [ ] Gasto operativo reconstruido desde el CSV = total del reporte (al centavo)
- [ ] Aliases de clientes actualizados con nuevos apodos detectados este mes (aquí y en `tasks/analisis_clientes/classify.py`)
- [ ] PDFs revisados visualmente (sin texto encimado) y guardados en el repo

---

*Última actualización: 18-oct-2026 — informes de clientes y financiero jun–oct 2026*
