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
    const { data: item, error: getError } = await supabase
        .from('inventory_items')
        .select('current_stock')
        .eq('id', id)
        .single()

    if (getError) return { error: getError }

    const currentStock = Number(item.current_stock || 0)
    const newStock = type === 'entry'
        ? currentStock + Number(amount)
        : Math.max(currentStock - Number(amount), 0)

    const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ current_stock: newStock })
        .eq('id', id)

    if (updateError) return { error: updateError }

    await supabase.from('inventory_movements').insert([{
        inventory_item_id: id,
        movement_type: type === 'entry' ? 'entry' : 'adjustment_minus',
        quantity_change: type === 'entry' ? Number(amount) : -Number(amount),
        quantity: newStock,
        user_id: userId || null,
        note: note || null,
    }])

    return { error: null, data: newStock }
}