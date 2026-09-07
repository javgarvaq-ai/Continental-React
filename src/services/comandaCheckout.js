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
    cardTerminal,
}) {
    const safePropina       = Number(propina       || 0);
    const safeCambio        = Number(cambio        || 0);
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

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'finalize_comanda_payment',
        {
            p_comanda_id:    comandaId,
            p_user_id:       userId,
            p_shift_id:      shiftId,
            p_propina:       safePropina,
            p_efectivo:      netCashApplied,
            p_tarjeta:       safeTarjeta,
            p_transferencia: safeTransferencia,
            p_total_paid:    totalPaid,
            p_change_given:  safeCambio,
            p_total:         safeTotal,
        }
    );

    if (rpcError) {
        const msg = friendlyRpcError(rpcError.message, 'Error al finalizar cobro.')
        return { error: new Error(msg) };
    }

    if (rpcResult && !rpcResult.ok) {
        return { error: new Error(friendlyRpcError(rpcResult.error, 'Error al finalizar cobro.')) };
    }

    // ── Terminal de tarjeta ───────────────────────────────────────────────
    // Se guarda APARTE, después del cobro. Decisión de Javi (2026-09-07):
    // `finalize_comanda_payment` no se toca. Ver plan v3 en tasks/todo.md.
    //
    // Va por RPC y no por `.update()` directo porque los usuarios
    // `authenticated` solo tienen SELECT sobre `payments` — un update directo
    // afectaría 0 filas EN SILENCIO (ver 20260516000002_fix_payments_select_rls.sql).
    //
    // Si esto falla, el COBRO YA QUEDÓ BIEN: solo falta un dato informativo.
    // Por eso no se devuelve como `error` (eso haría creer que no se cobró),
    // sino como `terminalWarning` para que el POS lo muestre y se corrija.
    let terminalWarning = null;

    if (safeTarjeta > 0) {
        if (!cardTerminal) {
            terminalWarning = 'El cobro se registró, pero no se guardó con qué terminal. Avísale a Javi.';
        } else {
            const { data: termResult, error: termError } = await supabase.rpc(
                'set_payment_card_terminal',
                { p_comanda_id: comandaId, p_terminal: cardTerminal }
            );

            if (termError || (termResult && !termResult.ok)) {
                terminalWarning =
                    `El cobro se registró bien, pero NO se guardó la terminal (${cardTerminal}). Avísale a Javi.`;
            }
        }
    }

    return { error: null, terminalWarning };
}