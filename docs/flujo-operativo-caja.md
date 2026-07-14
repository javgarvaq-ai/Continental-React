# Flujo Operativo de Caja — Continental

> Guía para quien maneje el admin. Cada movimiento tiene una categoría correcta. Seguir este flujo asegura que los reportes cuadren y que la matemática de ventas vs gastos sea limpia.

---

## 1. Categorías: cuándo usar cada una

### Ingresos

| Categoría | Cuándo usarla | Ejemplo |
|-----------|---------------|---------|
| **Folio #X cobrado** | Automático al cobrar en el POS. No tocar. | — |
| **Aportación socio** | Un socio mete dinero FÍSICO a la caja que viene de su bolsillo o de una fuente externa al negocio. | Socio trae monedas para el cambio. |
| **Regreso de resguardo** | Se saca dinero de la caja fuerte y se regresa al cajón. | Al inicio del turno se saca el fondo de la caja fuerte. |
| **Ajuste ingreso** | **SOLO** para corregir errores de captura en el sistema. Nunca para caja chica ni reposiciones. | Se capturó mal un folio y hay que corrección. |

### Egresos

| Categoría | Cuándo usarla | Ejemplo |
|-----------|---------------|---------|
| **Pago proveedor (caja)** | Pago en efectivo a proveedor externo. | Tecate, Aurrera, Liz comida en efectivo. |
| **Pago proveedor (banco)** | Transferencia bancaria a proveedor externo. | Pago Concentrados, RMar por SPEI. |
| **Pago proveedor (resguardo)** | Se paga a proveedor sacando físicamente del resguardo. Poco frecuente. | Peñafiel pagado del resguardo. |
| **Gasto operativo (caja)** | Gastos pequeños de operación que no son proveedor recurrente. | Bolsas, artículos sueltos. |
| **Nómina (caja / banco)** | Solo sueldos de empleados. No mezclar con adelantos ni otros pagos. | Sueldo semanal Memo, Gus, Alexis, Javier. |
| **Propinas entregadas** | Propinas al staff. Una sola entrada por turno, al cierre. | Propinas turno noche. |
| **Resguardo casa** | Mover efectivo del cajón a la caja fuerte por seguridad. | Retirar sobrante al cierre. |

---

## 2. Traslado banco → caja (caso especial)

Cuando se necesita sacar efectivo del banco del negocio para meterlo al cajón (ej: para completar propinas, para traer cambio), se hacen **DOS entradas**:

**Paso 1 — salida del banco:**
```
Pago proveedor (banco) → -$[monto]
Nota: "Traslado a caja [nombre]"
```

**Paso 2 — entrada al cajón:**
```
Aportación socio → +$[monto]
Nota: "De banco del negocio [nombre]"
```

El neto es $0 para el negocio — solo cambia la forma del dinero (digital → físico).

**Ejemplos de esta semana:**
- Javier sacó $900 del banco para completar propinas → Pago proveedor banco -$900 + Aportación socio +$900
- Eduardo trajo $1,000 de cambio y se le reembolsó por banco → Pago proveedor banco -$1,000 + Aportación socio +$1,000

---

## 3. Caja chica

La caja chica es el fondo fijo que siempre debe estar disponible en el cajón para dar cambio y cubrir gastos menores.

**Monto fijo del fondo:** definir un monto (ej: $500) y mantenerlo constante.

**Cómo reponer si se agota o baja:**
- Si el dinero viene del banco del negocio → usar el traslado banco→caja (punto 2).
- Si un socio trae efectivo de afuera → `Aportación socio` con nota "Caja chica".
- **Nunca usar `Ajuste ingreso`** para reponer caja chica — eso infla los reportes de ingresos.

**Al cierre:** el fondo de caja chica no se resguarda. Se queda en el cajón como fondo del siguiente turno y se captura como fondo de apertura.

---

## 4. Cierre de turno — orden correcto

Seguir este orden evita cajones negativos y diferencias al cierre:

1. **Contar el cajón físico.**
2. **Registrar propinas** → `Propinas entregadas` (una sola entrada por turno con el total).
3. **Decidir el fondo del siguiente turno** (ej: $500 fijo de caja chica).
4. **Todo lo que exceda ese fondo** → `Resguardo casa` a la caja fuerte.
5. **Verificar:** cajón físico debe = fondo definido.
6. **Cerrar turno** → la diferencia debe ser $0. Si no es $0, investigar antes de cerrar.

> ⚠️ No pagar nómina del cajón si el saldo está justo. Si la nómina deja el cajón en negativo, traer el faltante del banco antes de pagar (traslado banco→caja).

---

## 5. Resguardo — reglas

- El resguardo es solo para **seguridad nocturna**. No es una cuenta de operación.
- Para regresar dinero del resguardo al cajón → `Regreso de resguardo`.
- Para pagar un proveedor del resguardo → `Pago proveedor (resguardo)` (usar solo cuando sea necesario sacar físicamente del resguardo).
- Nunca usar `Ajuste ingreso` para mover el resguardo al cajón. Eso crea doble conteo.

---

## 6. Por qué importa capturar bien

Cuando se usan categorías incorrectas (ej: `Ajuste ingreso` para caja chica), el sistema cuenta ese dinero como si fueran ventas nuevas. Esto hace que:

- Las ventas del reporte aparezcan infladas.
- El cálculo de "ganamos X, gastamos Y, deberían sobrar Z" no cuadre.
- Sea imposible saber si el negocio está ganando o perdiendo de verdad.

Con el flujo correcto, la fórmula es limpia:

```
Ventas cobradas − Gastos − Nómina − Propinas = Efectivo disponible
```

Y ese número debe coincidir exactamente con cajón + banco + resguardo.

---

## 7. Ledger persistente (nuevo, julio 2026)

El cajón en `/admin/ledger` ya no se resetea al fondo de cada turno — se acumula igual que caja fuerte y banco, solo por ventas en efectivo y `cash_movements` documentados.

El conteo físico de apertura/cierre de cada turno se sigue capturando igual (`ShiftPanel`, sin cambios), pero ahora el Ledger lo compara contra ese saldo acumulado y muestra la diferencia debajo de cada marcador de turno. Si un turno "cuadra" internamente pero el fondo de apertura no coincidió con lo que el sistema esperaba (ej: se contó mal, o salió/entró dinero del cajón sin registrar un movimiento), esa diferencia ahora es visible ahí — antes se perdía silenciosamente en el reset.

**Por qué importa seguir las reglas de este documento al pie de la letra ahora:** cualquier entrada o salida de efectivo del cajón que no pase por una de las categorías de arriba (secciones 1-5) va a aparecer como una diferencia en el Ledger, aunque el corte del turno se vea perfecto.

---

*Última actualización: julio 2026*
