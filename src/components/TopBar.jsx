import { useOnlineStatus } from '../hooks/useOnlineStatus'

function TopBar({
    currentUser,
    onChangeUser,
    onReprintTicket,
    onAddCash,
    onRemoveCash,
    onInventory,
    onShiftCut,
    onCloseShift,
    onWeeklyReport,
    onUsersAdmin,
    onProductsAdmin,
    onInventoryAdmin,
    onRecipeMappingsAdmin,
}) {
    const isManagerOrAdmin =
        currentUser?.role === 'manager' || currentUser?.role === 'admin'

    const isAdmin = currentUser?.role === 'admin'
    const isOnline = useOnlineStatus()

    const baseButtonStyle = {
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid #555',
        color: 'white',
        cursor: 'pointer',
        fontWeight: 'bold',
    }

    return (
        <>
            {!isOnline && (
                <div
                    style={{
                        background: '#7a1c1c',
                        color: '#fff',
                        padding: '10px 14px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        borderBottom: '1px solid #a33a3a',
                        marginBottom: '10px',
                        borderRadius: '8px',
                    }}
                >
                    🔴 Sin conexión — usar comandas manuales. Acciones bloqueadas.
                </div>
            )}

            {isOnline && (
                <div
                    style={{
                        background: '#1f4d32',
                        color: '#d8ffe6',
                        padding: '6px 14px',
                        textAlign: 'center',
                        fontSize: '12px',
                        borderBottom: '1px solid #2e7d32',
                        marginBottom: '10px',
                        borderRadius: '8px',
                    }}
                >
                    🟢 En línea
                </div>
            )}

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginBottom: '16px',
                    padding: '12px',
                    border: '1px solid #444',
                    borderRadius: '10px',
                    background: '#181818',
                }}
            >
                <button
                    type="button"
                    onClick={onChangeUser}
                    style={{
                        ...baseButtonStyle,
                        background: '#222',
                    }}
                >
                    Cambiar usuario
                </button>

                <button
                    type="button"
                    onClick={onReprintTicket}
                    style={{
                        ...baseButtonStyle,
                        background: '#222',
                    }}
                >
                    Reimprimir ticket
                </button>

                {isManagerOrAdmin ? (
                    <>
                        <button
                            type="button"
                            onClick={onAddCash}
                            style={{
                                ...baseButtonStyle,
                                background: '#1f3a25',
                            }}
                        >
                            Depósito
                        </button>

                        <button
                            type="button"
                            onClick={onRemoveCash}
                            style={{
                                ...baseButtonStyle,
                                background: '#3a1f1f',
                            }}
                        >
                            Retiro
                        </button>

                        <button
                            type="button"
                            onClick={onWeeklyReport}
                            style={{
                                ...baseButtonStyle,
                                background: '#222',
                            }}
                        >
                            Reporte semanal
                        </button>

                        <button
                            type="button"
                            onClick={onInventory}
                            style={{
                                ...baseButtonStyle,
                                background: '#222',
                            }}
                        >
                            Inventario
                        </button>

                        <button
                            type="button"
                            onClick={onShiftCut}
                            style={{
                                ...baseButtonStyle,
                                background: '#222',
                            }}
                        >
                            Corte
                        </button>
                    </>
                ) : null}

                {isAdmin ? (
                    <>
                        <button
                            type="button"
                            onClick={onUsersAdmin}
                            style={{
                                ...baseButtonStyle,
                                background: '#1d3557',
                            }}
                        >
                            Usuarios
                        </button>

                        <button
                            type="button"
                            onClick={onProductsAdmin}
                            style={{
                                ...baseButtonStyle,
                                background: '#3d2c1d',
                            }}
                        >
                            Productos
                        </button>

                        <button
                            type="button"
                            onClick={onInventoryAdmin}
                            style={{
                                ...baseButtonStyle,
                                background: '#2e7d32',
                            }}
                        >
                            Inventario Admin
                        </button>
                        <button
                            type="button"
                            onClick={onRecipeMappingsAdmin}
                            style={{
                                ...baseButtonStyle,
                                background: '#5a3d1e',
                            }}
                        >
                            Recetas
                        </button>
                        <button
                            type="button"
                            onClick={onCloseShift}
                            style={{
                                ...baseButtonStyle,
                                background: '#4a2616',
                            }}
                        >
                            Cerrar turno
                        </button>
                    </>
                ) : null}
            </div>
        </>
    )
}

export default TopBar