import { supabase } from './supabase'
import { computeProductCost } from '../utils/cost'

// ── Date helpers ──────────────────────────────────────────────
export function daysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d
}

export function startOfMonth() {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
}

export function isoDate(date) {
    return date.toISOString().split('T')[0]
}

// ── Operational day helper ────────────────────────────────────
// Mexico (-06:00). The bar's "day" runs past midnight (shifts often close
// around 2am), so the cutover is 06:00 local instead of 00:00 — a sale at
// 1am still belongs to the previous day's bucket. Used to bucket payments
// for Analytics so a single overnight shift isn't split across two days.
const OPERATIONAL_DAY_SHIFT_MS = (6 + 6) * 60 * 60 * 1000 // -06:00 offset + 6h cutover

export function operationalDateKey(timestamp) {
    const ms = new Date(timestamp).getTime() - OPERATIONAL_DAY_SHIFT_MS
    return new Date(ms).toISOString().split('T')[0]
}

export function currentMonthDate() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function getWeeklyReportData({ startDate, endDate }) {
    // Use the same 06:00 operational-day cutoff as every other query in this file.
    // T00:00:00 would include early-morning (madrugada) records that operationally
    // belong to the previous day/week.
    const startIso = `${startDate}T06:00:00-06:00`
    const endIso   = `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`

    const [paymentsResult, cashMovementsResult, comandasResult] = await Promise.all([
        supabase
            .from('payments')
            .select(`
                *,
                comandas (
                    id,
                    folio,
                    final_total,
                    tip_total,
                    status,
                    cobrado_at
                )
            `)
            .gte('created_at', startIso)
            .lt('created_at', endIso),

        supabase
            .from('cash_movements')
            .select('*')
            .gte('created_at', startIso)
            .lt('created_at', endIso),

        supabase
            .from('comandas')
            .select('*')
            .eq('status', 'paid')
            .gte('cobrado_at', startIso)
            .lt('cobrado_at', endIso),
    ])

    return {
        payments: paymentsResult.data || [],
        cashMovements: cashMovementsResult.data || [],
        comandas: comandasResult.data || [],
        error: paymentsResult.error || cashMovementsResult.error || comandasResult.error || null,
        paymentsError: paymentsResult.error,
        cashMovementsError: cashMovementsResult.error,
        comandasError: comandasResult.error,
    }
}

// Global balances — ALL TIME, no date filter.
// Used for "Posición de dinero" in the financial report so the
// register/safe/bank balances are always historically consistent
// regardless of which period filter is selected.
export async function getGlobalBalances() {
    const [paymentsResult, cashMovementsResult] = await Promise.all([
        supabase
            .from('payments')
            .select('efectivo, tarjeta, transferencia, tip_amount, total_paid'),
        supabase
            .from('cash_movements')
            .select('amount, movement_nature, source_location, destination_location, category'),
    ])
    return {
        payments:      paymentsResult.data      || [],
        cashMovements: cashMovementsResult.data  || [],
        error: paymentsResult.error || cashMovementsResult.error || null,
    }
}

// ─────────────────────────────────────────────────────────────
// Analytics & Trends
// ─────────────────────────────────────────────────────────────

export async function getPaymentsForPeriod(days = 14) {
    const { data, error } = await supabase
        .from('payments')
        .select('created_at, total_paid, efectivo, tarjeta, transferencia, tip_amount')
        .gte('created_at', daysAgo(days).toISOString())
        .order('created_at', { ascending: true })
    return { data: data || [], error }
}

export function buildDailyRevenue(payments, days = 14) {
    const buckets = {}
    const now = Date.now()
    for (let i = days - 1; i >= 0; i--) {
        const ts = now - i * 24 * 60 * 60 * 1000
        const key = operationalDateKey(ts)
        const label = new Date(ts).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', timeZone: 'America/Mexico_City' })
        buckets[key] = { date: key, label, revenue: 0, comandas: 0, tips: 0 }
    }
    payments.forEach(p => {
        const key = operationalDateKey(p.created_at)
        if (buckets[key]) {
            buckets[key].revenue  += Number(p.total_paid  || 0)
            buckets[key].tips     += Number(p.tip_amount  || 0)
            buckets[key].comandas += 1
        }
    })
    return Object.values(buckets)
}

