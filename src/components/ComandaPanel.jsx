import PaymentPanel from './PaymentPanel';
import { money } from '../utils/money';

const STATUS_LABEL = {
    open: { label: 'Abierta', color: '#60a5fa' },
    pending_payment: { label: 'Cuenta presentada', color: '#fb923c' },
    processing_payment: { label: 'Cobrando', color: '#a78bfa' },
}

function ComandaPanel({
    currentComanda,
    visibleCartItems,
    isChangingCart,
    isAddingProduct,
    shotSelectorState,
    displayedTotal,
    isUpdatingComandaStatus,
    currentUser,
    isConfirmingPayment,
    paymentData,
    propinaFieldValue,
    paymentSummary,
    onDecreaseCartItem,
    onIncreaseCartItem,
    onPresentBill,
    onReopenComanda,
    onCancelMesa,
    cancelConfirming,
    onStartPayment,
    onPaymentFieldChange,
    onResetAutoTip,
    onConfirmPayment,
}) {
    const statusInfo = STATUS_LABEL[currentComanda?.status] || null

    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
            }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Comanda
                </span>
                {statusInfo && (
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: `${statusInfo.color}18`,
                        color: statusInfo.color,
                        border: `1px solid ${statusInfo.color}30`,
                    }}>
                        {statusInfo.label}
                    </span>
                )}
            </div>

            {/* Cart items */}
            {visibleCartItems.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '16px 0' }}>Sin productos.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {visibleCartItems.map((item) => (
                        <div
                            key={item.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 0',
                                borderBottom: '1px solid #1a1a1a',
                            }}
                        >
                            {/* Product info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e2e2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.products?.name || 'Producto'}
                                </div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>
                                    {item.quantity} × {money(item.unit_price)}
                                    <span style={{ color: '#64748b', marginLeft: '6px' }}>
                                        = {money(Number(item.quantity || 0) * Number(item.unit_price || 0))}
                                    </span>
                                </div>
                            </div>

                            {/* +/- controls */}
                            {currentComanda?.status === 'open' ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => onDecreaseCartItem(item)}
                                        disabled={isChangingCart || isAddingProduct || shotSelectorState.open}
                                        title={item.quantity <= 1 ? 'Eliminar producto' : 'Disminuir'}
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '5px',
                                            border: item.quantity <= 1 ? '1px solid #4a1a1a' : '1px solid #2a2a2a',
                                            background: item.quantity <= 1 ? '#2a1010' : '#111',
                                            color: item.quantity <= 1 ? '#f87171' : '#777',
                                            cursor: 'pointer',
                                            fontSize: item.quantity <= 1 ? '13px' : '16px',
                                            lineHeight: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {item.quantity <= 1 ? '✕' : '−'}
                                    </button>
                                    <span style={{ minWidth: '20px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#ccc' }}>
                                        {item.quantity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onIncreaseCartItem(item)}
                                        disabled={isChangingCart || isAddingProduct || shotSelectorState.open}
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '5px',
                                            border: '1px solid #2a2a2a',
                                            background: '#111',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            fontSize: '16px',
                                            lineHeight: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        +
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            {/* Total */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #222',
            }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
                <span style={{ fontSize: '22px', fontWeight: 700, color: '#e2e2e2', letterSpacing: '-0.5px' }}>
                    {money(displayedTotal)}
                </span>
            </div>

            {/* Action buttons */}
            <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>

                {currentComanda?.status === 'open' && displayedTotal > 0 && (
                    <button
                        type="button"
                        onClick={onPresentBill}
                        disabled={isUpdatingComandaStatus || shotSelectorState.open}
                        style={{
                            padding: '10px 16px',
                            borderRadius: '7px',
                            border: '1px solid #1e3a5a',
                            background: '#1a2e47',
                            color: '#93c5fd',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '13px',
                        }}
                    >
                        Presentar cuenta
                    </button>
                )}

                {currentComanda?.status === 'open' && (
                    <button
                        type="button"
                        onClick={onCancelMesa}
                        disabled={isUpdatingComandaStatus}
                        style={{
                            padding: '10px 14px',
                            borderRadius: '7px',
                            border: cancelConfirming ? '1px solid #ef4444' : '1px solid #2a1a1a',
                            background: cancelConfirming ? '#3d1a1a' : 'transparent',
                            color: cancelConfirming ? '#ef4444' : '#7f1d1d',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '13px',
                            transition: 'all 0.15s',
                        }}
                    >
                        {cancelConfirming ? '¿Confirmar cancelación?' : 'Cancelar mesa'}
                    </button>
                )}

                {currentComanda?.status === 'pending_payment' && (
                    <>
                        <button
                            type="button"
                            onClick={onReopenComanda}
                            disabled={isUpdatingComandaStatus}
                            style={{
                                padding: '10px 14px',
                                borderRadius: '7px',
                                border: '1px solid #2a2a2a',
                                background: 'transparent',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '13px',
                            }}
                        >
                            ← Reabrir
                        </button>

                        <button
                            type="button"
                            onClick={onStartPayment}
                            disabled={isUpdatingComandaStatus}
                            style={{
                                padding: '10px 18px',
                                borderRadius: '7px',
                                border: '1px solid #2a5a3a',
                                background: '#1a3a2a',
                                color: '#4ade80',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '13px',
                            }}
                        >
                            Cobrar
                        </button>
                    </>
                )}

                {currentComanda?.status === 'processing_payment' &&
                    (currentUser?.role === 'manager' || currentUser?.role === 'admin') && (
                    <button
                        type="button"
                        onClick={onReopenComanda}
                        disabled={isUpdatingComandaStatus || isConfirmingPayment}
                        style={{
                            padding: '10px 14px',
                            borderRadius: '7px',
                            border: '1px solid #2a2a2a',
                            background: 'transparent',
                            color: '#666',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '13px',
                        }}
                    >
                        ← Reabrir
                    </button>
                )}
            </div>

            <PaymentPanel
                currentComanda={currentComanda}
                paymentData={paymentData}
                propinaFieldValue={propinaFieldValue}
                paymentSummary={paymentSummary}
                isConfirmingPayment={isConfirmingPayment}
                onPaymentFieldChange={onPaymentFieldChange}
                onResetAutoTip={onResetAutoTip}
                onConfirmPayment={onConfirmPayment}
            />
        </section>
    );
}

export default ComandaPanel;
