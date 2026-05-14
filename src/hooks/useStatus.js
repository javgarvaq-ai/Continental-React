import { useState, useCallback } from 'react'

/**
 * Colors keyed by message type.
 * Used by the hook and can be imported directly when needed.
 */
export const STATUS_COLORS = {
    error:   '#dc2626', // red-600
    warning: '#d97706', // amber-600
    success: '#16a34a', // green-600
    info:    '#6b7280', // gray-500
}

// ── Auto-classification heuristics ────────────────────────────────────────────
// These run only when setStatus receives a plain string (no explicit type).
// Objects with { message, type } skip classification entirely.

const ERROR_RE   = /^error|error al|error:|error cargando|no se pudo|falta|inválid|insuficiente/i
const WARNING_RE = /sin conexi|no autorizado|ya existe|ya fue|bloqueada|faltan|bloqueado|⚠️/i
const SUCCESS_RE = /agregado|registrado|correctamente|exitoso|presentad|reabierto|cancelad|guardado|actualizado|creado|eliminado|cobro|activad|configurad|iniciado|cerrado|cargado|actualiz/i

function classify(message) {
    if (ERROR_RE.test(message))   return 'error'
    if (WARNING_RE.test(message)) return 'warning'
    if (SUCCESS_RE.test(message)) return 'success'
    return 'info'
}

/**
 * Drop-in replacement for `useState` for status messages.
 *
 * Returns:
 *  - status      — the current message string (empty string when none)
 *  - statusColor — hex color matching the current message type
 *  - setStatus   — accepts a plain string OR { message, type } object
 *
 * All existing `setStatus('...')` callsites continue to work unchanged.
 * Use `setStatus({ message: '...', type: 'error' })` for explicit typing.
 *
 * @param {string} [initial=''] - Initial status message
 */
export function useStatus(initial = '') {
    const [state, setState] = useState(() => {
        if (!initial) return { message: '', type: 'info' }
        return { message: initial, type: classify(initial) }
    })

    const setStatus = useCallback((input) => {
        if (!input) {
            setState({ message: '', type: 'info' })
            return
        }
        if (typeof input === 'string') {
            setState({ message: input, type: classify(input) })
            return
        }
        // { message, type } object — explicit, skip classification
        setState({ message: input.message ?? '', type: input.type ?? 'info' })
    }, [])

    return {
        status:      state.message,
        statusColor: STATUS_COLORS[state.type] ?? STATUS_COLORS.info,
        setStatus,
    }
}
