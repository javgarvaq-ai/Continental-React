import { supabase } from './supabase'

export async function getOrCreateActiveComanda({ unitId, userId, customerName, customerId = null, prefetchedExisting = undefined }) {
    let existing = prefetchedExisting

    if (existing === undefined) {
        const { data, error: existingError } = await supabase
            .from('comandas')
            .select('*')
            .eq('unit_id', unitId)
            .in('status', ['open', 'pending_payment', 'processing_payment'])
            .limit(1)

        if (existingError) {
            return { data: null, error: existingError }
        }

        existing = data
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
                customer_id: customerId || null,
            },
        ])
        .select()
        .single()

    if (newComandaError) {
        // Postgres unique-constraint violation (23505): another tablet created the
        // comanda between our SELECT and this INSERT. Re-read and return it.
        if (newComandaError.code === '23505') {
            const { data: raceData, error: raceError } = await supabase
                .from('comandas')
                .select('*')
                .eq('unit_id', unitId)
                .in('status', ['open', 'pending_payment', 'processing_payment'])
                .limit(1)

            if (raceError || !raceData || raceData.length === 0) {
                return { data: null, error: raceError || new Error('No se pudo abrir la mesa. Intenta de nuevo.') }
            }

            return { data: raceData[0], error: null }
        }

        return { data: null, error: newComandaError }
    }

    await supabase.from('comanda_events').insert([
        {
            comanda_id: newComanda.id,
            user_id: userId,
            event_type: 'created',
            event_data: {
                customer_name: cleanName || null,
                customer_id: customerId || null,
            },
        },
    ])

    return { data: newComanda, error: null }
}
export async function cancelComanda({ comandaId, userId }) {
    const { data: updated, error: updateError } = await supabase
        .from('comandas')
        .update({
            status: 'cancelled',
            closed_at: new Date().toISOString(),
        })
        .eq('id', comandaId)
        .eq('status', 'open')
        .select('id')

    if (updateError) {
        return { error: updateError }
    }

    if (!updated || updated.length === 0) {
        return { error: new Error('La comanda ya no está abierta.') }
    }

    // Cancel any membership that was activated on this comanda but never paid
    const { error: membershipCancelError } = await supabase
        .from('customer_memberships')
        .update({ status: 'cancelled' })
        .eq('paid_via_comanda_id', comandaId)
        .eq('status', 'active')

    if (membershipCancelError) {
        return { error: membershipCancelError }
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
export async function assignCustomerToComanda({ comandaId, customerId, customerName }) {
    const { data: updated, error } = await supabase
        .from('comandas')
        .update({ customer_id: customerId, customer_name: customerName })
        .eq('id', comandaId)
        .eq('status', 'open')
        .select('id')

    if (error) return { error }

    if (!updated || updated.length === 0) {
        return { error: new Error('La comanda ya no está abierta.') }
    }

    return { error: null }
}

export async function getActiveComandaByUnit({ unitId }) {
    const { data, error } = await supabase
        .from('comandas')
        .select('*')
        .eq('unit_id', unitId)
        .in('status', ['open', 'pending_payment', 'processing_payment'])
        .limit(1)

    return { data: data || [], error }
}
