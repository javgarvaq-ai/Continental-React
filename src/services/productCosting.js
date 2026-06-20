import { supabase } from './supabase'
import { computeProductCost } from '../utils/cost'

/**
 * Costeo de productos "en frío" — sin depender de que haya ventas.
 * Complementa services/reports.js (que solo calcula costo de lo YA vendido).
 *
 * Para productos normales reusa exactamente utils/cost.js → computeProductCost
 * (el mismo motor que usa el snapshot de cobro). NO se modifica esa función.
 *
 * Para combos (is_shot) sin receta propia ni manual_cost: estima el costo como
 * el promedio del costo de sus mixers elegibles (product_allowed_mixers) ×
 * free_mixers_qty. Es una capa de estimación que vive SOLO aquí — el costo
 * real de una venta sigue saliendo del roll-up exacto en services/reports.js.
 */

export async function getProductCostingData() {
    const [productsRes, categoriesRes, recipesRes, inventoryRes, allowedMixersRes] = await Promise.all([
        supabase
            .from('products')
            .select('id, name, price, manual_cost, is_shot, free_mixers_qty, active, category_id')
            .order('name', { ascending: true }),
        supabase.from('categories').select('id, name'),
        supabase.from('product_recipes').select('product_id, inventory_item_id, deduct_amount, active').eq('active', true),
        supabase.from('inventory_items').select('id, unit_cost'),
        supabase.from('product_allowed_mixers').select('shot_product_id, mixer_product_id, active').eq('active', true),
    ])

    const firstError = productsRes.error || categoriesRes.error || recipesRes.error || inventoryRes.error || allowedMixersRes.error
    if (firstError) return { data: null, error: firstError }

    const products = productsRes.data || []
    const categories = categoriesRes.data || []
    const recipeRows = recipesRes.data || []
    const inventoryItems = inventoryRes.data || []
    const allowedMixerRows = allowedMixersRes.data || []

    const rows = computeProductCostingRows({ products, categories, recipeRows, inventoryItems, allowedMixerRows })

    return { data: rows, error: null }
}

/**
 * Función pura — separada de la llamada a Supabase para poder probarla en node
 * sin red. Recibe las mismas filas "crudas" que devuelven las tablas.
 *
 * @returns {Array<{ productId, productName, categoryName, price, active, isShot,
 *   cost, costSource: 'recipe'|'manual'|'estimated_mixers_avg'|'none',
 *   costComplete, margin, marginPct }>}
 */
export function computeProductCostingRows({ products, categories, recipeRows, inventoryItems, allowedMixerRows }) {
    const categoryNameById = {}
    for (const c of categories || []) categoryNameById[c.id] = c.name

    const invById = {}
    for (const ii of inventoryItems || []) invById[ii.id] = ii

    const recipesByProduct = {}
    for (const r of recipeRows || []) {
        if (!recipesByProduct[r.product_id]) recipesByProduct[r.product_id] = []
        recipesByProduct[r.product_id].push(r)
    }

    const allowedMixersByShotId = {}
    for (const row of allowedMixerRows || []) {
        if (!allowedMixersByShotId[row.shot_product_id]) allowedMixersByShotId[row.shot_product_id] = []
        allowedMixersByShotId[row.shot_product_id].push(row.mixer_product_id)
    }

    // Costo "baseline" de cada producto (receta o manual_cost), igual que en
    // services/reports.js — se reusa para los productos normales y también
    // como insumo para promediar el costo de los mixers de un combo.
    const baselineByProductId = {}
    for (const p of products || []) {
        baselineByProductId[p.id] = computeProductCost(p, recipesByProduct[p.id] || [], invById)
    }

    return (products || []).map((p) => {
        const baseline = baselineByProductId[p.id]
        let cost = baseline.cost
        let costSource = baseline.source // 'recipe' | 'manual' | 'none'
        let costComplete = baseline.complete

        if (!baseline.complete && p.is_shot) {
            const mixerIds = allowedMixersByShotId[p.id] || []
            const mixerCosts = mixerIds
                .map((id) => baselineByProductId[id])
                .filter((c) => c && c.complete)
                .map((c) => c.cost)

            if (mixerCosts.length > 0) {
                const avg = mixerCosts.reduce((sum, c) => sum + c, 0) / mixerCosts.length
                cost = avg * Number(p.free_mixers_qty || 0)
                costSource = 'estimated_mixers_avg'
                costComplete = true
            }
        }

        const price = Number(p.price || 0)
        const margin = price - cost
        const marginPct = price > 0 ? (margin / price) * 100 : null

        return {
            productId: p.id,
            productName: p.name,
            categoryName: categoryNameById[p.category_id] || 'Sin categoría',
            price,
            active: Boolean(p.active),
            isShot: Boolean(p.is_shot),
            cost,
            costSource,
            costComplete,
            margin,
            marginPct,
        }
    })
}
