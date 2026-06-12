import { supabase } from './supabase'
import { addDaysToDateString } from './reports'

export async function getComandaByFolio(folioNumero) {
    const { data: comanda, error } = await supabase
        .from('comandas')
        .select('*')
        .eq('folio', folioNumero)
        .single()

    if (error || !comanda) {
        return { data: null, error: error || new Error('No se encontró una comanda con ese folio.') }
    }

    return { data: comanda, error: null }
}

export async function getReprintData({ comanda, tipo, userId }) {
    const { data: items } = await supabase
        .from('comanda_items')
        .select('*, products:products!comanda_items_product_id_fkey(name)')
        .eq('comanda_id', comanda.id)
        .eq('status', 'active')

    const { data: unit } = await supabase
        .from('units')
        .select('*')
        .eq('id', comanda.unit_id)
        .single()

    let payment = null

    if (tipo === 'pagado') {
        const { data: paymentData } = await supabase
            .from('payments')
            .select('*')
            .eq('comanda_id', comanda.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        payment = paymentData
    }

    if (userId) {
        await supabase.from('comanda_events').insert([{
            comanda_id: comanda.id,
            user_id: userId,
            event_type: 'ticket_reprinted',
            event_data: {
                folio: comanda.folio,
                tipo_ticket: tipo,
            },
        }])
    }

    return { items: items || [], unit, payment }
}

// ── Tip adjustment ────────────────────────────────────────────
export async function adjustPaymentTip({ paymentId, tipAmount }) {
    const { data, error } = await supabase.rpc('adjust_payment_tip', {
        p_payment_id: paymentId,
        p_tip_amount: Number(tipAmount || 0),
    })
    if (error) return { error }
    if (data && !data.ok) {
        const msgs = {
            tip_negative:     'La propina no puede ser negativa.',
            payment_not_found:'No se encontró el registro de pago.',
            comanda_not_paid: 'Solo se puede ajustar propina de comandas pagadas.',
        }
        return { error: new Error(msgs[data.error] || 'Error al ajustar propina.') }
    }
    return { error: null }
}

// ── Folio history browser ─────────────────────────────────────
// Searches comandas by date range, optional folio number, customer name,
// or status. Returns up to `limit` results newest-first.
export async function searchComandas({ startDate, endDate, search = '', status = 'all', limit = 100 }) {
    let query = supabase
        .from('comandas')
        .select(`
            id, folio, status, opened_at, cobrado_at, final_total, personas,
            units ( name ),
            customers ( name, customer_number ),
            payments ( total_paid, efectivo, tarjeta, transferencia, tip_amount )
        `)
        // Operational-day cutoff (06:00 local, -06:00) so a shift crossing
        // midnight isn't split across two calendar days — same convention as
        // buildDailyRevenue. Previously missing the -06:00 offset entirely.
        .gte('opened_at', `${startDate}T06:00:00-06:00`)
        .lt('opened_at', `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`)
        .order('opened_at', { ascending: false })
        .limit(limit)

    if (status !== 'all') {
        if (status === 'open') {
            query = query.in('status', ['open', 'pending_payment', 'processing_payment'])
        } else {
            query = query.eq('status', status)
        }
    }

    const { data, error } = await query

    if (error || !data) return { data: [], error }

    // Client-side filter for folio number or customer name search
    const trimmed = search.trim()
    if (!trimmed) return { data, error: null }

    const isNumeric = /^\d+$/.test(trimmed)
    const filtered = data.filter(c => {
        if (isNumeric) return String(c.folio).includes(trimmed)
        const name = c.customers?.name?.toLowerCase() || ''
        const unit = c.units?.name?.toLowerCase() || ''
        return name.includes(trimmed.toLowerCase()) || unit.includes(trimmed.toLowerCase())
    })

    return { data: filtered, error: null }
}

// Fetch items for a single comanda (used in detail expand)
export async function getComandaItems(comandaId) {
    const { data, error } = await supabase
        .from('comanda_items')
        .select('id, quantity, unit_price, is_free_benefit, is_free_mixer, products:products!comanda_items_product_id_fkey ( name )')
        .eq('comanda_id', comandaId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
    return { data: data || [], error }
}
