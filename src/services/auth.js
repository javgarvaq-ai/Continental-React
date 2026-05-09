import { supabase } from './supabase'

export async function loginWithPin({ userId, pin }) {
    // PIN verified entirely server-side — pin_hash never leaves the DB.
    const { data: result, error } = await supabase.rpc('verify_pin', {
        p_user_id: userId,
        p_pin:     pin,
    })

    if (error) {
        return { data: null, error: new Error('Error al verificar PIN.') }
    }

    if (!result?.success) {
        return { data: null, error: new Error(result?.error || 'PIN incorrecto') }
    }

    return { data: result.user, error: null }
}

export async function getOpenShift() {
    const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('status', 'open')
        .limit(1)

    return { data, error }
}

export async function createShift({ startingCash, userId }) {
    const { data, error } = await supabase
        .from('shifts')
        .insert([
            {
                starting_cash: startingCash,
                opened_by_user_id: userId,
            },
        ])
        .select()
        .single()

    return { data, error }
}