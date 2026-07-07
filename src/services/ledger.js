import { supabase } from './supabase'
import { addDaysToDateString } from './reports'

const PAGE_SIZE = 1000

/**
 * Fetches every row matching `builder` (a function that takes a fresh query
 * and returns it with filters/order applied), paginating with .range() until
 * a page comes back shorter than PAGE_SIZE. This guarantees completeness
 * regardless of how large the table grows — needed now that the Ledger's
 * drawer balance is persistent/cumulative (see utils/ledger.computeRunningBalances):
 * a single silently-dropped historical row would permanently skew the running
 * total, with no way to detect it from the UI.
 */
async function fetchAllPages(builder) {
    let all = []
    let from = 0

    while (true) {
        const { data, error } = await builder(from, from + PAGE_SIZE - 1)
        if (error) return { data: null, error }

        all = all.concat(data || [])
        if (!data || data.length < PAGE_SIZE) break
        from += PAGE_SIZE
    }

    return { data: all, error: null }
}

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

    // Orden ascendente + paginación explícita: ya no dependemos de "traer lo
    // más nuevo primero y truncar lo viejo" (workaround anterior para el reset
    // por turno). Con .range() en loop no se pierde ninguna fila sin importar
    // cuánto crezca el histórico.
    const [paymentsRes, movementsRes, shiftsRes] = await Promise.all([
        fetchAllPages((from, to) => supabase
            .from('payments')
            .select('id, created_at, efectivo, tarjeta, transferencia, tip_amount, shift_id, comanda_id, comandas ( folio )')
            .lt('created_at', endIso)
            .order('created_at', { ascending: true })
            .range(from, to)),

        fetchAllPages((from, to) => supabase
            .from('cash_movements')
            .select('id, created_at, type, amount, note, category, movement_nature, source_location, destination_location, shift_id, users ( name )')
            .lt('created_at', endIso)
            .order('created_at', { ascending: true })
            .range(from, to)),

        fetchAllPages((from, to) => supabase
            .from('shifts')
            .select('id, opened_at, closed_at, status, starting_cash, cash_counted, difference, opener:users!opened_by_user_id ( name ), closer:users!closed_by_user_id ( name )')
            .lt('opened_at', endIso)
            .order('opened_at', { ascending: true })
            .range(from, to)),
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
