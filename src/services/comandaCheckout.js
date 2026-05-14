import { supabase } from './supabase';
import { computePaymentBreakdown } from '../utils/payments';
import { friendlyRpcError } from '../utils/rpcErrors';

export async function presentBill({ comandaId, userId, total }) {
    const safeTotal = Number(total || 0);

    const { data: result, error } = await supabase.rpc('present_bill_atomic', {
        p_comanda_id: comandaId,
        p_user_id:    userId,
        p_total:      safeTotal,
    });

    if (error) return { error };

    if (!result?.ok) {
        return { error: new Error(friendlyRpcError(result?.error, 'Error al presentar cuenta.')) };
    }

    return { error: null };
}

export async function reopenComanda({ comandaId, userId, previousStatus }) {
    const safePreviousStatus = previousStatus || 'pending_payment';

    const { data: updated, error: updateError } = await supabase
        .from('comandas')
        .update({
            status: 'open',
            reopened_by: userId,
            reopened_at: new Date().toISOString(),
        })
        .eq('id', comandaId)
        .eq('status', safePreviousStatus)
        .select('id');

    if (updateError) {
        return { error: updateError };
    }

    if (!updated || updated.length === 0) {
        return { error: new Error('La comanda ya no está en el estado esperado. Recarga la página.') };
    }

    const { error: eventError } = await supabase
        .from('comanda_events')
        .insert([
            {
                comanda_id: comandaId,
                user_id: userId,
                event_type:
                    safePreviousStatus === 'processing_payment'
                        ? 'reopened_from_processing'
                        : 'reopened_from_cuenta',
                event_data: {
                    previous_status: safePreviousStatus,
                },
            },
        ]);

    if (eventError) {
        return { error: eventError };
    }

    return { error: null };
}

export async function startPayment({ comandaId, userId }) {
    const { data: updated, error: updateError } = await supabase
        .from('comandas')
        .update({
            status: 'processing_payment',
        })
        .eq('id', comandaId)
        .eq('status', 'pending_payment')
        .select('id');

    if (updateError) {
        return { error: updateError };
    }

    if (!updated || updated.length === 0) {
        return { error: new Error('La comanda ya no está en cuenta. Recarga la página.') };
    }

    const { error: eventError } = await supabase
        .from('comanda_events')
        .insert([
            {
                comanda_id: comandaId,
                user_id: userId,
                event_type: 'payment_started',
                event_data: null,
            },
        ]);

    if (eventError) {
        return { error: eventError };
    }

    return { error: null };
}

