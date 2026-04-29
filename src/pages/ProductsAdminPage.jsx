import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getAllProductsAdmin,
    createProductAdmin,
    updateProductAdmin,
    toggleProductActive,
} from '../services/productsAdmin'

function ProductsAdminPage() {
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const navigate = useNavigate()
    const [status, setStatus] = useState('Loading products...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [productSearch, setProductSearch] = useState('')

    const [newName, setNewName] = useState('')
    const [newPrice, setNewPrice] = useState('')
    const [newCategoryId, setNewCategoryId] = useState('')
    const [newIsShot, setNewIsShot] = useState(false)
    const [newIsMixer, setNewIsMixer] = useState(false)
    const [newFreeMixersQty, setNewFreeMixersQty] = useState('0')
    const [newRequiresInventory, setNewRequiresInventory] = useState(true)

    const [editingProductId, setEditingProductId] = useState('')
    const [editForm, setEditForm] = useState({
        name: '',
        price: '',
        category_id: '',
        is_shot: false,
        is_mixer: false,
        free_mixers_qty: '0',
        requires_inventory: true,
        active: true,
    })

    const currentUser = useMemo(() => {
        const raw = localStorage.getItem('continentalCurrentUser')
        return raw ? JSON.parse(raw) : null
    }, [])

    const isAdmin = currentUser?.role === 'admin'
    const filteredProducts = products.filter((product) =>
        product.name.toLowerCase().includes(productSearch.toLowerCase())
    )

    useEffect(() => {
        loadProducts()
    }, [])

    async function loadProducts() {
        setLoading(true)
        setStatus('Loading products...')

        const { data, error } = await getAllProductsAdmin()

        if (error) {
            setStatus(`Error loading products: ${error.message}`)
            setLoading(false)
            return
        }

        setProducts(data?.products || [])
        setCategories(data?.categories || [])
        setStatus('Products loaded.')
        setLoading(false)
    }

    useEffect(() => {
        if (!newCategoryId && categories.length > 0) {
            setNewCategoryId(categories[0].id)
        }
    }, [categories, newCategoryId])

    async function handleCreateProduct(event) {
        event.preventDefault()

        if (!isAdmin) {
            setStatus('Only admin can create products.')
            return
        }

        if (!newName.trim()) {
            setStatus('Product name is required.')
            return
        }

        if (newPrice === '' || Number.isNaN(Number(newPrice)) || Number(newPrice) < 0) {
            setStatus('Price must be a valid number.')
            return
        }

        if (!newCategoryId) {
            setStatus('Category is required.')
            return
        }

        setIsSaving(true)
        setStatus('Creating product...')

        const { error } = await createProductAdmin({
            name: newName,
            price: newPrice,
            categoryId: newCategoryId,
            isShot: newIsShot,
            isMixer: newIsMixer,
            freeMixersQty: newIsShot ? Number(newFreeMixersQty || 0) : 0,
            requiresInventory: newRequiresInventory,
        })

        if (error) {
            setStatus(`Error creating product: ${error.message}`)
            setIsSaving(false)
            return
        }

        setNewName('')
        setNewPrice('')
        setNewIsShot(false)
        setNewIsMixer(false)
        setNewFreeMixersQty('0')
        setNewRequiresInventory(true)
        setStatus('Product created successfully.')
        setIsSaving(false)

        await loadProducts()
    }

    function startEdit(product) {
        setEditingProductId(product.id)
        setEditForm({
            name: product.name || '',
            price: String(product.price ?? ''),
            category_id: product.category_id || '',
            is_shot: Boolean(product.is_shot),
            is_mixer: Boolean(product.is_mixer),
            free_mixers_qty: String(product.free_mixers_qty ?? 0),
            requires_inventory: Boolean(product.requires_inventory),
            active: Boolean(product.active),
        })
    }

    function cancelEdit() {
        setEditingProductId('')
        setEditForm({
            name: '',
            price: '',
            category_id: '',
            is_shot: false,
            is_mixer: false,
            free_mixers_qty: '0',
            requires_inventory: true,
            active: true,
        })
    }

    async function saveEdit(productId) {
        if (!isAdmin) {
            setStatus('Only admin can edit products.')
            return
        }

        if (!editForm.name.trim()) {
            setStatus('Product name is required.')
            return
        }

        if (
            editForm.price === '' ||
            Number.isNaN(Number(editForm.price)) ||
            Number(editForm.price) < 0
        ) {
            setStatus('Price must be a valid number.')
            return
        }

        if (!editForm.category_id) {
            setStatus('Category is required.')
            return
        }

        setStatus('Saving product changes...')

        const { error } = await updateProductAdmin({
            productId,
            name: editForm.name,
            price: editForm.price,
            categoryId: editForm.category_id,
            isShot: editForm.is_shot,
            isMixer: editForm.is_mixer,
            freeMixersQty: editForm.is_shot ? Number(editForm.free_mixers_qty || 0) : 0,
            requiresInventory: editForm.requires_inventory,
            active: editForm.active,
        })

        if (error) {
            setStatus(`Error updating product: ${error.message}`)
            return
        }

        setStatus('Product updated successfully.')
        cancelEdit()
        await loadProducts()
    }

    async function handleToggleActive(product) {
        if (!isAdmin) {
            setStatus('Only admin can activate/deactivate products.')
            return
        }

        const nextActive = !product.active

        setStatus(`${nextActive ? 'Activating' : 'Deactivating'} product...`)

        const { error } = await toggleProductActive({
            productId: product.id,
            active: nextActive,
        })

        if (error) {
            setStatus(`Error updating product status: ${error.message}`)
            return
        }

        setStatus('Product status updated.')
        await loadProducts()
    }

    if (!currentUser) {
        return (
            <div style={{ padding: '24px', background: '#111', color: 'white', minHeight: '100vh' }}>
                Not logged in.
            </div>
        )
    }

    if (!isAdmin) {
        return (
            <div style={{ padding: '24px', background: '#111', color: 'white', minHeight: '100vh' }}>
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
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
                        style={{ ...navButtonStyle, background: '#3d2c1d' }}
                    >
                        Productos
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/admin/inventory-items')}
                        style={navButtonStyle}
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
                <h1 style={{ marginTop: 0 }}>Products Administration</h1>
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
                        <h2 style={{ marginTop: 0 }}>Create Product</h2>

                        <form onSubmit={handleCreateProduct}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(event) => setNewName(event.target.value)}
                                    placeholder="Product name"
                                    style={inputStyle}
                                />
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Price</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={newPrice}
                                    onChange={(event) => setNewPrice(event.target.value)}
                                    placeholder="0.00"
                                    style={inputStyle}
                                />
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Category</label>
                                <select
                                    value={newCategoryId}
                                    onChange={(event) => setNewCategoryId(event.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Select category</option>
                                    {categories.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <label style={checkboxRowStyle}>
                                <input
                                    type="checkbox"
                                    checked={newIsShot}
                                    onChange={(event) => setNewIsShot(event.target.checked)}
                                />
                                Shot
                            </label>

                            <label style={checkboxRowStyle}>
                                <input
                                    type="checkbox"
                                    checked={newIsMixer}
                                    onChange={(event) => setNewIsMixer(event.target.checked)}
                                />
                                Mixer
                            </label>

                            <label style={checkboxRowStyle}>
                                <input
                                    type="checkbox"
                                    checked={newRequiresInventory}
                                    onChange={(event) => setNewRequiresInventory(event.target.checked)}
                                />
                                Requires inventory
                            </label>

                            <div style={{ marginTop: '14px', marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>
                                    Free mixers qty
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={newFreeMixersQty}
                                    onChange={(event) => setNewFreeMixersQty(event.target.value)}
                                    disabled={!newIsShot}
                                    style={inputStyle}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                style={primaryButtonStyle}
                            >
                                {isSaving ? 'Creating...' : 'Create Product'}
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
                        <h2 style={{ marginTop: 0 }}>Current Products</h2>
                        <div style={{ marginBottom: '14px' }}>
                            <input
                                type="text"
                                value={productSearch}
                                onChange={(event) => setProductSearch(event.target.value)}
                                placeholder="Buscar producto..."
                                style={inputStyle}
                            />
                        </div>

                        {loading ? (
                            <div>Loading...</div>
                        ) : filteredProducts.length === 0 ? (
                            <div>No products found.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {filteredProducts.map((product) => {
                                    const isEditing = editingProductId === product.id

                                    if (isEditing) {
                                        return (
                                            <div key={product.id} style={cardStyle}>
                                                <div style={{ display: 'grid', gap: '10px' }}>
                                                    <input
                                                        type="text"
                                                        value={editForm.name}
                                                        onChange={(event) =>
                                                            setEditForm((prev) => ({
                                                                ...prev,
                                                                name: event.target.value,
                                                            }))
                                                        }
                                                        style={inputStyle}
                                                    />

                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.price}
                                                        onChange={(event) =>
                                                            setEditForm((prev) => ({
                                                                ...prev,
                                                                price: event.target.value,
                                                            }))
                                                        }
                                                        style={inputStyle}
                                                    />

                                                    <select
                                                        value={editForm.category_id}
                                                        onChange={(event) =>
                                                            setEditForm((prev) => ({
                                                                ...prev,
                                                                category_id: event.target.value,
                                                            }))
                                                        }
                                                        style={inputStyle}
                                                    >
                                                        <option value="">Select category</option>
                                                        {categories.map((category) => (
                                                            <option key={category.id} value={category.id}>
                                                                {category.name}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <label style={checkboxRowStyle}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editForm.is_shot}
                                                            onChange={(event) =>
                                                                setEditForm((prev) => ({
                                                                    ...prev,
                                                                    is_shot: event.target.checked,
                                                                }))
                                                            }
                                                        />
                                                        Shot
                                                    </label>

                                                    <label style={checkboxRowStyle}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editForm.is_mixer}
                                                            onChange={(event) =>
                                                                setEditForm((prev) => ({
                                                                    ...prev,
                                                                    is_mixer: event.target.checked,
                                                                }))
                                                            }
                                                        />
                                                        Mixer
                                                    </label>

                                                    <label style={checkboxRowStyle}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editForm.requires_inventory}
                                                            onChange={(event) =>
                                                                setEditForm((prev) => ({
                                                                    ...prev,
                                                                    requires_inventory: event.target.checked,
                                                                }))
                                                            }
                                                        />
                                                        Requires inventory
                                                    </label>

                                                    <label style={checkboxRowStyle}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editForm.active}
                                                            onChange={(event) =>
                                                                setEditForm((prev) => ({
                                                                    ...prev,
                                                                    active: event.target.checked,
                                                                }))
                                                            }
                                                        />
                                                        Active
                                                    </label>

                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={editForm.free_mixers_qty}
                                                        onChange={(event) =>
                                                            setEditForm((prev) => ({
                                                                ...prev,
                                                                free_mixers_qty: event.target.value,
                                                            }))
                                                        }
                                                        disabled={!editForm.is_shot}
                                                        style={inputStyle}
                                                    />

                                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => saveEdit(product.id)}
                                                            style={primaryButtonStyle}
                                                        >
                                                            Save
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={cancelEdit}
                                                            style={secondaryButtonStyle}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }

                                    const categoryName =
                                        categories.find((c) => c.id === product.category_id)?.name ||
                                        'Sin categoría'

                                    return (
                                        <div key={product.id} style={cardStyle}>
                                            <div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                                    {product.name}
                                                </div>
                                                <div style={{ opacity: 0.85 }}>
                                                    Price: ${Number(product.price || 0).toFixed(2)} | Category: {categoryName}
                                                </div>
                                                <div style={{ opacity: 0.85 }}>
                                                    Shot: {product.is_shot ? 'Yes' : 'No'} | Mixer: {product.is_mixer ? 'Yes' : 'No'}
                                                </div>
                                                <div style={{ opacity: 0.85 }}>
                                                    Free mixers: {Number(product.free_mixers_qty || 0)} | Requires inventory: {product.requires_inventory ? 'Yes' : 'No'}
                                                </div>
                                                <div style={{ opacity: 0.85 }}>
                                                    Status: {product.active ? 'Active' : 'Inactive'}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(product)}
                                                    style={secondaryButtonStyle}
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleActive(product)}
                                                    style={{
                                                        ...secondaryButtonStyle,
                                                        background: product.active ? '#7a1c1c' : '#1f4d32',
                                                    }}
                                                >
                                                    {product.active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #444',
    background: '#111',
    color: 'white',
    boxSizing: 'border-box',
}

const checkboxRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
}

const primaryButtonStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#2e7d32',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
}

const secondaryButtonStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #555',
    background: '#222',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
}

const cardStyle = {
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    background: '#121212',
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
export default ProductsAdminPage