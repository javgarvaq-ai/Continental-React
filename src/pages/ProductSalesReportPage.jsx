import { useEffect, useState, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import { useStatus } from '../hooks/useStatus'
import { getProductSalesForPeriod, getProductUnitsForPeriod } from '../services/reports'
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
function downloadVentasCsv(rows, groupByCategory) {
    const headers = groupByCategory
        ? ['Categoría', 'Unidades', 'Ingresos', 'Costo', 'Margen', 'Margen %']
        : ['Producto', 'Categoría', 'Unidades', 'Ingresos', 'Costo', 'Margen', 'Margen %']

    const lines = [headers.join(',')]
    rows.forEach(r => {
        const base = groupByCategory ? [r.categoryName] : [r.productName, r.categoryName]
        const cols = [
            ...base,
            r.units,
            r.revenue.toFixed(2),
            (r.cost || 0).toFixed(2),
            (r.margin || 0).toFixed(2),
            r.marginPct == null ? '' : r.marginPct.toFixed(1),
        ]
        lines.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    })

    triggerDownload(lines.join('\n'), `ventas_${Date.now()}.csv`)
}

function downloadUnidadesCsv(rows) {
    const headers = ['Producto', 'Categoría', 'Total Unidades', 'Directo', 'En Promo', 'Detalle Promos']
    const lines   = [headers.join(',')]
    rows.forEach(r => {
        const detalle = r.promosList.map(p => `${p.promoName}: ${p.units}`).join(' | ')
        const cols = [r.productName, r.categoryName, r.totalUnits, r.unitsDirect, r.unitsInPromo, detalle]
        lines.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    })
    triggerDownload(lines.join('\n'), `unidades_${Date.now()}.csv`)
}

function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

// ── Shared header style ────────────────────────────────────────
function thStyle(align = 'right', clickable = false) {
    return {
        textAlign: align,
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: MUTED,
        cursor: clickable ? 'pointer' : 'default',
        userSelect: 'none',
    }
}

// ── Tab button ─────────────────────────────────────────────────
function TabButton({ label, active, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                padding: '7px 20px',
                borderRadius: '8px',
                border: active ? 'none' : '1px solid #333',
                background: active ? '#1565c0' : 'transparent',
                color: active ? 'white' : MUTED,
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
            }}
        >
            {label}
        </button>
    )
}

// ── Ventas tab ─────────────────────────────────────────────────
function VentasTable({ rows, groupByCategory, sortKey, setSortKey }) {
    const totals = useMemo(() => rows.reduce((acc, r) => ({
        units:   acc.units   + r.units,
        revenue: acc.revenue + r.revenue,
        cost:    acc.cost    + (r.cost || 0),
    }), { units: 0, revenue: 0, cost: 0 }), [rows])

    const colSpan = groupByCategory ? 5 : 6

    return (
        <div style={sectionCard}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                        {!groupByCategory && <th style={thStyle('left')}>Producto</th>}
                        <th style={thStyle('left')}>Categoría</th>
                        <th style={thStyle('right', true)} onClick={() => setSortKey('units')}>
                            Unidades {sortKey === 'units' ? '▾' : ''}
                        </th>
                        <th style={thStyle('right', true)} onClick={() => setSortKey('revenue')}>
                            Ingresos {sortKey === 'revenue' ? '▾' : ''}
                        </th>
                        <th style={thStyle('right')}>Costo</th>
                        <th style={thStyle('right', true)} onClick={() => setSortKey('margin')}>
                            Margen {sortKey === 'margin' ? '▾' : ''}
                        </th>
                        <th style={thStyle('right')}>Margen %</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={colSpan + 1} style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                                Sin resultados.
                            </td>
                        </tr>
                    ) : rows.map(r => (
                        <tr key={groupByCategory ? r.categoryName : (r.productName + r.categoryName)} style={{ borderBottom: '1px solid #1e1e1e' }}>
                            {!groupByCategory && (
                                <td style={{ padding: '8px 12px', fontSize: '13px' }}>
                                    {r.productName}
                                </td>
                            )}
                            <td style={{ padding: '8px 12px', fontSize: '13px', color: MUTED }}>{r.categoryName}</td>
                            <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right' }}>{r.units}</td>
                            <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>{money(r.revenue)}</td>
                            <td
                                style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: r.costMissing ? '#f59e0b' : MUTED }}
                                title={r.costMissing ? 'Costo incompleto: falta capturar el costo de algún componente' : ''}
                            >
                                {r.costMissing ? '≈ ' : ''}{money(r.cost || 0)}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: (r.margin || 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                                {money(r.margin || 0)}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: MUTED }}>
                                {r.marginPct == null ? '—' : r.marginPct.toFixed(1) + '%'}
                            </td>
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
                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: (totals.revenue - totals.cost) >= 0 ? '#4ade80' : '#f87171' }}>
                                {money(totals.revenue - totals.cost)}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: MUTED }}>
                                {totals.revenue > 0 ? (((totals.revenue - totals.cost) / totals.revenue) * 100).toFixed(1) + '%' : '—'}
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    )
}

