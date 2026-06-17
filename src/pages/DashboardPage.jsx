import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import { money } from '../utils/money'
import {
    getCurrentShift,
    getTodayPaymentStats,
    getOpenTables,
    getTopProductsToday,
    getRecentPayments,
    getMembershipStatsToday,
    getSalesVelocity,
} from '../services/dashboard'

const REFRESH_INTERVAL_MS = 60_000 // auto-refresh every 60s

// ── Risk alert thresholds ─────────────────────────────────────
const RISK_HOURS  = 3      // hours open
const RISK_AMOUNT = 3000   // MXN on the tab

function isAtRisk(table) {
    const hoursOpen = (Date.now() - new Date(table.opened_at)) / (1000 * 60 * 60)
    return hoursOpen >= RISK_HOURS && Number(table.final_total || 0) >= RISK_AMOUNT
}

// ── Helpers ───────────────────────────────────────────────────
function timeAgo(isoString) {
    if (!isoString) return '—'
    const diff = Math.floor((Date.now() - new Date(isoString)) / 1000)
    if (diff < 60)  return `hace ${diff}s`
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    return `hace ${h}h ${m}min`
}

function formatTime(isoString) {
    if (!isoString) return '—'
    return new Date(isoString).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function statusLabel(status) {
    const map = {
        open: { label: 'Abierta', color: '#4ade80' },
        pending_payment: { label: 'En cuenta', color: '#fbbf24' },
        processing_payment: { label: 'Pagando', color: '#60a5fa' },
    }
    return map[status] || { label: status, color: '#94a3b8' }
}

// ── Sub-components ────────────────────────────────────────────
function MetricCard({ label, value, sub, accent }) {
    return (
        <div style={{
            background: '#161616',
            border: '1px solid #2a2a2a',
            borderTop: `3px solid ${accent}`,
            borderRadius: '10px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
        }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b' }}>
                {label}
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.1 }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: '12px', color: '#64748b' }}>{sub}</div>}
        </div>
    )
}

function SectionTitle({ children }) {
    return (
        <div style={{
            fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#64748b', marginBottom: '12px',
        }}>
            {children}
        </div>
    )
}

function Card({ children, style }) {
    return (
        <div style={{
            background: '#161616',
            border: '1px solid #2a2a2a',
            borderRadius: '10px',
            padding: '18px 20px',
            ...style,
        }}>
            {children}
        </div>
    )
}

