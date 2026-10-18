import { useState, useEffect, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import CashMovementPanel from '../components/CashMovementPanel'
import { useAuthStore } from '../store/authStore'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useShift } from '../hooks/useShift'
import { useStatus } from '../hooks/useStatus'
import { getCashMovements } from '../services/shifts'
import { money } from '../utils/money'
import { getCashMovementConfig } from '../config/cashMovements'

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

// Día operativo actual (corte 06:00, igual que getCashMovements): a la 1am
// el movimiento cuenta para el día anterior.
function operationalToday() {
    return toLocalDateString(new Date(Date.now() - 6 * 60 * 60 * 1000))
}

function nDaysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return toLocalDateString(d)
}


// ── Operational week helpers (same 12h shift as reports.js) ───
const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const OPERATIONAL_SHIFT_MS = 12 * 60 * 60 * 1000

function operationalWeekSunday(timestamp) {
    const ms = new Date(timestamp).getTime() - OPERATIONAL_SHIFT_MS
    const d  = new Date(ms)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return d.toISOString().split('T')[0]
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return toLocalDateString(d)
}

function weekLabel(sunStr, satStr) {
    const sun = new Date(sunStr + 'T12:00:00')
    const sat = new Date(satStr + 'T12:00:00')
    if (sun.getMonth() === sat.getMonth()) {
        return `${sun.getDate()}-${sat.getDate()} ${MONTH_SHORT[sat.getMonth()]}`
    }
    return `${sun.getDate()} ${MONTH_SHORT[sun.getMonth()]}-${sat.getDate()} ${MONTH_SHORT[sat.getMonth()]}`
}

function getLastNWeeks(n = 4) {
    const currentSun = operationalWeekSunday(Date.now())
    const todayStr   = toLocalDateString(new Date())
    return Array.from({ length: n }, (_, i) => {
        const offset = n - 1 - i
        const sunStr = addDays(currentSun, -offset * 7)
        const satStr = addDays(sunStr, 6)
        const isCurrent = offset === 0
        return {
            label: weekLabel(sunStr, satStr) + (isCurrent ? ' (actual)' : ''),
            start: sunStr,
            end:   isCurrent ? todayStr : satStr,
            isCurrent,
        }
    })
}

function formatDateTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

// Human-readable labels for each category
const CATEGORY_LABELS = {
    resguardo_casa:         'Resguardo casa',
    deposito_banco:         'Depósito banco',
    pago_proveedor_caja:    'Pago proveedor (caja)',
    pago_proveedor_banco:   'Pago proveedor (banco)',
    pago_proveedor_resguardo: 'Pago proveedor (resguardo)',
    nomina_caja:            'Nómina (caja)',
    nomina_banco:           'Nómina (banco)',
    renta_caja:             'Renta (caja)',
    renta_banco:            'Renta (banco)',
    propinas_entregadas:    'Propinas entregadas',
    gasto_operativo_caja:   'Gasto operativo (caja)',
    gasto_operativo_banco:  'Gasto operativo (banco)',
    regreso_resguardo:      'Regreso de resguardo',
    retiro_banco_a_caja:    'Retiro banco → caja',
    aportacion_socio:       'Aportación socio',
    aportacion_socio_banco: 'Aportación socio (banco)',
    pago_prestamo_banco:    'Pago de préstamo (banco)',
    ajuste_ingreso:         'Ajuste ingreso (caja)',
    ajuste_egreso_caja:     'Ajuste egreso (caja)',
    ajuste_ingreso_resguardo: 'Ajuste ingreso (caja fuerte)',
    ajuste_egreso_resguardo:  'Ajuste egreso (caja fuerte)',
}

const TYPE_FILTERS = [
    { key: 'all', label: 'Todos'    },
    { key: 'in',  label: 'Entradas' },
    { key: 'out', label: 'Salidas'  },
]

const ACCOUNT_FILTERS = [
    { key: 'all',        label: 'Todas'       },
    { key: 'drawer',     label: 'Caja'        },
    { key: 'house_safe', label: 'Caja fuerte' },
    { key: 'bank',       label: 'Banco'       },
]

const LOCATION_LABELS = {
    drawer:     'Caja',
    house_safe: 'Caja fuerte',
    bank:       'Banco',
    owner:      'Socio',
    expense:    'Gasto',
    tips:       'Propinas',
    loan:       'Préstamo',
    adjustment: 'Ajuste',
}

// Origen/destino del movimiento. Fallback a la config por categoría para
// movimientos viejos que no traigan las columnas de ubicación.
function getLocations(m) {
    const cfg = getCashMovementConfig(m.category)
    return {
        src: m.source_location      || cfg?.sourceLocation      || null,
        dst: m.destination_location || cfg?.destinationLocation || null,
    }
}

