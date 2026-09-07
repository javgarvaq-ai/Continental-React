/**
 * Ledger math — pure functions shared by the Ledger view (read-only report).
 *
 * No side effects, no imports. Builds a chronological list of money events
 * (folios cobrados + movimientos de caja + apertura/cierre de turno) and
 * computes a running balance per location.
 *
 * Location model:
 *   - drawer (cajón):      + payments.efectivo, + movs dest=drawer,      − movs origen=drawer
 *   - house_safe (caja fuerte): + movs dest=house_safe,                  − movs origen=house_safe
 *   - bank (banco):        + payments.tarjeta + payments.transferencia, + movs dest=bank, − movs origen=bank
 *
 * Drawer convention (revisada 2026-07-07 — decisión Javi): el cajón es
 * PERSISTENTE, igual que house_safe y bank — nunca se resetea. Solo se mueve
 * por eventos documentados (ventas en efectivo y cash_movements). Esto exigió
 * un backfill único (tasks/backfill_fondo_inicial_2026-07-07.sql) para
 * registrar como cash_movement el fondo con el que arrancó el negocio, que
 * nunca había quedado documentado.
 *
 * El conteo físico de cada turno (`starting_cash` al abrir, `cash_counted` al
 * cerrar) sigue existiendo y sigue siendo la fuente de verdad del corte por
 * turno (ShiftPanel / getShiftSummary / closeShift — sin cambios), pero AQUÍ
 * se usa solo como comparación/anotación sobre el saldo persistente, nunca
 * para resetearlo ni corregirlo automáticamente. Ver `openVariance` /
 * `closeVariance` en computeRunningBalances: si el conteo físico y el saldo
 * del sistema no coinciden, esa diferencia es la señal de que salió o entró
 * dinero sin pasar por un cash_movement.
 *
 * (Convención anterior, ya no aplica: el cajón se anclaba a `starting_cash`
 * en cada apertura, haciendo que el saldo de cierre del cajón fuera siempre
 * igual a `expected_cash` por construcción — no era una verificación
 * independiente.)
 */

export const LEDGER_LOCATIONS = ['drawer', 'house_safe', 'bank']

// Card-terminal commission — Mercado Pago Point / Tap (cobro presencial directo):
// 3.5% + 16% IVA, sin cargo fijo por transacción. Effective ≈ 4.06%.
export const CARD_COMMISSION_RATE = 0.035
export const CARD_COMMISSION_IVA  = 0.16

/**
 * Factor neto por terminal — cuánto del bruto llega realmente al banco.
 *
 * MEDIDOS contra los estados de cuenta reales durante la conciliación del
 * 2026-09-06 (ver tasks/conciliacion_bancaria_2026-09-06.md), no supuestos:
 *
 *   mp     0.9594 — 3.5% + IVA = 4.06%. Verificado: 341 de 353 "Liberación de
 *                   dinero" ÷ 0.9594 dan un bruto múltiplo exacto de $0.05.
 *   getnet 0.9783 — 1.87% + IVA = 2.17%. Verificado al centavo en 7 barridos
 *                   que son exactamente 0.9783 × las ventas del periodo.
 *
 * ⚠️ Antes de este cambio se aplicaba 4.06% a TODA la tarjeta, incluyendo la de
 * Getnet: al 2026-09-06 eso sobreestimaba la comisión en $1,730.41 y el error
 * crecía $18.90 por cada $1,000 vendidos con Getnet.
 */
export const CARD_TERMINAL_NET_FACTOR = {
    mp:     1 - CARD_COMMISSION_RATE * (1 + CARD_COMMISSION_IVA), // 0.9594
    getnet: 0.9783,
}

/** Terminal que se asume cuando la venta no la tiene registrada (histórico sin backfill). */
export const FALLBACK_CARD_TERMINAL = 'mp'

export function netFactorForTerminal(terminal) {
    const f = CARD_TERMINAL_NET_FACTOR[terminal]
    return f == null ? CARD_TERMINAL_NET_FACTOR[FALLBACK_CARD_TERMINAL] : f
}

/**
 * Comisión de tarjeta a partir del bruto vendido POR TERMINAL.
 * Acepta también un número (bruto total) por compatibilidad: en ese caso lo
 * trata todo como la terminal de fallback.
 */
export function cardCommission(cardSalesByTerminal) {
    if (typeof cardSalesByTerminal === 'number') {
        return Number(cardSalesByTerminal || 0) * (1 - netFactorForTerminal(FALLBACK_CARD_TERMINAL))
    }
    const by = cardSalesByTerminal || {}
    return Object.keys(by).reduce(
        (sum, t) => sum + Number(by[t] || 0) * (1 - netFactorForTerminal(t)),
        0,
    )
}

