import { supabase } from './supabase';

export async function getProductsCatalog() {
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
            active
        `)
        .eq('active', true)
        .order('category_id', { ascending: true })
        .order('name', { ascending: true });

    if (productsError) {
        return { data: null, error: productsError };
    }

    const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true });

    if (categoriesError) {
        return { data: null, error: categoriesError };
    }

    const categoryMap = {};
    (categories || []).forEach((category) => {
        categoryMap[category.id] = category.name;
    });

    const groupedProducts = {};
    (products || []).forEach((product) => {
        const categoryName = categoryMap[product.category_id] || 'Sin categoría';

        if (!groupedProducts[categoryName]) {
            groupedProducts[categoryName] = [];
        }

        groupedProducts[categoryName].push(product);
    });

    return {
        data: {
            groupedProducts,
            categories: categories || [],
            products: products || [],
        },
        error: null,
    };
}

export async function getActiveCartItems(comandaId) {
    const { data, error } = await supabase
        .from('comanda_items')
        .select('*, products:products!comanda_items_product_id_fkey(name)')
        .eq('comanda_id', comandaId)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

    return { data, error };
}

export async function addNormalProductToComanda({ comandaId, product }) {
    const { data: existingItem, error: existingError } = await supabase
        .from('comanda_items')
        .select('*')
        .eq('comanda_id', comandaId)
        .eq('product_id', product.id)
        .eq('status', 'active')
        .eq('is_free_mixer', false)
        .eq('is_free_benefit', false)
        .maybeSingle();

    if (existingError) {
        return { error: existingError };
    }

    if (existingItem) {
        const { error: updateError } = await supabase
            .from('comanda_items')
            .update({
                quantity: Number(existingItem.quantity || 0) + 1,
            })
            .eq('id', existingItem.id);

        return { error: updateError };
    }

    const { error: insertError } = await supabase
        .from('comanda_items')
        .insert([
            {
                comanda_id: comandaId,
                product_id: product.id,
                quantity: 1,
                unit_price: product.price,
                status: 'active',
                is_free_mixer: false,
                source_type: 'regular',
            },
        ]);

    return { error: insertError };
}

export async function getAvailableMixersForProduct(productId) {
    if (!productId) {
        return { data: [], error: new Error('Producto inválido.') };
    }

    const { data: allowedRows, error: allowedError } = await supabase
        .from('product_allowed_mixers')
        .select(`
            mixer_product_id,
            products:mixer_product_id (
                id,
                name,
                price,
                category_id,
                is_shot,
                is_mixer,
                free_mixers_qty,
                requires_inventory,
                active
            )
        `)
        .eq('shot_product_id', productId)
        .eq('active', true);

    if (allowedError) {
        return { data: [], error: allowedError };
    }

    const mixers = (allowedRows || [])
        .map((row) => row.products)
        .filter((item) => item && item.active);

    mixers.sort((a, b) => a.name.localeCompare(b.name));

    return { data: mixers, error: null };
}

export async function addShotWithFreeMixers({
    comandaId,
    shotProduct,
    selectedMixers,
    userId,
}) {
    const freeMixersQty = Number(shotProduct?.free_mixers_qty || 0);
    const safeMixers = Array.isArray(selectedMixers) ? selectedMixers : [];

    if (!comandaId || !shotProduct?.id) {
        return { error: new Error('Datos incompletos para agregar shot.') };
    }

    if (!shotProduct.is_shot) {
        return { error: new Error('El producto seleccionado no es shot.') };
    }

    if (safeMixers.length > freeMixersQty) {
        return {
            data: null,
            error: new Error(
                `Puedes seleccionar hasta ${freeMixersQty} mixer(s).`
            ),
        }
    }

    const { data: existingShot, error: existingShotError } = await supabase
        .from('comanda_items')
        .select('id, quantity')
        .eq('comanda_id', comandaId)
        .eq('product_id', shotProduct.id)
        .eq('status', 'active')
        .eq('is_free_mixer', false)
        .maybeSingle();

    if (existingShotError) {
        return { error: existingShotError };
    }

    let shotItemId = null;

    if (existingShot) {
        const { error: updateShotError } = await supabase
            .from('comanda_items')
            .update({
                quantity: Number(existingShot.quantity || 0) + 1,
            })
            .eq('id', existingShot.id);

        if (updateShotError) {
            return { error: updateShotError };
        }

        shotItemId = existingShot.id;
    } else {
        const { data: insertedShotRows, error: shotInsertError } = await supabase
            .from('comanda_items')
            .insert([
                {
                    comanda_id: comandaId,
                    product_id: shotProduct.id,
                    quantity: 1,
                    unit_price: shotProduct.price,
                    status: 'active',
                    is_free_mixer: false,
                    source_type: 'regular',
                    source_shot_product_id: null,
                },
            ])
            .select('id')
            .limit(1);

        if (shotInsertError) {
            return { error: shotInsertError };
        }

        const insertedShot = insertedShotRows?.[0];

        if (!insertedShot?.id) {
            return { error: new Error('No se pudo crear el shot.') };
        }

        shotItemId = insertedShot.id;
    }

    if (safeMixers.length > 0) {
        const mixerRows = safeMixers.map((mixer) => ({
            comanda_id: comandaId,
            product_id: mixer.id,
            quantity: 1,
            unit_price: 0,
            status: 'active',
            is_free_mixer: true,
            source_type: 'free_mixer',
            source_shot_product_id: shotProduct.id,
        }));

        const { error: mixersInsertError } = await supabase
            .from('comanda_items')
            .insert(mixerRows);

        if (mixersInsertError) {
            return { error: mixersInsertError };
        }
    }

    if (userId) {
        const { error: eventError } = await supabase
            .from('comanda_events')
            .insert([
                {
                    comanda_id: comandaId,
                    user_id: userId,
                    event_type: 'shot_with_mixers_added',
                    product_id: shotProduct.id,
                    event_data: {
                        shot_product_id: shotProduct.id,
                        shot_item_id: shotItemId,
                        shot_name: shotProduct.name,
                        free_mixers_qty: freeMixersQty,
                        mixers: safeMixers.map((mixer) => ({
                            id: mixer.id,
                            name: mixer.name,
                        })),
                    },
                },
            ]);

        if (eventError) {
            return { error: eventError };
        }
    }

    return { error: null };
}

export async function decreaseCartItem({
    comandaId,
    itemId,
    productId,
    currentQty,
    userId,
}) {
    const qty = Number(currentQty || 0);

    if (qty <= 0) {
        return { error: new Error('Cantidad inválida.') };
    }

    const { data: productRow, error: productError } = await supabase
        .from('products')
        .select('id, is_shot, free_mixers_qty')
        .eq('id', productId)
        .maybeSingle();

    if (productError) {
        return { error: productError };
    }

    const newQty = qty - 1;
    let dbError = null;

    if (newQty <= 0) {
        const { error } = await supabase
            .from('comanda_items')
            .delete()
            .eq('id', itemId);

        dbError = error;
    } else {
        const { error } = await supabase
            .from('comanda_items')
            .update({ quantity: newQty })
            .eq('id', itemId);

        dbError = error;
    }

    if (dbError) {
        return { error: dbError };
    }

    if (productRow?.is_shot) {
        const mixersToRemove = Number(productRow.free_mixers_qty || 0);

        if (mixersToRemove > 0) {
            const { data: linkedMixers, error: mixersError } = await supabase
                .from('comanda_items')
                .select('id, created_at')
                .eq('comanda_id', comandaId)
                .eq('status', 'active')
                .eq('is_free_mixer', true)
                .eq('source_shot_product_id', productId)
                .order('created_at', { ascending: false })
                .limit(mixersToRemove);

            if (mixersError) {
                return { error: mixersError };
            }

            if (linkedMixers && linkedMixers.length > 0) {
                const mixerIds = linkedMixers.map((item) => item.id);

                const { error: deleteMixersError } = await supabase
                    .from('comanda_items')
                    .delete()
                    .in('id', mixerIds);

                if (deleteMixersError) {
                    return { error: deleteMixersError };
                }
            }
        }
    }

    if (userId) {
        const { error: eventError } = await supabase
            .from('comanda_events')
            .insert([
                {
                    comanda_id: comandaId,
                    user_id: userId,
                    event_type: 'item_decreased',
                    product_id: productId,
                    event_data: {
                        comanda_item_id: itemId,
                        previous_quantity: qty,
                        new_quantity: newQty > 0 ? newQty : 0,
                    },
                },
            ]);

        if (eventError) {
            return { error: eventError };
        }
    }

    return { error: null };
}

export async function updateComandaPersonas({ comandaId, personas }) {
    const safePersonas = Math.max(0, Number(personas || 0));

    const { error } = await supabase
        .from('comandas')
        .update({ personas: safePersonas })
        .eq('id', comandaId);

    return {
        data: safePersonas,
        error,
    };
}