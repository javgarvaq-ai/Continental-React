import { supabase } from './supabase'

export async function getAllUsers() {
    return await supabase
        .from('users')
        .select('id, name, role, active, created_at')
        .order('created_at', { ascending: true })
}

export async function createUser({ name, role, pin }) {
    const { data, error } = await supabase.functions.invoke('create-user', {
        body: { name, role, pin },
    })

    if (error) return { data: null, error }
    if (!data?.success) return { data: null, error: new Error(data?.error || 'Error creando usuario') }
    return { data: data.user, error: null }
}

export async function updateUserActive({ userId, active }) {
    const { data, error } = await supabase.functions.invoke('deactivate-user', {
        body: { userId, active },
    })

    if (error) return { data: null, error }
    if (!data?.success) return { data: null, error: new Error(data?.error || 'Error actualizando usuario') }
    return { data: null, error: null }
}

export async function resetUserPin({ userId, pin }) {
    const { data, error } = await supabase.functions.invoke('reset-pin', {
        body: { userId, pin },
    })

    if (error) return { data: null, error }
    if (!data?.success) return { data: null, error: new Error(data?.error || 'Error reseteando PIN') }
    return { data: null, error: null }
}
