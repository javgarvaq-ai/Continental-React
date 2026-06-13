import { supabase } from './supabase'
import { addDaysToDateString } from './reports'

/**
 * Fetches everything the Ledger view needs to compute running balances.
 *
 * Read-only. Pulls ALL history up to the end of the selected range (no lower
 * bound) so the opening balance and the per-shift drawer seeding are exact —
 * the display range is applied client-side in utils/ledger.sliceWithOpening.
 *
 * Operational-day cutoff (06:00 local, -06:00) matches the rest of the app
 * (getCashMovements / getShifts / buildDailyRevenue).
 *
 * Returns { payments, cashMovements, shifts, startIso, endIso, error }.
 */
export async function getLedgerData({ startDate, endDate }) {
    const startIso = `${startDate}T06:00:00-06:00`
    const endIso   = `${addDaysToDateString(endDate, 1)}T06:00:00-06:00`

    const [paymentsRes, movementsRes, shiftsRes] = await Promise.all([
        supabase
            .from('payments')
            .select('id, created_at, efectivo, tarjeta, transferencia, tip_amount, shift_id, comanda_id, comandas ( folio )')
            .lt('created_at', endIso)
            .order('created_at', { ascending: true }),

        supabase
            .from('cash_movements')
            .select('id, created_at, type, amount, note, category, movement_nature, source_location, destination_location, shift_id, users ( name )')
            .lt('created_at', endIso)
            .order('created_at', { ascending: true }),

        supabase
            .from('shifts')
            .select('id, opened_at, closed_at, status, starting_cash, cash_counted, difference, opener:users!opened_by_user_id ( name ), closer:users!closed_by_user_id ( name )')
            .lt('opened_at', endIso)
            .order('opened_at', { ascending: true }),
    ])

    return {
        payments:      paymentsRes.data  || [],
        cashMovements: movementsRes.data || [],
        shifts:        shiftsRes.data    || [],
        startIso,
        endIso,
        error: paymentsRes.error || movementsRes.error || shiftsRes.error || null,
    }
}
