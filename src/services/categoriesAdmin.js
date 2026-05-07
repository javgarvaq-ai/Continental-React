import { supabase } from './supabase'

export async function getAllCategories() {
    return await supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })
}

export async function createCategory({ name }) {
    return await supabase
        .from('categories')
        .insert([{ name: name.trim(), active: true }])
        .select()
        .single()
}

export async function updateCategory({ id, name }) {
    return await supabase
        .from('categories')
        .update({ name: name.trim() })
        .eq('id', id)
        .select()
        .single()
}

export async function deactivateCategory({ id }) {
    return await supabase
        .from('categories')
        .update({ active: false })
        .eq('id', id)
}
