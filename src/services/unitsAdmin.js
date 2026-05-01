import { supabase } from './supabase'

export async function getAllUnits() {
    return await supabase
        .from('units')
        .select('*')
        .order('name', { ascending: true })
}

export async function createUnit({ name, type }) {
    return await supabase
        .from('units')
        .insert([{ name: name.trim(), type: type.trim() }])
        .select()
        .single()
}

export async function updateUnit({ id, name, type }) {
    return await supabase
        .from('units')
        .update({ name: name.trim(), type: type.trim() })
        .eq('id', id)
        .select()
        .single()
}

export async function deleteUnit({ id }) {
    return await supabase
        .from('units')
        .delete()
        .eq('id', id)
}