import { useEffect, useMemo, useState } from 'react'
import { useStatus } from '../hooks/useStatus'
import { Link, useNavigate } from 'react-router-dom'
import { getActiveUsers } from '../services/users'
import { loginWithPin, getOpenShift, createShift } from '../services/auth'
import { useAuthStore } from '../store/authStore'
import CashCounter from '../components/CashCounter'
import logo from '../assets/logo.png'

// Llave temporal del conteo de apertura (aún no hay shiftId). Se migra a
// `cash-counter-${shiftId}` al crear el turno para que el corte muestre lo mismo.
const OPENING_COUNT_ID = 'opening'

const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: '7px',
    border: '1px solid #2a2a2a',
    background: '#0e0e0e',
    color: '#e2e2e2',
    boxSizing: 'border-box',
    outline: 'none',
}

const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
}

function LoginPage() {
    const navigate = useNavigate()
    const setAuth = useAuthStore(state => state.setAuth)

    // Phase: 'login' → user/PIN form  |  'new_shift' → starting cash form
    const [phase, setPhase] = useState('login')
    const { status, statusColor, setStatus } = useStatus('Loading users...')
    const [users, setUsers] = useState([])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [pin, setPin] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Held after PIN validates while we wait for shift creation
    const [validatedUser, setValidatedUser] = useState(null)
    const [startingCash, setStartingCash] = useState('')
    // true = el usuario tecleó el fondo a mano → la calculadora deja de autollenar.
    const [startingCashManual, setStartingCashManual] = useState(false)
    const [counterOpen, setCounterOpen] = useState(false)

    useEffect(() => {
        async function loadUsers() {
            const { data, error } = await getActiveUsers()
            if (error) {
                setStatus(`Error cargando usuarios: ${error.message}`)
                return
            }
            const loadedUsers = data || []
            setUsers(loadedUsers)
            if (loadedUsers.length === 0) {
                setStatus('Sin usuarios activos.')
                return
            }
            setStatus('Users loaded successfully.')
            setSelectedUserId(loadedUsers[0].id)
        }
        loadUsers()
    }, [])

    const selectedUser = useMemo(
        () => users.find(u => u.id === selectedUserId) || null,
        [users, selectedUserId]
    )

    function handlePinChange(e) {
        setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
    }

    function handleCashChange(e) {
        // Allow digits and one decimal point
        const val = e.target.value.replace(/[^0-9.]/g, '')
        setStartingCash(val)
        setStartingCashManual(true) // edición manual: la calculadora ya no sobrescribe
    }

    // Total en vivo de la calculadora de apertura. Autollena el fondo solo si el
    // usuario no lo ha escrito a mano (patrón override manual).
    function handleCounterTotal(total) {
        if (startingCashManual) return
        setStartingCash(total > 0 ? String(total) : '')
    }

    // Step 1: validate PIN and check for existing shift
    async function handleLoginSubmit(e) {
        e.preventDefault()
        if (!selectedUserId || pin.length !== 6 || isSubmitting) return

        setIsSubmitting(true)
        setStatus('')

        const { data: user, error: loginError } = await loginWithPin({ userId: selectedUserId, pin })

        if (loginError || !user) {
            setStatus('PIN incorrecto')
            setPin('')
            setIsSubmitting(false)
            return
        }

        const { data: existingShift, error: shiftError } = await getOpenShift()

        if (shiftError) {
            setStatus(`Error verificando turno: ${shiftError.message}`)
            setPin('')
            setIsSubmitting(false)
            return
        }

        if (existingShift && existingShift.length > 0) {
            // Shift already open — go straight in
            setAuth(user, existingShift[0].id)
            navigate('/pos')
            return
        }

        // No open shift — ask for starting cash
        setValidatedUser(user)
        setPin('')
        setIsSubmitting(false)
        setPhase('new_shift')
    }

    // Step 2: create the shift with starting cash
    async function handleShiftSubmit(e) {
        e.preventDefault()
        const amount = Number(startingCash)
        if (!startingCash.trim() || isNaN(amount) || amount < 0) {
            setStatus('Ingresa un monto válido.')
            return
        }

        setIsSubmitting(true)
        setStatus('')

        const { data: newShift, error: createShiftError } = await createShift({
            startingCash: amount,
            userId: validatedUser.id,
        })

        if (createShiftError || !newShift) {
            // Code 23505 = unique constraint violation → another device already opened a shift
            const isAlreadyOpen = createShiftError?.code === '23505'
            setStatus(
                isAlreadyOpen
                    ? 'Ya hay un turno abierto en otra terminal. Recarga la página para cargarlo.'
                    : 'Error abriendo turno. Intenta de nuevo.'
            )
            setIsSubmitting(false)
            return
        }

        // Migrar el conteo de apertura al turno recién creado, para que la
        // calculadora del corte/cierre cargue la misma información de referencia.
        try {
            const opening = localStorage.getItem(`cash-counter-${OPENING_COUNT_ID}`)
            if (opening != null) {
                localStorage.setItem(`cash-counter-${newShift.id}`, opening)
                localStorage.removeItem(`cash-counter-${OPENING_COUNT_ID}`)
            }
        } catch { /* localStorage no disponible: no bloquea la apertura */ }

        setAuth(validatedUser, newShift.id)
        navigate('/pos')
    }

    // ── Shared card wrapper ───────────────────────────────────────────────
    return (
        <div style={{
            minHeight: '100vh',
            background: '#0e0e0e',
            color: '#e2e2e2',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '80px',
            paddingLeft: '20px',
            paddingRight: '20px',
            boxSizing: 'border-box',
        }}>
            <div style={{
                width: '100%',
                maxWidth: '480px',
                padding: '28px 28px 32px',
                background: '#141414',
                border: '1px solid #242424',
                borderRadius: '14px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}>

                {/* Wordmark */}
                <div style={{ marginBottom: '28px', textAlign: 'center' }}>
                    <img
                        src={logo}
                        alt="Continental Cantina Bar"
                        style={{ width: '220px', display: 'block', margin: '0 auto 10px' }}
                    />
                    <p style={{ margin: 0, fontSize: '11px', color: '#444', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        Sistema de punto de venta
                    </p>
                    <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#555', userSelect: 'none' }}>
                        v{__APP_VERSION__}
                    </p>
                </div>

                {/* Error / status */}
                {status && status !== 'Users loaded successfully.' && (
                    <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: statusColor, textAlign: 'center' }}>
                        {status}
                    </p>
                )}

                {/* ── Phase: login ── */}
                {phase === 'login' && (
                    users.length === 0 ? (
                        <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid #2a2a2a', background: '#111' }}>
                            <p style={{ marginTop: 0, fontSize: '14px', color: '#888' }}>
                                No hay usuarios activos. Configura el admin primero.
                            </p>
                            <Link
                                to="/setup-admin"
                                style={{
                                    display: 'inline-block',
                                    marginTop: '8px',
                                    padding: '10px 14px',
                                    borderRadius: '7px',
                                    background: '#1a3a2a',
                                    color: '#4ade80',
                                    textDecoration: 'none',
                                    fontWeight: '600',
                                    fontSize: '13px',
                                    border: '1px solid #2a5a3a',
                                }}
                            >
                                Ir a configuración inicial
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleLoginSubmit}>
                            <h2 style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Seleccionar usuario
                            </h2>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                                {users.map(user => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => setSelectedUserId(user.id)}
                                        style={{
                                            padding: '9px 14px',
                                            borderRadius: '7px',
                                            border: user.id === selectedUserId ? '1px solid #3a5a8a' : '1px solid #2a2a2a',
                                            background: user.id === selectedUserId ? '#1a2e47' : '#1e1e1e',
                                            color: user.id === selectedUserId ? '#93c5fd' : '#aaa',
                                            fontWeight: user.id === selectedUserId ? '600' : '400',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                        }}
                                    >
                                        {user.name}
                                    </button>
                                ))}
                            </div>

                            <label htmlFor="pin" style={labelStyle}>PIN</label>
                            <input
                                id="pin"
                                type="password"
                                inputMode="numeric"
                                autoComplete="off"
                                value={pin}
                                onChange={handlePinChange}
                                placeholder="••••••"
                                style={{ ...inputStyle, fontSize: '18px', letterSpacing: '0.3em' }}
                            />

                            {selectedUser && (
                                <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#555', textAlign: 'center' }}>
                                    {selectedUser.name}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={!selectedUserId || pin.length !== 6 || isSubmitting}
                                style={{
                                    width: '100%',
                                    marginTop: '20px',
                                    padding: '12px',
                                    borderRadius: '7px',
                                    border: '1px solid',
                                    borderColor: !selectedUserId || pin.length !== 6 || isSubmitting ? '#222' : '#2a5a3a',
                                    background: !selectedUserId || pin.length !== 6 || isSubmitting ? '#1e1e1e' : '#1a3a2a',
                                    color: !selectedUserId || pin.length !== 6 || isSubmitting ? '#444' : '#4ade80',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    cursor: !selectedUserId || pin.length !== 6 || isSubmitting ? 'default' : 'pointer',
                                }}
                            >
                                {isSubmitting ? 'Verificando...' : 'Ingresar'}
                            </button>
                        </form>
                    )
                )}

                {/* ── Phase: new shift ── */}
                {phase === 'new_shift' && (
                    <form onSubmit={handleShiftSubmit}>
                        <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '8px', background: '#1a2e47', border: '1px solid #1e3a5a' }}>
                            <p style={{ margin: 0, fontSize: '13px', color: '#93c5fd' }}>
                                Bienvenido, <strong>{validatedUser?.name}</strong> — no hay turno abierto.
                            </p>
                        </div>

                        <label htmlFor="startingCash" style={labelStyle}>
                            Efectivo inicial de caja
                        </label>
                        <input
                            id="startingCash"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            autoFocus
                            value={startingCash}
                            onChange={handleCashChange}
                            placeholder="0.00"
                            style={{ ...inputStyle, fontSize: '22px', fontWeight: '600' }}
                        />
                        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#444' }}>
                            Cuenta el efectivo en caja. Usa la calculadora para sumar por denominación; el total llena el fondo.
                        </p>

                        <button
                            type="button"
                            onClick={() => setCounterOpen(true)}
                            style={{
                                width: '100%',
                                marginTop: '12px',
                                padding: '11px',
                                borderRadius: '7px',
                                border: '1px solid #2a3a4a',
                                background: '#16202c',
                                color: '#93c5fd',
                                fontWeight: '600',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            🧮 Contar efectivo
                        </button>

                        <button
                            type="submit"
                            disabled={!startingCash.trim() || isSubmitting}
                            style={{
                                width: '100%',
                                marginTop: '20px',
                                padding: '12px',
                                borderRadius: '7px',
                                border: '1px solid',
                                borderColor: !startingCash.trim() || isSubmitting ? '#222' : '#2a5a3a',
                                background: !startingCash.trim() || isSubmitting ? '#1e1e1e' : '#1a3a2a',
                                color: !startingCash.trim() || isSubmitting ? '#444' : '#4ade80',
                                fontWeight: '600',
                                fontSize: '14px',
                                cursor: !startingCash.trim() || isSubmitting ? 'default' : 'pointer',
                            }}
                        >
                            {isSubmitting ? 'Abriendo turno...' : 'Abrir turno'}
                        </button>

                        <button
                            type="button"
                            onClick={() => { setPhase('login'); setStatus(''); setValidatedUser(null) }}
                            style={{
                                width: '100%',
                                marginTop: '10px',
                                padding: '10px',
                                borderRadius: '7px',
                                border: '1px solid #222',
                                background: 'transparent',
                                color: '#555',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            ← Volver
                        </button>

                        {validatedUser?.role === 'admin' && (
                            <button
                                type="button"
                                onClick={() => {
                                    setAuth(validatedUser, null)
                                    navigate('/dashboard')
                                }}
                                style={{
                                    width: '100%',
                                    marginTop: '10px',
                                    padding: '10px',
                                    borderRadius: '7px',
                                    border: '1px solid #2a3a2a',
                                    background: 'transparent',
                                    color: '#4ade80',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                }}
                            >
                                → Entrar solo al panel de admin
                            </button>
                        )}
                    </form>
                )}

            </div>

            {/* ── Modal: calculadora de denominaciones (apertura) ── */}
            {phase === 'new_shift' && counterOpen && (
                <div
                    onClick={() => setCounterOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, padding: '20px',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#1a1a1a', border: '1px solid #333', borderRadius: '16px',
                            padding: '24px', width: '100%', maxWidth: '500px',
                            maxHeight: '90vh', overflowY: 'auto',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '18px' }}>🧮 Contar efectivo de caja</h2>
                            <button
                                type="button"
                                onClick={() => setCounterOpen(false)}
                                style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
                            >
                                ✕
                            </button>
                        </div>

                        <CashCounter storageId={OPENING_COUNT_ID} onTotalChange={handleCounterTotal} />

                        <button
                            type="button"
                            onClick={() => setCounterOpen(false)}
                            style={{ width: '100%', marginTop: '16px', padding: '11px', borderRadius: '8px', border: '1px solid #2a5a3a', background: '#1a3a2a', color: '#4ade80', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                        >
                            Usar total y volver
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default LoginPage
