/**
 * Maps known RPC error codes to clean, user-facing Spanish strings.
 *
 * RPC functions can return errors in two forms:
 *  - Short machine codes (e.g. 'already_paid') — must be whitelisted here.
 *  - Natural-language Spanish sentences — already user-friendly, passed through as-is.
 *
 * Anything that is neither whitelisted nor a natural-language sentence is
 * replaced with a generic fallback so internal error details never reach the UI.
 */

const KNOWN_CODES = {
    already_paid:      'Esta comanda ya fue cobrada. Recarga la página.',
    comanda_not_open:  'La comanda ya no está abierta. Recarga la página.',
    insufficient_stock: 'Inventario insuficiente. Verifica el stock antes de continuar.',
}

/**
 * Returns a safe, user-facing error message for a raw RPC error string.
 *
 * @param {string|null|undefined} raw   - The raw `result.error` from an RPC call
 * @param {string}                [fallback] - Override the generic fallback message
 * @returns {string}
 */
export function friendlyRpcError(raw, fallback = 'Error interno. Contacta al administrador.') {
    if (!raw) return fallback

    // Known short code → whitelisted message
    if (KNOWN_CODES[raw]) return KNOWN_CODES[raw]

    // Contains whitespace → already a natural-language sentence from the RPC, safe to show
    if (/\s/.test(raw)) return raw.slice(0, 200)

    // Unrecognized machine code — don't leak it
    return fallback
}
