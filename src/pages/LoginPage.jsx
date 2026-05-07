import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getActiveUsers } from '../services/users'
import { loginWithPin, getOpenShift, createShift } from '../services/auth'
import { useAuthStore } from '../store/authStore'

function LoginPage() {
    const navigate = useNavigate()
    const setAuth = useAuthStore(state => state.setAuth)

    const [status, setStatus] = useState('Loading users...')
    const [users, setUsers] = useState([])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [pin, setPin] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        async function loadUsers() {
            const { data, error } = await getActiveUsers()

            if (error) {
                setStatus(`Error loading users: ${error.message}`)
                return
            }

            const loadedUsers = data || []
            setUsers(loadedUsers)

            if (loadedUsers.length === 0) {
                setStatus('No active users found.')
                return
            }

            setStatus('Users loaded successfully.')

            if (loadedUsers.length > 0) {
                setSelectedUserId(loadedUsers[0].id)
            }
        }

        loadUsers()
    }, [])

    const selectedUser = useMemo(() => {
        return users.find((user) => user.id === selectedUserId) || null
    }, [users, selectedUserId])

    function handlePinChange(event) {
        const numericValue = event.target.value.replace(/\D/g, '').slice(0, 6)
        setPin(numericValue)
    }

    async function handleSubmit(event) {
        event.preventDefault()

        if (!selectedUserId || pin.length !== 6 || isSubmitting) return

        setIsSubmitting(true)
        setStatus('Validating login...')

        const { data: user, error: loginError } = await loginWithPin({
            userId: selectedUserId,
            pin,
        })

        if (loginError || !user) {
            setStatus('PIN incorrecto')
            setPin('')
            setIsSubmitting(false)
            return
        }

        const { data: existingShift, error: shiftError } = await getOpenShift()

        if (shiftError) {
            setStatus(`Error checking shift: ${shiftError.message}`)
            setPin('')
            setIsSubmitting(false)
            return
        }

        let currentShiftId = null

        if (existingShift && existingShift.length > 0) {
            currentShiftId = existingShift[0].id
        } else {
            const startingCashInput = window.prompt('Ingrese efectivo inicial de caja:')

            if (
                startingCashInput === null ||
                startingCashInput.trim() === '' ||
                Number.isNaN(Number(startingCashInput))
            ) {
                setStatus('Debe ingresar un monto válido.')
                setPin('')
                setIsSubmitting(false)
                return
            }

            const { data: newShift, error: createShiftError } = await createShift({
                startingCash: Number(startingCashInput),
                userId: user.id,
            })

            if (createShiftError || !newShift) {
                setStatus('Error creando turno.')
                setPin('')
                setIsSubmitting(false)
                return
            }

            currentShiftId = newShift.id
        }

        setAuth(user, currentShiftId)

        setStatus('Login successful.')
        setPin('')
        setIsSubmitting(false)
        navigate('/pos')
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#111',
                color: 'white',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                paddingTop: '80px',
                paddingLeft: '20px',
                paddingRight: '20px',
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '480px',
                    padding: '28px 28px 32px',
                    background: '#141414',
                    border: '1px solid #242424',
                    borderRadius: '14px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                }}
            >
                <div style={{ marginBottom: '28px', textAlign: 'center' }}>
                    <h1 style={{ margin: '0 0 4px 0', fontSize: '26px', fontWeight: 700, color: '#e8e8e8', letterSpacing: '-0.4px' }}>
                        Continental
                    </h1>
                    <p style={{ margin: 0, fontSize: '13px', color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Sistema de punto de venta
                    </p>
                </div>
                {status && status !== 'Users loaded successfully.' && (
                    <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#f87171', textAlign: 'center' }}>{status}</p>
                )}

                {users.length === 0 ? (
                    <div
                        style={{
                            padding: '16px',
                            borderRadius: '12px',
                            border: '1px solid #444',
                            background: '#111',
                        }}
                    >
                        <p style={{ marginTop: 0 }}>
                            No active users exist yet. Run the initial admin bootstrap first.
                        </p>

                        <Link
                            to="/setup-admin"
                            style={{
                                display: 'inline-block',
                                marginTop: '8px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                background: '#2e7d32',
                                color: 'white',
                                textDecoration: 'none',
                                fontWeight: 'bold',
                            }}
                        >
                            Go to Initial Admin Setup
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div>
                            <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Seleccionar usuario</h2>

                            <div
                                style={{
                                    display: 'flex',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    marginBottom: '8px',
                                }}
                            >
                                {users.map((user) => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => setSelectedUserId(user.id)}
                                        style={{
                                            padding: '9px 14px',
                                            borderRadius: '7px',
                                            border: user.id === selectedUserId
                                                ? '1px solid #3a5a8a'
                                                : '1px solid #2a2a2a',
                                            background: user.id === selectedUserId ? '#1a2e47' : '#1e1e1e',
                                            color: user.id === selectedUserId ? '#93c5fd' : '#aaa',
                                            fontWeight: user.id === selectedUserId ? '600' : '400',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                        }}
                                    >
                                        {user.name}
                                        <span style={{ opacity: 0.5, marginLeft: '6px', fontSize: '12px' }}>
                                            {user.role}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <label
                                htmlFor="pin"
                                style={{
                                    display: 'block',
                                    marginBottom: '8px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: '#888',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                }}
                            >
                                PIN
                            </label>

                            <input
                                id="pin"
                                type="password"
                                inputMode="numeric"
                                autoComplete="off"
                                value={pin}
                                onChange={handlePinChange}
                                placeholder="••••••"
                                style={{
                                    width: '100%',
                                    padding: '11px 14px',
                                    borderRadius: '7px',
                                    border: '1px solid #2a2a2a',
                                    background: '#0e0e0e',
                                    color: '#e2e2e2',
                                    boxSizing: 'border-box',
                                    fontSize: '18px',
                                    letterSpacing: '0.3em',
                                    outline: 'none',
                                }}
                            />
                        </div>

                        {selectedUser && (
                            <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#555', textAlign: 'center' }}>
                                {selectedUser.name}
                                <span style={{ marginLeft: '6px', color: '#3d3d3d' }}>({selectedUser.role})</span>
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
                                border: 'none',
                                background: !selectedUserId || pin.length !== 6 || isSubmitting
                                    ? '#1e1e1e'
                                    : '#1a3a2a',
                                color: !selectedUserId || pin.length !== 6 || isSubmitting
                                    ? '#444'
                                    : '#4ade80',
                                fontWeight: '600',
                                fontSize: '14px',
                                cursor: !selectedUserId || pin.length !== 6 || isSubmitting
                                    ? 'default'
                                    : 'pointer',
                                border: '1px solid',
                                borderColor: !selectedUserId || pin.length !== 6 || isSubmitting
                                    ? '#222'
                                    : '#2a5a3a',
                            }}
                        >
                            {isSubmitting ? 'Verificando...' : 'Ingresar'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}

export default LoginPage