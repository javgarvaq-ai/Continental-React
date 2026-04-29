import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getAllInventoryItems,
    createInventoryItem,
    updateInventoryItem,
    toggleInventoryItemActive,
} from '../services/inventoryAdmin'

function InventoryItemsAdminPage() {
    const navigate = useNavigate()

    const [items, setItems] = useState([])
    const [status, setStatus] = useState('Loading inventory items...')
    const [loading, setLoading] = useState(true)

    const [newName, setNewName] = useState('')
    const [newUnitType, setNewUnitType] = useState('unit')
    const [newCapacityOz, setNewCapacityOz] = useState('')

    const [editingId, setEditingId] = useState('')
    const [editForm, setEditForm] = useState({
        name: '',
        unit_type: 'unit',
        capacity_oz: '',
        active: true,
    })

    const currentUser = useMemo(() => {
        const raw = localStorage.getItem('continentalCurrentUser')
        return raw ? JSON.parse(raw) : null
    }, [])

    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => {
        loadItems()
    }, [])

    async function loadItems() {
        setLoading(true)
        const { data, error } = await getAllInventoryItems()

        if (error) {
            setStatus(error.message)
            setLoading(false)
            return
        }

        setItems(data || [])
        setStatus('Inventory loaded.')
        setLoading(false)
    }

    async function handleCreate(e) {
        e.preventDefault()

        if (!newName.trim()) {
            setStatus('Name required')
            return
        }

        const { error } = await createInventoryItem({
            name: newName,
            unitType: newUnitType,
            capacityOz: newCapacityOz,
        })

        if (error) {
            setStatus(error.message)
            return
        }

        setNewName('')
        setNewCapacityOz('')
        await loadItems()
    }

    function startEdit(item) {
        setEditingId(item.id)
        setEditForm({
            name: item.name,
            unit_type: item.unit_type,
            capacity_oz: item.capacity_oz || '',
            active: item.active,
        })
    }

    async function saveEdit(id) {
        const { error } = await updateInventoryItem({
            id,
            name: editForm.name,
            unitType: editForm.unit_type,
            capacityOz: editForm.capacity_oz,
            active: editForm.active,
        })

        if (error) {
            setStatus(error.message)
            return
        }

        setEditingId('')
        await loadItems()
    }

    async function toggleActive(item) {
        await toggleInventoryItemActive({
            id: item.id,
            active: !item.active,
        })

        await loadItems()
    }

    if (!isAdmin) return <div style={{ padding: 20 }}>Access denied</div>

    return (
        <div style={{ padding: 20, background: '#111', color: 'white', minHeight: '100vh' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

                <div
                    style={{
                        display: 'flex',
                        gap: '10px',
                        marginBottom: '16px',
                        flexWrap: 'wrap',
                    }}
                >
                    <button
                        type="button"
                        onClick={() => navigate('/pos')}
                        style={navButtonStyle}
                    >
                        POS
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/admin/users')}
                        style={navButtonStyle}
                    >
                        Usuarios
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/admin/products')}
                        style={navButtonStyle}
                    >
                        Productos
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/admin/inventory-items')}
                        style={{ ...navButtonStyle, background: '#2e7d32' }}
                    >
                        Inventario
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/admin/recipe-mappings')}
                        style={navButtonStyle}
                    >
                        Recetas
                    </button>
                </div>

                <h1>Inventory Items</h1>
                <p>{status}</p>

                {/* CREATE */}
                <form onSubmit={handleCreate}>
                    <input
                        placeholder="Name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                    />

                    <select
                        value={newUnitType}
                        onChange={(e) => setNewUnitType(e.target.value)}
                    >
                        <option value="unit">Unit</option>
                        <option value="oz">OZ</option>
                    </select>

                    {newUnitType === 'oz' && (
                        <input
                            type="number"
                            placeholder="Capacity OZ"
                            value={newCapacityOz}
                            onChange={(e) => setNewCapacityOz(e.target.value)}
                        />
                    )}

                    <button type="submit">Create</button>
                </form>

                {/* LIST */}
                {loading ? 'Loading...' : items.map(item => (
                    <div key={item.id} style={{ marginTop: 10, border: '1px solid #333', padding: 10 }}>
                        {editingId === item.id ? (
                            <>
                                <input
                                    value={editForm.name}
                                    onChange={(e) =>
                                        setEditForm(prev => ({ ...prev, name: e.target.value }))
                                    }
                                />

                                <select
                                    value={editForm.unit_type}
                                    onChange={(e) =>
                                        setEditForm(prev => ({ ...prev, unit_type: e.target.value }))
                                    }
                                >
                                    <option value="unit">Unit</option>
                                    <option value="oz">OZ</option>
                                </select>

                                {editForm.unit_type === 'oz' && (
                                    <input
                                        type="number"
                                        value={editForm.capacity_oz}
                                        onChange={(e) =>
                                            setEditForm(prev => ({ ...prev, capacity_oz: e.target.value }))
                                        }
                                    />
                                )}

                                <label>
                                    <input
                                        type="checkbox"
                                        checked={editForm.active}
                                        onChange={(e) =>
                                            setEditForm(prev => ({ ...prev, active: e.target.checked }))
                                        }
                                    />
                                    Active
                                </label>

                                <button onClick={() => saveEdit(item.id)}>Save</button>
                            </>
                        ) : (
                            <>
                                <div>{item.name}</div>
                                <div>{item.unit_type}</div>
                                <div>{item.capacity_oz || '-'}</div>
                                <div>{item.active ? 'Active' : 'Inactive'}</div>

                                <button onClick={() => startEdit(item)}>Edit</button>
                                <button onClick={() => toggleActive(item)}>
                                    {item.active ? 'Deactivate' : 'Activate'}
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
const navButtonStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #555',
    background: '#222',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
}
export default InventoryItemsAdminPage