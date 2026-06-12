import { useState, useEffect, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import { getShifts } from '../services/shifts'
import { money } from '../utils/money'

// ── Helpers ───────────────────────────────────────────────────
// Local (Mexico) date string — toISOString() returns the UTC date, which is
// already "tomorrow" during the evening (UTC-6), making "Hoy" point at the
// wrong day during the bar's busiest hours.
function toLocalDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function today() {
    return toLocalDateString(new Date())
}

function nDaysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return toLocalDateString(d)
}

function formatDateTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function formatDuration(openedAt, closedAt) {
    if (!openedAt || !closedAt) return null
    const ms = new Date(closedAt) - new Date(openedAt)
    const h  = Math.floor(ms / 3_600_000)
    const m  = Math.floor((ms % 3_600_000) / 60_000)
    return `${h}h ${m}m`
}

// ── Expanded detail row ───────────────────────────────────────
function ShiftDetail({ shift }) {
    const diff = Number(shift.difference || 0)
    const diffColor = diff < -50 ? '#f87171' : diff > 50 ? '#4ade80' : '#94a3b8'

    const rows = [
        { label: 'Efectivo cobrado',    value: shift.total_efectivo      },
        { label: 'Tarjeta cobrada',     value: shift.total_tarjeta       },
        { label: 'Transferencia',       value: shift.total_transferencia },
        { label: 'Propinas',            value: shift.total_propinas      },
        { label: 'Total retiros',       value: shift.total_retiros       },
        { label: 'Caja inicial',        value: shift.starting_cash       },
        { label: 'Efectivo esperado',   value: shift.expected_cash       },
        { label: 'Efectivo contado',    value: shift.cash_counted        },
    ].filter(r => r.value != null)

    return (
        <div style={{ background: '#0d1117', borderTop: '1px solid #1e293b', padding: '16px 20px 20px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '10px' }}>
                        Desglose
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {rows.map(r => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid #1a1a1a' }}>
                                <span style={{ color: '#64748b' }}>{r.label}</span>
                                <span style={{ color: '#94a3b8' }}>{money(r.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '10px' }}>
                        Diferencia de caja
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: diffColor }}>
                        {diff >= 0 ? '+' : ''}{money(diff)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px' }}>
                        {diff < -50
                            ? 'Faltante en caja'
                            : diff > 50
                            ? 'Sobrante en caja'
                            : 'Caja cuadrada'}
                    </div>
                    {formatDuration(shift.opened_at, shift.closed_at) && (
                        <div style={{ marginTop: '16px', fontSize: '13px', color: '#64748b' }}>
                            Duración: <span style={{ color: '#94a3b8' }}>{formatDuration(shift.opened_at, shift.closed_at)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────
function ShiftHistoryPage() {
    const [startDate, setStartDate] = useState(nDaysAgo(30))
    const [endDate,   setEndDate]   = useState(today())
    const [loading,   setLoading]   = useState(false)
    const [results,   setResults]   = useState(null)
    const [expanded,  setExpanded]  = useState(null)
    const [error,     setError]     = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        setExpanded(null)
        const { data, error: err } = await getShifts({ startDate, endDate })
        if (err) setError(err.message)
        else setResults(data || [])
        setLoading(false)
    }, [startDate, endDate])

    useEffect(() => { load() }, [load])

    function toggleExpand(id) {
        setExpanded(prev => prev === id ? null : id)
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/shifts" />

                <h1 style={{ margin: '0 0 20px 0', fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Historial de Turnos</h1>

                {/* ── Filters ── */}
                <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {[
                                { label: '7d',  start: nDaysAgo(7),   end: today() },
                                { label: '30d', start: nDaysAgo(30),  end: today() },
                                { label: '90d', start: nDaysAgo(90),  end: today() },
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
                    </div>
                </div>

                {/* ── Summary ── */}
                {results !== null && !loading && (
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                        {results.length} turno{results.length !== 1 ? 's' : ''}
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
                        Sin turnos en el período seleccionado
                    </div>
                ) : (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 110px 110px 110px 120px 80px 60px', padding: '10px 16px', borderBottom: '1px solid #2a2a2a' }}>
                            {['Apertura', 'Aperturó', 'Cerró', 'Inicio', 'Esperado', 'Estado', ''].map(h => (
                                <div key={h} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>{h}</div>
                            ))}
                        </div>

                        {/* Rows */}
                        {results.map(s => {
                            const isOpen   = s.status === 'open'
                            const diff     = Number(s.difference || 0)
                            const diffColor = diff < -50 ? '#f87171' : diff > 50 ? '#4ade80' : '#94a3b8'
                            const isExpanded = expanded === s.id

                            return (
                                <div key={s.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                    <div
                                        onClick={() => toggleExpand(s.id)}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '150px 110px 110px 110px 120px 80px 60px',
                                            padding: '11px 16px',
                                            cursor: 'pointer',
                                            background: isExpanded ? '#0d1117' : 'transparent',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                            {formatDateTime(s.opened_at)}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                                            {s.opener?.name || '—'}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                            {s.closer?.name || (isOpen ? <span style={{ color: '#60a5fa' }}>Abierto</span> : '—')}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                            {money(s.starting_cash)}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                            {s.expected_cash != null ? money(s.expected_cash) : '—'}
                                        </div>
                                        <div>
                                            {isOpen ? (
                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#1d3557', color: '#60a5fa', fontWeight: 600 }}>Abierto</span>
                                            ) : (
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: diffColor }}>
                                                    {diff >= 0 ? '+' : ''}{money(diff)}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#475569', textAlign: 'right' }}>
                                            {isExpanded ? '▲' : '▼'}
                                        </div>
                                    </div>

                                    {isExpanded && <ShiftDetail shift={s} />}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ShiftHistoryPage
