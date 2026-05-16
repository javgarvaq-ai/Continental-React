import { supabase } from './supabase'

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
        .gte('opened_at', `${startDate}T00:00:00`)
        .lte('opened_at', `${endDate}T23:59:59`)
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
        .select('id, quantity, unit_price, is_free_benefit, is_free_mixer, products ( name )')
        .eq('comanda_id', comandaId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
    return { data: data || [], error }
}
