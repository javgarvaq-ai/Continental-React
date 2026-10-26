import { useState, useEffect, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import { getComandaEvents, getComandaTimeline } from '../services/reports'
import { getAllUsers } from '../services/usersAdmin'
import { money } from '../utils/money'
import {
    EVENT_TYPES, EVENT_GROUPS, typesInGroup, eventMeta,
    formatEventDetail, summarizeCobros, comandaStatusLabel, formatFolio, parseFolio,
} from '../utils/comandaEvents'

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
        second: '2-digit',
    })
}

const GRID = '150px 90px 140px 150px 1fr 110px'

const inputStyle = { background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 10px' }
const labelStyle = { fontSize: '12px', color: '#64748b' }
const cardStyle  = { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px' }

function chipStyle(active, color = '#4a90d9') {
    return {
        padding: '5px 10px', borderRadius: '5px', border: '1px solid',
        borderColor: active ? color : '#334155',
        background:  active ? `${color}26` : 'transparent',
        color:       active ? '#e2e8f0' : '#64748b',
        cursor: 'pointer', fontSize: '12px',
    }
}

// ── Sub-components ────────────────────────────────────────────
function EventBadge({ type }) {
    const meta = eventMeta(type)
    return (
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: `${meta.color}1a`, color: meta.color, whiteSpace: 'nowrap' }}>
            {meta.label}
        </span>
    )
}

function CobrosSummary({ events, limitReached }) {
    const s = summarizeCobros(events)
    if (s.count === 0) return null
    const cells = [
        { label: 'Cobros',        value: s.count },
        { label: 'Total',         value: money(s.total) },
        { label: 'Efectivo',      value: money(s.efectivo) },
        { label: 'Tarjeta',       value: money(s.tarjeta) },
        { label: 'Transferencia', value: money(s.transferencia) },
        { label: 'Propina',       value: money(s.propina) },
    ]
    return (
        <div style={{ ...cardStyle, padding: '12px 20px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                {cells.map(c => (
                    <div key={c.label}>
                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#4ade80' }}>{c.value}</div>
                    </div>
                ))}
            </div>
            {limitReached && (
                <div style={{ fontSize: '12px', color: '#fbbf24', marginTop: '8px' }}>
                    Totales incompletos: se alcanzó el límite de 500 eventos. Reduce el rango o filtra solo "Cobrada".
                </div>
            )}
        </div>
    )
}

function EventsTable({ events, onOpenComanda, showComandaCols = true }) {
    const grid = showComandaCols ? GRID : '150px 140px 1fr 110px'
    const headers = showComandaCols
        ? ['Fecha / Hora', 'Folio', 'Evento', 'Mesa / Cliente', 'Detalle', 'Usuario']
        : ['Fecha / Hora', 'Evento', 'Detalle', 'Usuario']
    return (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '10px 16px', borderBottom: '1px solid #2a2a2a' }}>
                {headers.map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>{h}</div>
                ))}
            </div>
            {events.map(e => {
                const c = e.comandas
                const isRaro = eventMeta(e.event_type).group === 'raros'
                return (
                    <div key={e.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '9px 16px', borderBottom: '1px solid #1a1a1a', alignItems: 'center', background: isRaro ? '#f871710a' : 'transparent' }}>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{formatDateTime(e.created_at)}</div>
                        {showComandaCols && (
                            <div>
                                {c?.id ? (
                                    <button
                                        onClick={() => onOpenComanda(c.id)}
                                        title="Ver historia de la comanda"
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#60a5fa', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                                    >
                                        {formatFolio(c.folio)}
                                    </button>
                                ) : '—'}
                            </div>
                        )}
                        <div><EventBadge type={e.event_type} /></div>
                        {showComandaCols && (
                            <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.3 }}>
                                {c?.units?.name || '—'}
                                {c?.customer_name && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.customer_name}</div>}
                            </div>
                        )}
                        <div style={{ fontSize: '12px', color: '#cbd5e1' }}>{formatEventDetail(e) || <span style={{ color: '#475569' }}>—</span>}</div>
                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{e.users?.name || '—'}</div>
                    </div>
                )
            })}
        </div>
    )
}

function ComandaTimeline({ timeline, onBack }) {
    const { comanda, events } = timeline
    const facts = [
        { label: 'Mesa',    value: comanda?.units?.name || '—' },
        { label: 'Cliente', value: comanda?.customer_name || '—' },
        { label: 'Estado',  value: comandaStatusLabel(comanda?.status) },
        { label: 'Total',   value: comanda?.final_total != null ? money(comanda.final_total) : '—' },
        { label: 'Propina', value: Number(comanda?.tip_total) > 0 ? money(comanda.tip_total) : '—' },
        { label: 'Abierta', value: formatDateTime(comanda?.opened_at) },
        { label: 'Cerrada', value: formatDateTime(comanda?.closed_at) },
    ]
    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <button onClick={onBack} style={{ ...chipStyle(false), color: '#e2e8f0' }}>← Volver a la lista</button>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#60a5fa' }}>{formatFolio(comanda?.folio)}</h2>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{events.length} evento{events.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ ...cardStyle, padding: '12px 20px', marginBottom: '12px', display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                {facts.map(f => (
                    <div key={f.label}>
                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{f.value}</div>
                    </div>
                ))}
            </div>
            {events.length === 0 ? (
                <div style={{ ...cardStyle, padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>Esta comanda no tiene eventos</div>
            ) : (
                <EventsTable events={events} showComandaCols={false} />
            )}
        </>
    )
}

