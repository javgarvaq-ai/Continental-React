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
}) {
    const navigate = useNavigate()
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
                <div style={{ background: '#7a1c1c', color: '#fff', padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid #a33a3a', marginBottom: '10px', borderRadius: '8px' }}>
                    🔴 Sin conexión — usar comandas manuales. Acciones bloqueadas.
                </div>
            )}

            {isOnline && (
                <div style={{ background: '#1f4d32', color: '#d8ffe6', padding: '6px 14px', textAlign: 'center', fontSize: '12px', borderBottom: '1px solid #2e7d32', marginBottom: '10px', borderRadius: '8px' }}>
                    🟢 En línea
                </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', padding: '12px', border: '1px solid #444', borderRadius: '10px', background: '#181818' }}>

                <button type="button" onClick={onChangeUser} style={{ ...baseButtonStyle, background: '#222' }}>
                    Cambiar usuario
                </button>

                <button type="button" onClick={onReprintTicket} style={{ ...baseButtonStyle, background: '#222' }}>
                    Reimprimir ticket
                </button>

                {isManagerOrAdmin && (
                    <>
                        <button type="button" onClick={onCashMovement} style={{ ...baseButtonStyle, background: '#2a2a2a' }}>
                            Movimiento de caja
                        </button>

                        <button type="button" onClick={onWeeklyReport} style={{ ...baseButtonStyle, background: '#222' }}>
                            Reporte semanal
                        </button>

                        <button type="button" onClick={onInventory} style={{ ...baseButtonStyle, background: '#222' }}>
                            Inventario
                        </button>

                        <button type="button" onClick={onShiftPanel} style={{ ...baseButtonStyle, background: '#2a1f1f' }}>
                            Corte / Cierre
                        </button>
                    </>
                )}

                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => navigate('/admin/users')}
                        style={{ ...baseButtonStyle, background: '#1d3557' }}
                    >
                        Admin
                    </button>
                )}
            </div>
        </>
    )
}

export default TopBar