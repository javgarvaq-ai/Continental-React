import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getRecipeMappingsAdminData,
    createRecipeMapping,
    updateRecipeMapping,
    toggleRecipeMappingActive,
} from '../services/recipeMappingsAdmin'

function RecipeMappingAdminPage() {
    const navigate = useNavigate()

    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [inventoryItems, setInventoryItems] = useState([])
    const [recipeRows, setRecipeRows] = useState([])

    const [status, setStatus] = useState('Loading recipe mappings...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const [selectedProductId, setSelectedProductId] = useState('')
    const [newInventoryItemId, setNewInventoryItemId] = useState('')
    const [newDeductAmount, setNewDeductAmount] = useState('')

    const [editingId, setEditingId] = useState('')
    const [editForm, setEditForm] = useState({
        inventory_item_id: '',
        deduct_amount: '',
        active: true,
    })

    const currentUser = useMemo(() => {
        const raw = localStorage.getItem('continentalCurrentUser')
        return raw ? JSON.parse(raw) : null
    }, [])

    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoading(true)
        setStatus('Loading recipe mappings...')

        const { data, error } = await getRecipeMappingsAdminData()

        if (error) {
            setStatus(`Error loading recipe mappings: ${error.message}`)
            setLoading(false)
            return
        }

        const safeProducts = data?.products || []
        const safeCategories = data?.categories || []
        const safeInventoryItems = data?.inventoryItems || []
        const safeRecipeRows = data?.recipeRows || []

        setProducts(safeProducts)
        setCategories(safeCategories)
        setInventoryItems(safeInventoryItems)
        setRecipeRows(safeRecipeRows)

        if (!selectedProductId && safeProducts.length > 0) {
            setSelectedProductId(safeProducts[0].id)
        }

        setStatus('Recipe mappings loaded.')
        setLoading(false)
    }

    async function handleCreateRecipe(event) {
        event.preventDefault()

        if (!isAdmin) {
            setStatus('Only admin can create recipe mappings.')
            return
        }

        if (!selectedProductId) {
            setStatus('Select a product.')
            return
        }

        if (!newInventoryItemId) {
            setStatus('Select an inventory item.')
            return
        }

        if (
            newDeductAmount === '' ||
            Number.isNaN(Number(newDeductAmount)) ||
            Number(newDeductAmount) <= 0
        ) {
            setStatus('Deduct amount must be greater than 0.')
            return
        }

        setIsSaving(true)
        setStatus('Creating recipe mapping...')

        const { error } = await createRecipeMapping({
            productId: selectedProductId,
            inventoryItemId: newInventoryItemId,
            deductAmount: Number(newDeductAmount),
        })

        if (error) {
            setStatus(`Error creating recipe mapping: ${error.message}`)
            setIsSaving(false)
            return
        }

        setNewInventoryItemId('')
        setNewDeductAmount('')
        setIsSaving(false)

        await loadData()
        setStatus('Recipe mapping created successfully.')
    }

    function startEdit(row) {
        setEditingId(row.id)
        setEditForm({
            inventory_item_id: row.inventory_item_id || '',
            deduct_amount: String(row.deduct_amount ?? ''),
            active: Boolean(row.active),
        })
    }

    function cancelEdit() {
        setEditingId('')
        setEditForm({
            inventory_item_id: '',
            deduct_amount: '',
            active: true,
        })
    }

    async function saveEdit(recipeId) {
        if (!isAdmin) {
            setStatus('Only admin can edit recipe mappings.')
            return
        }

        if (!editForm.inventory_item_id) {
            setStatus('Inventory item is required.')
            return
        }

        if (
            editForm.deduct_amount === '' ||
            Number.isNaN(Number(editForm.deduct_amount)) ||
            Number(editForm.deduct_amount) <= 0
        ) {
            setStatus('Deduct amount must be greater than 0.')
            return
        }

        setStatus('Saving recipe mapping changes...')

        const { error } = await updateRecipeMapping({
            recipeId,
            inventoryItemId: editForm.inventory_item_id,
            deductAmount: Number(editForm.deduct_amount),
            active: editForm.active,
        })

        if (error) {
            setStatus(`Error updating recipe mapping: ${error.message}`)
            return
        }

        cancelEdit()
        await loadData()
        setStatus('Recipe mapping updated successfully.')
    }

    async function handleToggleActive(row) {
        if (!isAdmin) {
            setStatus('Only admin can activate/deactivate recipe mappings.')
            return
        }

        const nextActive = !row.active

        setStatus(`${nextActive ? 'Activating' : 'Deactivating'} recipe mapping...`)

        const { error } = await toggleRecipeMappingActive({
            recipeId: row.id,
            active: nextActive,
        })

        if (error) {
            setStatus(`Error updating recipe mapping status: ${error.message}`)
            return
        }

        await loadData()
        setStatus('Recipe mapping status updated.')
    }

    const filteredRecipeRows = recipeRows.filter(
        (row) => row.product_id === selectedProductId
    )
    const requiredInventoryProducts = products.filter(
        (product) => product.requires_inventory && product.active
    )

    const coveredProducts = requiredInventoryProducts.filter((product) =>
        recipeRows.some(
            (row) => row.product_id === product.id && row.active
        )
    )

    const missingRecipeProducts = requiredInventoryProducts.filter(
        (product) =>
            !recipeRows.some(
                (row) => row.product_id === product.id && row.active
            )
    )

    function getCategoryName(categoryId) {
        return (
            categories.find((category) => category.id === categoryId)?.name ||
            'Sin categoría'
        )
    }
    function getProductName(productId) {
        return products.find((product) => product.id === productId)?.name || 'Unknown product'
    }

    function getInventoryItemName(inventoryItemId) {
        return (
            inventoryItems.find((item) => item.id === inventoryItemId)?.name ||
            'Unknown inventory item'
        )
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
                        style={navButtonStyle}
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
                        style={{ ...navButtonStyle, background: '#5a3d1e' }}
                    >
                        Recetas
                    </button>
                    <button type="button" onClick={() => navigate('/admin/categories')} style={navButtonStyle}>
                        Categorías
                    </button>
                    <button type="button" onClick={() => navigate('/admin/membership-plans')} style={navButtonStyle}>
                        Membresías
                    </button>
                    <button type="button" onClick={() => navigate('/admin/customers')} style={navButtonStyle}>
                        Clientes
                    </button>
                    <button type="button" onClick={() => navigate('/admin/units')} style={navButtonStyle}>
                        Mesas/Unidades
                    </button>
                </div>

                <h1 style={{ marginTop: 0 }}>Recipe Mapping Administration</h1>
                <p style={{ opacity: 0.85 }}>{status}</p>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '16px',
                        marginBottom: '24px',
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
                        <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Recipe Coverage Summary</h2>

                        <div style={{ opacity: 0.9, lineHeight: 1.6 }}>
                            <div>Total active products requiring inventory: <strong>{requiredInventoryProducts.length}</strong></div>
                            <div style={{ color: '#8fe388' }}>
                                Covered with active recipe: <strong>{coveredProducts.length}</strong>
                            </div>
                            <div style={{ color: '#ff8a8a' }}>
                                Missing active recipe: <strong>{missingRecipeProducts.length}</strong>
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            background: '#181818',
                            border: '1px solid #2f2f2f',
                            borderRadius: '16px',
                            padding: '20px',
                        }}
                    >
                        <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Operational Note</h2>
                        <div style={{ opacity: 0.9, lineHeight: 1.6 }}>
                            Products marked with <strong>requires inventory</strong> should have at least one
                            active recipe mapping. Otherwise, POS sales may not deduct inventory as expected.
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '16px',
                        padding: '20px',
                        marginBottom: '24px',
                    }}
                >
                    <h2 style={{ marginTop: 0, marginBottom: '12px' }}>
                        Products Missing Active Recipe
                    </h2>

                    {missingRecipeProducts.length === 0 ? (
                        <div
                            style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: '#17351f',
                                border: '1px solid #2e7d32',
                                color: '#d8ffe6',
                                fontWeight: 'bold',
                            }}
                        >
                            All active products that require inventory currently have at least one active recipe mapping.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {missingRecipeProducts.map((product) => (
                                <div
                                    key={product.id}
                                    style={{
                                        border: '1px solid #6b2a2a',
                                        borderRadius: '12px',
                                        padding: '14px',
                                        background: '#2a1414',
                                    }}
                                >
                                    <div style={{ fontSize: '17px', fontWeight: 'bold', color: '#ffd7d7' }}>
                                        {product.name}
                                    </div>
                                    <div style={{ opacity: 0.9 }}>
                                        Category: {getCategoryName(product.category_id)}
                                    </div>
                                    <div style={{ opacity: 0.9 }}>
                                        Status: Missing recipe mapping
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedProductId(product.id)}
                                        style={{
                                            marginTop: '10px',
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #555',
                                            background: '#5a3d1e',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                        }}
                                    >
                                        Select in mapping form
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '400px 1fr',
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
                        <h2 style={{ marginTop: 0 }}>Create Recipe Mapping</h2>

                        <form onSubmit={handleCreateRecipe}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>Product</label>
                                <select
                                    value={selectedProductId}
                                    onChange={(event) => setSelectedProductId(event.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Select product</option>
                                    {requiredInventoryProducts.map((product) => (
                                        <option key={product.id} value={product.id}>
                                            {product.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>
                                    Inventory item
                                </label>
                                <select
                                    value={newInventoryItemId}
                                    onChange={(event) => setNewInventoryItemId(event.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Select inventory item</option>
                                    {inventoryItems.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name} ({item.unit_type})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '8px' }}>
                                    Deduct amount
                                </label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={newDeductAmount}
                                    onChange={(event) => setNewDeductAmount(event.target.value)}
                                    placeholder="Example: 1 or 1.5"
                                    style={inputStyle}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                style={primaryButtonStyle}
                            >
                                {isSaving ? 'Creating...' : 'Create Mapping'}
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
                        <h2 style={{ marginTop: 0 }}>Current Mappings</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px' }}>
                                Filter by product
                            </label>
                            <select
                                value={selectedProductId}
                                onChange={(event) => setSelectedProductId(event.target.value)}
                                style={inputStyle}
                            >
                                <option value="">Select product</option>
                                {requiredInventoryProducts.map((product) => (
                                    <option key={product.id} value={product.id}>
                                        {product.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {loading ? (
                            <div>Loading...</div>
                        ) : !selectedProductId ? (
                            <div>Select a product to view mappings.</div>
                        ) : filteredRecipeRows.length === 0 ? (
                            <div>
                                No recipe mappings found for <strong>{getProductName(selectedProductId)}</strong>.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {filteredRecipeRows.map((row) => {
                                    const isEditing = editingId === row.id

                                    if (isEditing) {
                                        return (
                                            <div key={row.id} style={cardStyle}>
                                                <div style={{ width: '100%' }}>
                                                    <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>
                                                        {getProductName(row.product_id)}
                                                    </div>

                                                    <select
                                                        value={editForm.inventory_item_id}
                                                        onChange={(event) =>
                                                            setEditForm((prev) => ({
                                                                ...prev,
                                                                inventory_item_id: event.target.value,
                                                            }))
                                                        }
                                                        style={{ ...inputStyle, marginBottom: '10px' }}
                                                    >
                                                        <option value="">Select inventory item</option>
                                                        {inventoryItems.map((item) => (
                                                            <option key={item.id} value={item.id}>
                                                                {item.name} ({item.unit_type})
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <input
                                                        type="number"
                                                        min="0.01"
                                                        step="0.01"
                                                        value={editForm.deduct_amount}
                                                        onChange={(event) =>
                                                            setEditForm((prev) => ({
                                                                ...prev,
                                                                deduct_amount: event.target.value,
                                                            }))
                                                        }
                                                        style={{ ...inputStyle, marginBottom: '10px' }}
                                                    />

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

                                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => saveEdit(row.id)}
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

                                    return (
                                        <div key={row.id} style={cardStyle}>
                                            <div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                                    {getProductName(row.product_id)}
                                                </div>
                                                <div style={{ opacity: 0.85 }}>
                                                    Inventory item: {getInventoryItemName(row.inventory_item_id)}
                                                </div>
                                                <div style={{ opacity: 0.85 }}>
                                                    Deduct amount: {Number(row.deduct_amount || 0)}
                                                </div>
                                                <div style={{ opacity: 0.85 }}>
                                                    Status: {row.active ? 'Active' : 'Inactive'}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(row)}
                                                    style={secondaryButtonStyle}
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleActive(row)}
                                                    style={{
                                                        ...secondaryButtonStyle,
                                                        background: row.active ? '#7a1c1c' : '#1f4d32',
                                                    }}
                                                >
                                                    {row.active ? 'Deactivate' : 'Activate'}
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

const navButtonStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #555',
    background: '#222',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
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

export default RecipeMappingAdminPage