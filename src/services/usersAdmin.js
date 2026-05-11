import { supabase } from './supabase'

export async function getAllUsers() {
    return await supabase
        .from('users')
        .select('id, name, role, active, created_at')
        .order('created_at', { ascending: true })
}

export async function createUser({ name, role, pin }) {
    const { data: result, error } = await supabase.rpc('create_user', {
        p_name: name.trim(),
        p_role: role,
        p_pin:  pin,
    })

    if (error) return { data: null, error }
    if (!result?.success) return { data: null, error: new Error(result?.error || 'Error creando usuario') }
    return { data: { id: result.id }, error: null }
}

export async function updateUserActive({ userId, active }) {
    const { data: result, error } = await supabase.rpc('update_user_active', {
        p_user_id: userId,
        p_active:  active,
    })

    if (error) return { data: null, error }
    if (!result?.success) return { data: null, error: new Error(result?.error || 'Error actualizando usuario') }
    return { data: null, error: null }
}

export async function resetUserPin({ userId, pin }) {
    const { data: result, error } = await supabase.rpc('reset_user_pin', {
        p_user_id: userId,
        p_pin:     pin,
    })

    if (error) return { data: null, error }
    if (!result?.success) return { data: null, error: new Error(result?.error || 'Error reseteando PIN') }
    return { data: null, error: null }
}