export function buildHourlyDistribution(payments) {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, count: 0 }))
    payments.forEach(p => {
        const h = new Date(p.created_at).getHours()
        hours[h].revenue += Number(p.total_paid || 0)
        hours[h].count   += 1
    })
    return hours
}

export function buildDayOfWeekStats(payments) {
    const LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const days = LABELS.map((label, i) => ({ label, dow: i, revenue: 0, count: 0 }))
    payments.forEach(p => {
        // Use the same operational-day key as buildDailyRevenue so a late-night
        // sale is counted on the day its shift started, not the calendar day
        // it landed on. Parse as UTC to avoid the browser's local timezone
        // shifting the weekday of a date-only string.
        const [y, m, d] = operationalDateKey(p.created_at).split('-').map(Number)
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
        days[dow].revenue += Number(p.total_paid || 0)
        days[dow].count   += 1
    })
    return days
}

// Adds `days` calendar days to a 'YYYY-MM-DD' string using pure UTC date
// arithmetic — avoids local-timezone drift when computing the exclusive
// end bound of a date range.
export function addDaysToDateString(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().split('T')[0]
}

// ── Product sales report ────────────────────────────────────
// Returns per-product unit/revenue totals for a custom date range.
// Range bounds use the operational-day cutoff (06:00 local) so a shift that
// crosses midnight on `endDate` is fully included.
// Returns: { data: [{ productName, categoryName, units, revenue }], error }
export async function getProductSalesForPeriod({ startDate, endDate }) {
    const startIso = `${startDate}T06:00:00-06:00`
    const endIso   = `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`

    const { data: comandas, error: comandasError } = await supabase
        .from('comandas')
        .select('id')
        .eq('status', 'paid')
        .gte('cobrado_at', startIso)
        .lt('cobrado_at', endIso)

    if (comandasError) return { data: [], error: comandasError }
    if (!comandas || comandas.length === 0) return { data: [], error: null }

    const { data: items, error } = await supabase
        .from('comanda_items')
        .select('quantity, unit_price, unit_cost_at_sale, is_free_benefit, is_free_mixer, product_id, source_shot_product_id, products:products!comanda_items_product_id_fkey(name, categories(name))')
        .in('comanda_id', comandas.map(c => c.id))
        .eq('status', 'active')

    if (error || !items) return { data: [], error }

    // ── Costo en vivo por producto (fallback cuando el snapshot es NULL) ──
    const [prodCostRes, recipeRes, invRes] = await Promise.all([
        supabase.from('products').select('id, manual_cost'),
        supabase.from('product_recipes').select('product_id, inventory_item_id, deduct_amount, active').eq('active', true),
        supabase.from('inventory_items').select('id, unit_cost'),
    ])
    const invById = {}
    for (const ii of invRes.data || []) invById[ii.id] = ii
    const recipesByProduct = {}
    for (const r of recipeRes.data || []) {
        if (!recipesByProduct[r.product_id]) recipesByProduct[r.product_id] = []
        recipesByProduct[r.product_id].push(r)
    }
    const liveCostByProduct = {}
    for (const p of prodCostRes.data || []) {
        liveCostByProduct[p.id] = computeProductCost(p, recipesByProduct[p.id] || [], invById)
    }

    // Costo unitario de una línea: snapshot congelado, o costo en vivo si está
    // completo; null = no costeable (se marca "sin costo").
    function lineUnitCost(item) {
        if (item.unit_cost_at_sale != null) return Number(item.unit_cost_at_sale)
        const lc = liveCostByProduct[item.product_id]
        return lc && lc.complete ? lc.cost : null
    }

    // Lookups por product_id (nombre + categoría) — para combos y roll-up.
    const nameByProductId = {}
    const categoryByProductId = {}
    for (const item of items) {
        nameByProductId[item.product_id]     = item.products?.name || 'Desconocido'
        categoryByProductId[item.product_id] = item.products?.categories?.name || 'Sin categoría'
    }

    // Override de unidades para combos de misma categoría (beer packs): la cuenta
    // real de unidades es el número de mixers, no la cantidad del combo.
    const mixerUnitCounts = {}
    for (const item of items) {
        if (!item.is_free_mixer || !item.source_shot_product_id) continue
        const comboCategory = categoryByProductId[item.source_shot_product_id]
        const mixerCategory = item.products?.categories?.name || 'Sin categoría'
        if (comboCategory && mixerCategory === comboCategory) {
            mixerUnitCounts[item.source_shot_product_id] =
                (mixerUnitCounts[item.source_shot_product_id] || 0) + Number(item.quantity || 1)
        }
    }

    // Bucket por producto (keyed por product_id para poder hacer roll-up).
    const products = {}
    function bucket(productId) {
        if (!products[productId]) {
            products[productId] = {
                productId,
                productName:  nameByProductId[productId] || 'Desconocido',
                categoryName: categoryByProductId[productId] || 'Sin categoría',
                units: 0, revenue: 0, cost: 0, costMissing: false,
            }
        }
        return products[productId]
    }

    // 1) Líneas vendidas (no gratis): unidades, revenue y costo propio.
    for (const item of items) {
        if (item.is_free_mixer || item.is_free_benefit) continue
        const units = Number(item.quantity || 1)
        const b = bucket(item.product_id)
        b.units   += units
        b.revenue += Number(item.unit_price || 0) * units
        const uc = lineUnitCost(item)
        if (uc == null) b.costMissing = true
        else b.cost += uc * units
    }

    // 2) Roll-up: el costo de mixers/cervezas incluidos se SUMA al producto padre.
    for (const item of items) {
        if (!item.is_free_mixer || !item.source_shot_product_id) continue
        const b = bucket(item.source_shot_product_id)
        const units = Number(item.quantity || 1)
        const uc = lineUnitCost(item)
        if (uc == null) b.costMissing = true
        else b.cost += uc * units
    }

    // 3) Margen final. (unit override por beer packs eliminado — las cubetas/promos
    //    muestran cuántas veces se vendió el combo, no cuántos componentes individuales.
    //    Para ver unidades físicas por SKU usa getProductUnitsForPeriod.)
    const rows = Object.values(products).map(p => {
        const margin = p.revenue - p.cost
        return {
            productName: p.productName,
            categoryName: p.categoryName,
            units: p.units,
            revenue: p.revenue,
            cost: p.cost,
            margin,
            marginPct: p.revenue > 0 ? (margin / p.revenue) * 100 : null,
            costMissing: p.costMissing,
        }
    })

    return { data: rows.sort((a, b) => b.revenue - a.revenue), error: null }
}