function BarRow({ label, value, max, color }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
        <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', color: '#e2e8f0', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8', flexShrink: 0 }}>{value}</span>
            </div>
            <div style={{ height: '5px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
            </div>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────
function DashboardPage() {
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState(null)

    const [shift, setShift]             = useState(null)
    const [stats, setStats]             = useState(null)
    const [openTables, setOpenTables]   = useState([])
    const [topProducts, setTopProducts] = useState([])
    const [recentPayments, setRecentPayments] = useState([])
    const [memberships, setMemberships] = useState(0)
    const [velocity, setVelocity]       = useState(null)

    const fetchAll = useCallback(async () => {
        const [
            shiftRes,
            statsRes,
            tablesRes,
            productsRes,
            paymentsRes,
            memberRes,
            velocityRes,
        ] = await Promise.all([
            getCurrentShift(),
            getTodayPaymentStats(),
            getOpenTables(),
            getTopProductsToday(),
            getRecentPayments(),
            getMembershipStatsToday(),
            getSalesVelocity(),
        ])

        setShift(shiftRes.data)
        setStats(statsRes.data)
        setOpenTables(tablesRes.data)
        setTopProducts(productsRes.data)
        setRecentPayments(paymentsRes.data)
        setMemberships(memberRes.data)
        setVelocity(velocityRes.data)
        setLastUpdated(new Date())
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchAll()
        const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [fetchAll])

    const avgTicket = stats?.comandaCount > 0
        ? stats.totalRevenue / stats.comandaCount
        : 0

    const maxUnits = topProducts[0]?.units || 1
    const maxPayment = Math.max(
        stats?.totalEfectivo || 0,
        stats?.totalTarjeta || 0,
        stats?.totalTransferencia || 0,
        1
    )

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

                <AdminNav currentPath="/dashboard" />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Dashboard</h1>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>
                            {lastUpdated
                                ? `Actualizado ${lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · auto-refresh 60s`
                                : 'Cargando…'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={fetchAll}
                            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', padding: '7px 14px' }}
                        >
                            ↻ Actualizar
                        </button>
                        <button
                            onClick={() => navigate('/pos')}
                            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', padding: '7px 14px' }}
                        >
                            ← POS
                        </button>
                    </div>
                </div>

                {/* Shift banner */}
                <div style={{
                    background: shift ? '#0c1a0c' : '#1c1208',
                    border: `1px solid ${shift ? '#166534' : '#854d0e'}`,
                    borderRadius: '8px',
                    padding: '10px 16px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '13px',
                }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: shift ? '#4ade80' : '#fbbf24', flexShrink: 0 }} />
                    {shift ? (
                        <span style={{ color: '#86efac' }}>
                            <strong>Turno abierto</strong> · desde {formatTime(shift.opened_at)} · {timeAgo(shift.opened_at)}
                            {shift.users?.name ? ` · abierto por ${shift.users.name}` : ''}
                        </span>
                    ) : (
                        <span style={{ color: '#fbbf24' }}><strong>Sin turno activo</strong> · El POS está cerrado</span>
                    )}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando datos…</div>
                ) : (
                    <>
                        {/* ── Metric cards ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            <MetricCard
                                label="Ingresos hoy"
                                value={money(stats?.totalRevenue || 0)}
                                sub={`${stats?.comandaCount || 0} comandas pagadas`}
                                accent="#4ade80"
                            />
                            <MetricCard
                                label="Ticket promedio"
                                value={money(avgTicket)}
                                sub={stats?.comandaCount > 0 ? `de ${stats.comandaCount} comandas` : 'Sin datos hoy'}
                                accent="#60a5fa"
                            />
                            <MetricCard
                                label="Propinas hoy"
                                value={money(stats?.totalTips || 0)}
                                sub="incluidas en ingresos"
                                accent="#a78bfa"
                            />
                            <MetricCard
                                label="Mesas abiertas"
                                value={openTables.length}
                                sub={openTables.length === 1 ? '1 mesa activa' : `${openTables.length} mesas activas`}
                                accent="#fbbf24"
                            />
                            <MetricCard
                                label="Membresías hoy"
                                value={memberships}
                                sub="activadas hoy"
                                accent="#f472b6"
                            />
                            {/* ── Sales velocity ── */}
                            {velocity && (() => {
                                const curr = velocity.currentHour
                                const prev = velocity.prevHour
                                const trend = prev.revenue === 0
                                    ? null
                                    : curr.revenue >= prev.revenue ? 'up' : 'down'
                                const trendColor = trend === 'up' ? '#4ade80' : trend === 'down' ? '#f87171' : '#94a3b8'
                                const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''
                                return (
                                    <MetricCard
                                        label={`⚡ Esta hora (${velocity.currentHourLabel})`}
                                        value={
                                            <span>
                                                {money(curr.revenue)}
                                                {trendArrow && (
                                                    <span style={{ fontSize: '16px', color: trendColor, marginLeft: '6px' }}>{trendArrow}</span>
                                                )}
                                            </span>
                                        }
                                        sub={
                                            curr.count === 0
                                                ? 'Sin cobros esta hora'
                                                : `${curr.count} cobro${curr.count !== 1 ? 's' : ''} · hora ant. ${money(prev.revenue)}`
                                        }
                                        accent={trendColor}
                                    />
                                )
                            })()}
                        </div>

                        {/* ── Main content grid ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

                            {/* Payment breakdown */}
                            <Card>
                                <SectionTitle>Forma de pago — hoy</SectionTitle>
                                {stats?.totalRevenue > 0 ? (
                                    <>
                                        <BarRow label="Efectivo"        value={money(stats.totalEfectivo)}      max={maxPayment} color="#4ade80" />
                                        <BarRow label="Tarjeta"         value={money(stats.totalTarjeta)}       max={maxPayment} color="#60a5fa" />
                                        <BarRow label="Transferencia"   value={money(stats.totalTransferencia)} max={maxPayment} color="#a78bfa" />
                                        <div style={{ borderTop: '1px solid #1e293b', marginTop: '12px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                            <span style={{ color: '#64748b' }}>Total cobrado</span>
                                            <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{money(stats.totalRevenue)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ color: '#475569', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Sin pagos registrados hoy</div>
                                )}
                            </Card>

                            {/* Top products */}
                            <Card>
                                <SectionTitle>Top productos — hoy</SectionTitle>
                                {topProducts.length > 0 ? (
                                    topProducts.map(p => (
                                        <BarRow key={p.name} label={p.name} value={`${p.units} uds`} max={maxUnits} color="#f97316" />
                                    ))
                                ) : (
                                    <div style={{ color: '#475569', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Sin ventas registradas hoy</div>
                                )}
                            </Card>
                        </div>

                        {/* ── Bottom grid ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                            {/* Open tables */}
                            <Card>
                                <SectionTitle>
                                    Mesas abiertas ahora ({openTables.length})
                                    {openTables.some(isAtRisk) && (
                                        <span style={{ marginLeft: '8px', color: '#fbbf24', fontSize: '12px', fontWeight: 700 }}>
                                            ⚠️ {openTables.filter(isAtRisk).length} en riesgo
                                        </span>
                                    )}
                                </SectionTitle>
                                {openTables.length === 0 ? (
                                    <div style={{ color: '#475569', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Sin mesas activas</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {openTables.map(t => {
                                            const s    = statusLabel(t.status)
                                            const risk = isAtRisk(t)
                                            return (
                                                <div
                                                    key={t.id}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        background: risk ? '#1c1500' : '#111',
                                                        border: risk ? '1px solid #854d0e' : '1px solid transparent',
                                                        borderRadius: '6px',
                                                        padding: '9px 12px',
                                                    }}
                                                >
                                                    <div>
                                                        {risk && <span style={{ marginRight: '6px' }}>⚠️</span>}
                                                        <span style={{ fontWeight: 600, fontSize: '14px', color: risk ? '#fcd34d' : '#e2e8f0' }}>
                                                            {t.units?.name || '—'}
                                                        </span>
                                                        {(t.customers?.name || t.customer_name) && (
                                                            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>{t.customers?.name || t.customer_name}</span>
                                                        )}
                                                        {Number(t.final_total) > 0 && (
                                                            <span style={{ fontSize: '12px', color: risk ? '#fbbf24' : '#475569', marginLeft: '8px' }}>
                                                                {money(t.final_total)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '12px', color: risk ? '#fbbf24' : '#64748b' }}>{timeAgo(t.opened_at)}</span>
                                                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${s.color}1a`, color: s.color, fontWeight: 600 }}>
                                                            {s.label}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </Card>

                            {/* Recent payments */}
                            <Card>
                                <SectionTitle>Últimos cobros</SectionTitle>
                                {recentPayments.length === 0 ? (
                                    <div style={{ color: '#475569', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Sin cobros registrados</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {recentPayments.map(p => {
                                            const methods = [
                                                p.efectivo > 0 && 'Ef',
                                                p.tarjeta > 0 && 'Tj',
                                                p.transferencia > 0 && 'Tr',
                                            ].filter(Boolean).join('+')

                                            return (
                                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderRadius: '6px', padding: '8px 12px' }}>
                                                    <div>
                                                        <span style={{ fontWeight: 600, fontSize: '13px' }}>
                                                            C-{String(p.comandas?.folio || 0).padStart(6, '0')}
                                                        </span>
                                                        {(p.comandas?.customers?.name || p.comandas?.customer_name) && (
                                                            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>{p.comandas?.customers?.name || p.comandas?.customer_name}</span>
                                                        )}
                                                        {methods && (
                                                            <span style={{ fontSize: '11px', color: '#475569', marginLeft: '6px' }}>· {methods}</span>
                                                        )}
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#4ade80' }}>{money(p.total_paid)}</div>
                                                        <div style={{ fontSize: '11px', color: '#475569' }}>{formatTime(p.created_at)}</div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </Card>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default DashboardPage
