import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import { getLedgerData } from '../services/ledger'
import { getCurrentShift } from '../services/dashboard'
import { buildLedger, estimateBankNet } from '../utils/ledger'
import { money } from '../utils/money'

// ── Colors ─────────────────────────────────────────────────────
const GREEN = '#4ade80'
const RED   = '#f87171'
const MUTED = '#64748b'

// ── Date helpers (local Mexico date — see CashMovementsAdminPage) ──
function toLocalDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}
function today() { return toLocalDateString(new Date()) }
function getThisWeekStart() {
    const t = new Date()
    const dow = t.getDay()
    const start = new Date(t)
    start.setDate(t.getDate() - (dow === 0 ? 6 : dow - 1))
    return toLocalDateString(start)
}
function formatDateTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
}

// ── Category / location labels ─────────────────────────────────
const CATEGORY_LABELS = {
    resguardo_casa: 'Resguardo casa', deposito_banco: 'Depósito banco',
    pago_proveedor_caja: 'Pago proveedor (caja)', pago_proveedor_banco: 'Pago proveedor (banco)',
    pago_proveedor_resguardo: 'Pago proveedor (resguardo)', nomina_caja: 'Nómina (caja)',
    nomina_banco: 'Nómina (banco)', renta_caja: 'Renta (caja)', renta_banco: 'Renta (banco)',
    propinas_entregadas: 'Propinas entregadas', gasto_operativo_caja: 'Gasto operativo (caja)',
    gasto_operativo_banco: 'Gasto operativo (banco)', regreso_resguardo: 'Regreso de resguardo',
    retiro_banco_a_caja: 'Retiro banco → caja', aportacion_socio: 'Aportación socio',
    ajuste_ingreso: 'Ajuste ingreso',
}

const LOCATION_FILTERS = [
    { key: 'all',        label: 'Todas'       },
    { key: 'drawer',     label: 'Cajón'       },
    { key: 'house_safe', label: 'Caja fuerte' },
    { key: 'bank',       label: 'Banco'       },
]
const BALANCE_KEY = { drawer: 'drawerBalance', house_safe: 'houseBalance', bank: 'bankBalance' }
const DELTA_KEY   = { drawer: 'drawerDelta',   house_safe: 'houseDelta',   bank: 'bankDelta'   }

// ── Small render helpers ───────────────────────────────────────
function deltaCell(n) {
    const v = Number(n || 0)
    if (v === 0) return <span style={{ color: '#334155' }}>—</span>
    return (
        <span style={{ color: v > 0 ? GREEN : RED, fontWeight: 700 }}>
            {v > 0 ? '+' : '−'}{money(Math.abs(v))}
        </span>
    )
}

function rowConcept(e) {
    if (e.kind === 'shift_open')  return `Apertura de turno · Fondo ${money(e.startingCash)}`
    if (e.kind === 'shift_close') {
        const parts = ['Cierre de turno']
        if (e.cashCounted != null) parts.push(`contado ${money(e.cashCounted)}`)
        if (e.difference  != null) parts.push(`dif ${money(e.difference)}`)
        return parts.join(' · ')
    }
    if (e.kind === 'payment')  return e.folio != null ? `Folio #${e.folio} cobrado` : 'Folio cobrado'
    return CATEGORY_LABELS[e.category] || e.category || e.movementType || 'Movimiento'
}

