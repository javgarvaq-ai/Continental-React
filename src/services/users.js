import { supabase } from './supabase'

export async function getActiveUsers() {
    const { data, error } = await supabase
        .from('users')
        .select('id, name, role, active')
        .eq('active', true)
        .order('name')

    return { data, error }
}