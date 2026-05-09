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

export async function adjustInventoryStock({ id, amount, note, userId, type }) {
    const { data: result, error } = await supabase.rpc('adjust_inventory_stock', {
        p_id:      id,
        p_amount:  Number(amount),
        p_type:    type === 'entry' ? 'entry' : 'adjustment_minus',
        p_user_id: userId || null,
        p_note:    note || null,
    })

    if (error) return { error }

    if (!result?.ok) {
        return { error: new Error(result?.error || 'Error al ajustar inventario.') }
    }

    return { error: null, data: result.new_stock }
}