// ── Page ──────────────────────────────────────────────────────
function ComandaEventsPage() {
    const [startDate,  setStartDate]  = useState(nDaysAgo(7))
    const [endDate,    setEndDate]    = useState(today())
    const [eventTypes, setEventTypes] = useState([])      // [] = todos
    const [userId,     setUserId]     = useState('')
    const [users,      setUsers]      = useState([])
    const [loading,    setLoading]    = useState(false)
    const [results,    setResults]    = useState(null)
    const [error,      setError]      = useState('')

    const [folioInput, setFolioInput] = useState('')
    const [timeline,   setTimeline]   = useState(null)    // { comanda, events } | null
    const [tlLoading,  setTlLoading]  = useState(false)

    useEffect(() => {
        getAllUsers().then(({ data }) => setUsers(data || []))
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        const { data, error: err } = await getComandaEvents({ startDate, endDate, eventTypes, userId: userId || undefined })
        if (err) setError(err.message)
        else setResults(data || [])
        setLoading(false)
    }, [startDate, endDate, eventTypes, userId])

    useEffect(() => { load() }, [load])

    const openTimeline = useCallback(async ({ comandaId, folio }) => {
        setTlLoading(true)
        setError('')
        const { comanda, events, error: err } = await getComandaTimeline({ comandaId, folio })
        if (err) setError(err.message)
        else setTimeline({ comanda, events })
        setTlLoading(false)
    }, [])

    function handleFolioSearch(e) {
        e.preventDefault()
        const folio = parseFolio(folioInput)
        if (!folio) { setError('Folio inválido. Escribe el número, ej. 1234 o C-001234'); return }
        openTimeline({ folio })
    }

    function toggleType(type) {
        setEventTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
    }

    function selectGroup(groupKey) {
        const group = typesInGroup(groupKey)
        const isExactly = group.length === eventTypes.length && group.every(t => eventTypes.includes(t))
        setEventTypes(isExactly ? [] : group)
    }

    const isGroupActive = key => {
        const group = typesInGroup(key)
        return group.length === eventTypes.length && group.every(t => eventTypes.includes(t))
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/comanda-events" />

                <h1 style={{ margin: '0 0 20px 0', fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Eventos de Comandas</h1>

                {/* ── Error ── */}
                {error && (
                    <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px 16px', color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}

                {tlLoading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando comanda…</div>
                ) : timeline ? (
                    <ComandaTimeline timeline={timeline} onBack={() => { setTimeline(null); setError('') }} />
                ) : (
                    <>
                        {/* ── Filters ── */}
                        <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {/* Date range */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <label style={labelStyle}>Desde</label>
                                    <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                                    <label style={labelStyle}>Hasta</label>
                                    <input type="date" value={endDate} min={startDate} max={today()} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                                </div>

                                {/* Quick range shortcuts */}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[
                                        { label: 'Hoy', start: today(),      end: today() },
                                        { label: '7d',  start: nDaysAgo(7),  end: today() },
                                        { label: '30d', start: nDaysAgo(30), end: today() },
                                    ].map(r => (
                                        <button key={r.label} onClick={() => { setStartDate(r.start); setEndDate(r.end) }} style={chipStyle(startDate === r.start && endDate === r.end)}>
                                            {r.label}
                                        </button>
                                    ))}
                                </div>

                                {/* User */}
                                <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
                                    <option value="">Todos los usuarios</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.name}{u.active === false ? ' (inactivo)' : ''}</option>
                                    ))}
                                </select>

                                {/* Folio search → timeline */}
                                <form onSubmit={handleFolioSearch} style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                                    <input value={folioInput} onChange={e => setFolioInput(e.target.value)} placeholder="Folio (ej. 1234)" style={{ ...inputStyle, width: '130px' }} />
                                    <button type="submit" style={{ ...chipStyle(false), color: '#e2e8f0' }}>Ver comanda</button>
                                </form>
                            </div>

                            {/* Event type: group shortcuts */}
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button onClick={() => setEventTypes([])} style={chipStyle(eventTypes.length === 0)}>Todos</button>
                                {EVENT_GROUPS.map(g => (
                                    <button key={g.key} onClick={() => selectGroup(g.key)} style={chipStyle(isGroupActive(g.key), g.key === 'raros' ? '#f87171' : '#4a90d9')}>
                                        {g.label}
                                    </button>
                                ))}
                            </div>

                            {/* Event type: individual (multi-select) */}
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {Object.entries(EVENT_TYPES).map(([type, meta]) => (
                                    <button key={type} onClick={() => toggleType(type)} style={chipStyle(eventTypes.includes(type), meta.color)}>
                                        {meta.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Summary ── */}
                        {results !== null && !loading && (
                            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                {results.length} evento{results.length !== 1 ? 's' : ''}
                                {results.length === 500 && (
                                    <span style={{ color: '#fbbf24', marginLeft: '8px' }}>— límite de 500 alcanzado, ajusta el rango o los filtros</span>
                                )}
                            </div>
                        )}

                        {results !== null && !loading && (
                            <CobrosSummary events={results} limitReached={results.length === 500} />
                        )}

                        {/* ── Table ── */}
                        {loading ? (
                            <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando…</div>
                        ) : results === null ? null : results.length === 0 ? (
                            <div style={{ ...cardStyle, padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
                                Sin eventos con estos filtros
                            </div>
                        ) : (
                            <EventsTable events={results} onOpenComanda={comandaId => openTimeline({ comandaId })} />
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default ComandaEventsPage
