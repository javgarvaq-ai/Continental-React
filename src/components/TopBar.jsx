import { useNavigate } from 'react-router-dom'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

function TopBar({
    currentUser,
    onChangeUser,
    onReprintTicket,
    onCashMovement,
    onShiftPanel,
    onInventory,
    onWeeklyReport,
    onSchedule,
}) {
    const navigate = useNavigate()
    const isManagerOrAdmin =
        currentUser?.role === 'manager' || currentUser?.role === 'admin'
    const isAdmin = currentUser?.role === 'admin'
    const isOnline = useOnlineStatus()

    const btn = {
        padding: '8px 14px',
        borderRadius: '6px',
        border: '1px solid #2e2e2e',
        background: '#1a1a1a',
        color: '#d0d0d0',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '500',
        whiteSpace: 'nowrap',
    }

    return (
        <>
            {!isOnline && (
                <div style={{
                    background: '#3b0f0f',
                    color: '#fca5a5',
                    padding: '8px 14px',
                    textAlign: 'center',
                    fontSize: '13px',
                    fontWeight: '600',
                    borderRadius: '6px',
                    border: '1px solid #7f1d1d',
                    marginBottom: '10px',
                }}>
                    Sin conexión — usar comandas manuales. Acciones bloqueadas.
                </div>
            )}

            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
                padding: '10px 12px',
                border: '1px solid #222',
                borderRadius: '8px',
                background: '#121212',
            }}>
                {/* Online indicator */}
                <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '12px',
                    color: isOnline ? '#4ade80' : '#f87171',
                    marginRight: '4px',
                    userSelect: 'none',
                }}>
                    <span style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: isOnline ? '#4ade80' : '#f87171',
                        display: 'inline-block',
                    }} />
                    {isOnline ? 'En línea' : 'Sin conexión'}
                </span>

                <div style={{ width: '1px', height: '18px', background: '#2a2a2a', margin: '0 2px' }} />

                <button type="button" onClick={onChangeUser} style={btn}>
                    Cambiar usuario
                </button>

                <button type="button" onClick={onReprintTicket} style={btn}>
                    Reimprimir ticket
                </button>

                <button type="button" onClick={onSchedule} style={btn}>
                    Horario
                </button>

                {isManagerOrAdmin && (
                    <>
                        <button type="button" onClick={onCashMovement} style={btn}>
                            Movimiento de caja
                        </button>

                        <button type="button" onClick={onWeeklyReport} style={btn}>
                            Reporte semanal
                        </button>

                        <button type="button" onClick={onInventory} style={btn}>
                            Inventario
                        </button>

                        <button type="button" onClick={onShiftPanel} style={{
                            ...btn,
                            border: '1px solid #3d2a1a',
                            color: '#fb923c',
                        }}>
                            Corte / Cierre
                        </button>
                    </>
                )}

                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => navigate('/admin/users')}
                        style={{
                            ...btn,
                            border: '1px solid #1e3050',
                            color: '#60a5fa',
                        }}
                    >
                        Admin
                    </button>
                )}
            </div>
        </>
    )
}

export default TopBar
