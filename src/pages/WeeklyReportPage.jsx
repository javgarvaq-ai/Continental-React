import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useStatus } from '../hooks/useStatus'
import { getWeeklyReportData, getWeeklySummary, getProductSalesForPeriod } from '../services/reports'
import { getCurrentShift } from '../services/dashboard'
import { money } from '../utils/money'
import AdminNav from '../components/AdminNav'

const GREEN  = '#4ade80'
const RED    = '#f87171'
const BLUE   = '#60a5fa'
const YELLOW = '#facc15'
const MUTED  = '#94a3b8'

const sectionCard = {
    padding: '20px',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    background: '#1a1a1a',
    marginBottom: '14px',
}

const sectionTitle = {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: '16px',
}

function MetricCard({ label, value, color = 'white', accent, sub }) {
    return (
        <div style={{
            padding: '14px 16px',
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderLeft: `3px solid ${accent || color}`,
            borderRadius: '8px',
        }}>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color }}>{value}</div>
            {sub && <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>{sub}</div>}
        </div>
    )
}

// ── Weekly comparison chart ───────────────────────────────────
const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function weekLabel(sunStr, satStr) {
    const sun = new Date(sunStr + 'T12:00:00')
    const sat = new Date(satStr + 'T12:00:00')
    if (sun.getMonth() === sat.getMonth()) {
        return `${sun.getDate()}-${sat.getDate()} ${MONTH_SHORT[sat.getMonth()]}`
    }
    return `${sun.getDate()} ${MONTH_SHORT[sun.getMonth()]}-${sat.getDate()} ${MONTH_SHORT[sat.getMonth()]}`
}

