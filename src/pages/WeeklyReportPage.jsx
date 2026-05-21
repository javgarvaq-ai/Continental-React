import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useStatus } from '../hooks/useStatus'
import { getWeeklyReportData, getGlobalBalances } from '../services/reports'
import { getCurrentShift } from '../services/dashboard'
import { money } from '../utils/money'
import AdminNav from '../components/AdminNav'

// ── Constants ──────────────────────────────────────────────────
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

function MetricCard({ label, value, color = 'white', accent }) {
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
    const today = new Date()
    const dow   = today.getDay()
    const start = new Date(today)
    start.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    return toLocalDateString(start)
}

// ── Category label map ─────────────────────────────────────────
const CATEGORY_LABELS = {
    pago_proveedor_banco: 'Pago proveedor (banco)',
    pago_proveedor_caja:  'Pago proveedor (caja)',
    nomina_caja:          'Nómina (caja)',
    nomina_banco:         'Nómina (banco)',
    renta_caja:           'Renta (caja)',
    renta_banco:          'Renta (banco)',
    propinas_entregadas:  'Propinas entregadas',
    gasto_operativo_caja: 'Gasto operativo (caja)',
    gasto_operativo_banco:'Gasto operativo (banco)',
}

function formatCategory(cat) {
    return CATEGORY_LABELS[cat] || cat
}

// ── Aggregation helpers ─────────────────────────────────────────
function calcPeriod(payments, cashMovements, comandas) {
    const totalSales          = comandas.reduce((s, c) => s + Number(c.final_total || 0), 0)
    const totalCashSales      = payments.reduce((s, p) => s + Number(p.efectivo      || 0), 0)
    const totalCardSales      = payments.reduce((s, p) => s + Number(p.tarjeta       || 0), 0)
    const totalTransferSales  = payments.reduce((s, p) => s + Number(p.transferencia || 0), 0)
    const totalTips           = payments.reduce((s, p) => s + Number((p.tip_amount ?? p.comandas?.tip_total) || 0), 0)

    const totalExpenses       = cashMovements.reduce((s, m) => m.movement_nature === 'expense'      ? s + Number(m.amount || 0) : s, 0)
    const totalBankExpenses   = cashMovements.reduce((s, m) => m.source_location === 'bank' && m.movement_nature === 'expense' ? s + Number(m.amount || 0) : s, 0)
    const totalTransfersToHouse = cashMovements.reduce((s, m) => m.destination_location === 'house_safe' ? s + Number(m.amount || 0) : s, 0)
    const totalTransfersToBank  = cashMovements.reduce((s, m) => m.destination_location === 'bank'       ? s + Number(m.amount || 0) : s, 0)
    const totalDrawerIn       = cashMovements.reduce((s, m) => m.destination_location === 'drawer'       ? s + Number(m.amount || 0) : s, 0)
    const totalDrawerOut      = cashMovements.reduce((s, m) => m.source_location === 'drawer'            ? s + Number(m.amount || 0) : s, 0)

    const expensesByCategory  = cashMovements.reduce((acc, m) => {
        if (m.movement_nature === 'expense') {
            const key = m.category || 'otros'
            acc[key] = (acc[key] || 0) + Number(m.amount || 0)
        }
        return acc
    }, {})

    const estimatedUtility    = totalSales - totalExpenses

    return {
        totalSales, totalCashSales, totalCardSales, totalTransferSales, totalTips,
        totalExpenses, totalBankExpenses, totalTransfersToHouse, totalTransfersToBank,
        totalDrawerIn, totalDrawerOut, expensesByCategory, estimatedUtility,
    }
}

function calcGlobal(payments, cashMovements) {
    const cashSales         = payments.reduce((s, p) => s + Number(p.efectivo      || 0), 0)
    const cardSales         = payments.reduce((s, p) => s + Number(p.tarjeta       || 0), 0)
    const transferSales     = payments.reduce((s, p) => s + Number(p.transferencia || 0), 0)

    const drawerIn          = cashMovements.reduce((s, m) => m.destination_location === 'drawer'    ? s + Number(m.amount || 0) : s, 0)
    const drawerOut         = cashMovements.reduce((s, m) => m.source_location      === 'drawer'    ? s + Number(m.amount || 0) : s, 0)
    const toHouse           = cashMovements.reduce((s, m) => m.destination_location === 'house_safe'? s + Number(m.amount || 0) : s, 0)
    const fromHouseToDrawer = cashMovements.reduce((s, m) => m.source_location === 'house_safe' && m.destination_location === 'drawer' ? s + Number(m.amount || 0) : s, 0)
    const toBank            = cashMovements.reduce((s, m) => m.destination_location === 'bank'      ? s + Number(m.amount || 0) : s, 0)
    const fromBankToDrawer  = cashMovements.reduce((s, m) => m.source_location === 'bank' && m.destination_location === 'drawer' ? s + Number(m.amount || 0) : s, 0)
    const bankExpenses      = cashMovements.reduce((s, m) => m.source_location === 'bank' && m.movement_nature === 'expense' ? s + Number(m.amount || 0) : s, 0)

    const drawerBalance = cashSales + drawerIn - drawerOut
    const houseBalance  = toHouse - fromHouseToDrawer
    const bankBalance   = cardSales + transferSales + toBank - fromBankToDrawer - bankExpenses

    return { drawerBalance, houseBalance, bankBalance }
}