// ── Units per product (inventory view) ─────────────────────────
// Counts physical units per SKU across ALL channels:
//   - unitsDirect  = sold individually (is_free_mixer = false)
//   - unitsInPromo = served as component inside a cubeta/promo/shot (is_free_mixer = true)
//   - totalUnits   = unitsDirect + unitsInPromo
// Also returns a promosList breakdown (which promos each unit count came from).
// Membership benefits are excluded.
export async function getProductUnitsForPeriod({ startDate, endDate }) {
    const startIso = `${startDate}T06:00:00-06:00`
    const endIso   = `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`

    const { data: comandas, error: comandasError } = await supabase
        .from('comandas')
        .select('id')
        .eq('status', 'paid')
        .gte('cobrado_at', startIso)
        .lt('cobrado_at', endIso)

    if (comandasError) return { data: [], error: comandasError }
    if (!comandas || comandas.length === 0) return { data: [], error: null }

    const { data: items, error } = await supabase
        .from('comanda_items')
        .select(`
            quantity,
            is_free_mixer,
            is_free_benefit,
            source_shot_product_id,
            product_id,
            products:products!comanda_items_product_id_fkey(
                name,
                is_shot,
                categories(name)
            )
        `)
        .in('comanda_id', comandas.map(c => c.id))
        .eq('status', 'active')

    if (error || !items) return { data: [], error }

    // Build name/category map from the items we already have
    const nameById     = {}
    const categoryById = {}
    const isShotById   = {}
    for (const item of items) {
        nameById[item.product_id]     = item.products?.name || null
        categoryById[item.product_id] = item.products?.categories?.name || 'Sin categoría'
        isShotById[item.product_id]   = item.products?.is_shot || false
    }

    // Some source_shot_product_ids may point to cancelled shot rows (not in items).
    // Fetch their names so the promo breakdown makes sense.
    const missingIds = [...new Set(
        items
            .filter(i => i.is_free_mixer && i.source_shot_product_id && !nameById[i.source_shot_product_id])
            .map(i => i.source_shot_product_id)
    )]
    if (missingIds.length > 0) {
        const { data: extra } = await supabase
            .from('products')
            .select('id, name, categories(name)')
            .in('id', missingIds)
        for (const p of extra || []) {
            nameById[p.id]     = p.name
            categoryById[p.id] = p.categories?.name || 'Sin categoría'
        }
    }

    // Aggregate by product_id
    const byProduct = {}
    function ensureBucket(productId) {
        if (!byProduct[productId]) {
            byProduct[productId] = {
                productId,
                productName:  nameById[productId]     || 'Desconocido',
                categoryName: categoryById[productId] || 'Sin categoría',
                isBundle:     isShotById[productId]   || false,
                unitsDirect:  0,
                unitsInPromo: 0,
                promos:       {},
            }
        }
        return byProduct[productId]
    }

    for (const item of items) {
        if (item.is_free_benefit) continue
        const units = Number(item.quantity || 1)

        if (item.is_free_mixer && item.source_shot_product_id) {
            // Served as a component inside a promo / cubeta / shot
            const b = ensureBucket(item.product_id)
            b.unitsInPromo += units
            const pid = item.source_shot_product_id
            if (!b.promos[pid]) b.promos[pid] = { promoId: pid, promoName: nameById[pid] || 'Promo desconocida', units: 0 }
            b.promos[pid].units += units
        } else if (!item.is_free_mixer) {
            // Direct sale (includes the promo/cubeta products themselves)
            ensureBucket(item.product_id).unitsDirect += units
        }
    }

    const rows = Object.values(byProduct)
        .map(p => ({
            productId:    p.productId,
            productName:  p.productName,
            categoryName: p.categoryName,
            isBundle:     p.isBundle,
            unitsDirect:  p.unitsDirect,
            unitsInPromo: p.unitsInPromo,
            totalUnits:   p.unitsDirect + p.unitsInPromo,
            promosList:   Object.values(p.promos).sort((a, b) => b.units - a.units),
        }))
        .filter(p => p.totalUnits > 0)
        .sort((a, b) => b.totalUnits - a.totalUnits)

    return { data: rows, error: null }
}

