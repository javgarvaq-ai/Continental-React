import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import bcrypt from 'bcryptjs'
import { supabase } from '../services/supabase'

function SetupAdminPage() {
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [usersExist, setUsersExist] = useState(false)

    const [name, setName] = useState('')
    const [pin, setPin] = useState('')
    const [confirmPin, setConfirmPin] = useState('')
    const [status, setStatus] = useState('Checking system status...')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        async function checkUsers() {
            const { count, error } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })

            if (error) {
                setStatus(`Error checking users: ${error.message}`)
                setLoading(false)
                return
            }

            const hasUsers = (count || 0) > 0
            setUsersExist(hasUsers)
            setStatus(
                hasUsers
                    ? 'Users already exist. Redirecting to login...'
                    : 'No users found. Create the first admin user.'
            )
            setLoading(false)
        }

        checkUsers()
    }, [])

    function normalizePin(value) {
        return value.replace(/\D/g, '').slice(0, 6)
    }

    async function handleSubmit(event) {
        event.preventDefault()

        if (isSubmitting) return

        const trimmedName = name.trim()

        if (!trimmedName) {
            setStatus('Name is required.')
            return
        }

        if (pin.length !== 6) {
            setStatus('PIN must be exactly 6 digits.')
            return
        }

        if (pin !== confirmPin) {
            setStatus('PIN and confirmation do not match.')
            return
        }

        setIsSubmitting(true)
        setStatus('Creating admin user...')

        const { count, error: countError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })

        if (countError) {
            setStatus(`Error validating setup state: ${countError.message}`)
            setIsSubmitting(false)
            return
        }

        if ((count || 0) > 0) {
            setStatus('Setup is already completed. Redirecting to login...')
            setUsersExist(true)
            setIsSubmitting(false)
            return
        }

        const pinHash = await bcrypt.hash(pin, 10)

        const { error: insertError } = await supabase.from('users').insert([
            {
                name: trimmedName,
                role: 'admin',
                pin_hash: pinHash,
                active: true,
            },
        ])

        if (insertError) {
            setStatus(`Error creating admin user: ${insertError.message}`)
            setIsSubmitting(false)
            return
        }

        setStatus('Admin user created successfully. Redirecting to login...')
        setIsSubmitting(false)
        navigate('/login', { replace: true })
    }

    if (!loading && usersExist) {
        return <Navigate to="/login" replace />
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
                <h1 style={{ marginTop: 0, marginBottom: '12px' }}>Initial Admin Setup</h1>
                <p style={{ marginTop: 0, marginBottom: '20px', opacity: 0.85 }}>{status}</p>

                {!loading && (
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '16px' }}>
                            <label
                                htmlFor="name"
                                style={{
                                    display: 'block',
                                    marginBottom: '8px',
                                    fontWeight: 'bold',
                                }}
                            >
                                Name
                            </label>

                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Enter admin name"
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

                        <div style={{ marginBottom: '16px' }}>
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
                                onChange={(event) => setPin(normalizePin(event.target.value))}
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

                        <div style={{ marginBottom: '16px' }}>
                            <label
                                htmlFor="confirmPin"
                                style={{
                                    display: 'block',
                                    marginBottom: '8px',
                                    fontWeight: 'bold',
                                }}
                            >
                                Confirm PIN
                            </label>

                            <input
                                id="confirmPin"
                                type="password"
                                inputMode="numeric"
                                autoComplete="off"
                                value={confirmPin}
                                onChange={(event) => setConfirmPin(normalizePin(event.target.value))}
                                placeholder="Confirm 6-digit PIN"
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
                            <p style={{ margin: '0 0 6px 0' }}>Role to create: admin</p>
                            <p style={{ margin: 0 }}>Active: true</p>
                        </div>

                        <button
                            type="submit"
                            disabled={
                                isSubmitting ||
                                !name.trim() ||
                                pin.length !== 6 ||
                                confirmPin.length !== 6
                            }
                            style={{
                                width: '100%',
                                marginTop: '18px',
                                padding: '12px',
                                borderRadius: '10px',
                                border: 'none',
                                background:
                                    isSubmitting ||
                                        !name.trim() ||
                                        pin.length !== 6 ||
                                        confirmPin.length !== 6
                                        ? '#555'
                                        : '#2e7d32',
                                color: 'white',
                                fontWeight: 'bold',
                                cursor:
                                    isSubmitting ||
                                        !name.trim() ||
                                        pin.length !== 6 ||
                                        confirmPin.length !== 6
                                        ? 'default'
                                        : 'pointer',
                            }}
                        >
                            {isSubmitting ? 'Creating admin...' : 'Create First Admin'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}

export default SetupAdminPage