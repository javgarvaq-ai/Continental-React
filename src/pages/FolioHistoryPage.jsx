import { useState, useEffect, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'
import { money } from '../utils/money'
import { searchComandas, getComandaItems, getReprintData, adjustPaymentTip } from '../services/tickets'
import { printTicket } from '../components/Ticket'

// ── Helpers ───────────────────────────────────────────────────
// Local (Mexico) date string — toISOString() returns the UTC date, which is
// already "tomorrow" during the evening (UTC-6), making "Hoy" point at the
// wrong day during the bar's busiest hours.
function toLocalDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function today() {
    return toLocalDateString(new Date())
}

function nDaysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return toLocalDateString(d)
}

function formatDateTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-MX', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function statusBadge(status) {
    const map = {
        paid:                { label: 'Pagada',    color: '#4ade80' },
        cancelled:           { label: 'Cancelada', color: '#f87171' },
        open:                { label: 'Abierta',   color: '#60a5fa' },
        pending_payment:     { label: 'En cuenta', color: '#fbbf24' },
        processing_payment:  { label: 'Pagando',   color: '#a78bfa' },
    }
    return map[status] || { label: status, color: '#94a3b8' }
}

function paymentMethods(payment) {
    if (!payment) return null
    const parts = []
    if (payment.efectivo      > 0) parts.push('Ef')
    if (payment.tarjeta       > 0) parts.push('Tj')
    if (payment.transferencia > 0) parts.push('Tr')
    return parts.join('+') || null
}

const STATUS_FILTERS = [
    { key: 'all',       label: 'Todas'     },
    { key: 'paid',      label: 'Pagadas'   },
    { key: 'cancelled', label: 'Canceladas'},
    { key: 'open',      label: 'Abiertas'  },
]

