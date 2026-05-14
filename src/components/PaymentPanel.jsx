import { money } from '../utils/money';

const labelStyle = {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '5px',
}

const inputStyle = {
    width: '100%',
    padding: '9px 10px',
    borderRadius: '6px',
    border: '1px solid #2a2a2a',
    background: '#0e0e0e',
    color: '#e2e2e2',
    fontSize: '15px',
    fontWeight: '500',
    boxSizing: 'border-box',
    outline: 'none',
}

function SummaryRow({ label, value, highlight }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
            <span style={{
                fontSize: '13px',
                fontWeight: highlight ? 700 : 500,
                color: highlight === 'red' ? '#f87171' : highlight === 'green' ? '#4ade80' : '#aaa',
            }}>
                {value}
            </span>
        </div>
    )
}

function PaymentPanel({
    currentComanda,
    paymentData,
    propinaFieldValue,
    paymentSummary,
    isConfirmingPayment,
    onPaymentFieldChange,
    onResetAutoTip,
    onConfirmPayment,
}) {
    if (currentComanda?.status !== 'processing_payment') {
        return null;
    }

    const isReady = paymentSummary.pendiente <= 0
    const pendiente = Number(paymentSummary.pendiente || 0)
    const cambio = Number(paymentSummary.cambio || 0)

    return (
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #2a2a2a' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
                Desglose de cobro
            </div>

            {/* Payment fields — 2×2 grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                    <label style={labelStyle}>Efectivo</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentData.efectivo}
                        onChange={(e) => onPaymentFieldChange('efectivo', e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label style={labelStyle}>Tarjeta</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentData.tarjeta}
                        onChange={(e) => onPaymentFieldChange('tarjeta', e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label style={labelStyle}>Transferencia</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentData.transferencia}
                        onChange={(e) => onPaymentFieldChange('transferencia', e.target.value)}
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label style={labelStyle}>Propina</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={propinaFieldValue}
                            onChange={(e) => onPaymentFieldChange('propina', e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                            type="button"
                            onClick={onResetAutoTip}
                            title="Calcular propina automática"
                            style={{
                                padding: '9px 10px',
                                borderRadius: '6px',
                                border: '1px solid #2a2a2a',
                                background: '#161616',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 600,
                                letterSpacing: '0.05em',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Auto
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary box */}
            <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#0e0e0e',
                border: '1px solid #1e1e1e',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                marginBottom: '12px',
            }}>
                <SummaryRow label="Personas" value={currentComanda?.personas ?? 0} />
                <SummaryRow label="Total recibido" value={money(paymentSummary.totalRecibido || 0)} />
                <SummaryRow label="Propina" value={money(paymentSummary.propina || 0)} />
                {cambio > 0 && (
                    <SummaryRow label="Cambio" value={money(cambio)} highlight="green" />
                )}
                {pendiente > 0 && (
                    <SummaryRow label="Pendiente" value={money(pendiente)} highlight="red" />
                )}
                {pendiente <= 0 && cambio <= 0 && (
                    <SummaryRow label="Estado" value="Exacto ✓" highlight="green" />
                )}
            </div>

            {/* Confirm button */}
            <button
                type="button"
                onClick={onConfirmPayment}
                disabled={!isReady || isConfirmingPayment}
                style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '8px',
                    border: isReady ? '1px solid #2a5a3a' : '1px solid #1e1e1e',
                    background: isReady ? '#1a3a2a' : '#111',
                    color: isReady ? '#4ade80' : '#475569',
                    cursor: isReady && !isConfirmingPayment ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                    fontSize: '14px',
                    letterSpacing: '0.03em',
                    transition: 'all 0.15s',
                }}
            >
                {isConfirmingPayment ? 'Procesando...' : isReady ? '✓ Confirmar cobro' : `Faltan ${money(pendiente)}`}
            </button>
        </div>
    );
}

export default PaymentPanel;
