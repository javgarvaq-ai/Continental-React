import { useEffect, useState, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import { useStatus } from '../hooks/useStatus'
import { getProductCostingData } from '../services/productCosting'
import { money } from '../utils/money'

const MUTED = '#94a3b8'

const sectionCard = {
    padding: '20px',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    background: '#1a1a1a',
    marginBottom: '14px',
}

const SOURCE_LABEL = {
    recipe: 'Receta',
    manual: 'Costo manual',
    estimated_mixers_avg: '≈ Estimado (mixers)',
    none: 'Sin costo',
}

function downloadCsv(rows) {
    const headers = ['Producto', 'Categoría', 'Precio', 'Costo', 'Fuente', 'Margen', 'Margen %']
    const lines = [headers.join(',')]
    rows.forEach(r => {
        const cols = [
            r.productName,
            r.categoryName,
            r.price.toFixed(2),
            r.cost.toFixed(2),
            SOURCE_LABEL[r.costSource] || r.costSource,
            r.margin.toFixed(2),
            r.marginPct == null ? '' : r.marginPct.toFixed(1),
        ]
        lines.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `costeo_productos_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

function ProductCostingPage() {
    const location = useLocation()

    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [hideInactive, setHideInactive] = useState(true)
    const [sortKey, setSortKey] = useState('margin')

    const [loading, setLoading] = useState(false)
    const { status, statusColor, setStatus } = useStatus('')
    const [rows, setRows] = useState([])

    const load = useCallback(async () => {
        setLoading(true)
        setStatus('Cargando...')
        const { data, error } = await getProductCostingData()
        if (error) {
            setStatus(`Error: ${error.message}`)
            setLoading(false)
            return
        }
        setRows(data)
        setStatus(data.length === 0 ? 'Sin productos.' : 'Costeo cargado.')
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    const categories = useMemo(() => {
        const set = new Set(rows.map(r => r.categoryName))
        return Array.from(set).sort()
    }, [rows])

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase()
        const filtered = rows.filter(r => {
            if (hideInactive && !r.active) return false
            if (categoryFilter && r.categoryName !== categoryFilter) return false
            if (q && !r.productName.toLowerCase().includes(q)) return false
            return true
        })
        return [...filtered].sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity))
    }, [rows, search, categoryFilter, hideInactive, sortKey])

    function thStyle(key, sortable) {
        return {
            textAlign: key === 'productName' || key === 'categoryName' || key === 'costSource' ? 'left' : 'right',
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: MUTED,
            cursor: sortable ? 'pointer' : 'default',
            userSelect: 'none',
        }
    }

    function costCellStyle(row) {
        if (!row.costComplete) return { color: '#f59e0b' }
        if (row.costSource === 'estimated_mixers_avg') return { color: '#60a5fa' }
        return { color: MUTED }
    }

    function costTitle(row) {
        if (!row.costComplete) return 'Sin costo: falta receta activa o costo manual.'
        if (row.costSource === 'estimated_mixers_avg') {
            return 'Estimado: promedio de costo de los mixers elegibles × cantidad incluida en el combo. El costo real depende de lo elegido en cada venta — ver "Ventas por producto".'
        }
        return ''
    }

    function costPrefix(row) {
        if (!row.costComplete) return '— '
        if (row.costSource === 'estimated_mixers_avg') return '≈ '
        return ''
    }

    return (
        <div style={{ padding: '20px', paddingLeft: '216px', color: 'white', maxWidth: '1000px', minHeight: '100vh', background: '#111', boxSizing: 'border-box' }}>

            <AdminNav currentPath={location.pathname} />

            <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '700' }}>
                🧮 Costeo de productos
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: MUTED }}>
                Costo y margen calculados con los datos actuales (receta/insumos o costo manual) — sin depender de ventas.
                Para el costo real de lo ya vendido, usa "Ventas por producto".
            </p>

            {/* Filters */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '14px 18px' }}>
                <input
                    type="text"
                    placeholder="Buscar producto..."
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
                        checked={hideInactive}
                        onChange={e => setHideInactive(e.target.checked)}
                    />
                    Ocultar inactivos
                </label>

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
                    {loading ? 'Cargando...' : 'Recargar'}
                </button>

                <button
                    type="button"
                    onClick={() => downloadCsv(filteredRows)}
                    disabled={filteredRows.length === 0}
                    style={{
                        padding: '7px 18px',
                        borderRadius: '8px',
                        border: '1px solid #333',
                        background: 'transparent',
                        color: filteredRows.length === 0 ? '#444' : MUTED,
                        fontWeight: '600',
                        fontSize: '13px',
                        cursor: filteredRows.length === 0 ? 'default' : 'pointer',
                        marginLeft: 'auto',
                    }}
                >
                    ⬇ Exportar CSV
                </button>
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
                            <th style={thStyle('productName')}>Producto</th>
                            <th style={thStyle('categoryName')}>Categoría</th>
                            <th style={thStyle('price', true)} onClick={() => setSortKey('price')}>
                                Precio {sortKey === 'price' ? '▾' : ''}
                            </th>
                            <th style={thStyle('cost', true)} onClick={() => setSortKey('cost')}>
                                Costo {sortKey === 'cost' ? '▾' : ''}
                            </th>
                            <th style={thStyle('costSource')}>Fuente</th>
                            <th style={thStyle('margin', true)} onClick={() => setSortKey('margin')}>
                                Margen {sortKey === 'margin' ? '▾' : ''}
                            </th>
                            <th style={thStyle('marginPct')}>Margen %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                                    Sin resultados.
                                </td>
                            </tr>
                        ) : filteredRows.map(r => (
                            <tr key={r.productId} style={{ borderBottom: '1px solid #1e1e1e', opacity: r.active ? 1 : 0.5 }}>
                                <td style={{ padding: '8px 12px', fontSize: '13px' }}>{r.productName}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', color: MUTED }}>{r.categoryName}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right' }}>{money(r.price)}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', ...costCellStyle(r) }} title={costTitle(r)}>
                                    {costPrefix(r)}{money(r.cost)}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: '12px', color: MUTED }}>{SOURCE_LABEL[r.costSource] || r.costSource}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: r.margin >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{money(r.margin)}</td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: MUTED }}>{r.marginPct == null ? '—' : r.marginPct.toFixed(1) + '%'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default ProductCostingPage
