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
            .single()

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
