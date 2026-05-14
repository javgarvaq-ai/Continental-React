import { supabase } from './supabase'

export async function getAllUnits() {
    const { data, error } = await supabase
        .from('units')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })
    return { data, error }
}

export async function createUnit({ name, type }) {
    const { data, error } = await supabase
        .from('units')
        .insert([{ name: name.trim(), type: type.trim(), active: true }])
        .select()
        .single()
    return { data, error }
}

export async function updateUnit({ id, name, type }) {
    const { data, error } = await supabase
        .from('units')
        .update({ name: name.trim(), type: type.trim() })
        .eq('id', id)
        .select()
        .single()
    return { data, error }
}

export async function deactivateUnit({ id }) {
    const { data, error } = await supabase
        .from('units')
        .update({ active: false })
        .eq('id', id)
    return { data, error }
}
