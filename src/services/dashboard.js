import { supabase } from './supabase'

// Returns the ISO string for midnight today in Mexico timezone (-06:00).
// Uses explicit offset — matches the pattern used throughout reports.js and the rest of the codebase.
// Do NOT use d.toISOString() here: it converts to UTC and shifts the boundary by 6 hours,
// causing "today" to include late-night records from yesterday or miss early-morning ones.
function startOfToday() {
    const d = new Date()
    const y   = d.getFullYear()
    const m   = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}T00:00:00-06:00`
}

// ── Current open shift ────────────────────────────────────────
export async function getCurrentShift() {
    const { data, error } = await supabase
        .from('shifts')
        .select('id, opened_at, status, users!opened_by_user_id(name)')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    return { data, error }
}

// ── Today's payments aggregated ───────────────────────────────
// Returns: { totalRevenue, totalTips, totalEfectivo, totalTarjeta,
//            totalTransferencia, comandaCount }
export async function getTodayPaymentStats() {
    const { data, error } = await supabase
        .from('payments')
        .select('total_paid, tip_amount, efectivo, tarjeta, transferencia, comanda_id')
        .gte('created_at', startOfToday())

    if (error || !data) return { data: null, error }

    const stats = data.reduce((acc, p) => {
        acc.totalRevenue      += Number(p.total_paid       || 0)
        acc.totalTips         += Number(p.tip_amount       || 0)
        acc.totalEfectivo     += Number(p.efectivo         || 0)
        acc.totalTarjeta      += Number(p.tarjeta          || 0)
        acc.totalTransferencia+= Number(p.transferencia    || 0)
        acc.comandaCount      += 1
        return acc
    }, {
        totalRevenue: 0, totalTips: 0, totalEfectivo: 0,
        totalTarjeta: 0, totalTransferencia: 0, comandaCount: 0,
    })

    return { data: stats, error: null }
}

// ── Open tables right now ─────────────────────────────────────
export async function getOpenTables() {
    const { data, error } = await supabase
        .from('comandas')
        .select('id, status, opened_at, folio, final_total, units(name), customers(name)')
        .not('status', 'in', '(paid,cancelled)')
        .order('opened_at', { ascending: true })
    return { data: data || [], error }
}

// ── Sales velocity — current hour vs previous hour ────────────
// Returns: { currentHour: { revenue, count }, prevHour: { revenue, count } }
export async function getSalesVelocity() {
    const now = new Date()

    const startCurrent = new Date(now)
    startCurrent.setMinutes(0, 0, 0)

    const startPrev = new Date(startCurrent)
    startPrev.setHours(startPrev.getHours() - 1)

    const [currentRes, prevRes] = await Promise.all([
        supabase
            .from('payments')
            .select('total_paid')
            .gte('created_at', startCurrent.toISOString()),
        supabase
            .from('payments')
            .select('total_paid')
            .gte('created_at', startPrev.toISOString())
            .lt('created_at', startCurrent.toISOString()),
    ])

    function aggregate(rows) {
        return (rows || []).reduce(
            (acc, p) => ({ revenue: acc.revenue + Number(p.total_paid || 0), count: acc.count + 1 }),
            { revenue: 0, count: 0 }
        )
    }

    return {
        data: {
            currentHour: aggregate(currentRes.data),
            prevHour:    aggregate(prevRes.data),
            currentHourLabel: startCurrent.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
            prevHourLabel:    startPrev.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        },
        error: currentRes.error || prevRes.error || null,
    }
}

// ── Top 5 products sold today ─────────────────────────────────
export async function getTopProductsToday() {
    // Step 1: get today's paid comanda IDs
    const { data: paidComandas, error: e1 } = await supabase
        .from('comandas')
        .select('id')
        .eq('status', 'paid')
        .gte('cobrado_at', startOfToday())

    if (e1 || !paidComandas || paidComandas.length === 0) return { data: [], error: e1 }

    const ids = paidComandas.map(c => c.id)

    // Step 2: fetch items for those comandas
    const { data: items, error: e2 } = await supabase
        .from('comanda_items')
        .select('quantity, products(name)')
        .in('comanda_id', ids)
        .eq('status', 'active')
        .eq('is_free_mixer', false)
        .eq('is_free_benefit', false)

    if (e2 || !items) return { data: [], error: e2 }

    // Step 3: aggregate in JS
    const counts = {}
    items.forEach(item => {
        const name = item.products?.name || 'Desconocido'
        counts[name] = (counts[name] || 0) + (item.quantity || 1)
    })

    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, units]) => ({ name, units }))

    return { data: sorted, error: null }
}

// ── Last 8 payments ───────────────────────────────────────────
export async function getRecentPayments() {
    const { data, error } = await supabase
        .from('payments')
        .select('id, created_at, total_paid, efectivo, tarjeta, transferencia, tip_amount, comandas(folio, customers(name))')
        .order('created_at', { ascending: false })
        .limit(8)
    return { data: data || [], error }
}

// ── Membership activations this month ────────────────────────
export async function getMembershipStatsToday() {
    const { count, error } = await supabase
        .from('customer_memberships')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfToday())
        .eq('status', 'active')
    return { data: count || 0, error }
}