async function validateComandaInventoryBeforePayment({ comandaId }) {
    // Single query for all active items + their product info
    const { data: comandaItems, error: itemsError } = await supabase
        .from('comanda_items')
        .select(`
            id,
            product_id,
            quantity,
            products:products!comanda_items_product_id_fkey (
                id,
                name,
                requires_inventory,
                active
            )
        `)
        .eq('comanda_id', comandaId)
        .eq('status', 'active');

    if (itemsError) {
        return { ok: false, error: itemsError };
    }

    // Verify all items have a product and build the list that needs inventory
    const inventoryItems = [];
    for (const item of comandaItems || []) {
        if (!item.products) {
            return {
                ok: false,
                error: new Error('Hay items de comanda con producto faltante.'),
            };
        }
        if (item.products.requires_inventory) {
            inventoryItems.push(item);
        }
    }

    // Nothing requires inventory — skip straight to ok
    if (inventoryItems.length === 0) {
        return { ok: true, error: null };
    }

    // Single batched query for all recipes (replaces the per-item loop)
    const inventoryProductIds = [...new Set(inventoryItems.map((i) => i.product_id))];

    const { data: allRecipeRows, error: recipeError } = await supabase
        .from('product_recipes')
        .select(`
            product_id,
            inventory_item_id,
            deduct_amount,
            inventory_items (
                id,
                name,
                current_stock,
                active
            )
        `)
        .in('product_id', inventoryProductIds)
        .eq('active', true);

    if (recipeError) {
        return { ok: false, error: recipeError };
    }

    // Group recipes by product_id for O(1) lookup
    const recipesByProduct = new Map();
    for (const recipe of allRecipeRows || []) {
        if (!recipesByProduct.has(recipe.product_id)) {
            recipesByProduct.set(recipe.product_id, []);
        }
        recipesByProduct.get(recipe.product_id).push(recipe);
    }

    // Accumulate stock needs across all items
    const stockNeedByInventoryItem = new Map();

    for (const item of inventoryItems) {
        const qty = Number(item.quantity || 0);
        const product = item.products;
        const recipeRows = recipesByProduct.get(item.product_id);

        if (!recipeRows || recipeRows.length === 0) {
            return {
                ok: false,
                error: new Error(`El producto "${product.name}" requiere inventario pero no tiene receta.`),
            };
        }

        for (const recipe of recipeRows) {
            const inventoryItem = recipe.inventory_items;

            if (!inventoryItem) {
                return {
                    ok: false,
                    error: new Error(`La receta de "${product.name}" apunta a un inventario inexistente.`),
                };
            }

            if (inventoryItem.active === false) {
                return {
                    ok: false,
                    error: new Error(`El inventario "${inventoryItem.name}" está inactivo.`),
                };
            }

            const needed = qty * Number(recipe.deduct_amount || 0);
            const accumulated = stockNeedByInventoryItem.get(recipe.inventory_item_id) || {
                name: inventoryItem.name,
                current_stock: Number(inventoryItem.current_stock || 0),
                needed: 0,
            };

            accumulated.needed += needed;
            stockNeedByInventoryItem.set(recipe.inventory_item_id, accumulated);
        }
    }

    for (const [, item] of stockNeedByInventoryItem.entries()) {
        if (item.current_stock < item.needed) {
            return {
                ok: false,
                error: new Error(
                    `Inventario insuficiente para "${item.name}". Stock actual: ${item.current_stock}. Requerido: ${item.needed}.`
                ),
            };
        }
    }

    return { ok: true, error: null };
}


export async function confirmPayment({
    comandaId,
    total,
    userId,
    shiftId,
    efectivo,
    tarjeta,
    transferencia,
    propina,
    cambio,
}) {
    const safePropina       = Number(propina       || 0);
    const safeCambio        = Number(cambio        || 0);
    const cashReceived      = Number(efectivo      || 0);
    const safeTarjeta       = Number(tarjeta       || 0);
    const safeTransferencia = Number(transferencia || 0);
    const safeTotal         = Number(total         || 0);

    const { totalDue, totalReceived, netCashApplied, totalPaid } = computePaymentBreakdown({
        total,
        efectivo,
        tarjeta,
        transferencia,
        propina: safePropina,
        cambio:  safeCambio,
    });

    if (totalReceived < totalDue) {
        return { error: new Error('El monto pagado es insuficiente.') };
    }

    if (Math.abs(totalPaid - totalDue) > 0.009) {
        return {
            error: new Error(
                `Inconsistencia en cobro. Total esperado: ${totalDue}, total aplicado: ${totalPaid}.`
            ),
        };
    }

    const inventoryValidation = await validateComandaInventoryBeforePayment({
        comandaId,
    });

    if (!inventoryValidation.ok) {
        return { error: inventoryValidation.error };
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'finalize_comanda_payment',
        {
            p_comanda_id:     comandaId,
            p_user_id:        userId,
            p_shift_id:       shiftId,
            p_cobrado_at:     new Date().toISOString(),
            p_tip_total:      safePropina,
            p_efectivo:       netCashApplied,
            p_tarjeta:        safeTarjeta,
            p_transferencia:  safeTransferencia,
            p_total_paid:     totalPaid,
            p_tip_amount:     safePropina,
            p_change_given:   safeCambio,
            p_total:          safeTotal,
            p_cash_received:  cashReceived,
            p_total_aplicado: totalPaid,
        }
    );

    if (rpcError) {
        const msg = (rpcError.message || 'Error al finalizar cobro.').slice(0, 200)
        return { error: new Error(msg) };
    }

    if (rpcResult && !rpcResult.ok) {
        return { error: new Error(friendlyRpcError(rpcResult.error, 'Error al finalizar cobro.')) };
    }

    return { error: null };
}