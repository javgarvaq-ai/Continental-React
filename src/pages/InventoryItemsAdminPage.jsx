import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getAllInventoryItems,
    createInventoryItem,
    updateInventoryItem,
    toggleInventoryItemActive,
    adjustInventoryStock,
} from '../services/inventoryAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'

const STATUS_COLOR = (stock, unitType) => {
    if (stock <= 0) return '#b71c1c'
    if (unitType === 'oz' && stock < 5) return '#e65100'
    if (unitType === 'unit' && stock < 3) return '#e65100'
    return '#2e7d32'
}

function InventoryItemsAdminPage() {
    const navigate = useNavigate()
    const [items, setItems] = useState([])
    const [status, setStatus] = useState('Loading inventory items...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const [newName, setNewName] = useState('')
    const [newUnitType, setNewUnitType] = useState('unit')
    const [newCapacityOz, setNewCapacityOz] = useState('')

    const [editingId, setEditingId] = useState('')
    const [editForm, setEditForm] = useState({ name: '', unit_type: 'unit', capacity_oz: '', active: true })

    const [adjustingId, setAdjustingId] = useState(null)
    const [adjustForm, setAdjustForm] = useState({ amount: '', type: 'entry', note: '' })

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => { loadItems() }, [])

    async function loadItems() {
        setLoading(true)
        const { data, error } = await getAllInventoryItems()
        if (error) { setStatus(error.message); setLoading(false); return }
        setItems(data || [])
        setStatus(`${(data || []).length} inventory items loaded.`)
        setLoading(false)
    }

    async function handleCreate(e) {
        e.preventDefault()
        if (!newName.trim()) { setStatus('Name required'); return }
        setIsSaving(true)
        const { error } = await createInventoryItem({ name: newName, unitType: newUnitType, capacityOz: newCapacityOz })
        if (error) { setStatus(error.message); setIsSaving(false); return }
        setNewName('')
        setNewCapacityOz('')
        setStatus('Item created.')
        setIsSaving(false)
        await loadItems()
    }

    async function saveEdit(id) {
        setIsSaving(true)
        const { error } = await updateInventoryItem({ id, name: editForm.name, unitType: editForm.unit_type, capacityOz: editForm.capacity_oz, active: editForm.active })
        if (error) { setStatus(error.message); setIsSaving(false); return }
        setEditingId('')
        setStatus('Item updated.')
        setIsSaving(false)
        await loadItems()
    }

    async function handleAdjust(id) {
        if (!adjustForm.amount || Number(adjustForm.amount) <= 0) { setStatus('Enter a valid amount.'); return }
        setIsSaving(true)
        const { error, data: newStock } = await adjustInventoryStock({
            id,
            amount: adjustForm.amount,
            type: adjustForm.type,
            note: adjustForm.note,
            userId: currentUser?.id,
        })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setAdjustingId(null)
        setAdjustForm({ amount: '', type: 'entry', note: '' })
        setStatus(`Stock updated. New stock: ${newStock}`)
        setIsSaving(false)
        await loadItems()
    }

    if (!isAdmin) return <div style={{ padding: 20 }}>Access denied</div>

    return (
        <div style={{ padding: '24px', background: '#111', color: 'white', minHeight: '100vh', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/inventory-items" />
                <h1 style={{ marginTop: 0 }}>Inventory Items</h1>
                <p style={{ opacity: 0.85 }}>{status}</p>

                {/* CREATE FORM */}
                <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
                    <h2 style={{ marginTop: 0 }}>New Item</h2>
                    <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Name *</label>
                            <input
                                placeholder="e.g. Herradura Blanco"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '200px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Unit Type</label>
                            <select value={newUnitType} onChange={(e) => setNewUnitType(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}>
                                <option value="unit">Unit</option>
                                <option value="oz">OZ</option>
                            </select>
                        </div>
                        {newUnitType === 'oz' && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Capacity (oz)</label>
                                <input type="number" placeholder="e.g. 25" value={newCapacityOz} onChange={(e) => setNewCapacityOz(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '120px' }} />
                            </div>
                        )}
                        <button type="submit" disabled={isSaving || !newName.trim()} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: isSaving || !newName.trim() ? '#555' : '#2e7d32', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                            {isSaving ? 'Creating...' : 'Create'}
                        </button>
                    </form>
                </div>

                {/* ITEMS LIST */}
                {loading ? <div>Loading...</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {items.map(item => (
                            <div key={item.id} style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '14px', padding: '16px' }}>
                                {editingId === item.id ? (
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '180px' }} />
                                        <select value={editForm.unit_type} onChange={(e) => setEditForm(p => ({ ...p, unit_type: e.target.value }))} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}>
                                            <option value="unit">Unit</option>
                                            <option value="oz">OZ</option>
                                        </select>
                                        {editForm.unit_type === 'oz' && (
                                            <input type="number" value={editForm.capacity_oz} onChange={(e) => setEditForm(p => ({ ...p, capacity_oz: e.target.value }))} placeholder="Capacity oz" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '120px' }} />
                                        )}
                                        <button onClick={() => saveEdit(item.id)} disabled={isSaving} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                                        <button onClick={() => setEditingId('')} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                ) : adjustingId === item.id ? (
                                    <div>
                                        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Adjust stock: {item.name}</div>
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Type</label>
                                                <select value={adjustForm.type} onChange={(e) => setAdjustForm(p => ({ ...p, type: e.target.value }))} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}>
                                                    <option value="entry">+ Add stock</option>
                                                    <option value="remove">- Remove stock</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Amount ({item.unit_type})</label>
                                                <input type="number" value={adjustForm.amount} onChange={(e) => setAdjustForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" min="0" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '100px' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Note (optional)</label>
                                                <input value={adjustForm.note} onChange={(e) => setAdjustForm(p => ({ ...p, note: e.target.value }))} placeholder="Reason..." style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '160px' }} />
                                            </div>
                                            <button onClick={() => handleAdjust(item.id)} disabled={isSaving} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>{isSaving ? 'Saving...' : 'Apply'}</button>
                                            <button onClick={() => setAdjustingId(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{item.name}</span>
                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#333', color: '#aaa' }}>{item.unit_type}</span>
                                                {item.unit_type === 'oz' && item.capacity_oz && (
                                                    <span style={{ fontSize: '11px', opacity: 0.6 }}>cap: {item.capacity_oz}oz</span>
                                                )}
                                            </div>
                                            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', color: STATUS_COLOR(item.current_stock, item.unit_type) }}>
                                                    Stock: {Number(item.current_stock || 0).toFixed(item.unit_type === 'oz' ? 2 : 0)} {item.unit_type}
                                                </span>
                                                {!item.active && <span style={{ fontSize: '11px', color: '#888' }}>Inactivo</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => { setAdjustingId(item.id); setAdjustForm({ amount: '', type: 'entry', note: '' }) }} style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontSize: '13px' }}>
                                                Ajustar stock
                                            </button>
                                            <button onClick={() => { setEditingId(item.id); setEditForm({ name: item.name, unit_type: item.unit_type, capacity_oz: item.capacity_oz || '', active: item.active }) }} style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#333', color: 'white', cursor: 'pointer', fontSize: '13px' }}>
                                                Edit
                                            </button>
                                            <button onClick={() => toggleInventoryItemActive({ id: item.id, active: !item.active }).then(loadItems)} style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: item.active ? '#b71c1c' : '#2e7d32', color: 'white', cursor: 'pointer', fontSize: '13px' }}>
                                                {item.active ? 'Deactivate' : 'Activate'}
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
    )
}

export default InventoryItemsAdminPage