export async function getTopCategoriesRevenue(days = 14) {
    const { data: comandas } = await supabase
        .from('comandas')
        .select('id')
        .eq('status', 'paid')
        .gte('cobrado_at', daysAgo(days).toISOString())

    if (!comandas || comandas.length === 0) return { data: [], error: null }

    const { data: items, error } = await supabase
        .from('comanda_items')
        .select('quantity, unit_price, is_free_benefit, products:products!comanda_items_product_id_fkey(categories(name))')
        .in('comanda_id', comandas.map(c => c.id))
        .eq('status', 'active')
        .eq('is_free_mixer', false)

    if (error || !items) return { data: [], error }

    const cats = {}
    items.forEach(item => {
        if (item.is_free_benefit) return
        const cat = item.products?.categories?.name || 'Sin categoría'
        const rev = Number(item.unit_price || 0) * Number(item.quantity || 1)
        if (!cats[cat]) cats[cat] = { name: cat, revenue: 0, units: 0 }
        cats[cat].revenue += rev
        cats[cat].units   += Number(item.quantity || 1)
    })

    return { data: Object.values(cats).sort((a, b) => b.revenue - a.revenue), error: null }
}

// ─────────────────────────────────────────────────────────────
// Customer Intelligence
// ─────────────────────────────────────────────────────────────

export async function getTopCustomersByVisits(limit = 12) {
    const { data, error } = await supabase
        .from('customers')
        .select('id, customer_number, name, visit_count, bottle_credits_available')
        .order('visit_count', { ascending: false })
        .limit(limit)
    return { data: data || [], error }
}

export async function getMembershipFunnel() {
    const month = currentMonthDate()
    const [totalRes, activeRes, expiredRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('customer_memberships').select('id', { count: 'exact', head: true }).eq('month', month).eq('status', 'active'),
        supabase.from('customer_memberships').select('id', { count: 'exact', head: true }).eq('month', month).eq('status', 'expired'),
    ])
    return {
        data: {
            totalCustomers:   totalRes.count  || 0,
            activeThisMonth:  activeRes.count || 0,
            expiredThisMonth: expiredRes.count || 0,
        },
        error: totalRes.error || activeRes.error || expiredRes.error,
    }
}