/**
 * Dinero real en el banco después de la comisión de tarjeta.
 * La comisión aplica SOLO a la tarjeta — transferencias y depósitos de efectivo
 * llegan íntegros.
 */
export function estimateBankNet(bankBalance, cardSalesByTerminal) {
    return Number(bankBalance || 0) - cardCommission(cardSalesByTerminal)
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
            // El saldo de banco se sigue acumulando en BRUTO, igual que antes.
            // La comisión se resta aparte al mostrar el neto (estimateBankNet),
            // para no perder de vista el total cobrado con tarjeta.
            bankDelta: tarjeta + transferencia,
            efectivo, tarjeta, transferencia,
            cardTerminal: p.card_terminal || null,
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
 * Drawer, house & bank all accumulate — none of them reset. shift_open and
 * shift_close events carry drawerDelta === 0, so they don't move the drawer
 * balance by themselves; instead they get annotated with a comparison
 * against the physical count (see openVariance / closeVariance) for display.
 * @returns events annotated with drawerBalance / houseBalance / bankBalance
 */
export function computeRunningBalances(sortedEvents) {
    let drawer = 0
    let house = 0
    let bank = 0
    let cardSales = 0 // cumulative card sales — base for the bank commission estimate
    // Mismo acumulado pero separado por terminal, porque cada una cobra una
    // comisión distinta. Las ventas sin terminal registrada caen en el fallback
    // y además se cuentan aparte para poder marcarlas en la UI.
    const cardSalesByTerminal = { mp: 0, getnet: 0 }
    let cardSalesUnknownTerminal = 0
    return sortedEvents.map((e) => {
        drawer += e.drawerDelta
        house  += e.houseDelta
        bank   += e.bankDelta
        if (e.kind === 'payment') {
            const tarjeta = Number(e.tarjeta || 0)
            if (tarjeta) {
                cardSales += tarjeta
                const known = CARD_TERMINAL_NET_FACTOR[e.cardTerminal] != null
                if (!known) cardSalesUnknownTerminal += tarjeta
                const key = known ? e.cardTerminal : FALLBACK_CARD_TERMINAL
                cardSalesByTerminal[key] += tarjeta
            }
        }

        const annotated = {
            ...e,
            drawerBalance: drawer,
            houseBalance: house,
            bankBalance: bank,
            cardSalesCumulative: cardSales,
            cardSalesByTerminal: { ...cardSalesByTerminal },
            cardSalesUnknownTerminal,
        }

        // Comparación contra el conteo físico — no altera drawer/drawerBalance.
        if (e.kind === 'shift_open') {
            annotated.systemDrawerAtOpen  = drawer
            annotated.physicalCountAtOpen = e.startingCash
            annotated.openVariance        = e.startingCash != null ? Number(e.startingCash) - drawer : null
        }
        if (e.kind === 'shift_close') {
            annotated.systemDrawerAtClose  = drawer
            annotated.physicalCountAtClose = e.cashCounted
            annotated.closeVariance        = e.cashCounted != null ? Number(e.cashCounted) - drawer : null
        }

        return annotated
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

    let opening = {
        drawerBalance: 0, houseBalance: 0, bankBalance: 0,
        cardSalesCumulative: 0,
        cardSalesByTerminal: { mp: 0, getnet: 0 },
        cardSalesUnknownTerminal: 0,
    }
    const rows = []

    for (const e of computedEvents) {
        const t = new Date(e.ts).getTime()
        if (t < startMs) {
            opening = {
                drawerBalance: e.drawerBalance,
                houseBalance: e.houseBalance,
                bankBalance: e.bankBalance,
                cardSalesCumulative: e.cardSalesCumulative,
                cardSalesByTerminal: e.cardSalesByTerminal,
                cardSalesUnknownTerminal: e.cardSalesUnknownTerminal,
            }
        } else if (t < endMs) {
            rows.push(e)
        }
    }

    const last = rows.length ? rows[rows.length - 1] : null
    const closing = last
        ? {
            drawerBalance: last.drawerBalance,
            houseBalance: last.houseBalance,
            bankBalance: last.bankBalance,
            cardSalesCumulative: last.cardSalesCumulative,
            cardSalesByTerminal: last.cardSalesByTerminal,
            cardSalesUnknownTerminal: last.cardSalesUnknownTerminal,
        }
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
