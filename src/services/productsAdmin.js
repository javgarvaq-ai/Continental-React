import { supabase } from './supabase'

export async function getAllProductsAdmin() {
    const { data: products, error: productsError } = await supabase
        .from('products')
        .select(`
            id,
            name,
            price,
            category_id,
            is_shot,
            is_mixer,
            free_mixers_qty,
            requires_inventory,
            active,
            created_at
        `)
        .order('created_at', { ascending: true })

    if (productsError) {
        return { data: null, error: productsError }
    }

    const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true })

    if (categoriesError) {
        return { data: null, error: categoriesError }
    }

    return {
        data: {
            products: products || [],
            categories: categories || [],
        },
        error: null,
    }
}

export async function createProductAdmin({
    name,
    price,
    categoryId,
    isShot,
    isMixer,
    freeMixersQty,
    requiresInventory,
}) {
    return await supabase.from('products').insert([
        {
            name: name.trim(),
            price: Number(price),
            category_id: categoryId,
            is_shot: Boolean(isShot),
            is_mixer: Boolean(isMixer),
            free_mixers_qty: Number(freeMixersQty || 0),
            requires_inventory: Boolean(requiresInventory),
            active: true,
        },
    ])
}

export async function updateProductAdmin({
    productId,
    name,
    price,
    categoryId,
    isShot,
    isMixer,
    freeMixersQty,
    requiresInventory,
    active,
}) {
    return await supabase
        .from('products')
        .update({
            name: name.trim(),
            price: Number(price),
            category_id: categoryId,
            is_shot: Boolean(isShot),
            is_mixer: Boolean(isMixer),
            free_mixers_qty: Number(freeMixersQty || 0),
            requires_inventory: Boolean(requiresInventory),
            active: Boolean(active),
        })
        .eq('id', productId)
}

export async function toggleProductActive({ productId, active }) {
    return await supabase
        .from('products')
        .update({ active: Boolean(active) })
        .eq('id', productId)
}
export async function getAllowedMixersForProduct(shotProductId) {
    return await supabase
        .from('product_allowed_mixers')
        .select(`
            id,
            mixer_product_id,
            active,
            products:mixer_product_id (id, name)
        `)
        .eq('shot_product_id', shotProductId)
        .eq('active', true)
}

export async function addAllowedMixer({ shotProductId, mixerProductId }) {
    return await supabase
        .from('product_allowed_mixers')
        .insert([{
            shot_product_id: shotProductId,
            mixer_product_id: mixerProductId,
            active: true,
        }])
}

export async function removeAllowedMixer({ id }) {
    return await supabase
        .from('product_allowed_mixers')
        .delete()
        .eq('id', id)
}