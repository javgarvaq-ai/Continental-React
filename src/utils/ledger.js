/**
 * Ledger math — pure functions shared by the Ledger view (read-only report).
 *
 * No side effects, no imports. Builds a chronological list of money events
 * (folios cobrados + movimientos de caja + apertura/cierre de turno) and
 * computes a running balance per location.
 *
 * Location model — mirrors WeeklyReportPage.calcGlobal (the existing authority):
 *   - drawer (cajón):      + payments.efectivo, + movs dest=drawer,      − movs origen=drawer
 *   - house_safe (caja fuerte): + movs dest=house_safe,                  − movs origen=house_safe
 *   - bank (banco):        + payments.tarjeta + payments.transferencia, + movs dest=bank, − movs origen=bank
 *
 * Drawer convention (decision 2026-06-13): createShift only writes
 * shifts.starting_cash — it does NOT create a cash_movement for the fund.
 * So the drawer balance is ANCHORED PER SHIFT: it resets to that shift's
 * starting_cash at each shift open. This makes the drawer's closing balance
 * equal the shift's expected_cash. House_safe and bank run cumulatively.
 */

export const LEDGER_LOCATIONS = ['drawer', 'house_safe', 'bank']

// Card-terminal commission — Mercado Pago Point / Tap (cobro presencial directo):
// 3.5% + 16% IVA, sin cargo fijo por transacción. Effective ≈ 4.06%.
// Editable here; the rate depends on the MP disposition term (al instante vs 14 días).
export const CARD_COMMISSION_RATE = 0.035
export const CARD_COMMISSION_IVA  = 0.16

/**
 * Estimated real bank cash after the card-terminal commission.
 * Commission applies ONLY to card sales (transfers/cash deposits arrive whole).
 * It's an estimate — the exact fee is set by the MP statement.
 */
export function estimateBankNet(bankBalance, cardSalesCumulative) {
    const commission = Number(cardSalesCumulative || 0) * CARD_COMMISSION_RATE * (1 + CARD_COMMISSION_IVA)
    return Number(bankBalance || 0) - commission
}

// Tie-break ordering for events sharing the exact same timestamp:
// a shift opens before its sales/movements; it closes after them.
const KIND_ORDER = { shift_open: 0, payment: 1, movement: 1, shift_close: 2 }

/**
 * Normalizes raw rows into ledger events (unsorted).
 * @param {{ payments?: any[], cashMovements?: any[], shifts?: any[] }} input
 * @returns {Array} events with per-location deltas
 */
export function buildLedgerEvents({ payments = [], cashMovements = [], shifts = [] } = {}) {
    const events = []

    // ── Shift markers ─────────────────────────────────────────────
    shifts.forEach((s) => {
        events.push({
            id: `shift-open-${s.id}`,
            ts: s.opened_at,
            kind: 'shift_open',
            label: 'Apertura de turno',
            shiftId: s.id,
            startingCash: Number(s.starting_cash || 0),
            drawerDelta: 0, houseDelta: 0, bankDelta: 0,
            user: s.opener?.name || null,
        })

        if (s.status === 'closed' && s.closed_at) {
            events.push({
                id: `shift-close-${s.id}`,
                ts: s.closed_at,
                kind: 'shift_close',
                label: 'Cierre de turno',
                shiftId: s.id,
                drawerDelta: 0, houseDelta: 0, bankDelta: 0,
                cashCounted: s.cash_counted != null ? Number(s.cash_counted) : null,
                difference: s.difference != null ? Number(s.difference) : null,
                user: s.closer?.name || null,
            })
        }
    })

    // ── Folios cobrados (payments) ────────────────────────────────
    payments.forEach((p) => {
        const efectivo      = Number(p.efectivo || 0)
        const tarjeta       = Number(p.tarjeta || 0)
        const transferencia = Number(p.transferencia || 0)
        events.push({
            id: `pay-${p.id}`,
            ts: p.created_at,
            kind: 'payment',
            label: 'Folio cobrado',
            folio: p.comandas?.folio ?? null,
            shiftId: p.shift_id ?? null,
            // drawer receives the physical cash applied (incl. cash tips);
            // card + transfer land in the bank bucket.
            drawerDelta: efectivo,
            houseDelta: 0,
            bankDelta: tarjeta + transferencia,
            efectivo, tarjeta, transferencia,
            tip: Number(p.tip_amount || 0),
            user: null, // payments.paid_by_user has no FK to users — not joinable
        })
    })

    // ── Movimientos de caja ───────────────────────────────────────
    cashMovements.forEach((m) => {
        const amount = Number(m.amount || 0)
        const src = m.source_location
        const dst = m.destination_location
        const delta = (loc) => (dst === loc ? amount : 0) - (src === loc ? amount : 0)
        events.push({
            id: `mov-${m.id}`,
            ts: m.created_at,
            kind: 'movement',
            label: m.category || m.type || 'Movimiento',
            category: m.category || null,
            movementType: m.type || null,
            movementNature: m.movement_nature || null,
            shiftId: m.shift_id ?? null,
            drawerDelta: delta('drawer'),
            houseDelta: delta('house_safe'),
            bankDelta: delta('bank'),
            sourceLocation: src || null,
            destinationLocation: dst || null,
            amount,
            note: m.note || null,
            user: m.users?.name || null,
        })
    })

    return events
}

