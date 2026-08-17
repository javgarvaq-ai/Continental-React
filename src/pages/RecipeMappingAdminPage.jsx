import { useCallback, useEffect, useState } from 'react'
import { useStatus } from '../hooks/useStatus'
import {
    getRecipeMappingsAdminData,
    createRecipeMapping,
    updateRecipeMapping,
    toggleRecipeMappingActive,
} from '../services/recipeMappingsAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'
import {
    CAPTURE_MODES,
    amountFromCapture,
    bottleEquivalent,
    referenceSizeMl,
    sizeOptionsFor,
    unitLabel,
    usesBottles,
    usesOunces,
} from '../utils/inventoryUnits'

/** Tamaño de captura por defecto: la botella de referencia del insumo. */
function defaultSizeMl(item) {
    const options = sizeOptionsFor(item)
    return options.length > 0 ? String(options[0].ml) : '700'
}

/**
 * Campo de cantidad con selector de unidad opcional.
 *
 * `oz` es SIEMPRE el modo por defecto: ignorar el selector reproduce exactamente
 * el comportamiento que tenía este formulario antes de que el selector existiera.
 * `ml` y `bottle` son opt-in. Sea cual sea el modo, lo que se guarda en
 * `product_recipes.deduct_amount` es la unidad base del insumo — la conversión
 * ocurre solo al capturar.
 */
