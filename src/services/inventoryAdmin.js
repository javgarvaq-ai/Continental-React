import { supabase } from './supabase'

export async function getAllInventoryItems() {
    const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('created_at', { ascending: true })
    return { data, error }
}

export async function createInventoryItem({
    name,
    unitType,
    capacityOz,
}) {
    const { data, error } = await supabase.from('inventory_items').insert([
        {
            name: name.trim(),
            unit_type: unitType,
            capacity_oz: unitType === 'oz' ? Number(capacityOz || 0) : null,
            active: true,
        },
    ])
    return { data, error }
}

export async function updateInventoryItem({
    id,
    name,
    unitType,
    capacityOz,
    active,
}) {
    const { data, error } = await supabase
        .from('inventory_items')
        .update({
            name: name.trim(),
            unit_type: unitType,
            capacity_oz: unitType === 'oz' ? Number(capacityOz || 0) : null,
            active: Boolean(active),
        })
        .eq('id', id)
    return { data, error }
}

export async function toggleInventoryItemActive({ id, active }) {
    const { data, error } = await supabase
        .from('inventory_items')
        .update({ active: Boolean(active) })
        .eq('id', id)
    return { data, error }
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
        if (result?.error === 'insufficient_stock') {
            return {
                error: new Error(
                    `Stock insuficiente. Stock actual: ${result.current_stock} unidades.`
                ),
            }
        }
        return { error: new Error(result?.error || 'Error al ajustar inventario.') }
    }

    return { error: null, data: result.new_stock }
}