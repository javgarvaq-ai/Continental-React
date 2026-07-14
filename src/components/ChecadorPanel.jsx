import { useState, useEffect, useCallback } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { requireOnline } from '../utils/requireOnline'
import { getMyEmployeeStatus, clockSelf } from '../services/employeesAdmin'

function formatTime(isoStr) {
    if (!isoStr) return ''
    return new Date(isoStr).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
}

function formatDuration(inIso, outIso) {
    if (!inIso || !outIso) return null
    const mins = Math.round((new Date(outIso) - new Date(inIso)) / 60000)
    if (mins < 60) return `${mins} min`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/**
 * Checador por sesión: registra entrada/salida SOLO del usuario logueado.
 * La identidad la garantiza Supabase Auth — otro empleado debe cambiar de
 * usuario para checar. El write pasa por el RPC clock_self() (toggle atómico).
 */
function ChecadorPanel({ open, onClose, currentUser }) {
    const isOnline = useOnlineStatus()

    const [loading, setLoading] = useState(true)
    const [me, setMe] = useState(null)              // { id, name, isCheckedIn, checkedInAt } | null
    const [status, setStatus] = useState('')
    const [statusColor, setStatusColor] = useState('#888')
    const [armed, setArmed] = useState(false)       // confirmación (patrón doble-click)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [lastResult, setLastResult] = useState(null) // { action, at, checkedInAt }

    const load = useCallback(async () => {
        if (!currentUser?.id) { setLoading(false); return }
        setLoading(true)
        const { data, error } = await getMyEmployeeStatus({ userId: currentUser.id })
        if (error) {
            setStatus('Error cargando tu estado. Intenta de nuevo.')
            setStatusColor('#f87171')
        }
        setMe(data)
        setLoading(false)
    }, [currentUser?.id])

    useEffect(() => {
        if (!open) return
        setStatus('')
        setArmed(false)
        setLastResult(null)
        load()
    }, [open, load])

    // Desarmar confirmación a los 3s (mismo patrón que el resto del proyecto)
    useEffect(() => {
        if (!armed) return
        const t = setTimeout(() => setArmed(false), 3000)
        return () => clearTimeout(t)
    }, [armed])

    async function handleClock() {
        if (!requireOnline(isOnline, msg => { setStatus(msg); setStatusColor('#f87171') })) return
        if (isSubmitting) return

        if (!armed) {
            setArmed(true)
            return
        }

        setArmed(false)
        setIsSubmitting(true)
        const { data, error } = await clockSelf()
        if (error) {
            setStatus(error.message)
            setStatusColor('#f87171')
            setIsSubmitting(false)
            await load()
            return
        }

        setLastResult(data)
        setStatus(
            data.action === 'in'
                ? `Entrada registrada a las ${formatTime(data.at)}.`
                : `Salida registrada a las ${formatTime(data.at)}.`
        )
        setStatusColor('#4ade80')
        setIsSubmitting(false)
        await load()
    }

    if (!open) return null

    const isCheckedIn = me?.isCheckedIn
    const workedNow = lastResult?.action === 'out'
        ? formatDuration(lastResult.checkedInAt, lastResult.at)
        : null

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
                    <div>
                        <h3 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: 700, color: '#e8e8e8' }}>
                            Checador
                        </h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>
                            Registra entrada/salida de {currentUser?.name || 'tu usuario'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #2a2a2a', background: 'transparent', color: '#555', cursor: 'pointer', fontSize: '14px' }}
                    >
                        ✕
                    </button>
                </div>

                {loading ? (
                    <p style={{ color: '#444', fontSize: '13px', margin: 0 }}>Cargando...</p>
                ) : !me ? (
                    <p style={{ color: '#fb923c', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
                        Tu usuario no está ligado a un empleado activo.
                        Pide al admin que te ligue en la pantalla de Empleados.
                    </p>
                ) : (
                    <>
                        {/* Estado actual */}
                        <div style={{
                            padding: '14px',
                            borderRadius: '8px',
                            background: isCheckedIn ? '#0e1e0e' : '#0e0e0e',
                            border: `1px solid ${isCheckedIn ? '#2a5a3a' : '#1e1e1e'}`,
                            marginBottom: '14px',
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e2e2', marginBottom: '4px' }}>
                                {me.name}
                            </div>
                            <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: isCheckedIn ? '#4ade801a' : '#1e1e1e',
                                color: isCheckedIn ? '#4ade80' : '#666',
                                fontSize: '11px',
                                fontWeight: 600,
                                letterSpacing: '0.04em',
                            }}>
                                {isCheckedIn ? 'En turno' : 'Fuera'}
                            </span>
                            {isCheckedIn && me.checkedInAt && (
                                <div style={{ fontSize: '12px', color: '#555', marginTop: '6px' }}>
                                    Entrada: {formatTime(me.checkedInAt)}
                                </div>
                            )}
                        </div>

                        {/* Status */}
                        {status && (
                            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: statusColor }}>
                                {status}{workedNow ? ` Trabajaste ${workedNow}.` : ''}
                            </p>
                        )}

                        {/* Botón checar (doble-confirmación) */}
                        <button
                            type="button"
                            onClick={handleClock}
                            disabled={isSubmitting}
                            style={{
                                width: '100%',
                                padding: '12px 0',
                                borderRadius: '8px',
                                border: armed
                                    ? '1px solid #ef4444'
                                    : isCheckedIn ? '1px solid #3d2a1a' : '1px solid #2a5a3a',
                                background: armed
                                    ? '#3d1a1a'
                                    : isCheckedIn ? '#2a1a0e' : '#1a3a2a',
                                color: armed
                                    ? '#ef4444'
                                    : isCheckedIn ? '#fb923c' : '#4ade80',
                                fontSize: '15px',
                                fontWeight: 700,
                                cursor: isSubmitting ? 'default' : 'pointer',
                                opacity: isSubmitting ? 0.5 : 1,
                                transition: 'all 0.15s',
                            }}
                        >
                            {isSubmitting
                                ? 'Registrando...'
                                : armed
                                    ? `¿Confirmar ${isCheckedIn ? 'salida' : 'entrada'}?`
                                    : isCheckedIn ? 'Registrar salida' : 'Registrar entrada'}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

export default ChecadorPanel
