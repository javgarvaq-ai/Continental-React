import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getAllUsers,
    createUser,
    updateUserActive,
    resetUserPin,
} from '../services/usersAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'

function UsersAdminPage() {
    const [users, setUsers] = useState([])
    const navigate = useNavigate()
    const [status, setStatus] = useState('Loading users...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const [newName, setNewName] = useState('')
    const [newRole, setNewRole] = useState('waiter')
    const [newPin, setNewPin] = useState('')
    const [confirmNewPin, setConfirmNewPin] = useState('')

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => {
        loadUsers()
    }, [])

    async function loadUsers() {
        setLoading(true)
        setStatus('Loading users...')

        const { data, error } = await getAllUsers()

        if (error) {
            setStatus(`Error loading users: ${error.message}`)
            setLoading(false)
            return
        }

        setUsers(data || [])
        setStatus('Users loaded.')
        setLoading(false)
    }

    function normalizePin(value) {
        return value.replace(/\D/g, '').slice(0, 6)
    }

    async function handleCreateUser(event) {
        event.preventDefault()

        if (!isAdmin) {
            setStatus('Only admin can create users.')
            return
        }

        const trimmedName = newName.trim()

        if (!trimmedName) {
            setStatus('Name is required.')
            return
        }

        if (newPin.length !== 6) {
            setStatus('PIN must be exactly 6 digits.')
            return
        }

        if (newPin !== confirmNewPin) {
            setStatus('PIN confirmation does not match.')
            return
        }

        setIsSaving(true)
        setStatus('Creating user...')

        const { error } = await createUser({
            name: trimmedName,
            role: newRole,
            pin: newPin,
        })

        if (error) {
            setStatus(`Error creating user: ${error.message}`)
            setIsSaving(false)
            return
        }

        setNewName('')
        setNewRole('waiter')
        setNewPin('')
        setConfirmNewPin('')
        setStatus('User created successfully.')
        setIsSaving(false)

        await loadUsers()
    }

    async function handleToggleActive(user) {
        if (!isAdmin) {
            setStatus('Only admin can activate/deactivate users.')
            return
        }

        if (user.id === currentUser?.id && user.active === true) {
            setStatus('You cannot deactivate your own current user.')
            return
        }

        const nextActive = !user.active

        setStatus(`${nextActive ? 'Activating' : 'Deactivating'} user...`)

        const { error } = await updateUserActive({
            userId: user.id,
            active: nextActive,
        })

        if (error) {
            setStatus(`Error updating user: ${error.message}`)
            return
        }

        setStatus('User updated successfully.')
        await loadUsers()
    }

    async function handleResetPin(user) {
        if (!isAdmin) {
            setStatus('Only admin can reset PIN.')
            return
        }

        const pin = window.prompt(`Enter new 6-digit PIN for ${user.name}:`)

        if (pin === null) return

        const cleanedPin = pin.replace(/\D/g, '')

        if (cleanedPin.length !== 6 || pin.trim() !== cleanedPin) {
            setStatus('PIN must be exactly 6 numeric digits.')
            return
        }

        const confirmPin = window.prompt(`Confirm new 6-digit PIN for ${user.name}:`)

        if (confirmPin === null) return

        const cleanedConfirm = confirmPin.replace(/\D/g, '')

        if (cleanedConfirm.length !== 6 || confirmPin.trim() !== cleanedConfirm) {
            setStatus('Confirmation PIN must be exactly 6 numeric digits.')
            return
        }

        if (cleanedPin !== cleanedConfirm) {
            setStatus('PIN confirmation does not match.')
            return
        }

        setStatus('Resetting PIN...')

        const { error } = await resetUserPin({
            userId: user.id,
            pin: cleanedPin,
        })

        if (error) {
            setStatus(`Error resetting PIN: ${error.message}`)
            return
        }

        setStatus(`PIN reset successfully for ${user.name}.`)
    }

    if (!currentUser) {
        return (
            <div style={{ padding: '24px', color: 'white', background: '#111', minHeight: '100vh' }}>
                Not logged in.
            </div>
        )
    }

    if (!isAdmin) {
        return (
            <div style={{ padding: '24px', color: 'white', background: '#111', minHeight: '100vh' }}>
                Access denied. Admin only.
            </div>
        )
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#111',
                color: 'white',
                padding: '24px',
                boxSizing: 'border-box',
            }}
        >
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/users" />
                <h1 style={{ marginTop: 0 }}>Users Administration</h1>
                <p style={{ opacity: 0.85 }}>{status}</p>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '380px 1fr',
                        gap: '24px',
                        alignItems: 'start',
                    }}
                >
                    <div
                        style={{
                            background: '#181818',
                            border: '1px solid #2f2f2f',
                            borderRadius: '16px',
                            padding: '20px',
                        }}
                    >
                        <h2 style={{ marginTop: 0 }}>Create User</h2>

                        <form onSubmit={handleCreateUser}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(event) => setNewName(event.target.value)}
                                    placeholder="User name"
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

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Role</label>
                                <select
                                    value={newRole}
                                    onChange={(event) => setNewRole(event.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        border: '1px solid #444',
                                        background: '#111',
                                        color: 'white',
                                        boxSizing: 'border-box',
                                    }}
                                >
                                    <option value="waiter">waiter</option>
                                    <option value="manager">manager</option>
                                    <option value="admin">admin</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>PIN</label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={newPin}
                                    onChange={(event) => setNewPin(normalizePin(event.target.value))}
                                    placeholder="6-digit PIN"
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

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Confirm PIN</label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={confirmNewPin}
                                    onChange={(event) => setConfirmNewPin(normalizePin(event.target.value))}
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

                            <button
                                type="submit"
                                disabled={isSaving}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: isSaving ? '#555' : '#2e7d32',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: isSaving ? 'default' : 'pointer',
                                }}
                            >
                                {isSaving ? 'Creating...' : 'Create User'}
                            </button>
                        </form>
                    </div>

                    <div
                        style={{
                            background: '#181818',
                            border: '1px solid #2f2f2f',
                            borderRadius: '16px',
                            padding: '20px',
                        }}
                    >
                        <h2 style={{ marginTop: 0 }}>Current Users</h2>

                        {loading ? (
                            <div>Loading...</div>
                        ) : users.length === 0 ? (
                            <div>No users found.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {users.map((user) => (
                                    <div
                                        key={user.id}
                                        style={{
                                            border: '1px solid #333',
                                            borderRadius: '12px',
                                            padding: '14px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: '12px',
                                            background: '#121212',
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                                {user.name}
                                            </div>
                                            <div style={{ opacity: 0.85 }}>
                                                Role: {user.role} | Status: {user.active ? 'Active' : 'Inactive'}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            <button
                                                onClick={() => handleResetPin(user)}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '10px',
                                                    border: 'none',
                                                    background: '#1565c0',
                                                    color: 'white',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Reset PIN
                                            </button>

                                            <button
                                                onClick={() => handleToggleActive(user)}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '10px',
                                                    border: 'none',
                                                    background: user.active ? '#b71c1c' : '#2e7d32',
                                                    color: 'white',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {user.active ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default UsersAdminPage