/** Chronological sort with stable same-timestamp tie-break. */
export function sortEvents(events) {
    return [...events].sort((a, b) => {
        const ta = new Date(a.ts).getTime()
        const tb = new Date(b.ts).getTime()
        if (ta !== tb) return ta - tb
        return (KIND_ORDER[a.kind] ?? 1) - (KIND_ORDER[b.kind] ?? 1)
    })
}

/**
 * Applies running balances to a chronologically-sorted event list.
 * Drawer resets to starting_cash at each shift_open; house & bank accumulate.
 * @returns events annotated with drawerBalance / houseBalance / bankBalance
 */
export function computeRunningBalances(sortedEvents) {
    let drawer = 0
    let house = 0
    let bank = 0
    let cardSales = 0 // cumulative card sales — base for the bank commission estimate
    return sortedEvents.map((e) => {
        if (e.kind === 'shift_open') {
            drawer = e.startingCash // seed/reset the drawer for the new shift
        } else {
            drawer += e.drawerDelta
        }
        house += e.houseDelta
        bank  += e.bankDelta
        if (e.kind === 'payment') cardSales += Number(e.tarjeta || 0)
        return { ...e, drawerBalance: drawer, houseBalance: house, bankBalance: bank, cardSalesCumulative: cardSales }
    })
}

/**
 * Slices the fully-computed timeline to a display range, returning the
 * opening balance (state just before the range), the in-range rows, and the
 * closing balance. Range bounds are ISO strings; comparison is half-open
 * [startIso, endIso).
 */
export function sliceWithOpening(computedEvents, startIso, endIso) {
    const startMs = new Date(startIso).getTime()
    const endMs   = new Date(endIso).getTime()

    let opening = { drawerBalance: 0, houseBalance: 0, bankBalance: 0, cardSalesCumulative: 0 }
    const rows = []

    for (const e of computedEvents) {
        const t = new Date(e.ts).getTime()
        if (t < startMs) {
            opening = {
                drawerBalance: e.drawerBalance,
                houseBalance: e.houseBalance,
                bankBalance: e.bankBalance,
                cardSalesCumulative: e.cardSalesCumulative,
            }
        } else if (t < endMs) {
            rows.push(e)
        }
    }

    const last = rows.length ? rows[rows.length - 1] : null
    const closing = last
        ? { drawerBalance: last.drawerBalance, houseBalance: last.houseBalance, bankBalance: last.bankBalance, cardSalesCumulative: last.cardSalesCumulative }
        : opening

    return { opening, rows, closing }
}

/**
 * Convenience: full pipeline. Build → sort → running balances → slice.
 * @param {{ payments, cashMovements, shifts }} data  raw rows (all history up to endIso)
 * @param {string} startIso  range start (inclusive)
 * @param {string} endIso    range end (exclusive)
 */
export function buildLedger(data, startIso, endIso) {
    const events = sortEvents(buildLedgerEvents(data))
    const computed = computeRunningBalances(events)
    return sliceWithOpening(computed, startIso, endIso)
}
