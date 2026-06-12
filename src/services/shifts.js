import { supabase } from './supabase'
import { addDaysToDateString } from './reports'

// ─── Read ──────────────────────────────────────────────────────────────────

/**
 * Returns { id, status } for the given shift.
 * Used by authStore.verifySession to confirm the shift is still open.
 */
export async function getShiftById(shiftId) {
    const { data, error } = await supabase
        .from('shifts')
        .select('id, status')
        .eq('id', shiftId)
        .single()

    return { data, error }
}

/**
 * Fetches the full shift row + its payments + its cash movements,
 * then calculates all totals needed for the shift close panel.
 *
 * Returns { data: { shift, totalEfectivo, totalTarjeta, totalTransferencia,
 *                   totalPropinas, totalCambio, totalWithdrawals,
 *                   totalDeposits, expectedCash }, error }
 */
export async function getShiftSummary(shiftId) {
    const { data: shift, error: shiftError } = await supabase
        .from('shifts')
        .select('*')
        .eq('id', shiftId)
        .single()

    if (shiftError || !shift) {
        return { data: null, error: shiftError || new Error('No se pudo obtener el turno.') }
    }

    const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select(`
            *,
            comandas (
                tip_total
            )
        `)
        .eq('shift_id', shiftId)

    if (paymentsError) return { data: null, error: paymentsError }

    const { data: cashMovements, error: cashMovementsError } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('shift_id', shiftId)

    if (cashMovementsError) return { data: null, error: cashMovementsError }

    let totalEfectivo       = 0
    let totalTarjeta        = 0
    let totalTransferencia  = 0
    let totalPropinas       = 0
    let totalCambio         = 0
    let totalWithdrawals    = 0
    let totalDeposits       = 0

    ;(payments || []).forEach((p) => {
        totalEfectivo      += Number(p.efectivo    || 0)
        totalTarjeta       += Number(p.tarjeta     || 0)
        totalTransferencia += Number(p.transferencia || 0)
        totalPropinas      += Number((p.tip_amount ?? p.comandas?.tip_total) || 0)
        totalCambio        += Number(p.change_given || 0)
    })

    ;(cashMovements || []).forEach((m) => {
        const amount = Number(m.amount || 0)
        if (m.source_location      === 'drawer') totalWithdrawals += amount
        if (m.destination_location === 'drawer') totalDeposits    += amount
    })

    const expectedCash =
        Number(shift.starting_cash || 0) +
        totalEfectivo +
        totalDeposits -
        totalWithdrawals

    return {
        data: {
            shift,
            totalEfectivo,
            totalTarjeta,
            totalTransferencia,
            totalPropinas,
            totalCambio,
            totalWithdrawals,
            totalDeposits,
            expectedCash,
        },
        error: null,
    }
}

/**
 * Returns all comandas that are still open/pending/processing,
 * with their unit name. Used to block shift close and report
 * which tables need to be closed first.
 */
export async function getOpenComandas() {
    const { data, error } = await supabase
        .from('comandas')
        .select('id, units(name)')
        .in('status', ['open', 'pending_payment', 'processing_payment'])

    return { data, error }
}

/**
 * Returns all cash movements for audit, joined with user name.
 * Ordered by created_at descending.
 */
export async function getCashMovements({ startDate, endDate } = {}) {
    let query = supabase
        .from('cash_movements')
        .select(`
            id,
            created_at,
            shift_id,
            type,
            amount,
            note,
            category,
            movement_nature,
            source_location,
            destination_location,
            users ( name )
        `)
        .order('created_at', { ascending: false })

    // Operational-day cutoff (06:00 local) so a shift crossing midnight isn't
    // split across two calendar days — same convention as buildDailyRevenue.
    if (startDate) query = query.gte('created_at', `${startDate}T06:00:00-06:00`)
    if (endDate)   query = query.lt('created_at', `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`)

    const { data, error } = await query
    return { data, error }
}

/**
 * Returns all shifts for audit, joined with opener and closer user names.
 * Ordered by opened_at descending.
 */
export async function getShifts({ startDate, endDate } = {}) {
    let query = supabase
        .from('shifts')
        .select(`
            id,
            status,
            opened_at,
            closed_at,
            starting_cash,
            expected_cash,
            cash_counted,
            difference,
            total_efectivo,
            total_tarjeta,
            total_transferencia,
            total_propinas,
            total_retiros,
            opener:users!opened_by_user_id ( name ),
            closer:users!closed_by_user_id ( name )
        `)
        .order('opened_at', { ascending: false })

    // Operational-day cutoff (06:00 local) so a shift crossing midnight isn't
    // split across two calendar days — same convention as buildDailyRevenue.
    if (startDate) query = query.gte('opened_at', `${startDate}T06:00:00-06:00`)
    if (endDate)   query = query.lt('opened_at', `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`)

    const { data, error } = await query
    return { data, error }
}

// ─── Write ─────────────────────────────────────────────────────────────────

/**
 * Closes the shift: writes all summary totals and sets status to 'closed'.
 * The .eq('status', 'open') guard prevents double-close.
 *
 * @param {string} shiftId
 * @param {string} userId
 * @param {number} cashCounted
 * @param {object} summary  — output of getShiftSummary().data
 */
export async function closeShift(shiftId, userId, cashCounted, summary) {
    const difference = cashCounted - Number(summary.expectedCash || 0)

    const { data, error } = await supabase
        .from('shifts')
        .update({
            status:               'closed',
            closed_at:            new Date().toISOString(),
            closed_by_user_id:    userId,
            cash_counted:         cashCounted,
            difference,
            total_efectivo:       summary.totalEfectivo,
            total_tarjeta:        summary.totalTarjeta,
            total_transferencia:  summary.totalTransferencia,
            total_propinas:       summary.totalPropinas,
            total_retiros:        summary.totalWithdrawals,
            expected_cash:        summary.expectedCash,
        })
        .eq('id', shiftId)
        .eq('status', 'open')
        .select('id')

    return { data, error }
}

/**
 * Inserts a cash movement row.
 * The caller (useShift) is responsible for resolving the movement config
 * from getCashMovementConfig(category) before calling this.
 */
export async function addCashMovement({
    shiftId,
    userId,
    type,
    amount,
    note,
    category,
    movementNature,
    sourceLocation,
    destinationLocation,
}) {
    const { data, error } = await supabase
        .from('cash_movements')
        .insert([{
            shift_id:             shiftId,
            user_id:              userId,
            type,
            amount,
            note,
            category,
            movement_nature:      movementNature,
            source_location:      sourceLocation,
            destination_location: destinationLocation,
        }])

    return { data, error }
}
