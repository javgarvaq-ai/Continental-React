import { useState, useEffect } from 'react'

function money(value) {
    return `$${Number(value || 0).toFixed(2)}`
}

function SummaryRow({ label, value, muted, accent, bold }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
            <span style={{ fontSize: '13px', opacity: muted ? 0.45 : 0.75 }}>{label}</span>
            <span style={{
                fontSize: '13px',
                fontWeight: bold ? 'bold' : 'normal',
                color: accent || 'white',
                opacity: muted ? 0.45 : 1,
            }}>
                {value}
            </span>
        </div>
    )
}

function ShiftPanel({ open, onClose, currentUser, onFetchData, onConfirmClose, onOpenCashMovement }) {
    const [step, setStep] = useState('review')
    const [summary, setSummary] = useState(null)
    const [hasOpenComandas, setHasOpenComandas] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [cashCounted, setCashCounted] = useState('')
    const [isClosing, setIsClosing] = useState(false)
    const [errorMsg, setErrorMsg] = useState(null)

    const isManagerOrAdmin = currentUser?.role === 'manager' || currentUser?.role === 'admin'

    useEffect(() => {
        if (open) {
            fetchData()
        } else {
            setStep('review')
            setSummary(null)
            setHasOpenComandas(false)
            setCashCounted('')
            setErrorMsg(null)
        }
    }, [open])

    async function fetchData() {
        setIsLoading(true)
        setErrorMsg(null)
        const { data, error } = await onFetchData()
        setIsLoading(false)

        if (error || !data) {
            setErrorMsg(error?.message || 'No se pudo calcular el corte.')
            return
        }

        setSummary(data.summary)
        setHasOpenComandas(data.hasOpenComandas)
    }

    async function handleConfirmClose() {
        const counted = Number(cashCounted)
        if (isNaN(counted) || cashCounted === '') return

        setIsClosing(true)
        setErrorMsg(null)
        const { error } = await onConfirmClose(counted)
        setIsClosing(false)

        if (error) {
            setErrorMsg(error.message || 'No se pudo cerrar el turno.')
        }
    }

    if (!open) return null

    const parsedCounted = Number(cashCounted)
    const validCounted = cashCounted !== '' && !isNaN(parsedCounted)
    const difference = validCounted && summary ? parsedCounted - Number(summary.expectedCash || 0) : null
    const diffColor = difference !== null ? (difference >= 0 ? '#66bb6a' : '#ef9a9a') : 'white'

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '16px',
                padding: '24px',
                width: '100%',
                maxWidth: '500px',
                maxHeight: '90vh',
                overflowY: 'auto',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px' }}>
                        {step === 'review' ? '📊 Corte de turno' : '🔒 Cerrar turno'}
                    </h2>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {step === 'review' && (
                            <button
                                type="button"
                                onClick={fetchData}
                                disabled={isLoading}
                                style={{ background: '#222', border: '1px solid #444', color: '#aaa', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px' }}
                            >
                                {isLoading ? '...' : '↻ Actualizar'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Error message */}
                {errorMsg && (
                    <div style={{ background: '#4a1c1c', border: '1px solid #c62828', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#ef9a9a' }}>
                        {errorMsg}
                    </div>
                )}

                {/* Loading */}
                {isLoading && !summary && (
                    <div style={{ textAlign: 'center', padding: '40px', opacity: 0.5, fontSize: '14px' }}>
                        Calculando corte...
                    </div>
                )}

                {/* Summary */}
                {summary && (
                    <>
                        <div style={{ background: '#111', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                            <SummaryRow label="Fondo inicial" value={money(summary.shift.starting_cash)} />
                            <SummaryRow label="Efectivo ventas" value={money(summary.totalEfectivo)} />
                            <SummaryRow label="Cambio entregado" value={`-${money(summary.totalCambio)}`} muted />
                            <SummaryRow label="Tarjeta" value={money(summary.totalTarjeta)} />
                            <SummaryRow label="Transferencia" value={money(summary.totalTransferencia)} />
                            <SummaryRow label="Propinas" value={money(summary.totalPropinas)} accent="#f57c00" />
                            <div style={{ borderTop: '1px solid #2a2a2a', margin: '8px 0' }} />
                            <SummaryRow label="Depósitos" value={`+${money(summary.totalDeposits)}`} accent="#66bb6a" />
                            <SummaryRow label="Retiros" value={`-${money(summary.totalWithdrawals)}`} accent="#ef9a9a" />
                            <div style={{ borderTop: '1px solid #2a2a2a', margin: '8px 0' }} />
                            <SummaryRow label="Caja esperada" value={money(summary.expectedCash)} bold />
                        </div>

                        {/* Open comanda warning */}
                        {hasOpenComandas && (
                            <div style={{ background: '#4a2800', border: '1px solid #f57c00', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#ffb74d' }}>
                                ⚠️ Hay mesas abiertas o en cobro. Ciérralas antes de proceder al cierre de turno.
                            </div>
                        )}

                        {/* Step: Review */}
                        {step === 'review' && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={onOpenCashMovement}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid #444',
                                        background: '#222',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '13px',
                                    }}
                                >
                                    + Movimiento de caja
                                </button>

                                {isManagerOrAdmin && (
                                    <button
                                        type="button"
                                        onClick={() => { setStep('close'); setErrorMsg(null) }}
                                        disabled={hasOpenComandas}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: hasOpenComandas ? '#555' : '#c62828',
                                            color: 'white',
                                            cursor: hasOpenComandas ? 'default' : 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '13px',
                                        }}
                                    >
                                        🔒 Proceder al cierre
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Step: Close */}
                        {step === 'close' && (
                            <div>
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', opacity: 0.6, marginBottom: '6px' }}>
                                        Efectivo contado físicamente
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={cashCounted}
                                        onChange={e => setCashCounted(e.target.value)}
                                        placeholder="0.00"
                                        autoFocus
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            borderRadius: '8px',
                                            border: '1px solid #444',
                                            background: '#111',
                                            color: 'white',
                                            fontSize: '20px',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>

                                {validCounted && (
                                    <div style={{ background: '#111', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                                        <SummaryRow label="Caja esperada" value={money(summary.expectedCash)} />
                                        <SummaryRow label="Caja contada" value={money(parsedCounted)} />
                                        <div style={{ borderTop: '1px solid #2a2a2a', margin: '6px 0' }} />
                                        <SummaryRow
                                            label="Diferencia"
                                            value={`${difference >= 0 ? '+' : ''}${money(difference)}`}
                                            accent={diffColor}
                                            bold
                                        />
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => { setStep('review'); setErrorMsg(null) }}
                                        style={{
                                            padding: '10px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid #444',
                                            background: '#222',
                                            color: 'white',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        ← Volver
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmClose}
                                        disabled={!validCounted || isClosing}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: (!validCounted || isClosing) ? '#555' : '#c62828',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            cursor: (!validCounted || isClosing) ? 'default' : 'pointer',
                                            fontSize: '14px',
                                        }}
                                    >
                                        {isClosing ? 'Cerrando turno...' : '🔒 Confirmar cierre de turno'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default ShiftPanel
