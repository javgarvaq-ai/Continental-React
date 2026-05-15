import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'

// ─────────────────────────────────────────────────────────────
// DEV TOOL — remove this page (and its route in App.jsx) after QA
// ─────────────────────────────────────────────────────────────

const PRESETS = [
    {
        label: 'Comandas activas',
        sql: `SELECT c.id, c.folio, c.status, c.opened_at, u.name AS mesa, cu.name AS cliente
FROM comandas c
LEFT JOIN units u ON u.id = c.unit_id
LEFT JOIN customers cu ON cu.id = c.customer_id
WHERE c.status NOT IN ('paid', 'cancelled')
ORDER BY c.opened_at DESC
LIMIT 20`,
    },
    {
        label: 'Inventario',
        sql: `SELECT name, current_stock, unit_type, active
FROM inventory_items
ORDER BY current_stock ASC`,
    },
    {
        label: 'Últimos movimientos',
        sql: `SELECT im.created_at, ii.name, im.movement_type, im.quantity_change, im.resulting_stock
FROM inventory_movements im
JOIN inventory_items ii ON ii.id = im.inventory_item_id
ORDER BY im.created_at DESC
LIMIT 30`,
    },
    {
        label: 'Membresías activas',
        sql: `SELECT cu.name, cu.customer_number, mp.name AS plan, cm.month, cm.status
FROM customer_memberships cm
JOIN customers cu ON cu.id = cm.customer_id
JOIN membership_plans mp ON mp.id = cm.plan_id
WHERE cm.status = 'active'
ORDER BY cm.month DESC`,
    },
    {
        label: 'Turno actual',
        sql: `SELECT s.id, s.status, s.opened_at, s.closed_at,
       u.name AS abierto_por
FROM shifts s
LEFT JOIN users u ON u.id = s.opened_by_user_id
WHERE s.status = 'open'
ORDER BY s.opened_at DESC
LIMIT 5`,
    },
    {
        label: 'Últimos pagos',
        sql: `SELECT p.created_at, p.total_paid, p.efectivo, p.tarjeta,
       p.transferencia, p.tip_amount, p.change_given,
       c.folio, cu.name AS cliente
FROM payments p
JOIN comandas c ON c.id = p.comanda_id
LEFT JOIN customers cu ON cu.id = c.customer_id
ORDER BY p.created_at DESC
LIMIT 20`,
    },
    {
        label: 'Error log',
        sql: `SELECT created_at, route, error_message, user_id
FROM error_log
ORDER BY created_at DESC
LIMIT 20`,
    },
]

