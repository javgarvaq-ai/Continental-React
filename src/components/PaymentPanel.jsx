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

    return (
        <div
            style={{
                marginTop: '18px',
                paddingTop: '16px',
                borderTop: '1px solid #444',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
            }}
        >
            <h3 style={{ margin: 0 }}>Cobro</h3>

            <div>
                <label style={{ display: 'block', marginBottom: '6px' }}>
                    Efectivo
                </label>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentData.efectivo}
                    onChange={(e) => onPaymentFieldChange('efectivo', e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #444',
                        background: '#222',
                        color: 'white',
                    }}
                />
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '6px' }}>
                    Tarjeta
                </label>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentData.tarjeta}
                    onChange={(e) => onPaymentFieldChange('tarjeta', e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #444',
                        background: '#222',
                        color: 'white',
                    }}
                />
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '6px' }}>
                    Transferencia
                </label>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentData.transferencia}
                    onChange={(e) => onPaymentFieldChange('transferencia', e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #444',
                        background: '#222',
                        color: 'white',
                    }}
                />
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '6px' }}>
                    Propina
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={propinaFieldValue}
                        onChange={(e) => onPaymentFieldChange('propina', e.target.value)}
                        style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #444',
                            background: '#222',
                            color: 'white',
                        }}
                    />
                    <button
                        type="button"
                        onClick={onResetAutoTip}
                        style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #444',
                            background: '#222',
                            color: 'white',
                            cursor: 'pointer',
                        }}
                    >
                        Auto
                    </button>
                </div>
            </div>

            <div
                style={{
                    marginTop: '6px',
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#181818',
                    border: '1px solid #333',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                }}
            >
                <div>Personas: {currentComanda?.personas ?? 0}</div>
                <div>Total recibido: ${Number(paymentSummary.totalRecibido || 0).toFixed(2)}</div>
                <div>Propina: ${Number(paymentSummary.propina || 0).toFixed(2)}</div>
                <div>Cambio: ${Number(paymentSummary.cambio || 0).toFixed(2)}</div>
                <div>Pendiente: ${Number(paymentSummary.pendiente || 0).toFixed(2)}</div>
            </div>

            <button
                type="button"
                onClick={onConfirmPayment}
                disabled={paymentSummary.pendiente > 0 || isConfirmingPayment}
                style={{
                    marginTop: '6px',
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background:
                        paymentSummary.pendiente > 0
                            ? '#666'
                            : '#2e7d32',
                    color: 'white',
                    cursor:
                        paymentSummary.pendiente > 0
                            ? 'not-allowed'
                            : 'pointer',
                    fontWeight: 'bold',
                    fontSize: '16px',
                }}
            >
                Confirmar Cobro
            </button>
        </div>
    );
}

export default PaymentPanel;