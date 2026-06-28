import { useEffect, useState, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import { money } from '../utils/money'
import {
    getPaymentsForPeriod,
    buildDailyRevenue,
    buildHourlyDistribution,
    buildDayOfWeekStats,
    getTopCategoriesRevenue,
} from '../services/reports'

const PERIODS = [
    { label: '7 días',  days: 7  },
    { label: '14 días', days: 14 },
    { label: '30 días', days: 30 },
]

// ── Shared primitives ─────────────────────────────────────────
function SectionTitle({ children }) {
    return <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '14px' }}>{children}</div>
}

function Card({ children, style }) {
    return <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '20px', ...style }}>{children}</div>
}

// ── Vertical bar chart (daily revenue) ───────────────────────
function DailyRevenueChart({ data }) {
    const max = Math.max(...data.map(d => d.revenue), 1)
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px', marginBottom: '6px' }}>
                {data.map(d => {
                    const pct = Math.max(3, (d.revenue / max) * 100)
                    const hasRevenue = d.revenue > 0
                    return (
                        <div
                            key={d.date}
                            title={`${d.label}: ${money(d.revenue)} · ${d.comandas} cobros`}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                cursor: 'default',
                            }}
                        >
                            {hasRevenue && (
                                <div style={{
                                    fontSize: '9px',
                                    color: '#86efac',
                                    marginBottom: '3px',
                                    whiteSpace: 'nowrap',
                                    lineHeight: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '100%',
                                    textAlign: 'center',
                                }}>
                                    {money(d.revenue)}
                                </div>
                            )}
                            <div style={{
                                width: '100%',
                                height: `${pct}%`,
                                background: hasRevenue ? '#4ade80' : '#1e293b',
                                borderRadius: '3px 3px 0 0',
                                transition: 'height 0.3s ease',
                            }} />
                        </div>
                    )
                })}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
                {data.map(d => (
                    <div key={d.date} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '10px', color: '#475569', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {d.label}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Horizontal bar row ────────────────────────────────────────
function HBar({ label, value, displayValue, max, color = '#60a5fa' }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
        <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{displayValue ?? value}</span>
            </div>
            <div style={{ height: '5px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
            </div>
        </div>
    )
}

// ── Summary stat row ──────────────────────────────────────────
function StatRow({ label, value, accent = '#94a3b8' }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a1a' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: accent }}>{value}</span>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────
function AnalyticsPage() {
    const [period, setPeriod] = useState(PERIODS[1])
    const [loading, setLoading] = useState(true)

    const [daily, setDaily]           = useState([])
    const [hourly, setHourly]         = useState([])
    const [dowStats, setDowStats]     = useState([])
    const [categories, setCategories] = useState([])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const [paymentsRes, catsRes] = await Promise.all([
            getPaymentsForPeriod(period.days),
            getTopCategoriesRevenue(period.days),
        ])

        setDaily(buildDailyRevenue(paymentsRes.data, period.days))
        setHourly(buildHourlyDistribution(paymentsRes.data))
        setDowStats(buildDayOfWeekStats(paymentsRes.data))
        setCategories(catsRes.data)
        setLoading(false)
    }, [period])

    useEffect(() => { fetchAll() }, [fetchAll])

    // Derived summary stats
    const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0)
    const totalComandas = daily.reduce((s, d) => s + d.comandas, 0)
    const totalTips = daily.reduce((s, d) => s + d.tips, 0)
    const avgTicket = totalComandas > 0 ? totalRevenue / totalComandas : 0
    const bestDay = [...daily].sort((a, b) => b.revenue - a.revenue)[0]

    // Hourly: only show hours 16-03 (bar hours) for cleaner chart
    const barHours = [...hourly.slice(16), ...hourly.slice(0, 4)]
    const maxHourRevenue = Math.max(...barHours.map(h => h.revenue), 1)

    const maxDow = Math.max(...dowStats.map(d => d.revenue), 1)
    const maxCat = Math.max(...categories.map(c => c.revenue), 1)

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <AdminNav currentPath="/analytics" />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Analytics & Tendencias</h1>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {PERIODS.map(p => (
                            <button
                                key={p.days}
                                onClick={() => setPeriod(p)}
                                style={{
                                    padding: '6px 14px', borderRadius: '6px', border: '1px solid',
                                    borderColor: period.days === p.days ? '#4a90d9' : '#334155',
                                    background: period.days === p.days ? '#1d3557' : 'transparent',
                                    color: period.days === p.days ? '#e2e8f0' : '#64748b',
                                    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando…</div>
                ) : (
                    <>
                        {/* Summary row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            {[
                                { label: 'Ingresos totales', value: money(totalRevenue), accent: '#4ade80' },
                                { label: 'Comandas',          value: totalComandas,       accent: '#60a5fa' },
                                { label: 'Ticket promedio',   value: money(avgTicket),    accent: '#a78bfa' },
                                { label: 'Propinas',          value: money(totalTips),    accent: '#f472b6' },
                                { label: 'Mejor día',         value: bestDay?.revenue > 0 ? `${money(bestDay.revenue)}` : '—', accent: '#fbbf24',
                                  sub: bestDay?.revenue > 0 ? bestDay.label : '' },
                            ].map(s => (
                                <div key={s.label} style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '16px 18px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>{s.label}</div>
                                    <div style={{ fontSize: '24px', fontWeight: 700, color: s.accent, lineHeight: 1.1 }}>{s.value}</div>
                                    {s.sub && <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{s.sub}</div>}
                                </div>
                            ))}
                        </div>

                        {/* Daily revenue chart */}
                        <Card style={{ marginBottom: '16px' }}>
                            <SectionTitle>Ingresos diarios — últimos {period.days} días</SectionTitle>
                            <DailyRevenueChart data={daily} />
                        </Card>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

                            {/* Hourly heatmap */}
                            <Card>
                                <SectionTitle>Horas pico (16h – 03h)</SectionTitle>
                                {barHours.every(h => h.revenue === 0) ? (
                                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin datos en el período</div>
                                ) : barHours.map(h => (
                                    <HBar
                                        key={h.hour}
                                        label={`${String(h.hour).padStart(2, '0')}:00`}
                                        value={h.revenue}
                                        displayValue={h.revenue > 0 ? money(h.revenue) : '—'}
                                        max={maxHourRevenue}
                                        color="#fbbf24"
                                    />
                                ))}
                            </Card>

                            {/* Day of week */}
                            <Card>
                                <SectionTitle>Día de la semana</SectionTitle>
                                {dowStats.every(d => d.revenue === 0) ? (
                                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin datos en el período</div>
                                ) : dowStats.map(d => (
                                    <HBar
                                        key={d.label}
                                        label={`${d.label}  (${d.count})`}
                                        value={d.revenue}
                                        displayValue={d.revenue > 0 ? money(d.revenue) : '—'}
                                        max={maxDow}
                                        color="#a78bfa"
                                    />
                                ))}
                            </Card>
                        </div>

                        {/* Top categories */}
                        <Card>
                            <SectionTitle>Categorías — ingresos últimos {period.days} días</SectionTitle>
                            {categories.length === 0 ? (
                                <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin ventas en el período</div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
                                    {categories.map(c => (
                                        <div key={c.name}>
                                            <HBar label={c.name} value={c.revenue} displayValue={`${money(c.revenue)}  ·  ${c.units} uds`} max={maxCat} color="#4ade80" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </>
                )}
            </div>
        </div>
    )
}

export default AnalyticsPage
