import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import { getYearlyMonthSummaries, getMonthlyReportData, getProductSalesForPeriod } from '../services/reports'
import { getLedgerData } from '../services/ledger'
import { buildLedger, estimateBankNet } from '../utils/ledger'
import { money } from '../utils/money'

// ── Constants ─────────────────────────────────────────────────
const GREEN  = '#4ade80'
const RED    = '#f87171'
const BLUE   = '#60a5fa'
const YELLOW = '#facc15'
const MUTED  = '#64748b'

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const EXPENSE_GROUPS = [
    { label: 'Nómina',      cats: ['nomina_caja','nomina_banco','nomina_resguardo'] },
    { label: 'Renta',       cats: ['renta_caja','renta_banco'] },
    { label: 'Proveedores', cats: ['pago_proveedor_caja','pago_proveedor_banco','pago_proveedor_resguardo'] },
    { label: 'Propinas entregadas', cats: ['propinas_entregadas'] },
    { label: 'Otros gastos', cats: ['gasto_operativo_caja','gasto_operativo_banco','ajuste_ingreso'] },
]

// ── Styles ────────────────────────────────────────────────────
const card = {
    padding: '16px 18px',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
}

// ── Small components ──────────────────────────────────────────
function MetricCard({ label, value, color = 'white', accent, sub }) {
    return (
        <div style={{ ...card, borderLeft: `3px solid ${accent || '#334155'}` }}>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
            {sub && <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>{sub}</div>}
        </div>
    )
}

function SectionTitle({ children }) {
    return (
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
            {children}
        </div>
    )
}