// ── Page ───────────────────────────────────────────────────────
function WeeklyReportPage() {
    const location = useLocation()
    const today    = toLocalDateString(new Date())

    const [startDate, setStartDate] = useState(getThisWeekStart())
    const [endDate,   setEndDate]   = useState(today)

    // Period state
    const [loading,       setLoading]       = useState(false)
    const { status, statusColor, setStatus } = useStatus('')
    const [payments,      setPayments]      = useState([])
    const [cashMovements, setCashMovements] = useState([])
    const [comandas,      setComandas]      = useState([])

    // Global state (all-time, no filter)
    const [globalLoading, setGlobalLoading] = useState(false)
    const [globalPay,     setGlobalPay]     = useState([])
    const [globalMov,     setGlobalMov]     = useState([])

    // ── Quick filters ────────────────────────────────────────────
    async function applyShiftFilter() {
        const { data: shift } = await getCurrentShift()
        if (!shift) {
            setStatus('No hay un turno abierto actualmente.')
            return
        }
        const shiftStart = toLocalDateString(new Date(shift.opened_at))
        setStartDate(shiftStart)
        setEndDate(today)
    }

    function applyTodayFilter() {
        setStartDate(today)
        setEndDate(today)
    }

    function applyWeekFilter() {
        setStartDate(getThisWeekStart())
        setEndDate(today)
    }

    // ── Data loaders ─────────────────────────────────────────────
    const loadPeriod = useCallback(async () => {
        setLoading(true)
        setStatus('Cargando período...')

        const { payments: p, cashMovements: cm, comandas: co,
                paymentsError, cashMovementsError, comandasError } =
            await getWeeklyReportData({ startDate, endDate })

        if (paymentsError)      { setStatus(`Error pagos: ${paymentsError.message}`);        setLoading(false); return }
        if (cashMovementsError) { setStatus(`Error movimientos: ${cashMovementsError.message}`); setLoading(false); return }
        if (comandasError)      { setStatus(`Error comandas: ${comandasError.message}`);     setLoading(false); return }

        setPayments(p || [])
        setCashMovements(cm || [])
        setComandas(co || [])
        setStatus('Reporte cargado.')
        setLoading(false)
    }, [startDate, endDate])

    const loadGlobal = useCallback(async () => {
        setGlobalLoading(true)
        const { payments: gp, cashMovements: gcm } = await getGlobalBalances()
        setGlobalPay(gp || [])
        setGlobalMov(gcm || [])
        setGlobalLoading(false)
    }, [])

    useEffect(() => {
        loadPeriod()
        loadGlobal()
    }, [])

    // ── Derived metrics ───────────────────────────────────────────
    const period = calcPeriod(payments, cashMovements, comandas)
    const global = calcGlobal(globalPay, globalMov)

    // ── Render ────────────────────────────────────────────────────
    return (
        <div style={{ padding: '20px', paddingLeft: '216px', color: 'white', maxWidth: '900px', minHeight: '100vh', background: '#111', boxSizing: 'border-box' }}>

            <AdminNav currentPath={location.pathname} />

            <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: '700' }}>
                💰 Reporte financiero
            </h2>

            {/* Date Range Bar */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px' }}>
                {/* Quick filters */}
                {[
                    { label: 'Este turno', fn: applyShiftFilter },
                    { label: 'Hoy',        fn: applyTodayFilter },
                    { label: 'Esta semana',fn: applyWeekFilter  },
                ].map(({ label, fn }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={fn}
                        style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            border: '1px solid #444',
                            background: '#2a2a2a',
                            color: MUTED,
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                        }}
                    >
                        {label}
                    </button>
                ))}

                <span style={{ fontSize: '13px', color: '#555', marginLeft: '4px' }}>|</span>

                <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '6px 10px', fontSize: '13px' }}
                />
                <span style={{ color: '#444' }}>—</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '6px 10px', fontSize: '13px' }}
                />
                <button
                    type="button"
                    onClick={loadPeriod}
                    disabled={loading}
                    style={{
                        padding: '7px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: loading ? '#333' : '#1565c0',
                        color: loading ? MUTED : 'white',
                        fontWeight: '700',
                        fontSize: '13px',
                        cursor: loading ? 'default' : 'pointer',
                        marginLeft: 'auto',
                    }}
                >
                    {loading ? 'Cargando...' : 'Cargar'}
                </button>
            </div>

            {/* Status + Record Counts */}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    <MetricCard label="Ventas totales"      value={money(period.totalSales)}         color={GREEN}  accent={GREEN} />
                    <MetricCard label="Efectivo recibido"   value={money(period.totalCashSales)}     color={GREEN}  accent="#22c55e" />
                    <MetricCard label="Tarjeta"             value={money(period.totalCardSales)}     color={BLUE}   accent={BLUE} />
                    <MetricCard label="Transferencia"       value={money(period.totalTransferSales)} color={BLUE}   accent="#3b82f6" />
                    <MetricCard label="Propinas"            value={money(period.totalTips)}          color={YELLOW} accent={YELLOW} />
                </div>
            </div>

            {/* ── Egresos ── */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Egresos del período</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    <MetricCard label="Gastos totales (caja)"    value={money(period.totalExpenses)}          color={RED}  accent={RED} />
                    <MetricCard label="Gastos desde banco"       value={money(period.totalBankExpenses)}      color={RED}  accent="#ef4444" />
                    <MetricCard label="Traslados a resguardo"    value={money(period.totalTransfersToHouse)}  color={MUTED} accent="#475569" />
                    <MetricCard label="Traslados a banco"        value={money(period.totalTransfersToBank)}   color={MUTED} accent="#475569" />
                    <MetricCard label="Entradas a caja"          value={money(period.totalDrawerIn)}          color={MUTED} accent="#475569" />
                    <MetricCard label="Salidas de caja"          value={money(period.totalDrawerOut)}         color={MUTED} accent="#475569" />
                </div>
            </div>

            {/* ── Utilidad estimada ── */}
            <div style={{
                ...sectionCard,
                border: `1px solid ${period.estimatedUtility >= 0 ? '#166534' : '#7f1d1d'}`,
                background: period.estimatedUtility >= 0 ? '#052e16' : '#1c0a0a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
            }}>
                <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>
                        Utilidad estimada del período
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED }}>Ventas totales − gastos totales del período</div>
                </div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: period.estimatedUtility >= 0 ? GREEN : RED }}>
                    {money(period.estimatedUtility)}
                </div>
            </div>

            {/* ── Desglose de gastos ── */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Desglose de gastos del período</div>
                {Object.entries(period.expensesByCategory).length === 0 ? (
                    <div style={{ fontSize: '13px', color: MUTED }}>No hay gastos en este período.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(period.expensesByCategory).map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', borderRadius: '6px' }}>
                                <span style={{ fontSize: '13px', color: MUTED }}>{formatCategory(key)}</span>
                                <span style={{ fontSize: '14px', fontWeight: '600', color: RED }}>{money(value)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Posición de dinero — GLOBAL ── */}
            <div style={{ ...sectionCard, border: '1px solid #1e3a5f' }}>
                <div style={sectionTitle}>Posición de dinero — acumulado total</div>
                <div style={{ fontSize: '11px', color: '#556', marginBottom: '14px' }}>
                    Saldos históricos acumulados desde siempre, independientes del filtro de período.
                    {globalLoading && <span style={{ color: MUTED, marginLeft: '8px' }}>Calculando...</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                    <MetricCard
                        label="Caja (efectivo acumulado)"
                        value={money(global.drawerBalance)}
                        color={global.drawerBalance >= 0 ? GREEN : RED}
                        accent="#475569"
                    />
                    <MetricCard
                        label="Resguardo (acumulado)"
                        value={money(global.houseBalance)}
                        color={global.houseBalance >= 0 ? GREEN : RED}
                        accent="#475569"
                    />
                    <MetricCard
                        label="Banco (acumulado)"
                        value={money(global.bankBalance)}
                        color={global.bankBalance >= 0 ? GREEN : RED}
                        accent="#475569"
                    />
                </div>
            </div>

        </div>
    )
}

export default WeeklyReportPage
