import { money } from './money'

// ── Catálogo de eventos ───────────────────────────────────────
// Alineado con lo que REALMENTE escriben los services y las RPCs
// (verificado 2026-10-25 contra un conteo por event_type en prod).
// group: 'raros' | 'cobros' | 'flujo'
export const EVENT_TYPES = {
    created:                  { label: 'Creada',             color: '#60a5fa', group: 'flujo'  },
    renamed:                  { label: 'Renombrada',         color: '#94a3b8', group: 'flujo'  },
    shot_with_mixers_added:   { label: 'Shot + mezcladores', color: '#94a3b8', group: 'flujo'  },
    item_decreased:           { label: 'Bajó producto',      color: '#f87171', group: 'raros'  },
    reopened_from_cuenta:     { label: 'Reabierta (cuenta)', color: '#f97316', group: 'raros'  },
    reopened_from_processing: { label: 'Reabierta (pago)',   color: '#f97316', group: 'raros'  },
    cancelled:                { label: 'Cancelada',          color: '#f87171', group: 'raros'  },
    ticket_reprinted:         { label: 'Reimpresión',        color: '#e879f9', group: 'raros'  },
    cuenta_clicked:           { label: 'Cuenta',             color: '#fbbf24', group: 'cobros' },
    payment_started:          { label: 'Pago iniciado',      color: '#a78bfa', group: 'cobros' },
    cobro_confirmed:          { label: 'Cobrada',            color: '#4ade80', group: 'cobros' },
}

export const EVENT_GROUPS = [
    { key: 'raros',  label: '⚠ Movimientos raros' },
    { key: 'cobros', label: 'Cobros'              },
    { key: 'flujo',  label: 'Flujo'               },
]

export function typesInGroup(groupKey) {
    return Object.keys(EVENT_TYPES).filter(t => EVENT_TYPES[t].group === groupKey)
}

export function eventMeta(type) {
    return EVENT_TYPES[type] || { label: type, color: '#94a3b8', group: null }
}

const COMANDA_STATUS = {
    open:               'Abierta',
    pending_payment:    'En cuenta',
    processing_payment: 'Cobrando',
    paid:               'Pagada',
    cancelled:          'Cancelada',
}

export function comandaStatusLabel(status) {
    return COMANDA_STATUS[status] || status || '—'
}

export function formatFolio(folio) {
    return folio ? `C-${String(folio).padStart(6, '0')}` : '—'
}

// "1234", "C-001234", "c001234" → 1234. Devuelve null si no es un folio válido.
export function parseFolio(input) {
    const digits = String(input || '').trim().replace(/^c-?/i, '')
    if (!/^\d+$/.test(digits)) return null
    const n = Number(digits)
    return n > 0 ? n : null
}

// ── Detalle legible por tipo ──────────────────────────────────
// `event` es la fila tal como la regresa getComandaEvents (con event_data,
// products y comandas). Nunca truena con data incompleta o antigua.
export function formatEventDetail(event) {
    const d = event?.event_data || {}
    switch (event?.event_type) {
        case 'created': {
            const parts = []
            if (d.customer_name) parts.push(`Cliente: ${d.customer_name}`)
            if (d.rp_name) parts.push(`RP: ${d.rp_name}${d.rp_cortesia ? ' (cortesía)' : ''}`)
            return parts.join(' · ')
        }
        case 'renamed':
            return `${d.from || '(sin nombre)'} → ${d.to || '(sin nombre)'}`
        case 'shot_with_mixers_added': {
            const mixers = (d.mixers || []).map(m => m.name).filter(Boolean)
            const name = d.shot_name || event.products?.name || 'Shot'
            return mixers.length ? `${name} + ${mixers.join(', ')}` : name
        }
        case 'item_decreased': {
            const name = event.products?.name || 'Producto'
            if (d.previous_quantity == null) return name
            const to = Number(d.new_quantity) > 0 ? d.new_quantity : '0 (eliminado)'
            return `${name}: ${d.previous_quantity} → ${to}`
        }
        case 'cuenta_clicked':
            return d.total != null ? `Total ${money(d.total)}` : ''
        case 'cobro_confirmed': {
            const parts = []
            if (d.total != null) parts.push(`Total ${money(d.total)}`)
            if (Number(d.efectivo) > 0)      parts.push(`Ef ${money(d.efectivo)}`)
            if (Number(d.tarjeta) > 0)       parts.push(`Tar ${money(d.tarjeta)}`)
            if (Number(d.transferencia) > 0) parts.push(`Transf ${money(d.transferencia)}`)
            if (Number(d.propina) > 0)       parts.push(`Propina ${money(d.propina)}`)
            if (Number(d.cambio) > 0)        parts.push(`Cambio ${money(d.cambio)}`)
            return parts.join(' · ')
        }
        case 'reopened_from_cuenta':
        case 'reopened_from_processing':
            return d.previous_status ? `Estaba: ${comandaStatusLabel(d.previous_status)}` : ''
        case 'cancelled':
            return d.reason === 'manual_cancel' ? 'Cancelación manual' : (d.reason || '')
        case 'ticket_reprinted':
            return d.tipo_ticket === 'pagado' ? 'Ticket pagado'
                 : d.tipo_ticket === 'cuenta' ? 'Ticket de cuenta'
                 : (d.tipo_ticket || '')
        default:
            return ''
    }
}

// ── Totales de cobros (para cuadrar) ──────────────────────────
export function summarizeCobros(events) {
    const sum = { count: 0, total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, propina: 0 }
    for (const e of events || []) {
        if (e.event_type !== 'cobro_confirmed') continue
        const d = e.event_data || {}
        sum.count += 1
        sum.total         += Number(d.total || 0)
        sum.efectivo      += Number(d.efectivo || 0)
        sum.tarjeta       += Number(d.tarjeta || 0)
        sum.transferencia += Number(d.transferencia || 0)
        sum.propina       += Number(d.propina || 0)
    }
    return sum
}
