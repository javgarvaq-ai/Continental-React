import { useEffect, useState, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import {
    getAllInventoryItems,
    getRecentInventoryMovements,
    getTopConsumedItems,
} from '../services/reports'

// Stock level thresholds
function stockStatus(item) {
    if (item.capacity_oz) {
        const pct = (item.current_stock / item.capacity_oz) * 100
        if (pct <= 0)   return { color: '#64748b', label: 'Agotado',   pct: 0   }
        if (pct < 20)   return { color: '#ef4444', label: 'Crítico',   pct      }
        if (pct < 50)   return { color: '#fbbf24', label: 'Bajo',      pct      }
        return               { color: '#4ade80', label: 'OK',        pct      }
    }
    // No capacity — use absolute thresholds
    const stock = Number(item.current_stock)
    if (stock <= 0)  return { color: '#64748b', label: 'Agotado', pct: 0   }
    if (stock < 5)   return { color: '#ef4444', label: 'Crítico', pct: Math.min(100, stock * 5) }
    if (stock < 20)  return { color: '#fbbf24', label: 'Bajo',    pct: Math.min(100, stock * 3) }
    return               { color: '#4ade80', label: 'OK',      pct: 100 }
}

function movementColor(type) {
    if (type === 'sale_deduction')   return '#f87171'
    if (type === 'entry')            return '#4ade80'
    if (type === 'adjustment_minus') return '#fbbf24'
    return '#94a3b8'
}

function movementLabel(type) {
    const map = { sale_deduction: 'Venta', entry: 'Entrada', adjustment_minus: 'Ajuste −' }
    return map[type] || type
}

function formatTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function SectionTitle({ children }) {
    return <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '14px' }}>{children}</div>
}

function Card({ children, style }) {
    return <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '20px', ...style }}>{children}</div>
}