function AmountCapture({ item, mode, amount, sizeMl, onMode, onAmount, onSizeMl }) {
    const byOunces = usesOunces(item)
    const isBottle = byOunces && mode === CAPTURE_MODES.BOTTLE
    const isMl = byOunces && mode === CAPTURE_MODES.ML

    const computed = amountFromCapture({ item, mode, amount, sizeMl })
    const equivalent = bottleEquivalent(item, computed)

    const captureUnit = !byOunces
        ? (unitLabel(item && item.unit_type) || 'units')
        : isBottle ? 'bottles'
        : isMl ? 'ml'
        : 'oz'

    return (
        <div>
            <label style={{ display: 'block', marginBottom: '8px' }}>
                Deduct amount{item ? ` (${captureUnit})` : ''}
            </label>

            {byOunces && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    {[
                        { key: CAPTURE_MODES.OZ, label: 'oz' },
                        { key: CAPTURE_MODES.ML, label: 'ml' },
                        { key: CAPTURE_MODES.BOTTLE, label: 'bottle' },
                    ].map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => onMode(option.key)}
                            style={{
                                flex: 1,
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: '1px solid',
                                borderColor: mode === option.key ? '#4a90d9' : '#333',
                                background: mode === option.key ? '#1d3557' : 'transparent',
                                color: mode === option.key ? '#e2e8f0' : '#777',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: mode === option.key ? 700 : 400,
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
                <input
                    type="number"
                    min="0"
                    step={isBottle ? '1' : '0.01'}
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => onAmount(event.target.value)}
                    placeholder={isBottle ? '1' : isMl ? '45' : '1.5'}
                    style={{ ...inputStyle, flex: isBottle ? '0 0 110px' : '1' }}
                />

                {isBottle && (
                    <select
                        value={sizeMl}
                        onChange={(event) => onSizeMl(event.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                    >
                        {sizeOptionsFor(item).map((option) => (
                            <option key={option.ml} value={String(option.ml)}>{option.label}</option>
                        ))}
                    </select>
                )}
            </div>

            <div
                style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: computed > 0 ? '#13251a' : '#141414',
                    border: `1px solid ${computed > 0 ? '#2e7d32' : '#2a2a2a'}`,
                    fontSize: '13px',
                    lineHeight: 1.5,
                }}
            >
                {computed > 0 ? (
                    <>
                        <div>
                            {isBottle && `${Number(amount)} × ${sizeMl} ml = `}
                            {isMl && `${Number(amount)} ml = `}
                            <strong>{computed} {unitLabel(item && item.unit_type)}</strong> per unit sold
                        </div>
                        {equivalent && !isBottle && (
                            <div style={{ opacity: 0.7 }}>{equivalent}</div>
                        )}
                    </>
                ) : (
                    <span style={{ opacity: 0.55 }}>
                        {item ? 'Enter an amount above zero.' : 'Select an inventory item first.'}
                    </span>
                )}
            </div>
        </div>
    )
}

function RecipeMappingAdminPage() {
    const [products, setProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [inventoryItems, setInventoryItems] = useState([])
    const [recipeRows, setRecipeRows] = useState([])

    const { status, statusColor, setStatus } = useStatus('Loading recipe mappings...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const [selectedProductId, setSelectedProductId] = useState('all')
    const [newInventoryItemId, setNewInventoryItemId] = useState('')
    const [newDeductAmount, setNewDeductAmount] = useState('')
    const [newCaptureMode, setNewCaptureMode] = useState(CAPTURE_MODES.OZ)
    const [newSizeMl, setNewSizeMl] = useState('700')

    // ── Filtros (cliente, sin tocar el servicio) ──────────────
    const [productSearch, setProductSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [onlyWithRecipe, setOnlyWithRecipe] = useState(false)

    const [editingId, setEditingId] = useState('')
    const [editForm, setEditForm] = useState({
        inventory_item_id: '',
        deduct_amount: '',
        capture_mode: CAPTURE_MODES.OZ,
        size_ml: '700',
        active: true,
    })

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    const loadData = useCallback(async () => {
        setLoading(true)
        setStatus('Loading recipe mappings...')

        const { data, error } = await getRecipeMappingsAdminData()

        if (error) {
            setStatus(`Error loading recipe mappings: ${error.message}`)
            setLoading(false)
            return
        }

        setProducts(data?.products || [])
        setCategories(data?.categories || [])
        setInventoryItems(data?.inventoryItems || [])
        setRecipeRows(data?.recipeRows || [])

        setStatus('Recipe mappings loaded.')
        setLoading(false)
    }, [setStatus])

    useEffect(() => {
        loadData()
    }, [loadData])

    function findInventoryItem(id) {
        return inventoryItems.find((item) => item.id === id) || null
    }

    const newItem = findInventoryItem(newInventoryItemId)
    const editItem = findInventoryItem(editForm.inventory_item_id)

    function handleNewInventoryItem(id) {
        setNewInventoryItemId(id)
        // El modo vuelve a oz al cambiar de insumo: nunca se hereda un modo de
        // captura que pertenecía a un insumo distinto.
        setNewCaptureMode(CAPTURE_MODES.OZ)
        setNewSizeMl(defaultSizeMl(findInventoryItem(id)))
    }

    async function handleCreateRecipe(event) {
        event.preventDefault()

        if (!isAdmin) {
            setStatus('Only admin can create recipe mappings.')
            return
        }

        if (!selectedProductId || selectedProductId === 'all') {
            setStatus('Select a product.')
            return
        }

        if (!newInventoryItemId) {
            setStatus('Select an inventory item.')
            return
        }

        const deductAmount = amountFromCapture({
            item: newItem,
            mode: newCaptureMode,
            amount: newDeductAmount,
            sizeMl: newSizeMl,
        })

        if (deductAmount <= 0) {
            setStatus('Deduct amount must be greater than 0.')
            return
        }

        setIsSaving(true)
        setStatus('Creating recipe mapping...')

        const { error } = await createRecipeMapping({
            productId: selectedProductId,
            inventoryItemId: newInventoryItemId,
            deductAmount,
        })

        if (error) {
            setStatus(`Error creating recipe mapping: ${error.message}`)
            setIsSaving(false)
            return
        }

        setNewInventoryItemId('')
        setNewDeductAmount('')
        setNewCaptureMode(CAPTURE_MODES.OZ)
        setIsSaving(false)

        await loadData()
        setStatus('Recipe mapping created successfully.')
    }

    function startEdit(row) {
        const item = findInventoryItem(row.inventory_item_id)
        // Se abre SIEMPRE en oz con el valor guardado tal cual. No se intenta
        // inferir que "esto eran 1.5 botellas": adivinarlo reescribiría valores
        // en silencio al guardar.
        setEditingId(row.id)
        setEditForm({
            inventory_item_id: row.inventory_item_id || '',
            deduct_amount: String(row.deduct_amount == null ? '' : row.deduct_amount),
            capture_mode: CAPTURE_MODES.OZ,
            size_ml: defaultSizeMl(item),
            active: Boolean(row.active),
        })
    }

    function cancelEdit() {
        setEditingId('')
        setEditForm({
            inventory_item_id: '',
            deduct_amount: '',
            capture_mode: CAPTURE_MODES.OZ,
            size_ml: '700',
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

        const deductAmount = amountFromCapture({
            item: editItem,
            mode: editForm.capture_mode,
            amount: editForm.deduct_amount,
            sizeMl: editForm.size_ml,
        })

        if (deductAmount <= 0) {
            setStatus('Deduct amount must be greater than 0.')
            return
        }

        setStatus('Saving recipe mapping changes...')

        const { error } = await updateRecipeMapping({
            recipeId,
            inventoryItemId: editForm.inventory_item_id,
            deductAmount,
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

    const requiredInventoryProducts = products.filter(
        (product) => product.requires_inventory && product.active
    )

    const coveredProducts = requiredInventoryProducts.filter((product) =>
        recipeRows.some((row) => row.product_id === product.id && row.active)
    )

    const missingRecipeProducts = requiredInventoryProducts.filter(
        (product) => !recipeRows.some((row) => row.product_id === product.id && row.active)
    )

    // ── Filtros (cliente) ─────────────────────────────────────
    const coveredProductIds = new Set(coveredProducts.map((product) => product.id))
    const productSearchQuery = productSearch.trim().toLowerCase()

    const visibleProducts = requiredInventoryProducts.filter((product) => {
        if (productSearchQuery && !product.name.toLowerCase().includes(productSearchQuery)) return false
        if (categoryFilter && product.category_id !== categoryFilter) return false
        if (onlyWithRecipe && !coveredProductIds.has(product.id)) return false
        return true
    })
    const visibleProductIds = new Set(visibleProducts.map((product) => product.id))

    const visibleMissingRecipeProducts = missingRecipeProducts.filter((product) => {
        if (productSearchQuery && !product.name.toLowerCase().includes(productSearchQuery)) return false
        if (categoryFilter && product.category_id !== categoryFilter) return false
        return true
    })

    const filteredRecipeRows = recipeRows.filter((row) => {
        if (selectedProductId === 'all') return visibleProductIds.has(row.product_id)
        return row.product_id === selectedProductId
    })

    function getCategoryName(categoryId) {
        return categories.find((category) => category.id === categoryId)?.name || 'Sin categoría'
    }

    function getProductName(productId) {
        return products.find((product) => product.id === productId)?.name || 'Unknown product'
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
                paddingLeft: '216px',
                boxSizing: 'border-box',
            }}
        >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

                <AdminNav currentPath="/admin/recipe-mappings" />

                <h1 style={{ margin: '0 0 6px', fontSize: '26px' }}>Recipe Mapping Administration</h1>
                <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#8b8b8b', lineHeight: 1.5 }}>
                    Every product marked <strong>requires inventory</strong> needs at least one active
                    recipe mapping — otherwise POS sales will not deduct inventory.
                </p>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: statusColor }}>{status}</p>

                {/* Coverage summary: fila delgada, no tarjeta */}
                <div
                    style={{
                        display: 'flex',
                        gap: '28px',
                        flexWrap: 'wrap',
                        alignItems: 'baseline',
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '12px',
                        padding: '14px 20px',
                        marginBottom: '16px',
                    }}
                >
                    {[
                        { value: requiredInventoryProducts.length, label: 'require inventory', color: 'white' },
                        { value: coveredProducts.length, label: 'with recipe', color: '#8fe388' },
                        { value: missingRecipeProducts.length, label: 'missing recipe', color: '#ff8a8a' },
                    ].map((stat) => (
                        <div key={stat.label}>
                            <span style={{ fontSize: '22px', fontWeight: 700, color: stat.color }}>{stat.value}</span>
                            <span
                                style={{
                                    fontSize: '12px',
                                    color: '#8b8b8b',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.07em',
                                    marginLeft: '8px',
                                }}
                            >
                                {stat.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Filtros */}
                <div
                    style={{
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        marginBottom: '20px',
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                    }}
                >
                    <input
                        type="text"
                        placeholder="Buscar producto por nombre..."
                        value={productSearch}
                        onChange={(event) => setProductSearch(event.target.value)}
                        style={{ flex: 1, minWidth: '220px', ...inputStyle }}
                    />
                    <select
                        value={categoryFilter}
                        onChange={(event) => setCategoryFilter(event.target.value)}
                        style={{ width: '200px', ...inputStyle }}
                    >
                        <option value="">Todas las categorías</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={onlyWithRecipe}
                            onChange={(event) => setOnlyWithRecipe(event.target.checked)}
                        />
                        Solo con receta activa
                    </label>
                </div>

                {/* Módulo de trabajo: arriba, visible sin scroll */}
                <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px', alignItems: 'start' }}>

                    <div>
                        <div style={{ ...panelStyle, marginBottom: '16px' }}>
                            <h2 style={{ marginTop: 0, fontSize: '18px' }}>Create Recipe Mapping</h2>

                            <form onSubmit={handleCreateRecipe}>
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px' }}>Product</label>
                                    <select
                                        value={selectedProductId}
                                        onChange={(event) => setSelectedProductId(event.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="">Select product</option>
                                        {visibleProducts.map((product) => (
                                            <option key={product.id} value={product.id}>{product.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px' }}>Inventory item</label>
                                    <select
                                        value={newInventoryItemId}
                                        onChange={(event) => handleNewInventoryItem(event.target.value)}
                                        style={inputStyle}
                                    >
                                        <option value="">Select inventory item</option>
                                        {inventoryItems.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.unit_type}
                                                {usesBottles(item) ? `, ${referenceSizeMl(item)} ml` : ''})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <AmountCapture
                                        item={newItem}
                                        mode={newCaptureMode}
                                        amount={newDeductAmount}
                                        sizeMl={newSizeMl}
                                        onMode={setNewCaptureMode}
                                        onAmount={setNewDeductAmount}
                                        onSizeMl={setNewSizeMl}
                                    />
                                </div>

                                <button type="submit" disabled={isSaving} style={primaryButtonStyle}>
                                    {isSaving ? 'Creating...' : 'Create Mapping'}
                                </button>
                            </form>
                        </div>

                        {/* Pendientes: chips, pegados al formulario que alimentan */}
                        <div style={panelStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <span
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        color: '#6b6b6b',
                                    }}
                                >
                                    Missing recipe
                                </span>
                                {missingRecipeProducts.length > 0 && (
                                    <span
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: '20px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            background: '#3a1414',
                                            color: '#ff9a9a',
                                            border: '1px solid #6b2a2a',
                                        }}
                                    >
                                        {missingRecipeProducts.length}
                                    </span>
                                )}
                            </div>

                            {missingRecipeProducts.length === 0 ? (
                                <div
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        background: '#17351f',
                                        border: '1px solid #2e7d32',
                                        color: '#d8ffe6',
                                        fontSize: '13px',
                                    }}
                                >
                                    Every active product requiring inventory has a recipe.
                                </div>
                            ) : visibleMissingRecipeProducts.length === 0 ? (
                                <div style={{ color: '#888', fontSize: '13px' }}>Sin resultados con estos filtros.</div>
                            ) : (
                                <>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px',
                                            maxHeight: '260px',
                                            overflowY: 'auto',
                                        }}
                                    >
                                        {visibleMissingRecipeProducts.map((product) => (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() => setSelectedProductId(product.id)}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    gap: '8px',
                                                    width: '100%',
                                                    textAlign: 'left',
                                                    padding: '7px 10px',
                                                    borderRadius: '7px',
                                                    border: '1px solid',
                                                    borderColor: selectedProductId === product.id ? '#b8574f' : '#4a2020',
                                                    background: selectedProductId === product.id ? '#3a1a1a' : '#1e1212',
                                                    color: '#ffc9c9',
                                                    cursor: 'pointer',
                                                    fontSize: '12.5px',
                                                }}
                                            >
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {product.name}
                                                </span>
                                                <span style={{ color: '#8b6b6b', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                                                    {getCategoryName(product.category_id)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#777', lineHeight: 1.5 }}>
                                        Click one to load it into the form above.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <div style={panelStyle}>
                        <h2 style={{ marginTop: 0, fontSize: '18px' }}>Current Mappings</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px' }}>Filter by product</label>
                            <select
                                value={selectedProductId}
                                onChange={(event) => setSelectedProductId(event.target.value)}
                                style={inputStyle}
                            >
                                <option value="all">Todos los productos</option>
                                <option value="">— Seleccionar para crear —</option>
                                {visibleProducts.map((product) => (
                                    <option key={product.id} value={product.id}>{product.name}</option>
                                ))}
                            </select>
                        </div>

                        {loading ? (
                            <div>Loading...</div>
                        ) : filteredRecipeRows.length === 0 ? (
                            <div style={{ color: '#888', fontSize: '13px' }}>
                                {selectedProductId === 'all'
                                    ? 'No recipe mappings found for these filters.'
                                    : <>No recipe mappings found for <strong>{getProductName(selectedProductId)}</strong>.</>}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {filteredRecipeRows.map((row) => {
                                    const item = findInventoryItem(row.inventory_item_id)
                                    const amount = Number(row.deduct_amount || 0)
                                    const equivalent = bottleEquivalent(item, amount)

                                    if (editingId === row.id) {
                                        return (
                                            <div key={row.id} style={cardStyle}>
                                                <div style={{ width: '100%' }}>
                                                    <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>
                                                        {getProductName(row.product_id)}
                                                    </div>

                                                    <label style={{ display: 'block', marginBottom: '8px' }}>Inventory item</label>
                                                    <select
                                                        value={editForm.inventory_item_id}
                                                        onChange={(event) => {
                                                            const id = event.target.value
                                                            setEditForm((prev) => ({
                                                                ...prev,
                                                                inventory_item_id: id,
                                                                capture_mode: CAPTURE_MODES.OZ,
                                                                size_ml: defaultSizeMl(findInventoryItem(id)),
                                                            }))
                                                        }}
                                                        style={{ ...inputStyle, marginBottom: '14px' }}
                                                    >
                                                        <option value="">Select inventory item</option>
                                                        {inventoryItems.map((option) => (
                                                            <option key={option.id} value={option.id}>
                                                                {option.name} ({option.unit_type}
                                                                {usesBottles(option) ? `, ${referenceSizeMl(option)} ml` : ''})
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <div style={{ marginBottom: '14px' }}>
                                                        <AmountCapture
                                                            item={editItem}
                                                            mode={editForm.capture_mode}
                                                            amount={editForm.deduct_amount}
                                                            sizeMl={editForm.size_ml}
                                                            onMode={(mode) => setEditForm((prev) => ({ ...prev, capture_mode: mode }))}
                                                            onAmount={(value) => setEditForm((prev) => ({ ...prev, deduct_amount: value }))}
                                                            onSizeMl={(value) => setEditForm((prev) => ({ ...prev, size_ml: value }))}
                                                        />
                                                    </div>

                                                    <label style={checkboxRowStyle}>
                                                        <input
                                                            type="checkbox"
                                                            checked={editForm.active}
                                                            onChange={(event) =>
                                                                setEditForm((prev) => ({ ...prev, active: event.target.checked }))
                                                            }
                                                        />
                                                        Active
                                                    </label>

                                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                        <button type="button" onClick={() => saveEdit(row.id)} style={primaryButtonStyle}>
                                                            Save
                                                        </button>
                                                        <button type="button" onClick={cancelEdit} style={secondaryButtonStyle}>
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
                                                <div style={{ fontSize: '17px', fontWeight: 'bold' }}>
                                                    {getProductName(row.product_id)}
                                                </div>
                                                <div style={{ opacity: 0.85, fontSize: '13px', marginTop: '3px' }}>
                                                    Inventory item: {item ? item.name : 'Unknown inventory item'}
                                                </div>
                                                <div style={{ opacity: 0.85, fontSize: '13px' }}>
                                                    Deducts: <strong>{amount} {unitLabel(item && item.unit_type)}</strong>
                                                    {equivalent && <span style={{ opacity: 0.65 }}> ({equivalent})</span>}
                                                </div>
                                                {!row.active && (
                                                    <div style={{ fontSize: '12px', color: '#ff8a8a', marginTop: '3px' }}>Inactive</div>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                <button type="button" onClick={() => startEdit(row)} style={secondaryButtonStyle}>
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleActive(row)}
                                                    style={{ ...secondaryButtonStyle, background: row.active ? '#7a1c1c' : '#1f4d32' }}
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


const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #444',
    background: '#111',
    color: 'white',
    boxSizing: 'border-box',
}

const panelStyle = {
    background: '#181818',
    border: '1px solid #2f2f2f',
    borderRadius: '16px',
    padding: '20px',
}

const cardStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    alignItems: 'flex-start',
    border: '1px solid #2f2f2f',
    borderRadius: '12px',
    padding: '14px',
    background: '#141414',
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
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #444',
    background: '#242424',
    color: '#ddd',
    cursor: 'pointer',
    fontSize: '12px',
}

export default RecipeMappingAdminPage
