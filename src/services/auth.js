import { supabase } from './supabase'

export async function loginWithPin({ userId, pin }) {
    // Fetch the employee's internal email (anon SELECT on users is allowed for the login screen)
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, name, role, active, email')
        .eq('id', userId)
        .eq('active', true)
        .single()

    if (userError || !user) {
        return { data: null, error: new Error('Usuario no encontrado.') }
    }

    if (!user.email) {
        return { data: null, error: new Error('Usuario sin cuenta configurada. Contacta al administrador.') }
    }

    // Sign in via Supabase Auth — PIN is the password
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: pin,
    })

    if (signInError) {
        if (signInError.message?.toLowerCase().includes('invalid login credentials')) {
            return { data: null, error: new Error('PIN incorrecto.') }
        }
        if (signInError.message?.toLowerCase().includes('too many requests')) {
            return { data: null, error: new Error('Demasiados intentos fallidos. Intenta en unos minutos.') }
        }
        if (signInError.message?.toLowerCase().includes('banned')) {
            return { data: null, error: new Error('Usuario desactivado. Contacta al administrador.') }
        }
        return { data: null, error: new Error('Error al verificar PIN.') }
    }

    // Return safe user object — no email, no pin_hash
    const { email: _email, ...safeUser } = user
    return { data: safeUser, error: null }
}

export async function logout() {
    await supabase.auth.signOut()
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
