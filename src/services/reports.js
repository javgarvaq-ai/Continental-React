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
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = isoDate(d)
        buckets[key] = { date: key, label: d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }), revenue: 0, comandas: 0, tips: 0 }
    }
    payments.forEach(p => {
        const key = p.created_at.split('T')[0]
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
        const dow = new Date(p.created_at).getDay()
        days[dow].revenue += Number(p.total_paid || 0)
        days[dow].count   += 1
    })
    return days
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
        .select('quantity, unit_price, is_free_benefit, products(categories(name))')
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
        .select('id, created_at, movement_type, quantity_change, resulting_stock, inventory_items(name, unit_type)')
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