function BalanceCard({ label, opening, closing, accent, sub }) {
    return (
        <div style={{ flex: 1, minWidth: '200px', padding: '16px 18px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderLeft: `3px solid ${accent}`, borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'white' }}>{money(closing)}</div>
            <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px' }}>Inicial: {money(opening)}</div>
            {sub && (
                <div style={{ fontSize: '12px', color: '#7dd3fc', marginTop: '4px' }}>{sub}</div>
            )}
        </div>
    )
}

// ── Page ───────────────────────────────────────────────────────
function LedgerPage() {
    const location = useLocation()

    const [startDate, setStartDate]     = useState(getThisWeekStart())
    const [endDate, setEndDate]         = useState(today())
    const [locFilter, setLocFilter]     = useState('all')
    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState('')
    const [raw, setRaw]                 = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        const data = await getLedgerData({ startDate, endDate })
        if (data.error) setError(data.error.message)
        else setRaw(data)
        setLoading(false)
    }, [startDate, endDate])

    useEffect(() => { load() }, [load])

    async function applyShiftFilter() {
        const { data: shift } = await getCurrentShift()
        if (!shift) { setError('No hay un turno abierto actualmente.'); return }
        setStartDate(toLocalDateString(new Date(shift.opened_at)))
        setEndDate(today())
    }

    const ledger = useMemo(
        () => (raw ? buildLedger(raw, raw.startIso, raw.endIso) : null),
        [raw],
    )

    const rows = useMemo(() => {
        if (!ledger) return []
        if (locFilter === 'all') return ledger.rows
        const dk = DELTA_KEY[locFilter]
        return ledger.rows.filter((r) => {
            if (r.kind === 'shift_open' || r.kind === 'shift_close') return locFilter === 'drawer'
            return Number(r[dk] || 0) !== 0
        })
    }, [ledger, locFilter])

    // Mostrar más nuevo primero (lo de hoy arriba, como Movimientos). Los saldos
    // corridos se calcularon cronológicamente, así que el saldo de cada renglón
    // sigue siendo correcto; solo se invierte el orden de despliegue.
    const displayRows = useMemo(() => [...rows].reverse(), [rows])

    function exportCsv() {
        if (!ledger) return
        const head = ['Fecha', 'Concepto', 'Cajon', 'Caja fuerte', 'Banco', 'Saldo cajon', 'Saldo caja fuerte', 'Saldo banco', 'Nota']
        const lines = rows.map((e) => [
            formatDateTime(e.ts), rowConcept(e),
            e.drawerDelta || 0, e.houseDelta || 0, e.bankDelta || 0,
            e.drawerBalance, e.houseBalance, e.bankBalance,
            (e.note || '').replace(/[\n,]/g, ' '),
        ].join(','))
        const csv = [head.join(','), ...lines].join('\n')
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `ledger_${startDate}_${endDate}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const inputStyle = { background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 10px' }
    const showAllCols = locFilter === 'all'
    const gridCols = showAllCols ? '128px 1fr 150px 150px 150px' : '150px 1fr 150px 160px'

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
                <AdminNav currentPath={location.pathname} />

                <h1 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>📒 Ledger</h1>
                <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: MUTED }}>
                    Todo lo que entra y sale, en orden, con saldo corrido por ubicación. El cajón se ancla al fondo de cada turno; caja fuerte y banco son acumulados.
                </p>

                {/* ── Filters ── */}
                <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', color: MUTED }}>Desde</label>
                            <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
                            <label style={{ fontSize: '12px', color: MUTED }}>Hasta</label>
                            <input type="date" value={endDate} min={startDate} max={today()} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={applyShiftFilter} style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: 'transparent', color: MUTED, cursor: 'pointer', fontSize: '12px' }}>Este turno</button>
                            <button onClick={() => { setStartDate(today()); setEndDate(today()) }} style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: 'transparent', color: MUTED, cursor: 'pointer', fontSize: '12px' }}>Hoy</button>
                            <button onClick={() => { setStartDate(getThisWeekStart()); setEndDate(today()) }} style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: 'transparent', color: MUTED, cursor: 'pointer', fontSize: '12px' }}>Semana</button>
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                            {LOCATION_FILTERS.map((f) => (
                                <button key={f.key} onClick={() => setLocFilter(f.key)} style={{
                                    padding: '6px 12px', borderRadius: '5px', border: '1px solid',
                                    borderColor: locFilter === f.key ? '#4a90d9' : '#334155',
                                    background:  locFilter === f.key ? '#1d3557' : 'transparent',
                                    color:       locFilter === f.key ? '#e2e8f0' : MUTED,
                                    cursor: 'pointer', fontSize: '13px',
                                }}>{f.label}</button>
                            ))}
                        </div>

                        <button onClick={exportCsv} disabled={!ledger || rows.length === 0} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: '5px', border: '1px solid #334155', background: 'transparent', color: MUTED, cursor: ledger && rows.length ? 'pointer' : 'not-allowed', fontSize: '12px' }}>Exportar CSV</button>
                    </div>
                </div>

                {/* ── Balance cards ── */}
                {ledger && !loading && (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <BalanceCard label="Cajón"       opening={ledger.opening.drawerBalance} closing={ledger.closing.drawerBalance} accent={GREEN} />
                        <BalanceCard label="Caja fuerte" opening={ledger.opening.houseBalance}  closing={ledger.closing.houseBalance}  accent="#facc15" />
                        <BalanceCard label="Banco"       opening={ledger.opening.bankBalance}   closing={ledger.closing.bankBalance}   accent="#60a5fa"
                            sub={ledger.closing.cardSalesCumulative > 0
                                ? `Real estimado (− comisión MP): ${money(estimateBankNet(ledger.closing.bankBalance, ledger.closing.cardSalesCumulative))}`
                                : null} />
                    </div>
                )}

                {error && (
                    <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px 16px', color: RED, fontSize: '13px', marginBottom: '12px' }}>{error}</div>
                )}

                {/* ── Table ── */}
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando…</div>
                ) : !ledger ? null : rows.length === 0 ? (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>Sin movimientos en el período seleccionado</div>
                ) : (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '10px 16px', borderBottom: '1px solid #2a2a2a' }}>
                            {(showAllCols
                                ? ['Fecha', 'Concepto', 'Cajón', 'Caja fuerte', 'Banco']
                                : ['Fecha', 'Concepto', 'Movimiento', 'Saldo']
                            ).map((h, i) => (
                                <div key={h} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
                            ))}
                        </div>

                        {/* Rows */}
                        {displayRows.map((e) => {
                            const isMarker = e.kind === 'shift_open' || e.kind === 'shift_close'
                            return (
                                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '10px 16px', borderBottom: '1px solid #1a1a1a', alignItems: 'center', background: isMarker ? '#14141c' : 'transparent' }}>
                                    <div style={{ fontSize: '12px', color: MUTED }}>{formatDateTime(e.ts)}</div>
                                    <div>
                                        <div style={{ fontSize: '13px', color: isMarker ? '#a5b4fc' : '#e2e8f0', fontWeight: isMarker ? 600 : 400 }}>{rowConcept(e)}</div>
                                        {(e.note || e.user) && (
                                            <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{[e.user, e.note].filter(Boolean).join(' · ')}</div>
                                        )}
                                    </div>

                                    {showAllCols ? (
                                        ['drawer', 'house_safe', 'bank'].map((loc) => (
                                            <div key={loc} style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '13px' }}>
                                                    {e.kind === 'shift_open' && loc === 'drawer' ? <span style={{ color: MUTED }}>fondo</span> : deltaCell(e[DELTA_KEY[loc]])}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{money(e[BALANCE_KEY[loc]])}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <>
                                            <div style={{ textAlign: 'right', fontSize: '13px' }}>
                                                {e.kind === 'shift_open' && locFilter === 'drawer' ? <span style={{ color: MUTED }}>fondo</span> : deltaCell(e[DELTA_KEY[locFilter]])}
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'white' }}>{money(e[BALANCE_KEY[locFilter]])}</div>
                                        </>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Footer count */}
                {ledger && !loading && rows.length > 0 && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: MUTED }}>
                        {rows.length} línea{rows.length !== 1 ? 's' : ''} en el período
                    </div>
                )}
            </div>
        </div>
    )
}

export default LedgerPage