// ── Unidades tab ───────────────────────────────────────────────
function UnidadesTable({ rows, sortKey, setSortKey }) {
    const [expanded, setExpanded] = useState({})

    function toggleExpand(productId) {
        setExpanded(prev => ({ ...prev, [productId]: !prev[productId] }))
    }

    const totals = useMemo(() => rows.reduce((acc, r) => ({
        total:    acc.total    + r.totalUnits,
        direct:   acc.direct   + r.unitsDirect,
        inPromo:  acc.inPromo  + r.unitsInPromo,
    }), { total: 0, direct: 0, inPromo: 0 }), [rows])

    return (
        <div style={sectionCard}>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '14px', lineHeight: '1.5' }}>
                <strong style={{ color: 'white' }}>Unidades físicas</strong> — muestra cuántas veces salió cada producto del bar,
                ya sea vendido de forma individual (<strong>Directo</strong>) o como componente de una cubeta / promo / shot (<strong>En promo</strong>).
                El total coincide con las deducciones de inventario.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                        <th style={thStyle('left')}>Producto</th>
                        <th style={thStyle('left')}>Categoría</th>
                        <th style={thStyle('right', true)} onClick={() => setSortKey('totalUnits')}>
                            Total {sortKey === 'totalUnits' ? '▾' : ''}
                        </th>
                        <th style={thStyle('right', true)} onClick={() => setSortKey('unitsDirect')}>
                            Directo {sortKey === 'unitsDirect' ? '▾' : ''}
                        </th>
                        <th style={thStyle('right', true)} onClick={() => setSortKey('unitsInPromo')}>
                            En promo {sortKey === 'unitsInPromo' ? '▾' : ''}
                        </th>
                        <th style={{ width: '32px' }} />
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                                Sin resultados.
                            </td>
                        </tr>
                    ) : rows.map(r => (
                        <>
                            <tr
                                key={r.productId}
                                style={{ borderBottom: expanded[r.productId] ? 'none' : '1px solid #1e1e1e', cursor: r.promosList.length > 0 ? 'pointer' : 'default' }}
                                onClick={() => r.promosList.length > 0 && toggleExpand(r.productId)}
                            >
                                <td style={{ padding: '8px 12px', fontSize: '13px' }}>
                                    {r.productName}
                                    {r.isBundle && (
                                        <span style={{ marginLeft: '6px', fontSize: '10px', color: '#7c3aed', background: '#1e1040', borderRadius: '4px', padding: '1px 6px' }}>
                                            combo
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', color: MUTED }}>{r.categoryName}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', fontWeight: 700 }}>{r.totalUnits}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: '#4ade80' }}>
                                    {r.unitsDirect > 0 ? r.unitsDirect : <span style={{ color: '#333' }}>—</span>}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: r.unitsInPromo > 0 ? '#f59e0b' : '#333' }}>
                                    {r.unitsInPromo > 0 ? r.unitsInPromo : '—'}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '12px', color: MUTED }}>
                                    {r.promosList.length > 0 ? (expanded[r.productId] ? '▴' : '▾') : ''}
                                </td>
                            </tr>
                            {expanded[r.productId] && (
                                <tr key={r.productId + '_detail'} style={{ borderBottom: '1px solid #1e1e1e' }}>
                                    <td colSpan={6} style={{ padding: '0 12px 10px 28px' }}>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
                                            {r.promosList.map(p => (
                                                <span
                                                    key={p.promoId}
                                                    style={{
                                                        fontSize: '11px',
                                                        background: '#1e1040',
                                                        color: '#a78bfa',
                                                        borderRadius: '6px',
                                                        padding: '3px 10px',
                                                        border: '1px solid #3b1d8a',
                                                    }}
                                                >
                                                    {p.promoName} · <strong>{p.units}</strong>
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </>
                    ))}
                </tbody>
                {rows.length > 0 && (
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #2a2a2a' }}>
                            <td colSpan={2} style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700 }}>Total</td>
                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{totals.total}</td>
                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: '#4ade80' }}>{totals.direct}</td>
                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, textAlign: 'right', color: '#f59e0b' }}>{totals.inPromo}</td>
                            <td />
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    )
}