export async function getNewCustomersThisMonth() {
    const { data, error } = await supabase
        .from('customers')
        .select('id, customer_number, name, created_at')
        .gte('created_at', startOfMonth().toISOString())
        .order('created_at', { ascending: false })
    return { data: data || [], error }
}

export async function getCustomersWithBottleCredits() {
    const { data, error } = await supabase
        .from('customers')
        .select('id, customer_number, name, bottle_credits_available, visit_count')
        .gt('bottle_credits_available', 0)
        .order('bottle_credits_available', { ascending: false })
    return { data: data || [], error }
}

// ─────────────────────────────────────────────────────────────
// Inventory Dashboard
// ─────────────────────────────────────────────────────────────

export async function getAllInventoryItems() {
    const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, unit_type, current_stock, capacity_oz, active')
        .order('current_stock', { ascending: true })
    return { data: data || [], error }
}

export async function getRecentInventoryMovements(limit = 30) {
    const { data, error } = await supabase
        .from('inventory_movements')
        .select('id, created_at, movement_type, quantity_change, resulting_stock, note, inventory_items(name, unit_type)')
        .order('created_at', { ascending: false })
        .limit(limit)
    return { data: data || [], error }
}

export async function getTopConsumedItems(days = 7) {
    const { data, error } = await supabase
        .from('inventory_movements')
        .select('inventory_item_id, quantity_change, inventory_items(name)')
        .eq('movement_type', 'sale_deduction')
        .gte('created_at', daysAgo(days).toISOString())

    if (error || !data) return { data: [], error }

    const byItem = {}
    data.forEach(m => {
        const name = m.inventory_items?.name || 'Desconocido'
        if (!byItem[name]) byItem[name] = { name, totalDeducted: 0 }
        byItem[name].totalDeducted += Math.abs(Number(m.quantity_change || 0))
    })

    return {
        data: Object.values(byItem).sort((a, b) => b.totalDeducted - a.totalDeducted).slice(0, 8),
        error: null,
    }
}

/**
 * Returns comanda events for audit, joined with user name, folio, and unit name.
 * Ordered by created_at descending. Hard limit of 500 rows.
 */
export async function getComandaEvents({ startDate, endDate, eventType } = {}) {
    let query = supabase
        .from('comanda_events')
        .select(`
            id,
            created_at,
            event_type,
            users ( name ),
            comandas ( folio, units ( name ) )
        `)
        .order('created_at', { ascending: false })
        .limit(500)

    // Operational-day cutoff (06:00 local) so a shift crossing midnight isn't
    // split across two calendar days — same convention as buildDailyRevenue.
    if (startDate)  query = query.gte('created_at', `${startDate}T06:00:00-06:00`)
    if (endDate)    query = query.lt('created_at', `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`)
    if (eventType && eventType !== 'all') query = query.eq('event_type', eventType)

    const { data, error } = await query
    return { data, error }
}

// ── Multi-week comparison ─────────────────────────────────────
// Returns the last `numWeeks` operational weeks (Sun 06:00 → Sun 06:00),
// each with total revenue (payments.total_paid) and expenses (cash_movements).
// Uses the same OPERATIONAL_DAY_SHIFT_MS bucketing as operationalDateKey so
// early-morning records (before 6am) belong to the previous day/week.
function operationalWeekSunday(timestamp) {
    // Shift the timestamp by the operational offset, then find that date's Sunday
    const ms = new Date(timestamp).getTime() - OPERATIONAL_DAY_SHIFT_MS
    const d  = new Date(ms)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())   // roll back to Sunday in shifted-UTC
    return d.toISOString().split('T')[0]
}