function WeeklyComparisonChart({ weeks }) {
    if (!weeks || weeks.length === 0) return null
    const maxVal = Math.max(...weeks.flatMap(w => [w.revenue, w.expenses]), 1)
    const BAR_H  = 140  // px chart area height

    return (
        <div>
            {/* Chart area */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', height: `${BAR_H + 40}px`, marginBottom: '8px' }}>
                {weeks.map((w, i) => {
                    const revPct = Math.max(8, (w.revenue  / maxVal) * BAR_H)
                    const expPct = Math.max(8, (w.expenses / maxVal) * BAR_H)
                    const isCurrent = i === weeks.length - 1
                    return (
                        <div key={w.sunStr} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            {/* Two bars side by side */}
                            <div style={{ width: '100%', display: 'flex', gap: '3px', alignItems: 'flex-end', justifyContent: 'center' }}>
                                {/* Revenue bar */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                                    {w.revenue > 0 && (
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#86efac', marginBottom: '4px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                            {money(w.revenue)}
                                        </div>
                                    )}
                                    <div style={{ width: '100%', height: `${revPct}px`, background: isCurrent ? '#22c55e' : GREEN, borderRadius: '3px 3px 0 0', opacity: isCurrent ? 1 : 0.75 }} />
                                </div>
                                {/* Expenses bar */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                                    {w.expenses > 0 && (
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#fca5a5', marginBottom: '4px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                            {money(w.expenses)}
                                        </div>
                                    )}
                                    <div style={{ width: '100%', height: `${expPct}px`, background: RED, borderRadius: '3px 3px 0 0', opacity: isCurrent ? 1 : 0.75 }} />
                                </div>
                            </div>
                            {/* Week label */}
                            <div style={{ fontSize: '12px', color: isCurrent ? '#e2e8f0' : MUTED, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {weekLabel(w.sunStr, w.satStr)}
                                {isCurrent && <div style={{ fontSize: '11px', color: '#60a5fa' }}>actual</div>}
                            </div>
                        </div>
                    )
                })}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: MUTED }}>
                    <div style={{ width: '10px', height: '10px', background: GREEN, borderRadius: '2px' }} /> Ingresos
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: MUTED }}>
                    <div style={{ width: '10px', height: '10px', background: RED, borderRadius: '2px' }} /> Gastos operativos
                </div>
            </div>
        </div>
    )
}

// ── Date helpers ───────────────────────────────────────────────
function toLocalDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function getThisWeekStart() {
    const now = new Date()
    if (now.getHours() < 6) now.setDate(now.getDate() - 1)
    const dow = now.getDay()
    const start = new Date(now)
    start.setDate(now.getDate() - dow)
    return toLocalDateString(start)
}


// ── Operational week shortcuts ────────────────────────────────
const MONTH_SHORT_W = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const OPERATIONAL_SHIFT_MS_W = 12 * 60 * 60 * 1000

function opWeekSunday(timestamp) {
    const ms = new Date(timestamp).getTime() - OPERATIONAL_SHIFT_MS_W
    const d  = new Date(ms)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return d.toISOString().split('T')[0]
}

function addDaysStr(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return toLocalDateString(d)
}

function weekLabelW(sunStr, satStr) {
    const sun = new Date(sunStr + 'T12:00:00')
    const sat = new Date(satStr + 'T12:00:00')
    if (sun.getMonth() === sat.getMonth()) {
        return `${sun.getDate()}-${sat.getDate()} ${MONTH_SHORT_W[sat.getMonth()]}`
    }
    return `${sun.getDate()} ${MONTH_SHORT_W[sun.getMonth()]}-${sat.getDate()} ${MONTH_SHORT_W[sat.getMonth()]}`
}

function getLastNWeeksW(n = 4) {
    const currentSun = opWeekSunday(Date.now())
    const todayStr   = toLocalDateString(new Date())
    return Array.from({ length: n }, (_, i) => {
        const offset = n - 1 - i
        const sunStr = addDaysStr(currentSun, -offset * 7)
        const satStr = addDaysStr(sunStr, 6)
        const isCurrent = offset === 0
        return { label: weekLabelW(sunStr, satStr), start: sunStr, end: isCurrent ? todayStr : satStr, isCurrent }
    })
}

// ── Category label map ─────────────────────────────────────────
const CATEGORY_LABELS = {
    pago_proveedor_banco:     'Pago proveedor (banco)',
    pago_proveedor_caja:      'Pago proveedor (caja)',
    pago_proveedor_resguardo: 'Pago proveedor (resguardo)',
    nomina_caja:              'Nómina (caja)',
    nomina_banco:             'Nómina (banco)',
    nomina_resguardo:         'Nómina (resguardo)',
    renta_caja:               'Renta (caja)',
    renta_banco:              'Renta (banco)',
    propinas_entregadas:      'Propinas entregadas',
    gasto_operativo_caja:     'Gasto operativo (caja)',
    gasto_operativo_banco:    'Gasto operativo (banco)',
}

function formatCategory(cat) { return CATEGORY_LABELS[cat] || cat }

// ── Aggregation ────────────────────────────────────────────────
function calcPeriod(payments, cashMovements) {
    // Use payments.total_paid as source of truth (consistent with Analytics/Dashboard)
    const totalSales           = payments.reduce((s, p) => s + Number(p.total_paid        || 0), 0)
    const totalCashSales       = payments.reduce((s, p) => s + Number(p.efectivo          || 0), 0)
    const totalCardSales       = payments.reduce((s, p) => s + Number(p.tarjeta           || 0), 0)
    const totalTransferSales   = payments.reduce((s, p) => s + Number(p.transferencia     || 0), 0)
    const totalTips            = payments.reduce((s, p) => s + Number(p.tip_amount        || 0), 0)

    const totalExpenses        = cashMovements.reduce((s, m) => m.movement_nature === 'expense'                                         ? s + Number(m.amount || 0) : s, 0)
    const totalBankExpenses    = cashMovements.reduce((s, m) => m.source_location === 'bank'       && m.movement_nature === 'expense'   ? s + Number(m.amount || 0) : s, 0)
    const totalCashExpenses    = cashMovements.reduce((s, m) => m.source_location === 'drawer'     && m.movement_nature === 'expense'   ? s + Number(m.amount || 0) : s, 0)
    const totalResguardoExp    = cashMovements.reduce((s, m) => m.source_location === 'house_safe' && m.movement_nature === 'expense'   ? s + Number(m.amount || 0) : s, 0)
    const totalTransfersToHouse= cashMovements.reduce((s, m) => m.destination_location === 'house_safe'                                ? s + Number(m.amount || 0) : s, 0)
    const totalTransfersToBank = cashMovements.reduce((s, m) => m.destination_location === 'bank'                                      ? s + Number(m.amount || 0) : s, 0)

    const expensesByCategory   = cashMovements.reduce((acc, m) => {
        if (m.movement_nature === 'expense') {
            const key = m.category || 'otros'
            acc[key] = (acc[key] || 0) + Number(m.amount || 0)
        }
        return acc
    }, {})

    return {
        totalSales, totalCashSales, totalCardSales, totalTransferSales, totalTips,
        totalExpenses, totalBankExpenses, totalCashExpenses, totalResguardoExp,
        totalTransfersToHouse, totalTransfersToBank,
        expensesByCategory,
    }
}

// ── Page ───────────────────────────────────────────────────────
function WeeklyReportPage() {
    const location = useLocation()
    const today    = toLocalDateString(new Date())

    const [startDate, setStartDate] = useState(getThisWeekStart())
    const [endDate,   setEndDate]   = useState(today)

    const [loading,       setLoading]       = useState(false)
    const { status, statusColor, setStatus } = useStatus('')
    const [payments,      setPayments]      = useState([])
    const [cashMovements, setCashMovements] = useState([])
    const [comandas,      setComandas]      = useState([])
    const [cogsData,      setCogsData]      = useState([])
    const [weeklySummary, setWeeklySummary] = useState([])
    const [weeklyLoading, setWeeklyLoading] = useState(false)

    async function applyShiftFilter() {
        const { data: shift } = await getCurrentShift()
        if (!shift) { setStatus('No hay turno abierto.'); return }
        setStartDate(toLocalDateString(new Date(shift.opened_at)))
        setEndDate(today)
    }

    function applyTodayFilter()  { setStartDate(today); setEndDate(today) }
    function applyWeekFilter()   { setStartDate(getThisWeekStart()); setEndDate(today) }

    const loadPeriod = useCallback(async (overrideStart, overrideEnd) => {
        const s = overrideStart || startDate
        const e = overrideEnd   || endDate
        setLoading(true)
        setStatus('Cargando período...')

        const [reportRes, cogsRes] = await Promise.all([
            getWeeklyReportData({ startDate: s, endDate: e }),
            getProductSalesForPeriod({ startDate: s, endDate: e }),
        ])

        if (reportRes.paymentsError)      { setStatus(`Error pagos: ${reportRes.paymentsError.message}`);            setLoading(false); return }
        if (reportRes.cashMovementsError) { setStatus(`Error movimientos: ${reportRes.cashMovementsError.message}`); setLoading(false); return }

        setPayments(reportRes.payments || [])
        setCashMovements(reportRes.cashMovements || [])
        setComandas(reportRes.comandas || [])
        setCogsData(cogsRes.data || [])
        setStatus('Reporte cargado.')
        setLoading(false)
    }, [startDate, endDate])

    function applyWeek(start, end) {
        setStartDate(start)
        setEndDate(end)
        loadPeriod(start, end)
    }

    const loadWeeklySummary = useCallback(async () => {
        setWeeklyLoading(true)
        const { data } = await getWeeklySummary({ numWeeks: 4 })
        setWeeklySummary(data || [])
        setWeeklyLoading(false)
    }, [])

    useEffect(() => {
        loadPeriod()
        loadWeeklySummary()
    }, [])

    const period = calcPeriod(payments, cashMovements)

    // COGS aggregates
    const totalCOGS    = cogsData.reduce((s, p) => s + Number(p.cost    || 0), 0)
    const cogsMissing  = cogsData.some(p => p.costMissing)
    const grossMargin  = period.totalSales - totalCOGS
    const grossPct     = period.totalSales > 0 ? (grossMargin / period.totalSales) * 100 : 0
    const netUtility   = period.totalSales - totalCOGS - period.totalExpenses

    return (
        <div style={{ minHeight: '100vh', background: '#111', color: 'white', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>

            <AdminNav currentPath={location.pathname} />
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

            <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: '700' }}>
                💰 Reporte financiero
            </h2>

            {/* ── Weekly comparison chart ── */}
            <div style={sectionCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={sectionTitle}>Últimas 4 semanas</div>
                    {weeklyLoading && <span style={{ fontSize: '11px', color: MUTED }}>Cargando…</span>}
                </div>
                <WeeklyComparisonChart weeks={weeklySummary} />
            </div>

            {/* ── Date filters ── */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px' }}>
                {[
                    { label: 'Este turno', fn: applyShiftFilter },
                    { label: 'Hoy',        fn: applyTodayFilter },
                    { label: 'Esta semana',fn: applyWeekFilter  },
                ].map(({ label, fn }) => (
                    <button key={label} type="button" onClick={fn}
                        style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #444', background: '#2a2a2a', color: MUTED, cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        {label}
                    </button>
                ))}
                <span style={{ fontSize: '13px', color: '#555', marginLeft: '4px' }}>|</span>
                {getLastNWeeksW(4).map(w => {
                    const isActive = startDate === w.start && endDate === w.end
                    return (
                        <button key={w.start} type="button" onClick={() => applyWeek(w.start, w.end)}
                            style={{
                                padding: '5px 12px', borderRadius: '6px', border: '1px solid',
                                borderColor: isActive ? '#4a90d9' : '#444',
                                background:  isActive ? '#1d3557' : '#2a2a2a',
                                color:       isActive ? '#e2e8f0' : w.isCurrent ? '#93c5fd' : MUTED,
                                cursor: 'pointer', fontSize: '12px', fontWeight: w.isCurrent ? '600' : '400',
                            }}>
                            {w.label}{w.isCurrent ? ' ★' : ''}
                        </button>
                    )
                })}
                <span style={{ fontSize: '13px', color: '#555', marginLeft: '4px' }}>|</span>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '6px 10px', fontSize: '13px' }} />
                <span style={{ color: '#444' }}>—</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '6px 10px', fontSize: '13px' }} />
                <button type="button" onClick={loadPeriod} disabled={loading}
                    style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', background: loading ? '#333' : '#1565c0', color: loading ? MUTED : 'white', fontWeight: '700', fontSize: '13px', cursor: loading ? 'default' : 'pointer', marginLeft: 'auto' }}>
                    {loading ? 'Cargando...' : 'Cargar'}
                </button>
            </div>

            {/* Status + counts */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', padding: '14px 18px' }}>
                <div style={{ flex: 1, fontSize: '13px', color: loading ? MUTED : statusColor }}>
                    {loading ? 'Cargando...' : status}
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                    {[
                        { label: 'Comandas',    value: comandas.length      },
                        { label: 'Pagos',       value: payments.length      },
                        { label: 'Movimientos', value: cashMovements.length },
                    ].map(({ label, value }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '18px', fontWeight: '700' }}>{value}</div>
                            <div style={{ fontSize: '11px', color: MUTED }}>{label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Ingresos ── */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Ingresos del período</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px' }}>
                    <MetricCard label="Ventas totales"    value={money(period.totalSales)}         color={GREEN}  accent={GREEN} />
                    <MetricCard label="Efectivo"          value={money(period.totalCashSales)}     color={GREEN}  accent="#22c55e" />
                    <MetricCard label="Tarjeta"           value={money(period.totalCardSales)}     color={BLUE}   accent={BLUE} />
                    <MetricCard label="Transferencia"     value={money(period.totalTransferSales)} color={BLUE}   accent="#3b82f6" />
                    <MetricCard label="Propinas"          value={money(period.totalTips)}          color={YELLOW} accent={YELLOW} />
                </div>
            </div>

            {/* ── COGS ── */}
            <div style={sectionCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={sectionTitle}>Costo de producto (COGS)</div>
                    {cogsMissing && (
                        <div style={{ fontSize: '11px', color: YELLOW, background: '#1c1800', border: '1px solid #854d0e', borderRadius: '5px', padding: '3px 8px' }}>
                            ⚠ Algunos productos sin costo — margen subestimado
                        </div>
                    )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px' }}>
                    <MetricCard label="Costo de productos" value={money(totalCOGS)}               color={RED}    accent={RED} />
                    <MetricCard label="Margen bruto"       value={money(grossMargin)}              color={grossMargin >= 0 ? GREEN : RED} accent={grossMargin >= 0 ? GREEN : RED} />
                    <MetricCard label="Margen %"           value={`${grossPct.toFixed(1)}%`}       color={grossPct >= 50 ? GREEN : grossPct >= 30 ? YELLOW : RED} accent="#475569" />
                </div>
            </div>

            {/* ── Gastos operativos ── */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Gastos operativos del período</div>
                <div style={{ fontSize: '11px', color: MUTED, marginBottom: '12px' }}>
                    Dinero que salió permanentemente del negocio (proveedores, nómina, propinas).
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                    <MetricCard label="Total gastos"        value={money(period.totalExpenses)}     color={RED}   accent={RED} />
                    <MetricCard label="Desde banco"         value={money(period.totalBankExpenses)} color={RED}   accent="#ef4444" />
                    <MetricCard label="Desde caja"          value={money(period.totalCashExpenses)} color={RED}   accent="#ef4444" />
                    {period.totalResguardoExp > 0 && (
                        <MetricCard label="Desde resguardo" value={money(period.totalResguardoExp)} color={RED}   accent="#ef4444" />
                    )}
                </div>
                {period.totalTransfersToHouse > 0 && (
                    <>
                        <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569', marginBottom: '10px', borderTop: '1px solid #222', paddingTop: '14px' }}>
                            Traslados internos — no son gastos
                        </div>
                        <div style={{ fontSize: '11px', color: MUTED, marginBottom: '10px' }}>
                            Dinero movido entre ubicaciones del negocio. No sale del negocio.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '10px' }}>
                            <MetricCard label="Movido a resguardo" value={money(period.totalTransfersToHouse)} color={MUTED} accent="#475569" />
                            {period.totalTransfersToBank > 0 && (
                                <MetricCard label="Movido a banco"  value={money(period.totalTransfersToBank)}  color={MUTED} accent="#475569" />
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── Desglose de gastos ── */}
            {Object.entries(period.expensesByCategory).length > 0 && (
                <div style={sectionCard}>
                    <div style={sectionTitle}>Desglose de gastos del período</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(period.expensesByCategory).map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', borderRadius: '6px' }}>
                                <span style={{ fontSize: '13px', color: MUTED }}>{formatCategory(key)}</span>
                                <span style={{ fontSize: '14px', fontWeight: '600', color: RED }}>{money(value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Utilidad neta estimada ── */}
            <div style={{
                ...sectionCard,
                border: `1px solid ${netUtility >= 0 ? '#166534' : '#7f1d1d'}`,
                background: netUtility >= 0 ? '#052e16' : '#1c0a0a',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                        Utilidad neta estimada del período
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: netUtility >= 0 ? GREEN : RED }}>
                        {money(netUtility)}
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px', color: MUTED, alignItems: 'center' }}>
                    <span style={{ color: GREEN }}>{money(period.totalSales)}</span><span>ventas</span>
                    <span style={{ color: '#475569' }}>−</span>
                    <span style={{ color: RED }}>{money(totalCOGS)}</span><span>COGS</span>
                    <span style={{ color: '#475569' }}>−</span>
                    <span style={{ color: RED }}>{money(period.totalExpenses)}</span><span>gastos operativos</span>
                    <span style={{ color: '#475569' }}>=</span>
                    <span style={{ color: netUtility >= 0 ? GREEN : RED, fontWeight: '700' }}>{money(netUtility)}</span>
                    {cogsMissing && <span style={{ color: '#854d0e', marginLeft: '6px' }}>(COGS parcial)</span>}
                </div>
            </div>

            </div>
        </div>
    )
}

export default WeeklyReportPage
