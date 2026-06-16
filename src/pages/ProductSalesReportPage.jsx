import { useEffect, useState, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import { useStatus } from '../hooks/useStatus'
import { getProductSalesForPeriod } from '../services/reports'
import { money } from '../utils/money'

const MUTED = '#94a3b8'

const sectionCard = {
    padding: '20px',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    background: '#1a1a1a',
    marginBottom: '14px',
}

// ── Date helpers ───────────────────────────────────────────────
function toLocalDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function getYesterday() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return toLocalDateString(d)
}

// ── CSV export ────────────────────────────────────────────────
function downloadCsv(rows, groupByCategory) {
    const headers = groupByCategory
        ? ['Categoría', 'Unidades', 'Ingresos', 'Costo', 'Margen', 'Margen %']
        : ['Producto', 'Categoría', 'Unidades', 'Ingresos', 'Costo', 'Margen', 'Margen %']

    const lines = [headers.join(',')]
    rows.forEach(r => {
        const base = groupByCategory ? [r.categoryName] : [r.productName, r.categoryName]
        const cols = [...base, r.units, r.revenue.toFixed(2), (r.cost || 0).toFixed(2), (r.margin || 0).toFixed(2), r.marginPct == null ? '' : r.marginPct.toFixed(1)]
        lines.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `ventas_productos_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

// ── Page ───────────────────────────────────────────────────────
function ProductSalesReportPage() {
    const location = useLocation()
    const today = toLocalDateString(new Date())

    const [startDate, setStartDate] = useState(getYesterday())
    const [endDate,   setEndDate]   = useState(getYesterday())
    const [search,    setSearch]    = useState('')
    const [groupByCategory, setGroupByCategory] = useState(false)
    const [sortKey,   setSortKey]   = useState('revenue') // 'units' | 'revenue'

    const [loading, setLoading] = useState(false)
    const { status, statusColor, setStatus } = useStatus('')
    const [products, setProducts] = useState([])

    const load = useCallback(async () => {
        setLoading(true)
        setStatus('Cargando...')
        const { data, error } = await getProductSalesForPeriod({ startDate, endDate })
        if (error) {
            setStatus(`Error: ${error.message}`)
            setLoading(false)
            return
        }
        setProducts(data)
        setStatus(data.length === 0 ? 'Sin ventas en el período.' : 'Reporte cargado.')
        setLoading(false)
    }, [startDate, endDate])

    useEffect(() => { load() }, [load])

    // ── Quick filters ─────────────────────────────────────────
    function applyYesterdayFilter() {
        const y = getYesterday()
        setStartDate(y)
        setEndDate(y)
    }

    function applyTodayFilter() {
        setStartDate(today)
        setEndDate(today)
    }

    // ── Categories present in this period (for the dropdown) ──
    const categories = useMemo(() => {
        const set = new Set(products.map(p => p.categoryName))
        return Array.from(set).sort()
    }, [products])

    const [categoryFilter, setCategoryFilter] = useState('')

    // ── Filter + group + sort ──────────────────────────────────
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        let filtered = products.filter(p => {
            if (categoryFilter && p.categoryName !== categoryFilter) return false
            if (q && !p.productName.toLowerCase().includes(q)) return false
            return true
        })

        if (groupByCategory) {
            const byCat = {}
            filtered.forEach(p => {
                if (!byCat[p.categoryName]) byCat[p.categoryName] = { categoryName: p.categoryName, units: 0, revenue: 0, cost: 0, costMissing: false }
                const c = byCat[p.categoryName]
                c.units   += p.units
                c.revenue += p.revenue
                c.cost    += p.cost || 0
                if (p.costMissing) c.costMissing = true
            })
            filtered = Object.values(byCat).map(c => ({
                ...c,
                margin: c.revenue - c.cost,
                marginPct: c.revenue > 0 ? ((c.revenue - c.cost) / c.revenue) * 100 : null,
            }))
        }

        return [...filtered].sort((a, b) => b[sortKey] - a[sortKey])
    }, [products, search, categoryFilter, groupByCategory, sortKey])

    const totals = useMemo(() => rows.reduce((acc, r) => ({
        units:   acc.units   + r.units,
        revenue: acc.revenue + r.revenue,
        cost:    acc.cost    + (r.cost || 0),
    }), { units: 0, revenue: 0, cost: 0 }), [rows])

    function thStyle(key) {
        return {
            textAlign: key === 'productName' || key === 'categoryName' ? 'left' : 'right',
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: MUTED,
            cursor: (key === 'units' || key === 'revenue' || key === 'margin') ? 'pointer' : 'default',
            userSelect: 'none',
        }
    }

    return (
        <div style={{ padding: '20px', paddingLeft: '216px', color: 'white', maxWidth: '900px', minHeight: '100vh', background: '#111', boxSizing: 'border-box' }}>

            <AdminNav currentPath={location.pathname} />

            <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: '700' }}>
                🛒 Ventas por producto
            </h2>

            {/* Filters */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px' }}>
                {[
                    { label: 'Ayer', fn: applyYesterdayFilter },
                    { label: 'Hoy',  fn: applyTodayFilter     },
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
                    onClick={load}
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
                    }}
                >
                    {loading ? 'Cargando...' : 'Cargar'}
                </button>

                <button
                    type="button"
                    onClick={() => downloadCsv(rows, groupByCategory)}
                    disabled={rows.length === 0}
                    style={{
                        padding: '7px 18px',
                        borderRadius: '8px',
                        border: '1px solid #333',
                        background: 'transparent',
                        color: rows.length === 0 ? '#444' : MUTED,
                        fontWeight: '600',
                        fontSize: '13px',
                        cursor: rows.length === 0 ? 'default' : 'pointer',
                        marginLeft: 'auto',
                    }}
                >
                    ⬇ Exportar CSV
                </button>
            </div>

            {/* Search + category + grouping */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px' }}>
                <input
                    type="text"
                    placeholder="Buscar: trago, caguama, media…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, minWidth: '200px', background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '8px 12px', fontSize: '13px' }}
                />

                <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '8px 12px', fontSize: '13px' }}
                >
                    <option value="">Todas las categorías</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: MUTED, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={groupByCategory}
                        onChange={e => setGroupByCategory(e.target.checked)}
                    />
                    Agrupar por categoría
                </label>
            </div>

            {/* Status */}
            <div style={{ fontSize: '13px', color: loading ? MUTED : statusColor, marginBottom: '10px' }}>
                {loading ? 'Cargando...' : status}
            </div>

            {/* Table */}
            <div style={sectionCard}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                            {!groupByCategory && <th style={thStyle('productName')}>Producto</th>}
                            <th style={thStyle('categoryName')}>Categoría</th>
                            <th style={thStyle('units')} onClick={() => setSortKey('units')}>
                                Unidades {sortKey === 'units' ? '▾' : ''}
                            </th>
                            <th style={thStyle('revenue')} onClick={() => setSortKey('revenue')}>
                                Ingresos {sortKey === 'revenue' ? '▾' : ''}
                            </th>
                            <th style={thStyle('cost')}>Costo</th>
                            <th style={thStyle('margin')} onClick={() => setSortKey('margin')}>
                                Margen {sortKey === 'margin' ? '▾' : ''}
                            </th>
                            <th style={thStyle('marginPct')}>Margen %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={groupByCategory ? 6 : 7} style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                                    Sin resultados.
                                </td>
                            </tr>
                        ) : rows.map(r => (
                            <tr key={groupByCategory ? r.categoryName : r.productName} style={{ borderBottom: '1px solid #1e1e1e' }}>
                                {!groupByCategory && <td style={{ padding: '8px 12px', fontSize: '13px' }}>{r.productName}</td>}
                                <td style={{ padding: '8px 12px', fontSize: '13px', color: MUTED }}>{r.categoryName}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right' }}>{r.units}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>{money(r.revenue)}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: r.costMissing ? '#f59e0b' : MUTED }} title={r.costMissing ? 'Costo incompleto: falta capturar el costo de algún componente' : ''}>{r.costMissing ? '≈ ' : ''}{money(r.cost || 0)}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: (r.margin || 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{money(r.margin || 0)}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: MUTED }}>{r.marginPct == null ? '—' : r.marginPct.toFixed(1) + '%'}</td>
                            </tr>
                        ))}
                    </tbody>
                    {rows.length > 0 && (
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #2a2a2a' }}>
                                <td colSpan={groupByCategory ? 1 : 2} style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700 }}>Total</td>
                                <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{totals.units}</td>
                                <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: '#4ade80' }}>{money(totals.revenue)}</td>
                                <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: MUTED }}>{money(totals.cost)}</td>
                                <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: (totals.revenue - totals.cost) >= 0 ? '#4ade80' : '#f87171' }}>{money(totals.revenue - totals.cost)}</td>
                                <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: MUTED }}>{totals.revenue > 0 ? (((totals.revenue - totals.cost) / totals.revenue) * 100).toFixed(1) + '%' : '—'}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    )
}

export default ProductSalesReportPage