export async function getWeeklySummary({ numWeeks = 4 } = {}) {
    // Current operational week's Sunday (same 12h shift as operationalDateKey)
    const weekStartStr = operationalWeekSunday(Date.now())
    // Range start: (numWeeks-1) weeks before the current week
    const rangeStartStr = addDaysToDateString(weekStartStr, -(numWeeks - 1) * 7)
    const rangeStartIso = `${rangeStartStr}T06:00:00-06:00`
    // Range end: tomorrow 06:00 (captures today fully)
    const tomorrowStr   = addDaysToDateString(isoDate(new Date()), 1)
    const rangeEndIso   = `${tomorrowStr}T06:00:00-06:00`

    const [paymentsRes, movementsRes] = await Promise.all([
        supabase.from('payments')
            .select('created_at, total_paid')
            .gte('created_at', rangeStartIso)
            .lt('created_at',  rangeEndIso),
        supabase.from('cash_movements')
            .select('created_at, amount, movement_nature')
            .gte('created_at', rangeStartIso)
            .lt('created_at',  rangeEndIso),
    ])

    // Build ordered week buckets (oldest → newest)
    const buckets = {}
    for (let i = 0; i < numWeeks; i++) {
        const sunStr = addDaysToDateString(rangeStartStr, i * 7)
        const satStr = addDaysToDateString(sunStr, 6)
        buckets[sunStr] = { sunStr, satStr, revenue: 0, expenses: 0 }
    }

    for (const p of (paymentsRes.data || [])) {
        const key = operationalWeekSunday(p.created_at)
        if (buckets[key]) buckets[key].revenue += Number(p.total_paid || 0)
    }
    for (const m of (movementsRes.data || [])) {
        if (m.movement_nature !== 'expense') continue
        const key = operationalWeekSunday(m.created_at)
        if (buckets[key]) buckets[key].expenses += Number(m.amount || 0)
    }

    return {
        data: Object.values(buckets),   // ordered oldest-first
        error: paymentsRes.error || movementsRes.error || null,
    }
}

// ── Monthly reporting ─────────────────────────────────────────

// Returns revenue (sin propina), tips, and expenses for each of the 12 months
// of `year`, bucketed using the same 12h operational shift as the rest of the system.
export async function getYearlyMonthSummaries({ year }) {
    const startIso = `${year}-01-01T06:00:00-06:00`
    const endIso   = `${year + 1}-01-01T06:00:00-06:00`

    const [paymentsRes, movementsRes] = await Promise.all([
        supabase.from('payments')
            .select('created_at, total_paid, tip_amount')
            .gte('created_at', startIso)
            .lt('created_at',  endIso),
        supabase.from('cash_movements')
            .select('created_at, amount, movement_nature')
            .gte('created_at', startIso)
            .lt('created_at',  endIso),
    ])

    const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, revenue: 0, tips: 0, expenses: 0,
    }))

    for (const p of (paymentsRes.data || [])) {
        const idx = new Date(new Date(p.created_at).getTime() - OPERATIONAL_DAY_SHIFT_MS).getUTCMonth()
        months[idx].revenue += Number(p.total_paid || 0) - Number(p.tip_amount || 0)
        months[idx].tips    += Number(p.tip_amount || 0)
    }
    for (const m of (movementsRes.data || [])) {
        if (m.movement_nature !== 'expense') continue
        const idx = new Date(new Date(m.created_at).getTime() - OPERATIONAL_DAY_SHIFT_MS).getUTCMonth()
        months[idx].expenses += Number(m.amount || 0)
    }

    return { data: months, error: paymentsRes.error || movementsRes.error || null }
}

// Returns raw payments and cash_movements for a specific month,
// plus the date strings needed to call getProductSalesForPeriod and getLedgerData.
export async function getMonthlyReportData({ year, month }) {
    const mm       = String(month).padStart(2, '0')
    const nextMon  = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const nmm      = String(nextMon).padStart(2, '0')
    const startIso = `${year}-${mm}-01T06:00:00-06:00`
    const endIso   = `${nextYear}-${nmm}-01T06:00:00-06:00`

    // Last calendar day of the month (for getProductSalesForPeriod endDate)
    const lastDay = new Date(year, month, 0).getDate()
    const lastDayStr = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

    const [paymentsRes, movementsRes] = await Promise.all([
        supabase.from('payments')
            .select('created_at, total_paid, tip_amount, efectivo, tarjeta, transferencia')
            .gte('created_at', startIso)
            .lt('created_at',  endIso),
        supabase.from('cash_movements')
            .select('created_at, amount, movement_nature, category, source_location, destination_location')
            .gte('created_at', startIso)
            .lt('created_at',  endIso),
    ])

    return {
        payments:      paymentsRes.data  || [],
        cashMovements: movementsRes.data || [],
        startDate: `${year}-${mm}-01`,
        endDate:   lastDayStr,
        error: paymentsRes.error || movementsRes.error || null,
    }
}