// ── Expanded detail row ───────────────────────────────────────
function DetailPanel({ comanda, currentUser, onRefresh }) {
    const [items,       setItems]       = useState(null)
    const [printing,    setPrinting]    = useState(null)   // 'cuenta' | 'pagado' | null
    const [tipEdit,     setTipEdit]     = useState(false)
    const [tipValue,    setTipValue]    = useState('')
    const [tipSaving,   setTipSaving]   = useState(false)
    const [tipError,    setTipError]    = useState('')

    const payment = Array.isArray(comanda.payments) ? comanda.payments[0] : comanda.payments

    useEffect(() => {
        getComandaItems(comanda.id).then(({ data }) => setItems(data))
    }, [comanda.id])

    async function handlePrint(tipo) {
        setPrinting(tipo)
        const { items: printItems, unit, payment: pmt } = await getReprintData({
            comanda, tipo, userId: currentUser?.id,
        })
        printTicket({ tipo, comanda, items: printItems, unit, payment: pmt, onBlocked: () => {} })
        setPrinting(null)
    }

    function openTipEdit() {
        setTipValue(String(payment?.tip_amount || 0))
        setTipError('')
        setTipEdit(true)
    }

    async function saveTip() {
        const amount = Number(tipValue)
        if (isNaN(amount) || amount < 0) {
            setTipError('Valor inválido.')
            return
        }
        if (!payment?.id) {
            setTipError('No se encontró el pago.')
            return
        }
        setTipSaving(true)
        setTipError('')
        const { error } = await adjustPaymentTip({ paymentId: payment.id, tipAmount: amount })
        setTipSaving(false)
        if (error) {
            setTipError(error.message)
            return
        }
        setTipEdit(false)
        // Refresh the list so the row shows updated tip
        if (onRefresh) onRefresh()
    }

    return (
        <div style={{ background: '#0d1117', borderTop: '1px solid #1e293b', padding: '16px 20px 20px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                {/* Items list */}
                <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '10px' }}>
                        Productos
                    </div>
                    {items === null ? (
                        <div style={{ color: '#475569', fontSize: '13px' }}>Cargando…</div>
                    ) : items.length === 0 ? (
                        <div style={{ color: '#475569', fontSize: '13px' }}>Sin productos</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {items.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0', borderBottom: '1px solid #1a1a1a' }}>
                                    <span style={{ color: item.is_free_benefit ? '#a78bfa' : '#e2e8f0' }}>
                                        {item.quantity}× {item.products?.name}
                                        {item.is_free_benefit && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#a78bfa' }}>gratis</span>}
                                    </span>
                                    <span style={{ color: item.is_free_benefit ? '#a78bfa' : '#94a3b8' }}>
                                        {item.is_free_benefit ? '—' : money(item.unit_price * item.quantity)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Payment + actions */}
                <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '10px' }}>
                        Pago
                    </div>
                    {payment ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                            {[
                                { label: 'Efectivo',      value: payment.efectivo      },
                                { label: 'Tarjeta',       value: payment.tarjeta       },
                                { label: 'Transferencia', value: payment.transferencia },
                                { label: 'Total cobrado', value: payment.total_paid, bold: true },
                            ].filter(r => r.value > 0).map(r => (
                                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                    <span style={{ color: '#64748b' }}>{r.label}</span>
                                    <span style={{ color: r.bold ? '#4ade80' : '#94a3b8', fontWeight: r.bold ? 700 : 400 }}>{money(r.value)}</span>
                                </div>
                            ))}

                            {/* Propina — editable */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginTop: '2px' }}>
                                <span style={{ color: '#64748b' }}>Propina</span>
                                {comanda.status === 'paid' && !tipEdit ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: '#a78bfa' }}>{money(payment.tip_amount || 0)}</span>
                                        <button
                                            type="button"
                                            onClick={openTipEdit}
                                            style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer' }}
                                        >
                                            editar
                                        </button>
                                    </div>
                                ) : tipEdit ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={tipValue}
                                                onChange={e => setTipValue(e.target.value)}
                                                onWheel={e => e.target.blur()}
                                                style={{ width: '80px', background: '#111', border: '1px solid #475569', borderRadius: '4px', color: 'white', padding: '3px 7px', fontSize: '13px' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={saveTip}
                                                disabled={tipSaving}
                                                style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '4px', border: 'none', background: tipSaving ? '#333' : '#1d4ed8', color: 'white', cursor: tipSaving ? 'default' : 'pointer', fontWeight: 600 }}
                                            >
                                                {tipSaving ? '…' : 'Guardar'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTipEdit(false)}
                                                disabled={tipSaving}
                                                style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        {tipError && <div style={{ fontSize: '11px', color: '#f87171' }}>{tipError}</div>}
                                    </div>
                                ) : (
                                    <span style={{ color: '#a78bfa' }}>{money(payment.tip_amount || 0)}</span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#475569', fontSize: '13px', marginBottom: '16px' }}>
                            {comanda.status === 'paid' ? 'Sin registro de pago' : 'No pagada aún'}
                        </div>
                    )}

                    {/* Reprint buttons */}
                    {comanda.status === 'paid' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>
                                Reimprimir
                            </div>
                            <button
                                onClick={() => handlePrint('cuenta')}
                                disabled={!!printing}
                                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: printing === 'cuenta' ? '#475569' : '#e2e8f0', cursor: printing ? 'not-allowed' : 'pointer', fontSize: '13px', textAlign: 'left' }}
                            >
                                🧾 {printing === 'cuenta' ? 'Imprimiendo…' : 'Ticket cliente (cuenta)'}
                            </button>
                            <button
                                onClick={() => handlePrint('pagado')}
                                disabled={!!printing}
                                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: printing === 'pagado' ? '#475569' : '#e2e8f0', cursor: printing ? 'not-allowed' : 'pointer', fontSize: '13px', textAlign: 'left' }}
                            >
                                ✅ {printing === 'pagado' ? 'Imprimiendo…' : 'Ticket interno (pagado)'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────
function FolioHistoryPage() {
    const currentUser = useAuthStore(state => state.user)

    const [startDate, setStartDate] = useState(nDaysAgo(7))
    const [endDate,   setEndDate]   = useState(today())
    const [search,    setSearch]    = useState('')
    const [status,    setStatus]    = useState('all')
    const [loading,   setLoading]   = useState(false)
    const [results,   setResults]   = useState(null) // null = not searched yet
    const [expanded,  setExpanded]  = useState(null) // comanda id

    const runSearch = useCallback(async () => {
        setLoading(true)
        setExpanded(null)
        const { data } = await searchComandas({ startDate, endDate, search, status })
        setResults(data)
        setLoading(false)
    }, [startDate, endDate, search, status])

    // Auto-search on mount and when filters change (with debounce on search)
    useEffect(() => {
        const timer = setTimeout(runSearch, search ? 350 : 0)
        return () => clearTimeout(timer)
    }, [runSearch, search])

    // Immediate search on date/status change
    useEffect(() => { runSearch() }, [startDate, endDate, status]) // eslint-disable-line

    function toggleExpand(id) {
        setExpanded(prev => prev === id ? null : id)
    }

    const totalRevenue = results
        ? results.filter(c => c.status === 'paid').reduce((s, c) => {
            const p = Array.isArray(c.payments) ? c.payments[0] : c.payments
            return s + Number(p?.total_paid || 0)
        }, 0)
        : 0

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#e2e8f0', padding: '24px', paddingLeft: '216px', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/folios" />

                <h1 style={{ margin: '0 0 20px 0', fontSize: '22px', fontWeight: 700, color: '#f1f5f9' }}>Historial de Folios</h1>

                {/* ── Filters ── */}
                <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>

                        {/* Date range */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', color: '#64748b' }}>Desde</label>
                            <input
                                type="date"
                                value={startDate}
                                max={endDate}
                                onChange={e => setStartDate(e.target.value)}
                                style={{ background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 10px' }}
                            />
                            <label style={{ fontSize: '12px', color: '#64748b' }}>Hasta</label>
                            <input
                                type="date"
                                value={endDate}
                                min={startDate}
                                max={today()}
                                onChange={e => setEndDate(e.target.value)}
                                style={{ background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 10px' }}
                            />
                        </div>

                        {/* Quick range shortcuts */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {[
                                { label: 'Hoy',     start: today(),      end: today()      },
                                { label: '7d',      start: nDaysAgo(7),  end: today()      },
                                { label: '30d',     start: nDaysAgo(30), end: today()      },
                            ].map(r => (
                                <button
                                    key={r.label}
                                    onClick={() => { setStartDate(r.start); setEndDate(r.end) }}
                                    style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <input
                            type="text"
                            placeholder="Folio, cliente, mesa…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ background: '#111', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '6px 12px', minWidth: '200px', flex: 1 }}
                        />

                        {/* Status filter */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {STATUS_FILTERS.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setStatus(f.key)}
                                    style={{
                                        padding: '6px 12px', borderRadius: '5px', border: '1px solid',
                                        borderColor: status === f.key ? '#4a90d9' : '#334155',
                                        background:  status === f.key ? '#1d3557' : 'transparent',
                                        color:       status === f.key ? '#e2e8f0' : '#64748b',
                                        cursor: 'pointer', fontSize: '13px',
                                    }}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Results summary ── */}
                {results !== null && !loading && (
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
                        <span>{results.length} {results.length === 1 ? 'comanda' : 'comandas'}</span>
                        {totalRevenue > 0 && <span>· <span style={{ color: '#4ade80', fontWeight: 600 }}>{money(totalRevenue)}</span> en pagadas</span>}
                    </div>
                )}

                {/* ── Results table ── */}
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#475569', padding: '60px', fontSize: '14px' }}>Buscando…</div>
                ) : results === null ? null : results.length === 0 ? (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
                        Sin resultados para los filtros seleccionados
                    </div>
                ) : (
                    <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' }}>
                        {/* Table header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 100px 110px 100px 80px', gap: '0', padding: '10px 16px', borderBottom: '1px solid #2a2a2a' }}>
                            {['Folio', 'Fecha', 'Mesa / Cliente', 'Total', 'Pago', 'Estado', ''].map(h => (
                                <div key={h} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>{h}</div>
                            ))}
                        </div>

                        {/* Rows */}
                        {results.map(c => {
                            const badge   = statusBadge(c.status)
                            const payment = Array.isArray(c.payments) ? c.payments[0] : c.payments
                            const methods = paymentMethods(payment)
                            const isOpen  = expanded === c.id

                            return (
                                <div key={c.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                    {/* Main row */}
                                    <div
                                        onClick={() => toggleExpand(c.id)}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '90px 1fr 1fr 100px 110px 100px 80px',
                                            gap: '0',
                                            padding: '11px 16px',
                                            cursor: 'pointer',
                                            background: isOpen ? '#0d1117' : 'transparent',
                                            transition: 'background 0.15s',
                                        }}
                                    >
                                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#60a5fa' }}>
                                            C-{String(c.folio).padStart(6, '0')}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                            {formatDateTime(c.opened_at)}
                                        </div>
                                        <div style={{ fontSize: '13px' }}>
                                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{c.units?.name || '—'}</span>
                                            {(c.customers?.name || c.customer_name) && (
                                                <span style={{ color: '#64748b', marginLeft: '8px', fontSize: '12px' }}>
                                                    {c.customers?.name || c.customer_name}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: c.status === 'paid' ? '#4ade80' : '#94a3b8' }}>
                                            {payment?.total_paid ? money(payment.total_paid) : c.final_total ? money(c.final_total) : '—'}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            {methods || '—'}
                                            {payment?.tip_amount > 0 && <span style={{ color: '#a78bfa', marginLeft: '4px' }}>+prop</span>}
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${badge.color}1a`, color: badge.color, fontWeight: 600 }}>
                                                {badge.label}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#475569', textAlign: 'right' }}>
                                            {isOpen ? '▲ cerrar' : '▼ ver'}
                                        </div>
                                    </div>

                                    {/* Expanded detail */}
                                    {isOpen && (
                                        <DetailPanel
                                            comanda={c}
                                            currentUser={currentUser}
                                            onRefresh={runSearch}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default FolioHistoryPage
