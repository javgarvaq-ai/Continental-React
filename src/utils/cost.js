/**
 * Costeo de productos — funciones puras (sin efectos, sin imports).
 *
 * Modelo híbrido (decisión 2026-06-15):
 *   1. Si el producto tiene recetas activas → costo = Σ(deduct_amount × insumo.unit_cost).
 *   2. Si NO tiene receta → costo = products.manual_cost.
 *   3. Si falta algún dato (insumo sin unit_cost, o nada capturado) → incompleto.
 *
 * `complete=false` significa "no se pudo costear del todo". El llamador decide
 * qué hacer: el reporte lo marca "sin costo"; el snapshot del cobro guarda NULL.
 *
 * Defensivo a propósito: nunca lanza, siempre regresa un objeto válido. Esto
 * importa porque la misma lógica se enganchará al cobro (no debe poder romperlo).
 */

/**
 * @param {{ manual_cost?: number|null }} product
 * @param {Array<{ inventory_item_id: string, deduct_amount: number|string, active?: boolean }>} recipes  recetas del producto (se filtran activas)
 * @param {Object<string, { unit_cost?: number|null }>} inventoryItemsById  insumos por id
 * @returns {{ cost: number, source: 'recipe'|'manual'|'none', complete: boolean }}
 */
export function computeProductCost(product, recipes = [], inventoryItemsById = {}) {
    const activeRecipes = (recipes || []).filter((r) => r && r.active !== false)

    if (activeRecipes.length > 0) {
        let cost = 0
        let complete = true
        for (const r of activeRecipes) {
            const item = inventoryItemsById[r.inventory_item_id]
            const unitCost = item == null ? null : item.unit_cost
            if (unitCost == null) {
                complete = false // insumo sin costo capturado → costo incompleto
                continue
            }
            cost += Number(r.deduct_amount || 0) * Number(unitCost)
        }
        return { cost, source: 'recipe', complete }
    }

    // Sin receta → costo manual del producto
    if (product && product.manual_cost != null) {
        return { cost: Number(product.manual_cost), source: 'manual', complete: true }
    }

    return { cost: 0, source: 'none', complete: false }
}
