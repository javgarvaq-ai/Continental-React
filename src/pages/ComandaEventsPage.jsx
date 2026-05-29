import { useState, useEffect, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import { getComandaEvents } from '../services/reports'

// ── Helpers ───────────────────────────────────────────────────
function today() {
    return new Date().toISOString().split('T')[0]
}

function nDaysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
}

function formatDateTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
        second: '2-digit',
    })
}

const EVENT_LABELS = {
    opened:                  { label: 'Abierta',          color: '#60a5fa' },
    items_added:             { label: 'Productos',         color: '#94a3b8' },
    presented:               { label: 'Cuenta presentada', color: '#fbbf24' },
    payment_started:         { label: 'Pago iniciado',    color: '#a78bfa' },
    paid:                    { label: 'Pagada',            color: '#4ade80' },
    reopened_from_processing:{ label: 'Reabierta (pago)', color: '#f97316' },
    reopened_from_cuenta:    { label: 'Reabierta (cuenta)',color: '#f97316' },
    cancelled:               { label: 'Cancelada',         color: '#f87171' },
}

const EVENT_FILTERS = [
    { key: 'all',                   label: 'Todos'           },
    { key: 'paid',                  label: 'Pagadas'         },
    { key: 'reopened_from_processing', label: 'Reabiertas'  },
    { key: 'reopened_from_cuenta',  label: 'Reab. cuenta'   },
    { key: 'cancelled',             label: 'Canceladas'      },
    { key: 'presented',             label: 'Cuentas'         },
]

// ── Page ──────────────────────────────────────────────────────
function ComandaEventsPage() {
    const [startDate,  setStartDate]  = useState(nDaysAgo(7))
    const [endDate,    setEndDate]    = useState(today())
    const [eventType,  setEventType]  = useState('all')
    const [loading,    setLoading]    = useState(false)
    const [results,    setResults]    = useState(null)
    const [error,      setError]      = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        const { data, error: err } = await getComandaEvents({ startDate, endDate, eventType })
        if (err) setError(err.message)
        else setResults(data || [])
        setLoading(false)
    }, [startDate, endDate, eventType])

    useEffect(() => { load() }, [load])

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/comanda-events" />

                <h1 style={{ margin: '0 0 20px 0', fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Eventos de Comandas</h1>

                {/* ── Filters ── */}
                <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>

                        {/* Date range */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', color: '#64748b' }}>Desde</label>
                            <input
                                type="date"
                                value={startDate}
                                max={endDate}
                                onChange={e => setStartDate(e.target.value)}
                                style={{ background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 10px' }}
                            />
                            <label style={{ fontSize: '12px', color: '#64748b' }}>Hasta</label>
                            <input
                                type="date"
                                value={endDate}
                                min={startDate}
                                max={today()}
                                onChange={e => setEndDate(e.target.value)}
                                style={{ background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 10px' }}
                            />
                        </div>

                        {/* Quick range shortcuts */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {[
                                { label: 'Hoy', start: today(),      end: today()     },
                                { label: '7d',  start: nDaysAgo(7),  end: today()     },
                                { label: '30d', start: nDaysAgo(30), end: today()     },
                            ].map(r => (
                                <button
                                    key={r.label}
                                    onClick={() => { setStartDate(r.start); setEndDate(r.end) }}
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>

                        {/* Event type filter */}
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {EVENT_FILTERS.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setEventType(f.key)}
                                    style={{
                                        padding: '6px 10px', borderRadius: '5px', border: '1px solid',
                                        borderColor: eventType === f.key ? '#4a90d9' : '#334155',
                                        background:  eventType === f.key ? '#1d3557' : 'transparent',
                                        color:       eventType === f.key ? '#e2e8f0' : '#64748b',
                                        cursor: 'pointer', fontSize: '12px',
                                    }}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Summary ── */}
                {results !== null && !loading && (
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                        {results.length} evento{results.length !== 1 ? 's' : ''}
                        {results.length === 500 && (
                            <span style={{ color: '#fbbf24', marginLeft: '8px' }}>— límite de 500 alcanzado, ajusta el rango de fechas</span>
                        )}
                    </div>
                )}

                {/* ── Error ── */}
                {error && (
                    <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px 16px', color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}

                {/* ── Table ── */}
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando…</div>
                ) : results === null ? null : results.length === 0 ? (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
                        Sin eventos en el período seleccionado
                    </div>
                ) : (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '160px 90px 120px 1fr 100px', padding: '10px 16px', borderBottom: '1px solid #2a2a2a' }}>
                            {['Fecha / Hora', 'Folio', 'Evento', 'Mesa', 'Usuario'].map(h => (
                                <div key={h} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>{h}</div>
                            ))}
                        </div>

                        {/* Rows */}
                        {results.map(e => {
                            const meta = EVENT_LABELS[e.event_type] || { label: e.event_type, color: '#94a3b8' }
                            const folio = e.comandas?.folio
                            return (
                                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '160px 90px 120px 1fr 100px', padding: '10px 16px', borderBottom: '1px solid #1a1a1a', alignItems: 'center' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {formatDateTime(e.created_at)}
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>
                                        {folio ? `C-${String(folio).padStart(6, '0')}` : '—'}
                                    </div>
                                    <div>
                                        <span style={{
                                            fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                                            background: `${meta.color}1a`,
                                            color: meta.color,
                                        }}>
                                            {meta.label}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                                        {e.comandas?.units?.name || '—'}
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                        {e.users?.name || '—'}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ComandaEventsPage
