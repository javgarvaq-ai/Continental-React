/**
 * Terminales de cobro con tarjeta.
 *
 * Las tasas de comisión viven en `utils/ledger.js` (junto al resto de la
 * matemática de saldos) — aquí solo está lo que necesita la UI: cómo se llaman
 * y en qué orden se muestran.
 *
 * Ver tasks/conciliacion_bancaria_2026-09-06.md para cómo se midieron las tasas.
 */

export const CARD_TERMINAL_OPTIONS = [
    { value: 'mp',     label: 'Mercado Pago', short: 'MP'     },
    { value: 'getnet', label: 'Getnet',       short: 'Getnet' },
]

export const CARD_TERMINAL_LABEL = CARD_TERMINAL_OPTIONS.reduce(
    (acc, t) => ({ ...acc, [t.value]: t.label }),
    {},
)

/** Se recuerda la última usada para que no sea un clic extra en cada venta. */
export const LAST_CARD_TERMINAL_KEY = 'continental.lastCardTerminal'

export function readLastCardTerminal() {
    try {
        const v = window.localStorage.getItem(LAST_CARD_TERMINAL_KEY)
        return CARD_TERMINAL_LABEL[v] ? v : 'getnet'
    } catch {
        return 'getnet'
    }
}

export function rememberCardTerminal(terminal) {
    try {
        if (CARD_TERMINAL_LABEL[terminal]) {
            window.localStorage.setItem(LAST_CARD_TERMINAL_KEY, terminal)
        }
    } catch {
        /* localStorage bloqueado — no es crítico, solo se pierde el default */
    }
}
