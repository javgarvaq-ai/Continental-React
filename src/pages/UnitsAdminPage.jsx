import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllUnits, createUnit, updateUnit, deleteUnit } from '../services/unitsAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'


const UNIT_TYPES = ['mesa', 'barra', 'terraza', 'privado', 'otro']

function UnitsAdminPage() {
    const navigate = useNavigate()
    const [units, setUnits] = useState([])
    const [status, setStatus] = useState('Loading...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState('mesa')
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({ name: '', type: '' })

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => { loadUnits() }, [])

    async function loadUnits() {
        setLoading(true)
        const { data, error } = await getAllUnits()
        if (error) { setStatus(`Error: ${error.message}`); setLoading(false); return }
        setUnits(data || [])
        setStatus(`${(data || []).length} units loaded.`)
        setLoading(false)
    }

    async function handleCreate(e) {
        e.preventDefault()
        if (!isAdmin) return
        if (!newName.trim()) { setStatus('Name is required.'); return }
        setIsSaving(true)
        const { error } = await createUnit({ name: newName, type: newType })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setNewName('')
        setNewType('mesa')
        setStatus('Unit created.')
        setIsSaving(false)
        await loadUnits()
    }

    async function handleUpdate(id) {
        if (!isAdmin) return
        if (!editForm.name.trim()) { setStatus('Name is required.'); return }
        setIsSaving(true)
        const { error } = await updateUnit({ id, name: editForm.name, type: editForm.type })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setEditingId(null)
        setStatus('Unit updated.')
        setIsSaving(false)
        await loadUnits()
    }

    async function handleDelete(unit) {
        if (!isAdmin) return
        const confirmed = window.confirm(
            `Delete "${unit.name}"? This will fail if it has open or past comandas.`
        )
        if (!confirmed) return
        const { error } = await deleteUnit({ id: unit.id })
        if (error) { setStatus(`Error: ${error.message} — Make sure no comandas use this unit.`); return }
        setStatus('Unit deleted.')
        await loadUnits()
    }

    const typeColor = (type) => {
        const colors = { mesa: '#1565c0', barra: '#6a1b9a', terraza: '#2e7d32', privado: '#b71c1c', otro: '#555' }
        return colors[type] || '#555'
    }

    if (!isAdmin) {
        return <div style={{ padding: '24px', color: 'white', background: '#111', minHeight: '100vh' }}>Access denied. Admin only.</div>
    }

    return (
        <div style={{ minHeight: '100vh', background: '#111', color: 'white', padding: '24px', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>

                <AdminNav currentPath="/admin/units" />

                <h1 style={{ marginTop: 0 }}>Mesas / Unidades</h1>
                <p style={{ opacity: 0.85 }}>{status}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>

                    {/* CREATE FORM */}
                    <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px' }}>
                        <h2 style={{ marginTop: 0 }}>New Unit</h2>
                        <form onSubmit={handleCreate}>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Name *</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="e.g. Mesa 5"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Type</label>
                                <select
                                    value={newType}
                                    onChange={(e) => setNewType(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', boxSizing: 'border-box' }}
                                >
                                    {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={isSaving || !newName.trim()}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: isSaving || !newName.trim() ? '#555' : '#2e7d32', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                {isSaving ? 'Creating...' : 'Create Unit'}
                            </button>
                        </form>
                    </div>

                    {/* UNITS LIST */}
                    <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px' }}>
                        <h2 style={{ marginTop: 0 }}>Current Units</h2>
                        {loading ? <div>Loading...</div> : units.length === 0 ? (
                            <div style={{ opacity: 0.5 }}>No units found.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {units.map(unit => (
                                    <div key={unit.id} style={{ border: '1px solid #333', borderRadius: '12px', padding: '14px', background: '#121212' }}>
                                        {editingId === unit.id ? (
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    value={editForm.name}
                                                    onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                                                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', minWidth: '120px' }}
                                                />
                                                <select
                                                    value={editForm.type}
                                                    onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))}
                                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}
                                                >
                                                    {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                <button onClick={() => handleUpdate(unit.id)} disabled={isSaving} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                                                <button onClick={() => setEditingId(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{unit.name}</span>
                                                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: typeColor(unit.type), color: 'white' }}>
                                                        {unit.type}
                                                    </span>
                                                    <span style={{ fontSize: '11px', opacity: 0.5 }}>
                                                        {unit.status === 'free' ? '🟢 libre' : '🔵 ocupada'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        onClick={() => { setEditingId(unit.id); setEditForm({ name: unit.name, type: unit.type }) }}
                                                        style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(unit)}
                                                        style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#b71c1c', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        )}
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

export default UnitsAdminPage