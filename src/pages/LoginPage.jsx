import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getActiveUsers } from '../services/users'
import { loginWithPin, getOpenShift, createShift } from '../services/auth'

function LoginPage() {
    const navigate = useNavigate()

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

        localStorage.setItem('continentalCurrentUser', JSON.stringify(user))
        localStorage.setItem('continentalCurrentShiftId', currentShiftId)

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
                    maxWidth: '520px',
                    padding: '24px',
                    background: '#181818',
                    border: '1px solid #2f2f2f',
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                }}
            >
                <h1 style={{ marginTop: 0, marginBottom: '12px' }}>Continental Login</h1>
                <p style={{ marginTop: 0, marginBottom: '20px', opacity: 0.85 }}>{status}</p>

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
                            <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Select user</h2>

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
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border:
                                                user.id === selectedUserId
                                                    ? '1px solid #4da3ff'
                                                    : '1px solid #444',
                                            background:
                                                user.id === selectedUserId ? '#1d3557' : '#2a2a2a',
                                            color: 'white',
                                            fontWeight: user.id === selectedUserId ? 'bold' : 'normal',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {user.name} - {user.role}
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
                                    fontWeight: 'bold',
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
                                placeholder="Enter 6-digit PIN"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid #444',
                                    background: '#111',
                                    color: 'white',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        <div style={{ marginTop: '16px', opacity: 0.9 }}>
                            <p style={{ margin: 0 }}>
                                Selected user:{' '}
                                {selectedUser ? `${selectedUser.name} (${selectedUser.role})` : 'None'}
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={!selectedUserId || pin.length !== 6 || isSubmitting}
                            style={{
                                width: '100%',
                                marginTop: '18px',
                                padding: '12px',
                                borderRadius: '10px',
                                border: 'none',
                                background:
                                    !selectedUserId || pin.length !== 6 || isSubmitting
                                        ? '#555'
                                        : '#2e7d32',
                                color: 'white',
                                fontWeight: 'bold',
                                cursor:
                                    !selectedUserId || pin.length !== 6 || isSubmitting
                                        ? 'default'
                                        : 'pointer',
                            }}
                        >
                            {isSubmitting ? 'Logging in...' : 'Login'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}

export default LoginPage