// ── 12-month chart ────────────────────────────────────────────
function YearChart({ months, selectedMonth, onSelect }) {
    const maxVal = Math.max(...(months || []).flatMap(m => [m.revenue, m.expenses]), 1)
    const BAR_H = 120
    const now = new Date()

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: `${BAR_H + 50}px` }}>
            {(months || Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, tips: 0, expenses: 0 }))).map((m) => {
                const isSel     = m.month === selectedMonth
                const isFuture  = m.month > now.getMonth() + 1 && now.getFullYear() >= 2026
                const revH = Math.max(m.revenue  > 0 ? 6 : 0, (m.revenue  / maxVal) * BAR_H)
                const expH = Math.max(m.expenses > 0 ? 6 : 0, (m.expenses / maxVal) * BAR_H)

                return (
                    <div
                        key={m.month}
                        onClick={() => !isFuture && onSelect(m.month)}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', cursor: isFuture ? 'default' : 'pointer', gap: '4px' }}
                    >
                        <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', justifyContent: 'center' }}>
                            {/* Revenue bar */}
                            <div style={{ flex: 1, height: `${revH}px`, background: isFuture ? '#1e2a1e' : isSel ? '#22c55e' : GREEN, borderRadius: '3px 3px 0 0', opacity: isFuture ? 0.3 : isSel ? 1 : 0.7, transition: 'opacity 0.15s' }} />
                            {/* Expenses bar */}
                            <div style={{ flex: 1, height: `${expH}px`, background: isFuture ? '#2a1e1e' : isSel ? '#ef4444' : RED,  borderRadius: '3px 3px 0 0', opacity: isFuture ? 0.3 : isSel ? 1 : 0.7, transition: 'opacity 0.15s' }} />
                        </div>
                        <div style={{
                            fontSize: '10px', textAlign: 'center', fontWeight: isSel ? 700 : 400,
                            color: isSel ? '#e2e8f0' : isFuture ? '#334155' : MUTED,
                            borderBottom: isSel ? `2px solid ${GREEN}` : '2px solid transparent',
                            paddingBottom: '2px',
                        }}>
                            {MONTHS_SHORT[m.month - 1]}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── Aggregation ───────────────────────────────────────────────
function calcMonth(payments, cashMovements) {
    const revenue   = payments.reduce((s, p) => s + Number(p.total_paid  || 0) - Number(p.tip_amount || 0), 0)
    const tips      = payments.reduce((s, p) => s + Number(p.tip_amount  || 0), 0)
    const efectivo  = payments.reduce((s, p) => s + Number(p.efectivo    || 0), 0)
    const tarjeta   = payments.reduce((s, p) => s + Number(p.tarjeta     || 0), 0)
    const transferencia = payments.reduce((s, p) => s + Number(p.transferencia || 0), 0)

    const expensesByCat = {}
    let totalExpenses = 0
    for (const m of cashMovements) {
        if (m.movement_nature !== 'expense') continue
        const cat = m.category || 'otros'
        expensesByCat[cat] = (expensesByCat[cat] || 0) + Number(m.amount || 0)
        totalExpenses += Number(m.amount || 0)
    }

    return { revenue, tips, efectivo, tarjeta, transferencia, expensesByCat, totalExpenses }
}

// ── Page ──────────────────────────────────────────────────────
function MonthlyReportPage() {
    const location = useLocation()
    const now      = new Date()

    const [year,          setYear]          = useState(now.getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

    const [yearData,      setYearData]      = useState(null)
    const [yearLoading,   setYearLoading]   = useState(false)

    const [payments,      setPayments]      = useState([])
    const [cashMovements, setCashMovements] = useState([])
    const [cogsData,      setCogsData]      = useState([])
    const [ledger,        setLedger]        = useState(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [detailError,   setDetailError]   = useState('')

    // Load 12-month chart data
    const loadYear = useCallback(async () => {
        setYearLoading(true)
        const { data, error } = await getYearlyMonthSummaries({ year })
        if (!error) setYearData(data)
        setYearLoading(false)
    }, [year])

    // Load detail for selected month
    const loadDetail = useCallback(async () => {
        setDetailLoading(true)
        setDetailError('')

        const [reportRes, cogsRes, ledgerRes] = await Promise.all([
            getMonthlyReportData({ year, month: selectedMonth }),
            getProductSalesForPeriod({ startDate: `${year}-${String(selectedMonth).padStart(2,'0')}-01`, endDate: (() => { const d = new Date(year, selectedMonth, 0); return `${year}-${String(selectedMonth).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })() }),
            getLedgerData({ startDate: `${year}-${String(selectedMonth).padStart(2,'0')}-01`, endDate: (() => { const d = new Date(year, selectedMonth, 0); return `${year}-${String(selectedMonth).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })() }),
        ])

        if (reportRes.error) { setDetailError(reportRes.error.message); setDetailLoading(false); return }

        setPayments(reportRes.payments)
        setCashMovements(reportRes.cashMovements)
        setCogsData(cogsRes.data || [])

        if (!ledgerRes.error && ledgerRes.payments.length > 0) {
            const built = buildLedger(ledgerRes, ledgerRes.startIso, ledgerRes.endIso)
            setLedger(built)
        } else {
            setLedger(null)
        }

        setDetailLoading(false)
    }, [year, selectedMonth])

    useEffect(() => { loadYear() }, [loadYear])
    useEffect(() => { loadDetail() }, [loadDetail])

    const period = calcMonth(payments, cashMovements)
    const totalCOGS   = cogsData.reduce((s, p) => s + Number(p.cost    || 0), 0)
    const cogsMissing = cogsData.some(p => p.costMissing)
    const grossMargin = period.revenue - totalCOGS
    const grossPct    = period.revenue > 0 ? (grossMargin / period.revenue) * 100 : 0
    const netUtility  = period.revenue - totalCOGS - period.totalExpenses

    const monthLabel = `${MONTHS_ES[selectedMonth - 1]} ${year}`

    return (
        <div style={{ minHeight: '100vh', background: '#111', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <AdminNav currentPath={location.pathname} />

                <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 700 }}>📅 Cierre Mensual</h1>
                <p style={{ margin: '0 0 20px', fontSize: '12px', color: MUTED }}>Ventas sin propina · COGS · Gastos desglosados · Saldo de cuentas al cierre del mes</p>

                {/* ── Year selector + chart ── */}
                <div style={{ ...card, marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                        <button onClick={() => setYear(y => y - 1)}
                            style={{ background: 'none', border: '1px solid #334155', borderRadius: '6px', color: MUTED, padding: '4px 10px', cursor: 'pointer', fontSize: '14px' }}>←</button>
                        <span style={{ fontSize: '18px', fontWeight: 700, minWidth: '60px', textAlign: 'center' }}>{year}</span>
                        <button onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}
                            style={{ background: 'none', border: '1px solid #334155', borderRadius: '6px', color: year >= now.getFullYear() ? '#334155' : MUTED, padding: '4px 10px', cursor: year >= now.getFullYear() ? 'default' : 'pointer', fontSize: '14px' }}>→</button>
                        {yearLoading && <span style={{ fontSize: '11px', color: MUTED }}>Cargando…</span>}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', fontSize: '11px', color: MUTED }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ display: 'inline-block', width: '10px', height: '10px', background: GREEN, borderRadius: '2px' }} />Ingresos sin propina</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ display: 'inline-block', width: '10px', height: '10px', background: RED, borderRadius: '2px' }} />Gastos operativos</span>
                        </div>
                    </div>
                    <YearChart months={yearData} selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
                </div>

                {/* ── Month tabs ── */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {MONTHS_SHORT.map((label, i) => {
                        const m = i + 1
                        const isSel    = m === selectedMonth
                        const isFuture = year === now.getFullYear() && m > now.getMonth() + 1
                        return (
                            <button key={m} onClick={() => !isFuture && setSelectedMonth(m)} disabled={isFuture}
                                style={{
                                    padding: '6px 14px', borderRadius: '6px', border: '1px solid',
                                    borderColor: isSel ? '#4a90d9' : '#2a2a2a',
                                    background:  isSel ? '#1d3557' : '#1a1a1a',
                                    color:       isFuture ? '#334155' : isSel ? '#e2e8f0' : MUTED,
                                    cursor: isFuture ? 'default' : 'pointer', fontSize: '12px', fontWeight: isSel ? 700 : 400,
                                }}>
                                {label}
                            </button>
                        )
                    })}
                </div>

                {detailLoading ? (
                    <div style={{ textAlign: 'center', color: MUTED, padding: '60px', fontSize: '14px' }}>Cargando {monthLabel}…</div>
                ) : detailError ? (
                    <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px 16px', color: RED, fontSize: '13px' }}>{detailError}</div>
                ) : (
                    <>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #2a2a2a' }}>
                            {monthLabel}
                            <span style={{ fontSize: '12px', color: MUTED, fontWeight: 400, marginLeft: '12px' }}>{payments.length} pagos · {cashMovements.filter(m => m.movement_nature === 'expense').length} gastos</span>
                        </div>

                        {/* ── Ingresos ── */}
                        <div style={{ ...card, marginBottom: '14px' }}>
                            <SectionTitle>Ingresos del mes</SectionTitle>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                                <MetricCard label="Ventas sin propina" value={money(period.revenue)}      color={GREEN}  accent={GREEN} />
                                <MetricCard label="Propinas"           value={money(period.tips)}         color={YELLOW} accent={YELLOW} />
                                <MetricCard label="Total cobrado"      value={money(period.revenue + period.tips)} color="#e2e8f0" accent="#475569" />
                                <MetricCard label="Efectivo"           value={money(period.efectivo)}     color={GREEN}  accent="#22c55e" />
                                <MetricCard label="Tarjeta"            value={money(period.tarjeta)}      color={BLUE}   accent={BLUE} />
                                {period.transferencia > 0 && (
                                    <MetricCard label="Transferencia"  value={money(period.transferencia)} color={BLUE}  accent="#3b82f6" />
                                )}
                            </div>
                        </div>

                        {/* ── COGS ── */}
                        <div style={{ ...card, marginBottom: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <SectionTitle>Costo de producto (COGS)</SectionTitle>
                                {cogsMissing && (
                                    <span style={{ fontSize: '11px', color: YELLOW, background: '#1c1800', border: '1px solid #854d0e', borderRadius: '5px', padding: '3px 8px' }}>
                                        ⚠ Algunos productos sin costo
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                                <MetricCard label="Costo de productos" value={money(totalCOGS)}      color={RED}   accent={RED} />
                                <MetricCard label="Margen bruto"       value={money(grossMargin)}    color={grossMargin >= 0 ? GREEN : RED} accent={grossMargin >= 0 ? GREEN : RED} />
                                <MetricCard label="Margen %"           value={`${grossPct.toFixed(1)}%`} color={grossPct >= 50 ? GREEN : grossPct >= 30 ? YELLOW : RED} accent="#475569" />
                            </div>
                        </div>

                        {/* ── Gastos operativos ── */}
                        <div style={{ ...card, marginBottom: '14px' }}>
                            <SectionTitle>Gastos operativos del mes</SectionTitle>
                            {EXPENSE_GROUPS.map(({ label, cats }) => {
                                const total = cats.reduce((s, c) => s + (period.expensesByCat[c] || 0), 0)
                                if (total === 0) return null
                                return (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#111', borderRadius: '6px', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</span>
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: RED }}>{money(total)}</span>
                                    </div>
                                )
                            })}
                            {period.totalExpenses === 0 && (
                                <div style={{ color: MUTED, fontSize: '13px', textAlign: 'center', padding: '20px' }}>Sin gastos registrados este mes</div>
                            )}
                            {period.totalExpenses > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderTop: '1px solid #2a2a2a', marginTop: '6px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Total gastos</span>
                                    <span style={{ fontSize: '15px', fontWeight: 700, color: RED }}>{money(period.totalExpenses)}</span>
                                </div>
                            )}
                        </div>

                        {/* ── Saldo de cuentas al cierre ── */}
                        {ledger && (
                            <div style={{ ...card, marginBottom: '14px' }}>
                                <SectionTitle>Saldo de cuentas al cierre del mes</SectionTitle>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                    <MetricCard label="Cajón"       value={money(ledger.closing.drawerBalance)} color="white" accent={GREEN} />
                                    <MetricCard label="Caja fuerte" value={money(ledger.closing.houseBalance)}  color="white" accent={YELLOW} />
                                    <MetricCard label="Banco"       value={money(ledger.closing.bankBalance)}   color="white" accent={BLUE}
                                        sub={ledger.closing.cardSalesCumulative > 0
                                            ? `Estimado neto (−comisión MP): ${money(estimateBankNet(ledger.closing.bankBalance, ledger.closing.cardSalesCumulative))}`
                                            : null}
                                    />
                                    <MetricCard label="Total en cuentas"
                                        value={money(ledger.closing.drawerBalance + ledger.closing.houseBalance + ledger.closing.bankBalance)}
                                        color="#e2e8f0" accent="#475569" />
                                </div>
                            </div>
                        )}

                        {/* ── Utilidad neta ── */}
                        <div style={{
                            ...card,
                            border: `1px solid ${netUtility >= 0 ? '#166534' : '#7f1d1d'}`,
                            background: netUtility >= 0 ? '#052e16' : '#1c0a0a',
                            marginBottom: '24px',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                <SectionTitle>Utilidad neta estimada — {monthLabel}</SectionTitle>
                                <div style={{ fontSize: '36px', fontWeight: 800, color: netUtility >= 0 ? GREEN : RED }}>{money(netUtility)}</div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px', color: MUTED, alignItems: 'center' }}>
                                <span style={{ color: GREEN }}>{money(period.revenue)}</span><span>ventas sin propina</span>
                                <span style={{ color: '#475569' }}>−</span>
                                <span style={{ color: RED }}>{money(totalCOGS)}</span><span>COGS</span>
                                <span style={{ color: '#475569' }}>−</span>
                                <span style={{ color: RED }}>{money(period.totalExpenses)}</span><span>gastos operativos</span>
                                <span style={{ color: '#475569' }}>=</span>
                                <span style={{ color: netUtility >= 0 ? GREEN : RED, fontWeight: 700 }}>{money(netUtility)}</span>
                                {cogsMissing && <span style={{ color: '#854d0e', marginLeft: '6px' }}>(COGS parcial)</span>}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default MonthlyReportPage
