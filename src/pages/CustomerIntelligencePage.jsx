import { useEffect, useState, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import {
    getTopCustomersByVisits,
    getMembershipFunnel,
    getNewCustomersThisMonth,
    getCustomersWithBottleCredits,
} from '../services/reports'

function SectionTitle({ children }) {
    return <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '14px' }}>{children}</div>
}

function Card({ children, style }) {
    return <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '20px', ...style }}>{children}</div>
}

function MetricCard({ label, value, sub, accent }) {
    return (
        <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderTop: `3px solid ${accent}`, borderRadius: '10px', padding: '16px 18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.1 }}>{value}</div>
            {sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{sub}</div>}
        </div>
    )
}

function FunnelBar({ label, value, total, color }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    return (
        <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{label}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>{value} <span style={{ color: '#475569' }}>({pct}%)</span></span>
            </div>
            <div style={{ height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
        </div>
    )
}

function CustomerRow({ rank, customer }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px', background: '#111', borderRadius: '6px', marginBottom: '6px' }}>
            <div style={{ width: '24px', textAlign: 'center', fontSize: '12px', color: rank <= 3 ? '#fbbf24' : '#475569', fontWeight: 700, flexShrink: 0 }}>
                {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customer.name}
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>#{String(customer.customer_number).padStart(4, '0')}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#60a5fa' }}>{customer.visit_count}</div>
                <div style={{ fontSize: '11px', color: '#475569' }}>visitas</div>
            </div>
            {customer.bottle_credits_available > 0 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#a78bfa' }}>🍾 {customer.bottle_credits_available}</div>
                </div>
            )}
        </div>
    )
}

function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function CustomerIntelligencePage() {
    const [loading, setLoading] = useState(true)
    const [topCustomers, setTopCustomers]   = useState([])
    const [funnel, setFunnel]               = useState(null)
    const [newCustomers, setNewCustomers]   = useState([])
    const [withCredits, setWithCredits]     = useState([])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const [topRes, funnelRes, newRes, creditsRes] = await Promise.all([
            getTopCustomersByVisits(12),
            getMembershipFunnel(),
            getNewCustomersThisMonth(),
            getCustomersWithBottleCredits(),
        ])
        setTopCustomers(topRes.data)
        setFunnel(funnelRes.data)
        setNewCustomers(newRes.data)
        setWithCredits(creditsRes.data)
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    const membershipRate = funnel
        ? funnel.totalCustomers > 0 ? Math.round((funnel.activeThisMonth / funnel.totalCustomers) * 100) : 0
        : 0

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <AdminNav currentPath="/customers/intelligence" />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Clientes</h1>
                    <button onClick={fetchAll} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', padding: '7px 14px' }}>
                        ↻ Actualizar
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando…</div>
                ) : (
                    <>
                        {/* Summary metric cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            <MetricCard label="Clientes totales"       value={funnel?.totalCustomers ?? '—'}   sub="registrados"               accent="#60a5fa" />
                            <MetricCard label="Membresías activas"     value={funnel?.activeThisMonth ?? '—'}  sub="este mes"                  accent="#4ade80" />
                            <MetricCard label="Tasa de membresía"      value={`${membershipRate}%`}            sub="del total de clientes"     accent="#a78bfa" />
                            <MetricCard label="Nuevos este mes"        value={newCustomers.length}             sub="clientes nuevos"           accent="#fbbf24" />
                            <MetricCard label="Con créditos de botella" value={withCredits.length}            sub="créditos pendientes"       accent="#f472b6" />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

                            {/* Membership funnel */}
                            <Card>
                                <SectionTitle>Embudo de membresías — mes actual</SectionTitle>
                                {funnel ? (
                                    <>
                                        <FunnelBar label="Clientes totales"    value={funnel.totalCustomers}   total={funnel.totalCustomers} color="#334155" />
                                        <FunnelBar label="Con membresía activa" value={funnel.activeThisMonth}  total={funnel.totalCustomers} color="#4ade80" />
                                        <FunnelBar label="Membresía expirada"  value={funnel.expiredThisMonth} total={funnel.totalCustomers} color="#ef4444" />
                                        <div style={{ borderTop: '1px solid #1e293b', marginTop: '12px', paddingTop: '10px', fontSize: '12px', color: '#475569' }}>
                                            {funnel.totalCustomers - funnel.activeThisMonth - funnel.expiredThisMonth} clientes sin membresía este mes
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ color: '#475569', fontSize: '13px' }}>Sin datos</div>
                                )}
                            </Card>

                            {/* New customers this month */}
                            <Card>
                                <SectionTitle>Nuevos clientes este mes ({newCustomers.length})</SectionTitle>
                                {newCustomers.length === 0 ? (
                                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin nuevos clientes este mes</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                                        {newCustomers.map(c => (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderRadius: '6px', padding: '8px 12px' }}>
                                                <div>
                                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.name}</span>
                                                    <span style={{ fontSize: '11px', color: '#475569', marginLeft: '8px' }}>#{String(c.customer_number).padStart(4, '0')}</span>
                                                </div>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(c.created_at)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                            {/* Top by visits */}
                            <Card>
                                <SectionTitle>Top clientes por visitas</SectionTitle>
                                {topCustomers.length === 0 ? (
                                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin datos</div>
                                ) : topCustomers.map((c, i) => (
                                    <CustomerRow key={c.id} rank={i + 1} customer={c} />
                                ))}
                            </Card>

                            {/* Bottle credits */}
                            <Card>
                                <SectionTitle>Créditos de botella pendientes ({withCredits.length})</SectionTitle>
                                {withCredits.length === 0 ? (
                                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Nadie tiene créditos pendientes</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto' }}>
                                        {withCredits.map(c => (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderRadius: '6px', padding: '9px 12px' }}>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{c.name}</div>
                                                    <div style={{ fontSize: '11px', color: '#475569' }}>#{String(c.customer_number).padStart(4, '0')} · {c.visit_count} visitas</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#a78bfa' }}>🍾 {c.bottle_credits_available}</div>
                                                    <div style={{ fontSize: '11px', color: '#475569' }}>créditos</div>
                                                </div>
                                            </div>
                                        ))}
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

export default CustomerIntelligencePage
