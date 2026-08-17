import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStatus } from '../hooks/useStatus'
import {
    getAllInventoryItems,
    createInventoryItem,
    updateInventoryItem,
    toggleInventoryItemActive,
    adjustInventoryStock,
} from '../services/inventoryAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'
import {
    BOTTLE_SIZES_ML,
    CAPTURE_MODES,
    amountFromCapture,
    capacityOzFromMl,
    mlFromOz,
    unitCostFromBottlePrice,
    unitLabel,
    usesOunces,
} from '../utils/inventoryUnits'

const COST_MODES = { PER_UNIT: 'unit', PER_BOTTLE: 'bottle' }

const STATUS_COLOR = (stock, unitType) => {
    if (stock <= 0) return '#b71c1c'
    if (unitType === 'oz' && stock < 5) return '#e65100'
    if (unitType === 'unit' && stock < 3) return '#e65100'
    return '#2e7d32'
}

/** ¿Es un error de nombre duplicado? (índice único ux_inventory_items_name_unique) */
function isDuplicateNameError(error) {
    if (!error) return false
    return error.code === '23505' || /duplicate key|already exists|unique constraint/i.test(error.message || '')
}

const input = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #444',
    background: '#111',
    color: 'white',
    boxSizing: 'border-box',
}

const label = { display: 'block', marginBottom: '6px', fontSize: '13px' }
const hint = { fontSize: '12px', color: '#8b8b8b', marginTop: '6px' }

/**
 * Tamaño de botella capturado en MILILITROS.
 *
 * Se guarda como `capacity_oz` (numeric(12,2)). Verificado 2026-08-16: el viaje
 * redondo ml → oz → ml es exacto en todo el rango 100–2000 ml, así que abrir un
 * insumo existente y guardarlo NO corre su capacidad.
 *
 * El input es libre a propósito: hay presentaciones fuera de lo estándar (las de
 * 695 ml son reales). Los chips son solo atajo para los tamaños frecuentes.
 */
function CapacityField({ unitType, valueMl, onChange }) {
    if (unitType !== 'oz') return null

    const oz = capacityOzFromMl(valueMl, unitType)

    return (
        <div>
            <label style={label}>Tamaño de botella (ml)</label>
            <input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                placeholder="700"
                value={valueMl}
                onChange={(e) => onChange(e.target.value)}
                style={{ ...input, width: '120px' }}
            />
            <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                {BOTTLE_SIZES_ML.map((ml) => (
                    <button
                        key={ml}
                        type="button"
                        onClick={() => onChange(String(ml))}
                        style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid',
                            borderColor: String(ml) === String(valueMl) ? '#4a90d9' : '#333',
                            background: String(ml) === String(valueMl) ? '#1d3557' : 'transparent',
                            color: String(ml) === String(valueMl) ? '#e2e8f0' : '#777',
                            cursor: 'pointer',
                            fontSize: '11.5px',
                        }}
                    >
                        {ml}
                    </button>
                ))}
            </div>
            <div style={hint}>
                {oz ? `= ${oz} oz` : 'Opcional — sin tamaño no se puede capturar en botellas.'}
            </div>
        </div>
    )
}

/**
 * Costo del insumo, capturable de dos formas.
 *
 * `unit_cost` es numeric(12,4) y SIEMPRE se guarda por unidad base. El modo
 * "por botella" solo divide al capturar ($290 ÷ 23.67 oz = 12.2518 / oz).
 *
 * Al EDITAR se abre siempre en "por unidad" mostrando el valor guardado tal
 * cual: reconstruir el precio de botella para volver a dividirlo encadenaría
 * redondeos sobre un dato que alimenta el COGS.
 */
function CostField({ unitType, capacityOz, mode, value, onMode, onChange }) {
    const canPerBottle = unitType === 'oz' && Number(capacityOz) > 0
    const isPerBottle = canPerBottle && mode === COST_MODES.PER_BOTTLE
    const base = unitLabel(unitType) || 'unidad'

    const stored = isPerBottle
        ? unitCostFromBottlePrice(value, capacityOz)
        : (Number(value) > 0 ? Number(value) : 0)

    return (
        <div>
            <label style={label}>Costo {isPerBottle ? '(precio por botella)' : `(por ${base})`}</label>

            {canPerBottle && (
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    {[
                        { key: COST_MODES.PER_BOTTLE, text: 'por botella' },
                        { key: COST_MODES.PER_UNIT, text: `por ${base}` },
                    ].map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => onMode(option.key)}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid',
                                borderColor: mode === option.key ? '#4a90d9' : '#333',
                                background: mode === option.key ? '#1d3557' : 'transparent',
                                color: mode === option.key ? '#e2e8f0' : '#777',
                                cursor: 'pointer',
                                fontSize: '11.5px',
                            }}
                        >
                            {option.text}
                        </button>
                    ))}
                </div>
            )}

            <input
                type="number"
                step="0.0001"
                min="0"
                placeholder="opcional"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{ ...input, width: '130px' }}
            />

            {isPerBottle && (
                <div style={hint}>
                    {stored > 0 ? `= $${stored} / ${base}` : `Se guardará dividido entre ${capacityOz} ${base}.`}
                </div>
            )}
        </div>
    )
}

