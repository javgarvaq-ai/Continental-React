import { supabase } from './supabase'
import bcrypt from 'bcryptjs'

export async function loginWithPin({ userId, pin }) {
    // Fetch only the fields needed — pin_hash used for bcrypt.compare only,
    // stripped before returning so it never reaches localStorage.
    const { data: user, error } = await supabase
        .from('users')
        .select('id, name, role, active, pin_hash')
        .eq('id', userId)
        .eq('active', true)
        .single()

    if (error || !user) {
        return { data: null, error: new Error('Usuario no encontrado') }
    }

    const isValid = await bcrypt.compare(pin, user.pin_hash)

    if (!isValid) {
        return { data: null, error: new Error('PIN incorrecto') }
    }

    // Strip pin_hash — caller and localStorage never see it
    const { pin_hash: _discard, ...safeUser } = user
    return { data: safeUser, error: null }
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