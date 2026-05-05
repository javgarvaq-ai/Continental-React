import PaymentPanel from './PaymentPanel';
import { money } from '../utils/money';

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
    onStartPayment,
    onPaymentFieldChange,
    onResetAutoTip,
    onConfirmPayment,
}) {
    return (
        <section
            style={{
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '16px',
            }}
        >
            <h2>Comanda</h2>

            {visibleCartItems.length === 0 ? (
                <p>Sin productos.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {visibleCartItems.map((item) => (
                        <div
                            key={item.id}
                            style={{
                                borderBottom: '1px solid #333',
                                paddingBottom: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '12px',
                                alignItems: 'center',
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold' }}>
                                    {item.products?.name || 'Producto'}
                                </div>

                                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                                    {item.quantity} x {money(item.unit_price)} ={' '}
                                    {money(
                                        Number(item.quantity || 0) *
                                        Number(item.unit_price || 0)
                                    )}
                                </div>
                            </div>

                            {currentComanda?.status === 'open' ? (
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: '8px',
                                        alignItems: 'center',
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => onDecreaseCartItem(item)}
                                        disabled={isChangingCart || isAddingProduct || shotSelectorState.open}
                                        style={{
                                            width: '34px',
                                            height: '34px',
                                            borderRadius: '6px',
                                            border: '1px solid #444',
                                            background: '#222',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        -
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onIncreaseCartItem(item)}
                                        disabled={isChangingCart || isAddingProduct || shotSelectorState.open}
                                        style={{
                                            width: '34px',
                                            height: '34px',
                                            borderRadius: '6px',
                                            border: '1px solid #444',
                                            background: '#222',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            fontWeight: 'bold',
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

            <div
                style={{
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid #444',
                    fontSize: '20px',
                    fontWeight: 'bold',
                }}
            >
                Total: {money(displayedTotal)}
            </div>

            <div
                style={{
                    marginTop: '16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                }}
            >
                {currentComanda?.status === 'open' && displayedTotal > 0 ? (
                    <button
                        type="button"
                        onClick={onPresentBill}
                        disabled={isUpdatingComandaStatus || shotSelectorState.open}
                        style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#1565c0',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                        }}
                    >
                        Cuenta
                    </button>
                ) : null}
                {currentComanda?.status === 'open' ? (
                    <button
                        type="button"
                        onClick={onCancelMesa}
                        disabled={isUpdatingComandaStatus}
                        style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: '1px solid #c62828',
                            background: 'transparent',
                            color: '#ef9a9a',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                        }}
                    >
                        Cancelar Mesa
                    </button>
                ) : null}

                {currentComanda?.status === 'pending_payment' ? (
                    <>
                        <button
                            type="button"
                            onClick={onReopenComanda}
                            disabled={isUpdatingComandaStatus}
                            style={{
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: '1px solid #555',
                                background: '#222',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                            }}
                        >
                            Reabrir
                        </button>

                        <button
                            type="button"
                            onClick={onStartPayment}
                            disabled={isUpdatingComandaStatus}
                            style={{
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#2e7d32',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                            }}
                        >
                            Cobrar
                        </button>
                    </>
                ) : null}

                {currentComanda?.status === 'processing_payment' &&
                    (currentUser?.role === 'manager' || currentUser?.role === 'admin') ? (
                    <button
                        type="button"
                        onClick={onReopenComanda}
                        disabled={isUpdatingComandaStatus || isConfirmingPayment}
                        style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: '1px solid #555',
                            background: '#222',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                        }}
                    >
                        Reabrir
                    </button>
                ) : null}
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