function InventoryItemsAdminPage() {
    const [items, setItems] = useState([])
    const { status, statusColor, setStatus } = useStatus('Loading inventory items...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const nameInputRef = useRef(null)

    const [newName, setNewName] = useState('')
    const [newUnitType, setNewUnitType] = useState('unit')
    const [newCapacityMl, setNewCapacityMl] = useState('')
    const [newUnitCost, setNewUnitCost] = useState('')
    const [newCostMode, setNewCostMode] = useState(COST_MODES.PER_BOTTLE)

    const [editingId, setEditingId] = useState('')
    const [editForm, setEditForm] = useState({
        name: '', unit_type: 'unit', capacity_ml: '', unit_cost: '', cost_mode: COST_MODES.PER_UNIT, active: true,
    })

    const [adjustingId, setAdjustingId] = useState(null)
    const [adjustForm, setAdjustForm] = useState({
        amount: '', type: 'entry', note: '', mode: CAPTURE_MODES.OZ, sizeMl: '700',
    })

    // ── Filtros (cliente, sin tocar el servicio) ──────────────
    const [searchText, setSearchText] = useState('')
    const [onlySinCosto, setOnlySinCosto] = useState(false)
    const [unitTypeFilter, setUnitTypeFilter] = useState('')
    const [hideInactive, setHideInactive] = useState(false)

    const unitTypeOptions = useMemo(() => {
        const set = new Set(items.map(item => item.unit_type).filter(Boolean))
        return Array.from(set).sort()
    }, [items])

    const visibleItems = useMemo(() => {
        const q = searchText.trim().toLowerCase()
        return items.filter(item => {
            if (q && !item.name.toLowerCase().includes(q)) return false
            if (onlySinCosto && item.unit_cost != null) return false
            if (unitTypeFilter && item.unit_type !== unitTypeFilter) return false
            if (hideInactive && !item.active) return false
            return true
        })
    }, [items, searchText, onlySinCosto, unitTypeFilter, hideInactive])

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    const loadItems = useCallback(async () => {
        setLoading(true)
        const { data, error } = await getAllInventoryItems()
        if (error) { setStatus(error.message); setLoading(false); return }
        setItems(data || [])
        setStatus(`${(data || []).length} inventory items loaded.`)
        setLoading(false)
    }, [setStatus])

    useEffect(() => { loadItems() }, [loadItems])

    const newCapacityOz = capacityOzFromMl(newCapacityMl, newUnitType)

    async function handleCreate(e) {
        e.preventDefault()
        if (!newName.trim()) { setStatus('Name required'); return }

        setIsSaving(true)

        const unitCost = newUnitType === 'oz' && newCostMode === COST_MODES.PER_BOTTLE && newCapacityOz
            ? (Number(newUnitCost) > 0 ? unitCostFromBottlePrice(newUnitCost, newCapacityOz) : '')
            : newUnitCost

        const { error } = await createInventoryItem({
            name: newName,
            unitType: newUnitType,
            capacityOz: newCapacityOz,
            unitCost,
        })

        if (error) {
            // No se limpia el formulario: se corrige el nombre y se reintenta.
            setStatus(isDuplicateNameError(error)
                ? `Ya existe un insumo llamado "${newName.trim()}". Usa otro nombre.`
                : error.message)
            setIsSaving(false)
            return
        }

        // Captura en racha: se CONSERVAN tipo de unidad y tamaño (vienen
        // repetidos), se limpian nombre y costo, y el foco vuelve a Nombre.
        setNewName('')
        setNewUnitCost('')
        setStatus(`"${newName.trim()}" creado.`)
        setIsSaving(false)
        await loadItems()
        nameInputRef.current?.focus()
    }

    function startEdit(item) {
        setEditingId(item.id)
        // Abre en "por unidad" con el valor guardado tal cual — sin reconstruir
        // precios ni encadenar redondeos sobre un dato que alimenta el COGS.
        setEditForm({
            name: item.name,
            unit_type: item.unit_type,
            capacity_ml: item.capacity_oz ? String(mlFromOz(item.capacity_oz)) : '',
            unit_cost: item.unit_cost == null ? '' : String(item.unit_cost),
            cost_mode: COST_MODES.PER_UNIT,
            active: item.active,
        })
    }

    async function saveEdit(id) {
        setIsSaving(true)

        const capacityOz = capacityOzFromMl(editForm.capacity_ml, editForm.unit_type)
        const unitCost = editForm.unit_type === 'oz' && editForm.cost_mode === COST_MODES.PER_BOTTLE && capacityOz
            ? (Number(editForm.unit_cost) > 0 ? unitCostFromBottlePrice(editForm.unit_cost, capacityOz) : '')
            : editForm.unit_cost

        const { error } = await updateInventoryItem({
            id,
            name: editForm.name,
            unitType: editForm.unit_type,
            capacityOz,
            unitCost,
            active: editForm.active,
        })

        if (error) {
            setStatus(isDuplicateNameError(error)
                ? `Ya existe un insumo llamado "${editForm.name.trim()}". Usa otro nombre.`
                : error.message)
            setIsSaving(false)
            return
        }

        setEditingId('')
        setStatus('Item updated.')
        setIsSaving(false)
        await loadItems()
    }

    function openAdjust(item) {
        setAdjustingId(item.id)
        setAdjustForm({
            amount: '',
            type: 'entry',
            note: '',
            mode: CAPTURE_MODES.OZ,
            sizeMl: item.capacity_oz ? String(mlFromOz(item.capacity_oz)) : '700',
        })
    }

    function adjustAmount(item) {
        return amountFromCapture({
            item,
            mode: adjustForm.mode,
            amount: adjustForm.amount,
            sizeMl: adjustForm.sizeMl,
        })
    }

    async function handleAdjust(item) {
        const amount = adjustAmount(item)
        if (amount <= 0) { setStatus('Enter a valid amount.'); return }

        setIsSaving(true)
        const { error, data: newStock } = await adjustInventoryStock({
            id: item.id,
            amount,
            type: adjustForm.type,
            note: adjustForm.note,
            userId: currentUser?.id,
        })

        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }

        setAdjustingId(null)
        setStatus(`Stock updated. New stock: ${newStock} ${unitLabel(item.unit_type)}`)
        setIsSaving(false)
        await loadItems()
    }

    if (!isAdmin) return <div style={{ padding: 20 }}>Access denied</div>

    return (
        <div style={{ padding: '24px', paddingLeft: '216px', background: '#111', color: 'white', minHeight: '100vh', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <AdminNav currentPath="/admin/inventory-items" />
                <h1 style={{ marginTop: 0 }}>Inventory Items</h1>
                <p style={{ opacity: 0.85, color: statusColor }}>{status}</p>

                {/* CREATE FORM */}
                <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
                    <h2 style={{ marginTop: 0 }}>New Item</h2>
                    <form onSubmit={handleCreate} style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                            <label style={label}>Name *</label>
                            <input
                                ref={nameInputRef}
                                placeholder="e.g. Herradura Blanco"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                style={{ ...input, width: '200px' }}
                            />
                        </div>

                        <div>
                            <label style={label}>Unit Type</label>
                            <select
                                value={newUnitType}
                                onChange={(e) => setNewUnitType(e.target.value)}
                                style={input}
                            >
                                <option value="unit">Unidad</option>
                                <option value="oz">oz</option>
                                <option value="L">L</option>
                                <option value="ml">ml</option>
                                <option value="kg">kg</option>
                                <option value="g">g</option>
                            </select>
                        </div>

                        <CapacityField unitType={newUnitType} valueMl={newCapacityMl} onChange={setNewCapacityMl} />

                        <CostField
                            unitType={newUnitType}
                            capacityOz={newCapacityOz}
                            mode={newCostMode}
                            value={newUnitCost}
                            onMode={setNewCostMode}
                            onChange={setNewUnitCost}
                        />

                        <div>
                            <label style={{ ...label, visibility: 'hidden' }}>.</label>
                            <button
                                type="submit"
                                disabled={isSaving || !newName.trim()}
                                style={{
                                    padding: '10px 20px', borderRadius: '8px', border: 'none',
                                    background: isSaving || !newName.trim() ? '#555' : '#2e7d32',
                                    color: 'white', fontWeight: 'bold', cursor: 'pointer',
                                }}
                            >
                                {isSaving ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </form>

                    <div style={{ ...hint, marginTop: '12px' }}>
                        Al crear se conservan <strong>tipo de unidad</strong> y <strong>tamaño</strong> para la
                        siguiente captura; se limpian nombre y costo.
                    </div>
                </div>

                {/* FILTERS */}
                <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '16px 20px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ ...input, flex: 1, minWidth: '220px' }}
                    />
                    <select value={unitTypeFilter} onChange={(e) => setUnitTypeFilter(e.target.value)} style={input}>
                        <option value="">Todos los tipos</option>
                        {unitTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={onlySinCosto} onChange={(e) => setOnlySinCosto(e.target.checked)} />
                        Solo sin costo capturado
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} />
                        Ocultar inactivos
                    </label>
                </div>

                {/* ITEMS LIST */}
                {loading ? <div>Loading...</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {visibleItems.length === 0 && (
                            <div style={{ padding: '16px', color: '#888', fontSize: '13px' }}>Sin resultados con estos filtros.</div>
                        )}

                        {visibleItems.map(item => {
                            const editCapacityOz = capacityOzFromMl(editForm.capacity_ml, editForm.unit_type)

                            return (
                                <div key={item.id} style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '14px', padding: '16px' }}>
                                    {editingId === item.id ? (
                                        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                            <div>
                                                <label style={label}>Name</label>
                                                <input
                                                    value={editForm.name}
                                                    onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                                                    style={{ ...input, width: '180px' }}
                                                />
                                            </div>

                                            <div>
                                                <label style={label}>Unit Type</label>
                                                <select
                                                    value={editForm.unit_type}
                                                    onChange={(e) => setEditForm(p => ({ ...p, unit_type: e.target.value }))}
                                                    style={input}
                                                >
                                                    <option value="unit">Unidad</option>
                                                    <option value="oz">oz</option>
                                                    <option value="L">L</option>
                                                    <option value="ml">ml</option>
                                                    <option value="kg">kg</option>
                                                    <option value="g">g</option>
                                                </select>
                                            </div>

                                            <CapacityField
                                                unitType={editForm.unit_type}
                                                valueMl={editForm.capacity_ml}
                                                onChange={(value) => setEditForm(p => ({ ...p, capacity_ml: value }))}
                                            />

                                            <CostField
                                                unitType={editForm.unit_type}
                                                capacityOz={editCapacityOz}
                                                mode={editForm.cost_mode}
                                                value={editForm.unit_cost}
                                                onMode={(mode) => setEditForm(p => ({ ...p, cost_mode: mode }))}
                                                onChange={(value) => setEditForm(p => ({ ...p, unit_cost: value }))}
                                            />

                                            <div>
                                                <label style={{ ...label, visibility: 'hidden' }}>.</label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => saveEdit(item.id)} disabled={isSaving} style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                                                    <button onClick={() => setEditingId('')} style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : adjustingId === item.id ? (
                                        <div>
                                            <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>Adjust stock: {item.name}</div>

                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                                <div>
                                                    <label style={label}>Type</label>
                                                    <select
                                                        value={adjustForm.type}
                                                        onChange={(e) => setAdjustForm(p => ({ ...p, type: e.target.value }))}
                                                        style={input}
                                                    >
                                                        <option value="entry">+ Add stock</option>
                                                        <option value="remove">- Remove stock</option>
                                                    </select>
                                                </div>

                                                {usesOunces(item) && (
                                                    <div>
                                                        <label style={label}>Capturar en</label>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            {[
                                                                { key: CAPTURE_MODES.OZ, text: 'oz' },
                                                                { key: CAPTURE_MODES.ML, text: 'ml' },
                                                                { key: CAPTURE_MODES.BOTTLE, text: 'botellas' },
                                                            ].map(option => (
                                                                <button
                                                                    key={option.key}
                                                                    type="button"
                                                                    onClick={() => setAdjustForm(p => ({ ...p, mode: option.key }))}
                                                                    style={{
                                                                        padding: '9px 12px', borderRadius: '8px', border: '1px solid',
                                                                        borderColor: adjustForm.mode === option.key ? '#4a90d9' : '#333',
                                                                        background: adjustForm.mode === option.key ? '#1d3557' : 'transparent',
                                                                        color: adjustForm.mode === option.key ? '#e2e8f0' : '#777',
                                                                        cursor: 'pointer', fontSize: '12.5px',
                                                                    }}
                                                                >
                                                                    {option.text}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div>
                                                    <label style={label}>
                                                        Amount ({adjustForm.mode === CAPTURE_MODES.BOTTLE && usesOunces(item)
                                                            ? 'botellas'
                                                            : adjustForm.mode === CAPTURE_MODES.ML && usesOunces(item)
                                                            ? 'ml'
                                                            : unitLabel(item.unit_type)})
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={adjustForm.amount}
                                                        onChange={(e) => setAdjustForm(p => ({ ...p, amount: e.target.value }))}
                                                        placeholder="0"
                                                        min="0"
                                                        style={{ ...input, width: '110px' }}
                                                    />
                                                </div>

                                                {usesOunces(item) && adjustForm.mode === CAPTURE_MODES.BOTTLE && (
                                                    <div>
                                                        <label style={label}>ml por botella</label>
                                                        <input
                                                            type="number"
                                                            value={adjustForm.sizeMl}
                                                            onChange={(e) => setAdjustForm(p => ({ ...p, sizeMl: e.target.value }))}
                                                            style={{ ...input, width: '110px' }}
                                                        />
                                                    </div>
                                                )}

                                                <div>
                                                    <label style={label}>Note (optional)</label>
                                                    <input
                                                        value={adjustForm.note}
                                                        onChange={(e) => setAdjustForm(p => ({ ...p, note: e.target.value }))}
                                                        placeholder="Reason..."
                                                        style={{ ...input, width: '170px' }}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ ...label, visibility: 'hidden' }}>.</label>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            onClick={() => handleAdjust(item)}
                                                            disabled={isSaving || adjustAmount(item) <= 0}
                                                            style={{
                                                                padding: '10px 14px', borderRadius: '8px', border: 'none',
                                                                background: isSaving || adjustAmount(item) <= 0 ? '#333' : '#1565c0',
                                                                color: isSaving || adjustAmount(item) <= 0 ? '#888' : 'white',
                                                                cursor: 'pointer', fontWeight: 'bold',
                                                            }}
                                                        >
                                                            {isSaving ? 'Saving...' : 'Apply'}
                                                        </button>
                                                        <button onClick={() => setAdjustingId(null)} style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ ...hint, marginTop: '10px' }}>
                                                {adjustAmount(item) > 0
                                                    ? `${adjustForm.type === 'entry' ? '+' : '−'}${adjustAmount(item)} ${unitLabel(item.unit_type)} · nuevo total: ${(
                                                        Number(item.current_stock || 0) + (adjustForm.type === 'entry' ? 1 : -1) * adjustAmount(item)
                                                    ).toFixed(item.unit_type === 'unit' ? 0 : 2)} ${unitLabel(item.unit_type)}`
                                                    : 'Captura una cantidad mayor a cero.'}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{item.name}</span>
                                                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#333', color: '#aaa' }}>{item.unit_type}</span>
                                                    {item.unit_type === 'oz' && item.capacity_oz > 0 && (
                                                        <span style={{ fontSize: '11px', opacity: 0.6 }}>
                                                            botella: {mlFromOz(item.capacity_oz)} ml
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: STATUS_COLOR(item.current_stock, item.unit_type) }}>
                                                        Stock: {Number(item.current_stock || 0).toFixed(item.unit_type === 'unit' ? 0 : 2)} {unitLabel(item.unit_type)}
                                                    </span>
                                                    {item.unit_cost != null
                                                        ? <span style={{ fontSize: '13px', color: '#9ccc65' }}>Costo: ${Number(item.unit_cost).toFixed(2)}/{unitLabel(item.unit_type)}</span>
                                                        : <span style={{ fontSize: '12px', color: '#777' }}>sin costo</span>}
                                                    {!item.active && <span style={{ fontSize: '11px', color: '#888' }}>Inactivo</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => openAdjust(item)} style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontSize: '13px' }}>
                                                    Ajustar stock
                                                </button>
                                                <button onClick={() => startEdit(item)} style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#333', color: 'white', cursor: 'pointer', fontSize: '13px' }}>
                                                    Edit
                                                </button>
                                                <button onClick={() => toggleInventoryItemActive({ id: item.id, active: !item.active }).then(loadItems)} style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: item.active ? '#b71c1c' : '#2e7d32', color: 'white', cursor: 'pointer', fontSize: '13px' }}>
                                                    {item.active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default InventoryItemsAdminPage