function InventoryDashboardPage() {
    const [loading, setLoading]   = useState(true)
    const [items, setItems]       = useState([])
    const [movements, setMovements] = useState([])
    const [topConsumed, setTopConsumed] = useState([])
    const [filter, setFilter]     = useState('all') // all | critical | low | ok

    const fetchAll = useCallback(async () => {
        setLoading(true)
        const [itemsRes, movRes, topRes] = await Promise.all([
            getAllInventoryItems(),
            getRecentInventoryMovements(30),
            getTopConsumedItems(7),
        ])
        setItems(itemsRes.data)
        setMovements(movRes.data)
        setTopConsumed(topRes.data)
        setLoading(false)
    }, [])

    useEffect(() => { fetchAll() }, [fetchAll])

    const activeItems = items.filter(i => i.active)
    const critical = activeItems.filter(i => stockStatus(i).label === 'Crítico' || stockStatus(i).label === 'Agotado')
    const low      = activeItems.filter(i => stockStatus(i).label === 'Bajo')
    const ok       = activeItems.filter(i => stockStatus(i).label === 'OK')

    const filteredItems = filter === 'critical' ? [...activeItems.filter(i => stockStatus(i).label === 'Agotado'), ...critical]
        : filter === 'low'      ? low
        : filter === 'ok'       ? ok
        : activeItems

    const maxConsumed = topConsumed[0]?.totalDeducted || 1

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <AdminNav currentPath="/inventory/dashboard" />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Inventario</h1>
                    <button onClick={fetchAll} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', padding: '7px 14px' }}>
                        ↻ Actualizar
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Cargando…</div>
                ) : (
                    <>
                        {/* Summary cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            {[
                                { label: 'Total ítems',  value: activeItems.length, accent: '#64748b' },
                                { label: 'Crítico / Agotado', value: critical.length, accent: '#ef4444' },
                                { label: 'Bajo',         value: low.length,      accent: '#fbbf24' },
                                { label: 'OK',           value: ok.length,       accent: '#4ade80' },
                            ].map(s => (
                                <div key={s.label} style={{ background: '#161616', border: '1px solid #2a2a2a', borderTop: `3px solid ${s.accent}`, borderRadius: '10px', padding: '14px 16px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>{s.label}</div>
                                    <div style={{ fontSize: '26px', fontWeight: 700, color: s.accent }}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>

                            {/* Stock levels */}
                            <Card>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                    <SectionTitle>Niveles de stock</SectionTitle>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {[
                                            { key: 'all',      label: 'Todos' },
                                            { key: 'critical', label: '🔴 Crítico' },
                                            { key: 'low',      label: '🟡 Bajo'    },
                                            { key: 'ok',       label: '🟢 OK'      },
                                        ].map(f => (
                                            <button
                                                key={f.key}
                                                onClick={() => setFilter(f.key)}
                                                style={{
                                                    padding: '4px 10px', borderRadius: '5px', border: '1px solid',
                                                    borderColor: filter === f.key ? '#4a90d9' : '#334155',
                                                    background: filter === f.key ? '#1d3557' : 'transparent',
                                                    color: filter === f.key ? '#e2e8f0' : '#64748b',
                                                    cursor: 'pointer', fontSize: '12px',
                                                }}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '460px', overflowY: 'auto' }}>
                                    {filteredItems.length === 0 ? (
                                        <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin ítems en este filtro</div>
                                    ) : filteredItems.map(item => {
                                        const s = stockStatus(item)
                                        return (
                                            <div key={item.id} style={{ background: '#111', borderRadius: '6px', padding: '10px 12px', borderLeft: `3px solid ${s.color}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{item.name}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                                                            {Number(item.current_stock).toFixed(1)} {item.unit_type}
                                                            {item.capacity_oz ? ` / ${item.capacity_oz} oz` : ''}
                                                        </span>
                                                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: `${s.color}1a`, color: s.color, fontWeight: 600 }}>
                                                            {s.label}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ height: '4px', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, s.pct))}%`, background: s.color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </Card>

                            {/* Top consumed last 7 days */}
                            <Card>
                                <SectionTitle>Más consumido — 7 días</SectionTitle>
                                {topConsumed.length === 0 ? (
                                    <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin movimientos</div>
                                ) : topConsumed.map(item => (
                                    <div key={item.name} style={{ marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '13px', color: '#e2e8f0', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                            <span style={{ fontSize: '13px', color: '#94a3b8', flexShrink: 0 }}>{Number(item.totalDeducted).toFixed(1)}</span>
                                        </div>
                                        <div style={{ height: '5px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(item.totalDeducted / maxConsumed) * 100}%`, background: '#f97316', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                                        </div>
                                    </div>
                                ))}
                            </Card>
                        </div>

                        {/* Recent movements */}
                        <Card>
                            <SectionTitle>Últimos movimientos</SectionTitle>
                            {movements.length === 0 ? (
                                <div style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin movimientos registrados</div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr>
                                                {['Ítem', 'Tipo', 'Cambio', 'Stock resultante', 'Nota', 'Fecha'].map(h => (
                                                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', borderBottom: '1px solid #2a2a2a' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {movements.map((m, i) => {
                                                const color = movementColor(m.movement_type)
                                                return (
                                                    <tr key={m.id} style={{ background: i % 2 === 0 ? '#111' : '#0f0f0f' }}>
                                                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{m.inventory_items?.name || '—'}</td>
                                                        <td style={{ padding: '8px 12px' }}>
                                                            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: `${color}1a`, color, fontWeight: 600 }}>
                                                                {movementLabel(m.movement_type)}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color, fontWeight: 700 }}>
                                                            {Number(m.quantity_change) > 0 ? '+' : ''}{Number(m.quantity_change).toFixed(2)} {m.inventory_items?.unit_type || ''}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{Number(m.resulting_stock).toFixed(2)}</td>
                                                        <td style={{ padding: '8px 12px', color: '#64748b', fontStyle: m.note ? 'normal' : 'italic', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {m.note || '—'}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{formatTime(m.created_at)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </>
                )}
            </div>
        </div>
    )
}

export default InventoryDashboardPage
