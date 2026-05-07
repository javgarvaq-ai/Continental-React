import { supabase } from './supabase';

export async function presentBill({ comandaId, userId, total }) {
    const safeTotal = Number(total || 0);

    const { error: updateError } = await supabase
        .from('comandas')
        .update({
            status: 'pending_payment',
            final_total: safeTotal,
            cuenta_by: userId,
            cuenta_at: new Date().toISOString(),
        })
        .eq('id', comandaId);

    if (updateError) {
        return { error: updateError };
    }

    const { error: eventError } = await supabase
        .from('comanda_events')
        .insert([
            {
                comanda_id: comandaId,
                user_id: userId,
                event_type: 'cuenta_clicked',
                event_data: {
                    total: safeTotal,
                },
            },
        ]);

    if (eventError) {
        return { error: eventError };
    }

    return { error: null };
}

export async function reopenComanda({ comandaId, userId, previousStatus }) {
    const safePreviousStatus = previousStatus || 'pending_payment';

    const { error: updateError } = await supabase
        .from('comandas')
        .update({
            status: 'open',
            reopened_by: userId,
            reopened_at: new Date().toISOString(),
        })
        .eq('id', comandaId);

    if (updateError) {
        return { error: updateError };
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
    const { error: updateError } = await supabase
        .from('comandas')
        .update({
            status: 'processing_payment',
        })
        .eq('id', comandaId);

    if (updateError) {
        return { error: updateError };
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

    const stockNeedByInventoryItem = new Map();

    for (const item of comandaItems || []) {
        const qty = Number(item.quantity || 0);
        const product = item.products;

        if (!product) {
            return {
                ok: false,
                error: new Error('Hay items de comanda con producto faltante.'),
            };
        }

        if (!product.requires_inventory) {
            continue;
        }

        const { data: recipeRows, error: recipeError } = await supabase
            .from('product_recipes')
            .select(`
                inventory_item_id,
                deduct_amount,
                inventory_items (
                    id,
                    name,
                    current_stock,
                    active
                )
            `)
            .eq('product_id', item.product_id)
            .eq('active', true);

        if (recipeError) {
            return { ok: false, error: recipeError };
        }

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
            const currentAccumulated = stockNeedByInventoryItem.get(recipe.inventory_item_id) || {
                name: inventoryItem.name,
                current_stock: Number(inventoryItem.current_stock || 0),
                needed: 0,
            };

            currentAccumulated.needed += needed;
            stockNeedByInventoryItem.set(recipe.inventory_item_id, currentAccumulated);
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
    const safeTotal = Number(total || 0);
    const cashReceived = Number(efectivo || 0);
    const safeTarjeta = Number(tarjeta || 0);
    const safeTransferencia = Number(transferencia || 0);
    const safePropina = Number(propina || 0);
    const safeCambio = Number(cambio || 0);

    const totalDue = safeTotal + safePropina;
    const totalReceived = cashReceived + safeTarjeta + safeTransferencia;

    if (totalReceived < totalDue) {
        return { error: new Error('El monto pagado es insuficiente.') };
    }

    const netCashApplied = Math.max(cashReceived - safeCambio, 0);
    const totalPaid = netCashApplied + safeTarjeta + safeTransferencia;

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
        return { error: rpcError };
    }

    if (rpcResult && !rpcResult.ok) {
        return { error: new Error(rpcResult.error || 'Error al finalizar cobro.') };
    }

    return { error: null, data: { inventoryWarning: null } };
}