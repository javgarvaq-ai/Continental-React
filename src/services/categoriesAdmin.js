import { supabase } from './supabase'

export async function getAllCategories() {
    return await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true })
}

export async function createCategory({ name }) {
    return await supabase
        .from('categories')
        .insert([{ name: name.trim() }])
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

export async function deleteCategory({ id }) {
    return await supabase
        .from('categories')
        .delete()
        .eq('id', id)
}