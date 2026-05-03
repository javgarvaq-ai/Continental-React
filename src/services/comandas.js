import { supabase } from './supabase'

export async function getOrCreateActiveComanda({ unitId, userId, customerName }) {
    const { data: existing, error: existingError } = await supabase
        .from('comandas')
        .select('*')
        .eq('unit_id', unitId)
        .in('status', ['open', 'pending_payment', 'processing_payment'])
        .limit(1)

    if (existingError) {
        return { data: null, error: existingError }
    }

    if (existing && existing.length > 0) {
        return { data: existing[0], error: null }
    }

    const cleanName = (customerName || '').trim()

    const { data: newComanda, error: newComandaError } = await supabase
        .from('comandas')
        .insert([
            {
                unit_id: unitId,
                status: 'open',
                opened_by: userId,
                personas: 0,
                customer_name: cleanName || null,
            },
        ])
        .select()
        .single()

    if (newComandaError) {
        return { data: null, error: newComandaError }
    }

    await supabase.from('comanda_events').insert([
        {
            comanda_id: newComanda.id,
            user_id: userId,
            event_type: 'created',
            event_data: {
                customer_name: cleanName || null,
            },
        },
    ])

    return { data: newComanda, error: null }
}
export async function cancelComanda({ comandaId, userId }) {
    const { error: updateError } = await supabase
        .from('comandas')
        .update({
            status: 'cancelled',
            closed_at: new Date().toISOString(),
        })
        .eq('id', comandaId)

    if (updateError) {
        return { error: updateError }
    }

    await supabase.from('comanda_events').insert([
        {
            comanda_id: comandaId,
            user_id: userId,
            event_type: 'cancelled',
            event_data: { reason: 'manual_cancel' },
        },
    ])

    return { error: null }
}