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
    const [pinResetDialog, setPinResetDialog] = useState({ open: false, user: null, pin: '', confirm: '', error: '', saving: false })

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

    function handleResetPin(user) {
        if (!isAdmin) {
            setStatus('Only admin can reset PIN.')
            return
        }
        setPinResetDialog({ open: true, user, pin: '', confirm: '', error: '', saving: false })
    }

    async function handlePinResetSubmit() {
        const { user, pin, confirm } = pinResetDialog
        if (pin.length !== 6) {
            setPinResetDialog(d => ({ ...d, error: 'El PIN debe tener exactamente 6 dígitos.' }))
            return
        }
        if (pin !== confirm) {
            setPinResetDialog(d => ({ ...d, error: 'Los PINs no coinciden.' }))
            return
        }
        setPinResetDialog(d => ({ ...d, saving: true, error: '' }))
        const { error } = await resetUserPin({ userId: user.id, pin })
        if (error) {
            setPinResetDialog(d => ({ ...d, saving: false, error: `Error: ${error.message}` }))
            return
        }
        setPinResetDialog({ open: false, user: null, pin: '', confirm: '', error: '', saving: false })
        setStatus(`PIN actualizado para ${user.name}.`)
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

            {/* ── PIN Reset Dialog ── */}
            {pinResetDialog.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: 700, color: '#e8e8e8' }}>Resetear PIN</h3>
                        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#666' }}>{pinResetDialog.user?.name}</p>

                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                            Nuevo PIN (6 dígitos)
                        </label>
                        <input
                            autoFocus
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            value={pinResetDialog.pin}
                            onChange={e => setPinResetDialog(d => ({ ...d, pin: e.target.value.replace(/\D/g, '').slice(0, 6), error: '' }))}
                            placeholder="••••••"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '7px', border: '1px solid #2a2a2a', background: '#0e0e0e', color: '#e2e2e2', fontSize: '20px', letterSpacing: '0.3em', boxSizing: 'border-box', outline: 'none', marginBottom: '12px' }}
                        />

                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                            Confirmar PIN
                        </label>
                        <input
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            value={pinResetDialog.confirm}
                            onChange={e => setPinResetDialog(d => ({ ...d, confirm: e.target.value.replace(/\D/g, '').slice(0, 6), error: '' }))}
                            onKeyDown={e => e.key === 'Enter' && handlePinResetSubmit()}
                            placeholder="••••••"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '7px', border: '1px solid #2a2a2a', background: '#0e0e0e', color: '#e2e2e2', fontSize: '20px', letterSpacing: '0.3em', boxSizing: 'border-box', outline: 'none', marginBottom: '4px' }}
                        />

                        {pinResetDialog.error && (
                            <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#f87171' }}>{pinResetDialog.error}</p>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                            <button
                                type="button"
                                onClick={() => setPinResetDialog({ open: false, user: null, pin: '', confirm: '', error: '', saving: false })}
                                style={{ flex: 1, padding: '10px', borderRadius: '7px', border: '1px solid #222', background: 'transparent', color: '#666', fontSize: '13px', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handlePinResetSubmit}
                                disabled={pinResetDialog.pin.length !== 6 || pinResetDialog.saving}
                                style={{ flex: 2, padding: '10px', borderRadius: '7px', border: '1px solid #1e3a5a', background: '#1a2e47', color: '#93c5fd', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                                {pinResetDialog.saving ? 'Guardando...' : 'Guardar PIN'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default UsersAdminPage