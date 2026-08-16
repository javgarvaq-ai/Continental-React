/**
 * Conversión de unidades de inventario — funciones puras (sin React, sin imports).
 *
 * Contexto: los destilados se almacenan en ONZAS, pero la mercancía llega en
 * BOTELLAS, y no todas las botellas del mismo insumo son del mismo tamaño
 * (700 ml, 750 ml, 900 ml, 1 L…). `inventory_items.capacity_oz` guarda el tamaño
 * de REFERENCIA de cada insumo — el habitual, del que se derivó su `unit_cost`.
 * En la captura ese tamaño es solo el default: se puede cambiar por entrega.
 *
 * Todo lo que se manda a la base pasa por `round2`: `current_stock`,
 * `capacity_oz` y `quantity_change` son `numeric(12,2)`, y en JS
 * `6 * 23.67 === 142.01999999999998`.
 */

export const ML_PER_OZ = 29.5735296

/** Presentaciones comunes ofrecidas en el selector, además de la habitual del insumo. */
export const BOTTLE_SIZES_ML = [700, 750, 900, 1000, 1750]

/** Redondea a 2 decimales — las columnas de inventario son numeric(12,2). */
export function round2(value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100) / 100
}

/** ¿Este insumo se captura en botellas? Solo si es `oz` Y tiene tamaño de referencia. */
export function usesBottles(item) {
    return item && item.unit_type === 'oz' && Number(item.capacity_oz || 0) > 0
}

/** Tamaño de referencia del insumo en ml, derivado de capacity_oz. null si no aplica. */
export function referenceSizeMl(item) {
    const capacityOz = Number((item && item.capacity_oz) || 0)
    if (!(capacityOz > 0)) return null
    return Math.round(capacityOz * ML_PER_OZ)
}

/** Etiqueta legible de la unidad base ('unit' se muestra como 'pzas'). */
export function unitLabel(unitType) {
    return unitType === 'unit' ? 'pzas' : (unitType || '')
}

/** Decimales con que se muestra una existencia: las piezas son enteras. */
function decimalsFor(unitType) {
    return unitType === 'unit' ? 0 : 2
}

/** Convierte N botellas de `sizeMl` a onzas, redondeado a 2 decimales. */
export function ozFromBottles(bottles, sizeMl) {
    const count = Number(bottles)
    const ml = Number(sizeMl)
    if (!Number.isFinite(count) || !Number.isFinite(ml) || count <= 0 || ml <= 0) return 0
    return round2((count * ml) / ML_PER_OZ)
}

/**
 * Cantidad a sumar al stock, en la unidad base del insumo.
 * Insumos en botellas → convierte. El resto → la cantidad tal cual.
 */
export function receiptAmount({ item, bottles, sizeMl, amount }) {
    if (usesBottles(item)) return ozFromBottles(bottles, sizeMl)
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return 0
    return round2(n)
}

/**
 * Existencia formateada. `secondary` solo se llena para insumos en botellas, y
 * SIEMPRE nombra el tamaño de referencia: si el stock se llenó con
 * presentaciones mezcladas, "11.3 bot" a secas sería una cifra falsa.
 */
export function formatStock(item) {
    const stock = Number((item && item.current_stock) || 0)
    const unitType = item && item.unit_type
    const primary = `${stock.toFixed(decimalsFor(unitType))} ${unitLabel(unitType)}`.trim()

    if (!usesBottles(item)) return { primary, secondary: '' }

    const bottles = stock / Number(item.capacity_oz)
    return { primary, secondary: `≈ ${bottles.toFixed(1)} bot de ${referenceSizeMl(item)} ml` }
}

/** Opciones del selector de tamaño: la habitual del insumo primero, luego el resto. */
export function sizeOptionsFor(item) {
    const reference = referenceSizeMl(item)
    const options = []
    if (reference) options.push({ ml: reference, label: `${reference} ml (habitual)` })
    BOTTLE_SIZES_ML.forEach(ml => {
        if (ml !== reference) options.push({ ml, label: `${ml} ml` })
    })
    return options
}

/**
 * Nota que se guarda en inventory_movements. Se auto-compone con la presentación
 * recibida para que la entrega quede documentada sin que nadie la escriba —
 * es el único lugar donde queda registro de en qué tamaño llegó esta entrega.
 */
export function buildReceiptNote({ item, bottles, sizeMl, amount, userNote }) {
    const head = usesBottles(item)
        ? `${Number(bottles)} bot × ${Number(sizeMl)} ml`
        : `${round2(amount)} ${unitLabel(item && item.unit_type)}`.trim()

    const extra = (userNote || '').trim()
    return extra ? `${head} — ${extra}` : head
}
