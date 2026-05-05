import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory,
} from '../services/categoriesAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'


function CategoriesAdminPage() {
    const navigate = useNavigate()
    const [categories, setCategories] = useState([])
    const [status, setStatus] = useState('Loading categories...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [newName, setNewName] = useState('')
    const [editingId, setEditingId] = useState(null)
    const [editingName, setEditingName] = useState('')

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => {
        loadCategories()
    }, [])

    async function loadCategories() {
        setLoading(true)
        const { data, error } = await getAllCategories()
        if (error) {
            setStatus(`Error loading categories: ${error.message}`)
            setLoading(false)
            return
        }
        setCategories(data || [])
        setStatus('Categories loaded.')
        setLoading(false)
    }

    async function handleCreate(event) {
        event.preventDefault()
        if (!isAdmin) { setStatus('Admin only.'); return }
        const trimmed = newName.trim()
        if (!trimmed) { setStatus('Name is required.'); return }
        setIsSaving(true)
        setStatus('Creating category...')
        const { error } = await createCategory({ name: trimmed })
        if (error) {
            setStatus(`Error: ${error.message}`)
            setIsSaving(false)
            return
        }
        setNewName('')
        setStatus('Category created.')
        setIsSaving(false)
        await loadCategories()
    }

    async function handleUpdate(id) {
        if (!isAdmin) { setStatus('Admin only.'); return }
        const trimmed = editingName.trim()
        if (!trimmed) { setStatus('Name is required.'); return }
        setIsSaving(true)
        setStatus('Updating category...')
        const { error } = await updateCategory({ id, name: trimmed })
        if (error) {
            setStatus(`Error: ${error.message}`)
            setIsSaving(false)
            return
        }
        setEditingId(null)
        setEditingName('')
        setStatus('Category updated.')
        setIsSaving(false)
        await loadCategories()
    }

    async function handleDelete(category) {
        if (!isAdmin) { setStatus('Admin only.'); return }
        const confirmed = window.confirm(
            `Delete category "${category.name}"? This will fail if products are using it.`
        )
        if (!confirmed) return
        setStatus('Deleting category...')
        const { error } = await deleteCategory({ id: category.id })
        if (error) {
            setStatus(`Error: ${error.message} — Make sure no products use this category first.`)
            return
        }
        setStatus('Category deleted.')
        await loadCategories()
    }

    if (!isAdmin) {
        return (
            <div style={{ padding: '24px', color: 'white', background: '#111', minHeight: '100vh' }}>
                Access denied. Admin only.
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100vh', background: '#111', color: 'white', padding: '24px', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>

                <AdminNav currentPath="/admin/categories" />

                <h1 style={{ marginTop: 0 }}>Categories</h1>
                <p style={{ opacity: 0.85 }}>{status}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px', alignItems: 'start' }}>

                    <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px' }}>
                        <h2 style={{ marginTop: 0 }}>New Category</h2>
                        <form onSubmit={handleCreate}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Category name"
                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #444', background: '#111', color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSaving || !newName.trim()}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: isSaving || !newName.trim() ? '#555' : '#2e7d32', color: 'white', fontWeight: 'bold', cursor: isSaving || !newName.trim() ? 'default' : 'pointer' }}
                            >
                                {isSaving ? 'Creating...' : 'Create Category'}
                            </button>
                        </form>
                    </div>

                    <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px' }}>
                        <h2 style={{ marginTop: 0 }}>Existing Categories</h2>
                        {loading ? (
                            <div>Loading...</div>
                        ) : categories.length === 0 ? (
                            <div>No categories found.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {categories.map((cat) => (
                                    <div key={cat.id} style={{ border: '1px solid #333', borderRadius: '12px', padding: '14px', background: '#121212' }}>
                                        {editingId === cat.id ? (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}
                                                />
                                                <button
                                                    onClick={() => handleUpdate(cat.id)}
                                                    disabled={isSaving}
                                                    style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => { setEditingId(null); setEditingName('') }}
                                                    style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{cat.name}</span>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer' }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(cat)}
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#b71c1c', color: 'white', cursor: 'pointer' }}
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

export default CategoriesAdminPage