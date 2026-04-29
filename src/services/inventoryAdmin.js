import { supabase } from './supabase'

export async function getAllInventoryItems() {
    return await supabase
        .from('inventory_items')
        .select('*')
        .order('created_at', { ascending: true })
}

export async function createInventoryItem({
    name,
    unitType,
    capacityOz,
}) {
    return await supabase.from('inventory_items').insert([
        {
            name: name.trim(),
            unit_type: unitType,
            capacity_oz: unitType === 'oz' ? Number(capacityOz || 0) : null,
            active: true,
        },
    ])
}

export async function updateInventoryItem({
    id,
    name,
    unitType,
    capacityOz,
    active,
}) {
    return await supabase
        .from('inventory_items')
        .update({
            name: name.trim(),
            unit_type: unitType,
            capacity_oz: unitType === 'oz' ? Number(capacityOz || 0) : null,
            active: Boolean(active),
        })
        .eq('id', id)
}

export async function toggleInventoryItemActive({ id, active }) {
    return await supabase
        .from('inventory_items')
        .update({ active: Boolean(active) })
        .eq('id', id)
}