// ── Page ───────────────────────────────────────────────────────
function ProductSalesReportPage() {
    const location = useLocation()
    const today    = toLocalDateString(new Date())

    const [tab,       setTab]       = useState('ventas') // 'ventas' | 'unidades'
    const [startDate, setStartDate] = useState(getYesterday())
    const [endDate,   setEndDate]   = useState(getYesterday())
    const [search,    setSearch]    = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [groupByCategory, setGroupByCategory] = useState(false)

    // Per-tab sort keys
    const [ventasSortKey,   setVentasSortKey]   = useState('revenue')    // 'units' | 'revenue' | 'margin'
    const [unidadesSortKey, setUnidadesSortKey] = useState('totalUnits') // 'totalUnits' | 'unitsDirect' | 'unitsInPromo'

    const [loading, setLoading] = useState(false)
    const { status, statusColor, setStatus } = useStatus('')

    const [ventasData,   setVentasData]   = useState([])
    const [unidadesData, setUnidadesData] = useState([])

    const load = useCallback(async () => {
        setLoading(true)
        setStatus('Cargando...')

        const [ventasRes, unidadesRes] = await Promise.all([
            getProductSalesForPeriod({ startDate, endDate }),
            getProductUnitsForPeriod({ startDate, endDate }),
        ])

        const err = ventasRes.error || unidadesRes.error
        if (err) {
            setStatus(`Error: ${err.message}`)
            setLoading(false)
            return
        }

        setVentasData(ventasRes.data || [])
        setUnidadesData(unidadesRes.data || [])

        const empty = !ventasRes.data?.length && !unidadesRes.data?.length
        setStatus(empty ? 'Sin ventas en el período.' : 'Reporte cargado.')
        setLoading(false)
    }, [startDate, endDate])

    useEffect(() => { load() }, [load])

    // ── Quick date filters ─────────────────────────────────────
    function applyYesterday() { const y = getYesterday(); setStartDate(y); setEndDate(y) }
    function applyToday()     { setStartDate(today); setEndDate(today) }

    // ── Categories for the dropdown ───────────────────────────
    const sourceData = tab === 'ventas' ? ventasData : unidadesData
    const categories = useMemo(() => {
        const set = new Set(sourceData.map(p => p.categoryName))
        return Array.from(set).sort()
    }, [sourceData])

    // ── Filter + group + sort — Ventas ─────────────────────────
    const ventasRows = useMemo(() => {
        const q = search.trim().toLowerCase()
        let filtered = ventasData.filter(p => {
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
                margin:    c.revenue - c.cost,
                marginPct: c.revenue > 0 ? ((c.revenue - c.cost) / c.revenue) * 100 : null,
            }))
        }

        return [...filtered].sort((a, b) => b[ventasSortKey] - a[ventasSortKey])
    }, [ventasData, search, categoryFilter, groupByCategory, ventasSortKey])

    // ── Filter + sort — Unidades ───────────────────────────────
    const unidadesRows = useMemo(() => {
        const q = search.trim().toLowerCase()
        const filtered = unidadesData.filter(p => {
            if (categoryFilter && p.categoryName !== categoryFilter) return false
            if (q && !p.productName.toLowerCase().includes(q)) return false
            return true
        })
        return [...filtered].sort((a, b) => b[unidadesSortKey] - a[unidadesSortKey])
    }, [unidadesData, search, categoryFilter, unidadesSortKey])

    function handleExport() {
        if (tab === 'ventas') downloadVentasCsv(ventasRows, groupByCategory)
        else                  downloadUnidadesCsv(unidadesRows)
    }

    const exportDisabled = tab === 'ventas' ? ventasRows.length === 0 : unidadesRows.length === 0

    return (
        <div style={{ padding: '20px', paddingLeft: '216px', color: 'white', maxWidth: '960px', minHeight: '100vh', background: '#111', boxSizing: 'border-box' }}>

            <AdminNav currentPath={location.pathname} />

            <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: '700' }}>
                🛒 Ventas por producto
            </h2>

            {/* Filters */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px' }}>
                {[{ label: 'Ayer', fn: applyYesterday }, { label: 'Hoy', fn: applyToday }].map(({ label, fn }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={fn}
                        style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #444', background: '#2a2a2a', color: MUTED, cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
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
                    style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', background: loading ? '#333' : '#1565c0', color: loading ? MUTED : 'white', fontWeight: '700', fontSize: '13px', cursor: loading ? 'default' : 'pointer' }}
                >
                    {loading ? 'Cargando...' : 'Cargar'}
                </button>

                <button
                    type="button"
                    onClick={handleExport}
                    disabled={exportDisabled}
                    style={{ padding: '7px 18px', borderRadius: '8px', border: '1px solid #333', background: 'transparent', color: exportDisabled ? '#444' : MUTED, fontWeight: '600', fontSize: '13px', cursor: exportDisabled ? 'default' : 'pointer', marginLeft: 'auto' }}
                >
                    ⬇ Exportar CSV
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <TabButton label="💰 Ventas"   active={tab === 'ventas'}   onClick={() => setTab('ventas')} />
                <TabButton label="📦 Unidades" active={tab === 'unidades'} onClick={() => setTab('unidades')} />
            </div>

            {/* Search + category + grouping */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px' }}>
                <input
                    type="text"
                    placeholder="Buscar: trago, caguama, miller…"
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

                {tab === 'ventas' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: MUTED, cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={groupByCategory}
                            onChange={e => setGroupByCategory(e.target.checked)}
                        />
                        Agrupar por categoría
                    </label>
                )}
            </div>

            {/* Status */}
            <div style={{ fontSize: '13px', color: loading ? MUTED : statusColor, marginBottom: '10px' }}>
                {loading ? 'Cargando...' : status}
            </div>

            {/* Table */}
            {tab === 'ventas' ? (
                <VentasTable
                    rows={ventasRows}
                    groupByCategory={groupByCategory}
                    sortKey={ventasSortKey}
                    setSortKey={setVentasSortKey}
                />
            ) : (
                <UnidadesTable
                    rows={unidadesRows}
                    sortKey={unidadesSortKey}
                    setSortKey={setUnidadesSortKey}
                />
            )}
        </div>
    )
}

export default ProductSalesReportPage