// 'in' | 'out' | null, relativo a la cuenta elegida. En "Todas" se usa `type`
// (relativo al cajón), igual que antes.
function getDirection(m, account) {
    if (account === 'all') return m.type === 'deposit' ? 'in' : 'out'
    const { src, dst } = getLocations(m)
    if (dst === account) return 'in'
    if (src === account) return 'out'
    return null
}

// Minúsculas y sin acentos, para que "nomina" encuentre "Nómina".
function normalize(str) {
    return String(str ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function searchText(m) {
    const { src, dst } = getLocations(m)
    return normalize([
        CATEGORY_LABELS[m.category] || m.category,
        m.note,
        m.users?.name,
        Number(m.amount || 0),
        money(m.amount),
        LOCATION_LABELS[src] || src,
        LOCATION_LABELS[dst] || dst,
    ].join(' '))
}

function filterBtnStyle(active) {
    return {
        padding: '6px 12px', borderRadius: '5px', border: '1px solid',
        borderColor: active ? '#4a90d9' : '#334155',
        background:  active ? '#1d3557' : 'transparent',
        color:       active ? '#e2e8f0' : '#64748b',
        cursor: 'pointer', fontSize: '13px',
    }
}

const GRID_COLUMNS = '130px 110px 1fr 150px 120px 80px'

// ── Page ──────────────────────────────────────────────────────
function CashMovementsAdminPage() {
    const [startDate, setStartDate] = useState(nDaysAgo(7))
    const [endDate,   setEndDate]   = useState(today())
    const [typeFilter, setTypeFilter] = useState('all')
    const [account,   setAccount]   = useState('all')
    const [search,    setSearch]    = useState('')

    // ── Registrar movimiento (mismo flujo que POS) ──
    const currentUser = useAuthStore(state => state.user)
    const shiftId     = useAuthStore(state => state.shiftId)
    const isOnline    = useOnlineStatus()
    const { status, statusColor, setStatus } = useStatus('')
    const {
        cashPanelOpen, setCashPanelOpen, isSubmittingCash, handleCashMovementSubmit,
    } = useShift({ currentUser, currentShiftId: shiftId, isOnline, setStatus, onShiftClosed: () => {} })

    const cashDisabledReason = !shiftId ? 'Sin turno abierto' : !isOnline ? 'Sin conexión' : ''
    const [loading,   setLoading]   = useState(false)
    const [results,   setResults]   = useState(null)
    const [error,     setError]     = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        const { data, error: err } = await getCashMovements({ startDate, endDate })
        if (err) setError(err.message)
        else setResults(data || [])
        setLoading(false)
    }, [startDate, endDate])

    useEffect(() => { load() }, [load])

    async function handleSubmitMovement(payload) {
        const ok = await handleCashMovementSubmit(payload)
        if (!ok) {
            setCashPanelOpen(false) // para que se vea el mensaje de por qué no se guardó
            return
        }
        if (endDate < operationalToday()) {
            setStatus('Movimiento registrado. No aparece en la lista porque el rango de fechas no incluye hoy.')
        }
        load()
    }

    const query = normalize(search.trim())

    const filtered = (results || [])
        .map(m => ({ ...m, direction: getDirection(m, account) }))
        .filter(m => m.direction !== null)
        .filter(m => typeFilter === 'all' || m.direction === typeFilter)
        .filter(m => !query || searchText(m).includes(query))

    const totalWithdrawals = filtered
        .filter(m => m.direction === 'out')
        .reduce((s, m) => s + Number(m.amount || 0), 0)

    const totalDeposits = filtered
        .filter(m => m.direction === 'in')
        .reduce((s, m) => s + Number(m.amount || 0), 0)

    const net = totalDeposits - totalWithdrawals
    const accountLabel = ACCOUNT_FILTERS.find(a => a.key === account)?.label

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/cash-movements" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Movimientos de Caja</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {cashDisabledReason && (
                            <span style={{ fontSize: '12px', color: '#64748b' }}>{cashDisabledReason}</span>
                        )}
                        <button
                            type="button"
                            onClick={() => { setStatus(''); setCashPanelOpen(true) }}
                            disabled={!!cashDisabledReason}
                            style={{
                                padding: '8px 14px', borderRadius: '6px', border: '1px solid',
                                borderColor: cashDisabledReason ? '#334155' : '#4a90d9',
                                background:  cashDisabledReason ? 'transparent' : '#1d3557',
                                color:       cashDisabledReason ? '#475569' : '#e2e8f0',
                                cursor: cashDisabledReason ? 'not-allowed' : 'pointer',
                                fontSize: '13px', fontWeight: 600,
                            }}
                        >
                            + Movimiento de caja
                        </button>
                    </div>
                </div>

                {status && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#161616', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: statusColor }}>
                        <span>{status}</span>
                        <button type="button" onClick={() => setStatus('')} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                    </div>
                )}

                <CashMovementPanel
                    open={cashPanelOpen}
                    onClose={() => setCashPanelOpen(false)}
                    onSubmit={handleSubmitMovement}
                    isSubmitting={isSubmittingCash}
                    role={currentUser?.role}
                />

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
                                { label: 'Hoy', start: today(),       end: today()      },
                                { label: '7d',  start: nDaysAgo(7),   end: today()      },
                                { label: '30d', start: nDaysAgo(30),  end: today()      },
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

                        {/* Type filter */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {TYPE_FILTERS.map(f => (
                                <button key={f.key} onClick={() => setTypeFilter(f.key)} style={filterBtnStyle(typeFilter === f.key)}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Account + search ── */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1e1e1e' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#475569', marginRight: '4px' }}>Cuenta:</span>
                            {ACCOUNT_FILTERS.map(a => (
                                <button key={a.key} onClick={() => setAccount(a.key)} style={filterBtnStyle(account === a.key)}>
                                    {a.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '360px' }}>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar concepto, nota, usuario o monto…"
                                style={{ width: '100%', boxSizing: 'border-box', background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 30px 6px 10px' }}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    title="Limpiar búsqueda"
                                    style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Week shortcuts (second row) ── */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1e1e1e' }}>
                        <span style={{ fontSize: '11px', color: '#475569', alignSelf: 'center', marginRight: '4px' }}>Semana:</span>
                        {getLastNWeeks(4).map(w => {
                            const isActive = startDate === w.start && endDate === w.end
                            return (
                                <button
                                    key={w.start}
                                    onClick={() => { setStartDate(w.start); setEndDate(w.end) }}
                                    style={{
                                        padding: '5px 11px', borderRadius: '5px', border: '1px solid',
                                        borderColor: isActive ? '#4a90d9' : '#334155',
                                        background:  isActive ? '#1d3557' : 'transparent',
                                        color:       isActive ? '#e2e8f0' : w.isCurrent ? '#93c5fd' : '#64748b',
                                        cursor: 'pointer', fontSize: '12px', fontWeight: w.isCurrent ? 600 : 400,
                                    }}
                                >
                                    {w.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* ── Summary ── */}
                {results !== null && !loading && (
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
                        <span>{filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}</span>
                        {totalDeposits > 0 && (
                            <span>· Entradas: <span style={{ color: '#4ade80', fontWeight: 600 }}>{money(totalDeposits)}</span></span>
                        )}
                        {totalWithdrawals > 0 && (
                            <span>· Salidas: <span style={{ color: '#f87171', fontWeight: 600 }}>{money(totalWithdrawals)}</span></span>
                        )}
                        {account !== 'all' && filtered.length > 0 && (
                            <span>· Neto {accountLabel}: <span style={{ color: net >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{net < 0 ? '-' : ''}{money(Math.abs(net))}</span></span>
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
                ) : results === null ? null : filtered.length === 0 ? (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
                        Sin movimientos con estos filtros
                    </div>
                ) : (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, padding: '10px 16px', borderBottom: '1px solid #2a2a2a' }}>
                            {['Fecha', 'Usuario', 'Concepto', 'Cuenta', 'Monto', 'Tipo'].map(h => (
                                <div key={h} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>{h}</div>
                            ))}
                        </div>

                        {/* Rows */}
                        {filtered.map(m => {
                            const isDeposit = m.direction === 'in'
                            const { src, dst } = getLocations(m)
                            return (
                                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, padding: '11px 16px', borderBottom: '1px solid #1a1a1a', alignItems: 'start' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        {formatDateTime(m.created_at)}
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                        {m.users?.name || '—'}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                                            {CATEGORY_LABELS[m.category] || m.category || '—'}
                                        </div>
                                        {m.note && (
                                            <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                                                {m.note}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                        {LOCATION_LABELS[src] || src || '—'} → {LOCATION_LABELS[dst] || dst || '—'}
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: isDeposit ? '#4ade80' : '#f87171' }}>
                                        {isDeposit ? '+' : '-'}{money(m.amount)}
                                    </div>
                                    <div>
                                        <span style={{
                                            fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                                            background: isDeposit ? '#14532d33' : '#7f1d1d33',
                                            color:      isDeposit ? '#4ade80'   : '#f87171',
                                        }}>
                                            {isDeposit ? 'Entrada' : 'Salida'}
                                        </span>
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

export default CashMovementsAdminPage
