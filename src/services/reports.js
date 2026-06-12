import { supabase } from './supabase'

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
    const startIso = `${startDate}T00:00:00-06:00`
    const endIso = `${endDate}T23:59:59-06:00`

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
            .lte('created_at', endIso),

        supabase
            .from('cash_movements')
            .select('*')
            .gte('created_at', startIso)
            .lte('created_at', endIso),

        supabase
            .from('comandas')
            .select('*')
            .eq('status', 'paid')
            .gte('cobrado_at', startIso)
            .lte('cobrado_at', endIso),
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
function addDaysToDateString(dateStr, days) {
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
        .select('quantity, unit_price, is_free_benefit, products:products!comanda_items_product_id_fkey(name, categories(name))')
        .in('comanda_id', comandas.map(c => c.id))
        .eq('status', 'active')
        .eq('is_free_mixer', false)

    if (error || !items) return { data: [], error }

    const products = {}
    items.forEach(item => {
        if (item.is_free_benefit) return
        const productName  = item.products?.name || 'Desconocido'
        const categoryName = item.products?.categories?.name || 'Sin categoría'
        const units  = Number(item.quantity || 1)
        const revenue = Number(item.unit_price || 0) * units

        const key = productName
        if (!products[key]) products[key] = { productName, categoryName, units: 0, revenue: 0 }
        products[key].units   += units
        products[key].revenue += revenue
    })

    return { data: Object.values(products).sort((a, b) => b.revenue - a.revenue), error: null }
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

    if (startDate)  query = query.gte('created_at', `${startDate}T00:00:00-06:00`)
    if (endDate)    query = query.lte('created_at', `${endDate}T23:59:59-06:00`)
    if (eventType && eventType !== 'all') query = query.eq('event_type', eventType)

    const { data, error } = await query
    return { data, error }
}