// ── Styles ────────────────────────────────────────────────────
const S = {
    page: {
        minHeight: '100vh',
        backgroundColor: '#0f0f0f',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        padding: '24px',
    },
    banner: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        backgroundColor: '#1c1208',
        border: '1px solid #854d0e',
        borderRadius: '8px',
        padding: '10px 16px',
        marginBottom: '24px',
        fontSize: '13px',
        color: '#fbbf24',
    },
    header: {
        fontSize: '22px',
        fontWeight: '700',
        color: '#f1f5f9',
        margin: 0,
    },
    layout: {
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: '20px',
        alignItems: 'start',
    },
    sidebar: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    sidebarLabel: {
        fontSize: '11px',
        fontWeight: '600',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#64748b',
        marginBottom: '6px',
    },
    presetBtn: (active) => ({
        textAlign: 'left',
        background: active ? '#1e293b' : 'transparent',
        border: active ? '1px solid #334155' : '1px solid transparent',
        borderRadius: '6px',
        padding: '8px 10px',
        fontSize: '13px',
        color: active ? '#e2e8f0' : '#94a3b8',
        cursor: 'pointer',
        width: '100%',
        transition: 'all 0.1s',
    }),
    editor: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    textarea: {
        width: '100%',
        minHeight: '140px',
        backgroundColor: '#161616',
        color: '#e2e8f0',
        border: '1px solid #2a2a2a',
        borderRadius: '8px',
        padding: '14px',
        fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
        fontSize: '13px',
        lineHeight: '1.6',
        resize: 'vertical',
        outline: 'none',
        boxSizing: 'border-box',
    },
    toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    runBtn: (loading) => ({
        backgroundColor: loading ? '#1e3a5f' : '#1d4ed8',
        color: loading ? '#93c5fd' : '#fff',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 20px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: loading ? 'not-allowed' : 'pointer',
    }),
    clearBtn: {
        background: 'transparent',
        color: '#94a3b8',
        border: '1px solid #334155',
        borderRadius: '6px',
        padding: '8px 14px',
        fontSize: '13px',
        cursor: 'pointer',
    },
    statusText: (isError) => ({
        fontSize: '12px',
        color: isError ? '#f87171' : '#4ade80',
        marginLeft: 'auto',
    }),
    resultsBox: {
        marginTop: '4px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #2a2a2a',
    },
    resultsHeader: {
        backgroundColor: '#161616',
        borderBottom: '1px solid #2a2a2a',
        padding: '8px 14px',
        fontSize: '11px',
        fontWeight: '600',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#64748b',
    },
    tableWrap: {
        overflowX: 'auto',
        maxHeight: '420px',
        overflowY: 'auto',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px',
    },
    th: {
        backgroundColor: '#1a1a1a',
        color: '#94a3b8',
        fontWeight: '600',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        padding: '8px 12px',
        textAlign: 'left',
        borderBottom: '1px solid #2a2a2a',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
    },
    td: (even) => ({
        padding: '7px 12px',
        borderBottom: '1px solid #1a1a1a',
        backgroundColor: even ? '#111' : '#0f0f0f',
        color: '#e2e8f0',
        whiteSpace: 'nowrap',
        maxWidth: '300px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    }),
    emptyState: {
        padding: '32px',
        textAlign: 'center',
        color: '#475569',
        fontSize: '13px',
    },
    errorBox: {
        backgroundColor: '#1c0a0a',
        border: '1px solid #7f1d1d',
        borderRadius: '8px',
        padding: '14px 16px',
        marginTop: '4px',
        color: '#fca5a5',
        fontSize: '13px',
        fontFamily: 'monospace',
    },
}

function SqlAdminPage() {
    const [sql, setSql] = useState(PRESETS[0].sql)
    const [results, setResults] = useState(null)   // null | [] | [{...}]
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(false)
    const [rowCount, setRowCount] = useState(null)
    const [activePreset, setActivePreset] = useState(0)
    const [elapsed, setElapsed] = useState(null)
    const textareaRef = useRef(null)
    const navigate = useNavigate()

    async function runQuery() {
        if (!sql.trim() || loading) return
        setLoading(true)
        setError(null)
        setResults(null)
        setRowCount(null)

        const t0 = performance.now()
        const { data, error: rpcError } = await supabase.rpc('execute_sql', { query: sql.trim() })
        const ms = Math.round(performance.now() - t0)
        setElapsed(ms)
        setLoading(false)

        if (rpcError) {
            setError(rpcError.message)
            return
        }

        // The function returns JSON directly — data is already parsed by supabase-js
        if (data && data.error) {
            setError(`${data.error}${data.detail ? ` (${data.detail})` : ''}`)
            return
        }

        const rows = Array.isArray(data) ? data : []
        setResults(rows)
        setRowCount(rows.length)
    }

    function handleKeyDown(e) {
        // Cmd/Ctrl + Enter runs the query
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            runQuery()
        }
    }

    function selectPreset(i) {
        setActivePreset(i)
        setSql(PRESETS[i].sql)
        setResults(null)
        setError(null)
        setRowCount(null)
        setTimeout(() => textareaRef.current?.focus(), 0)
    }

    const columns = results && results.length > 0 ? Object.keys(results[0]) : []

    return (
        <div style={S.page}>
            {/* Warning banner */}
            <div style={S.banner}>
                <span>⚠️</span>
                <span>
                    <strong>Herramienta temporal de QA.</strong>{' '}
                    Solo lectura · Solo admins · Eliminar después de pruebas
                </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={S.header}>SQL Explorer</div>
                <button
                    onClick={() => navigate('/pos')}
                    style={{
                        background: 'transparent',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '13px',
                        padding: '7px 14px',
                    }}
                >
                    ← Volver al POS
                </button>
            </div>

            <div style={S.layout}>
                {/* Preset sidebar */}
                <div style={S.sidebar}>
                    <div style={S.sidebarLabel}>Consultas rápidas</div>
                    {PRESETS.map((p, i) => (
                        <button
                            key={i}
                            style={S.presetBtn(activePreset === i)}
                            onClick={() => selectPreset(i)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* Editor + results */}
                <div style={S.editor}>
                    <textarea
                        ref={textareaRef}
                        style={S.textarea}
                        value={sql}
                        onChange={e => {
                            setSql(e.target.value)
                            setActivePreset(null)
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="SELECT * FROM ..."
                        spellCheck={false}
                    />

                    <div style={S.toolbar}>
                        <button style={S.runBtn(loading)} onClick={runQuery} disabled={loading}>
                            {loading ? 'Ejecutando…' : '▶ Ejecutar'}
                        </button>
                        <button
                            style={S.clearBtn}
                            onClick={() => {
                                setSql('')
                                setResults(null)
                                setError(null)
                                setRowCount(null)
                                setActivePreset(null)
                            }}
                        >
                            Limpiar
                        </button>
                        <span style={{ fontSize: '11px', color: '#475569', marginLeft: '4px' }}>
                            ⌘ + Enter para ejecutar
                        </span>
                        {rowCount !== null && !error && (
                            <span style={S.statusText(false)}>
                                {rowCount} {rowCount === 1 ? 'fila' : 'filas'} · {elapsed}ms
                            </span>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={S.errorBox}>
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {/* Results table */}
                    {results !== null && !error && (
                        <div style={S.resultsBox}>
                            <div style={S.resultsHeader}>
                                Resultados — {rowCount} {rowCount === 1 ? 'fila' : 'filas'}
                            </div>
                            {results.length === 0 ? (
                                <div style={S.emptyState}>Sin resultados</div>
                            ) : (
                                <div style={S.tableWrap}>
                                    <table style={S.table}>
                                        <thead>
                                            <tr>
                                                {columns.map(col => (
                                                    <th key={col} style={S.th}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {results.map((row, ri) => (
                                                <tr key={ri}>
                                                    {columns.map(col => (
                                                        <td key={col} style={S.td(ri % 2 === 0)}>
                                                            {row[col] === null
                                                                ? <span style={{ color: '#475569', fontStyle: 'italic' }}>null</span>
                                                                : String(row[col])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default SqlAdminPage
