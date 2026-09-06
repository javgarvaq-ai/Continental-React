import { supabase } from './supabase'

/**
 * Costeo manual de productos — Fase 1 (2026-09-06).
 *
 * Reemplaza el modelo híbrido receta/manual_cost como fuente de margen/COGS.
 * `reference_cost` / `reference_cost_note` son completamente independientes
 * de `product_recipes` / `inventory_items` (quedan solo para descuento de
 * stock) y de `products.manual_cost` (campo viejo del modelo híbrido, ya no
 * se toca). Ver utils/cost.js para el modelo viejo (todavía usado por el
 * snapshot de cobro, sin cambios — no lo tocamos, ver tasks/todo.md).
 */

export async function getProductReferenceCostingData() {
    const { data, error } = await supabase
        .from('products')
        .select('id, name, price, active, reference_cost, reference_cost_note, category_id, categories(name)')
        .order('name', { ascending: true })

    if (error) return { data: null, error }

    const rows = (data || []).map((p) => {
        const price = Number(p.price || 0)
        const cost = p.reference_cost == null ? null : Number(p.reference_cost)
        const margin = cost == null ? null : price - cost
        const marginPct = cost == null || price <= 0 ? null : (margin / price) * 100

        return {
            productId: p.id,
            productName: p.name,
            categoryName: p.categories?.name || 'Sin categoría',
            price,
            active: Boolean(p.active),
            cost,
            note: p.reference_cost_note || '',
            margin,
            marginPct,
        }
    })

    return { data: rows, error: null }
}

export async function updateProductReferenceCost({ productId, cost, note }) {
    return await supabase
        .from('products')
        .update({
            // NULL preserva "sin capturar" (distinto de 0 real) — mismo criterio
            // que manual_cost en productsAdmin.js.
            reference_cost: cost === '' || cost == null ? null : Number(cost),
            reference_cost_note: note === '' || note == null ? null : note,
        })
        .eq('id', productId)
}
