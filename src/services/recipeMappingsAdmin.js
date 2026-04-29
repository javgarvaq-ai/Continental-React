import { supabase } from './supabase'

export async function getRecipeMappingsAdminData() {
    const { data: products, error: productsError } = await supabase
        .from('products')
        .select(`
            id,
            name,
            category_id,
            requires_inventory,
            active
        `)
        .order('name', { ascending: true })

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

    const { data: inventoryItems, error: inventoryItemsError } = await supabase
        .from('inventory_items')
        .select(`
            id,
            name,
            unit_type,
            active
        `)
        .order('name', { ascending: true })

    if (inventoryItemsError) {
        return { data: null, error: inventoryItemsError }
    }

    const { data: recipeRows, error: recipeRowsError } = await supabase
        .from('product_recipes')
        .select(`
            id,
            product_id,
            inventory_item_id,
            deduct_amount,
            active,
            created_at
        `)
        .order('created_at', { ascending: true })

    if (recipeRowsError) {
        return { data: null, error: recipeRowsError }
    }

    return {
        data: {
            products: products || [],
            categories: categories || [],
            inventoryItems: inventoryItems || [],
            recipeRows: recipeRows || [],
        },
        error: null,
    }
}

export async function createRecipeMapping({
    productId,
    inventoryItemId,
    deductAmount,
}) {
    return await supabase.from('product_recipes').insert([
        {
            product_id: productId,
            inventory_item_id: inventoryItemId,
            deduct_amount: Number(deductAmount),
            active: true,
        },
    ])
}

export async function updateRecipeMapping({
    recipeId,
    inventoryItemId,
    deductAmount,
    active,
}) {
    return await supabase
        .from('product_recipes')
        .update({
            inventory_item_id: inventoryItemId,
            deduct_amount: Number(deductAmount),
            active: Boolean(active),
        })
        .eq('id', recipeId)
}

export async function toggleRecipeMappingActive({
    recipeId,
    active,
}) {
    return await supabase
        .from('product_recipes')
        .update({
            active: Boolean(active),
        })
        .eq('id', recipeId)
}