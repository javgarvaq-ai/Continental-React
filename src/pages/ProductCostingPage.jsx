import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import { useStatus } from '../hooks/useStatus'
import { getProductReferenceCostingData, updateProductReferenceCost } from '../services/productReferenceCost'
import { money } from '../utils/money'

const MUTED = '#94a3b8'

const sectionCard = {
    padding: '20px',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    background: '#1a1a1a',
    marginBottom: '14px',
}

const inputStyle = {
    width: '100%',
    background: '#111',
    border: '1px solid #333',
    borderRadius: '6px',
    color: 'white',
    padding: '6px 8px',
    fontSize: '13px',
    boxSizing: 'border-box',
}

function downloadCsv(rows) {
    const headers = ['Producto', 'Categoría', 'Precio', 'Costo', 'Nota', 'Margen', 'Margen %']
    const lines = [headers.join(',')]
    rows.forEach(r => {
        const cols = [
            r.productName,
            r.categoryName,
            r.price.toFixed(2),
            r.cost == null ? '' : r.cost.toFixed(2),
            r.note,
            r.margin == null ? '' : r.margin.toFixed(2),
            r.marginPct == null ? '' : r.marginPct.toFixed(1),
        ]
        lines.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `costos_productos_${Date.now()}.csv`
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
    const [rows, setRows] = useState([]) // fuente "guardada" (última respuesta del servidor)

    // Estado local editable, separado de `rows` — se guarda por fila al perder
    // foco (onBlur). Sin botón "guardar todo" ni doble confirmación: no es
    // destructivo, es la misma acción que editar cualquier campo de un producto.
    const [editValues, setEditValues] = useState({}) // { [productId]: { cost, note } }
    const [rowStatus, setRowStatus] = useState({})   // { [productId]: 'saving' | 'saved' | 'error' }
    const savedTimers = useRef({})

    const load = useCallback(async () => {
        setLoading(true)
        setStatus('Cargando...')
        const { data, error } = await getProductReferenceCostingData()
        if (error) {
            setStatus(`Error: ${error.message}`)
            setLoading(false)
            return
        }
        setRows(data)
        const initialEdits = {}
        data.forEach(r => {
            initialEdits[r.productId] = {
                cost: r.cost == null ? '' : String(r.cost),
                note: r.note || '',
            }
        })
        setEditValues(initialEdits)
        setStatus(data.length === 0 ? 'Sin productos.' : 'Costeo cargado.')
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    // Limpia timers de "✓ Guardado" pendientes si la pantalla se desmonta.
    useEffect(() => () => {
        Object.values(savedTimers.current).forEach(clearTimeout)
    }, [])

    const categories = useMemo(() => {
        const set = new Set(rows.map(r => r.categoryName))
        return Array.from(set).sort()
    }, [rows])

    // Margen calculado en vivo sobre el valor EDITADO (no el guardado), para
    // que el margen reaccione mientras Javi teclea, antes de que se guarde.
    const displayRows = useMemo(() => {
        return rows.map(r => {
            const edit = editValues[r.productId] || { cost: '', note: '' }
            const cost = edit.cost === '' ? null : Number(edit.cost)
            const price = r.price
            const validCost = cost != null && !Number.isNaN(cost)
            const margin = validCost ? price - cost : null
            const marginPct = margin == null || price <= 0 ? null : (margin / price) * 100
            return { ...r, cost: validCost ? cost : null, note: edit.note, margin, marginPct }
        })
    }, [rows, editValues])

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase()
        const filtered = displayRows.filter(r => {
            if (hideInactive && !r.active) return false
            if (categoryFilter && r.categoryName !== categoryFilter) return false
            if (q && !r.productName.toLowerCase().includes(q)) return false
            return true
        })
        return [...filtered].sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity))
    }, [displayRows, search, categoryFilter, hideInactive, sortKey])

    function setEdit(productId, field, value) {
        setEditValues(prev => ({
            ...prev,
            [productId]: { ...prev[productId], [field]: value },
        }))
    }

    async function saveRow(productId) {
        const edit = editValues[productId]
        if (!edit) return

        // No guardar si no cambió nada respecto a lo ya guardado — evita
        // escrituras de más al simplemente tabular por la fila sin tocarla.
        const original = rows.find(r => r.productId === productId)
        const originalCost = original?.cost == null ? '' : String(original.cost)
        const originalNote = original?.note || ''
        if (edit.cost === originalCost && edit.note === originalNote) return

        setRowStatus(prev => ({ ...prev, [productId]: 'saving' }))
        const { error } = await updateProductReferenceCost({
            productId,
            cost: edit.cost,
            note: edit.note,
        })

        if (error) {
            setRowStatus(prev => ({ ...prev, [productId]: 'error' }))
            setStatus(`Error guardando "${original?.productName || productId}": ${error.message}`)
            return
        }

        // Refleja en `rows` (fuente "guardada") para que el próximo blur sin
        // cambios no dispare otro guardado idéntico.
        setRows(prev => prev.map(r => r.productId === productId
            ? { ...r, cost: edit.cost === '' ? null : Number(edit.cost), note: edit.note }
            : r))

        setRowStatus(prev => ({ ...prev, [productId]: 'saved' }))
        clearTimeout(savedTimers.current[productId])
        savedTimers.current[productId] = setTimeout(() => {
            setRowStatus(prev => {
                const next = { ...prev }
                delete next[productId]
                return next
            })
        }, 1500)
    }

    function thStyle(key, sortable, align) {
        return {
            textAlign: align || 'right',
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

    function rowStatusBadge(productId) {
        const s = rowStatus[productId]
        if (s === 'saving') return <span style={{ fontSize: '11px', color: MUTED }}>Guardando…</span>
        if (s === 'saved')  return <span style={{ fontSize: '11px', color: '#4ade80' }}>✓ Guardado</span>
        if (s === 'error')  return <span style={{ fontSize: '11px', color: '#f87171' }}>Error al guardar</span>
        return null
    }

    return (
        <div style={{ padding: '20px', paddingLeft: '216px', color: 'white', maxWidth: '1100px', minHeight: '100vh', background: '#111', boxSizing: 'border-box' }}>

            <AdminNav currentPath={location.pathname} />

            <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '700' }}>
                🧮 Costeo de productos
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: MUTED }}>
                Costo de referencia manual por producto — independiente de recetas/inventario (que solo descuentan stock).
                Escribe el costo y una nota opcional; se guarda solo al salir del campo (Tab o click fuera). El margen se calcula en vivo.
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
                            <th style={thStyle('productName', false, 'left')}>Producto</th>
                            <th style={thStyle('categoryName', false, 'left')}>Categoría</th>
                            <th style={thStyle('price', true)} onClick={() => setSortKey('price')}>
                                Precio {sortKey === 'price' ? '▾' : ''}
                            </th>
                            <th style={{ ...thStyle('cost', true), width: '110px' }} onClick={() => setSortKey('cost')}>
                                Costo {sortKey === 'cost' ? '▾' : ''}
                            </th>
                            <th style={{ ...thStyle('note', false, 'left'), width: '220px' }}>Nota</th>
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
                                <td style={{ padding: '6px 12px' }}>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="—"
                                        value={editValues[r.productId]?.cost ?? ''}
                                        onChange={e => setEdit(r.productId, 'cost', e.target.value)}
                                        onBlur={() => saveRow(r.productId)}
                                        style={{ ...inputStyle, textAlign: 'right' }}
                                    />
                                </td>
                                <td style={{ padding: '6px 12px' }}>
                                    <input
                                        type="text"
                                        placeholder="Nota de referencia (opcional)"
                                        value={editValues[r.productId]?.note ?? ''}
                                        onChange={e => setEdit(r.productId, 'note', e.target.value)}
                                        onBlur={() => saveRow(r.productId)}
                                        style={inputStyle}
                                    />
                                    <div style={{ minHeight: '14px', marginTop: '2px' }}>{rowStatusBadge(r.productId)}</div>
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: r.margin == null ? MUTED : (r.margin >= 0 ? '#4ade80' : '#f87171'), fontWeight: 600 }}>
                                    {r.margin == null ? '— sin costo' : money(r.margin)}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: '13px', textAlign: 'right', color: MUTED }}>
                                    {r.marginPct == null ? '—' : r.marginPct.toFixed(1) + '%'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default ProductCostingPage
