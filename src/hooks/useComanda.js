import { useState } from 'react'
import { getUnitsWithStatus } from '../services/units'
import {
    getProductsCatalog,
    getActiveCartItems,
    addNormalProductToComanda,
    getAvailableMixersForProduct,
    addShotWithFreeMixers,
    decreaseCartItem,
    updateComandaPersonas,
} from '../services/products'
import { requireOnline } from '../utils/requireOnline'

/**
 * Manages units list, comanda selection state, cart operations, and shot mixer.
 *
 * @param {object} params
 * @param {object|null} params.currentUser
 * @param {object|null} params.currentMembership - Active membership (read-only, for blocking membership product re-add)
 * @param {object|null} params.currentComanda - Active comanda (owned by PosPage)
 * @param {function} params.setCurrentComanda - PosPage setter for currentComanda
 * @param {object} params.productsById - Flat map of product id → product (computed in PosPage)
 * @param {boolean} params.isOnline
 * @param {function} params.setStatus
 * @param {function} params.onLoadComanda - loadComandaView(comandaId) from PosPage
 */
export function useComanda({
    currentUser,
    currentMembership,
    currentComanda,
    setCurrentComanda,
    productsById,
    isOnline,
    setStatus,
    onLoadComanda,
}) {
    const [units, setUnits] = useState([])
    const [selectedUnit, setSelectedUnit] = useState(null)
    const [isAddingProduct, setIsAddingProduct] = useState(false)
    const [isChangingCart, setIsChangingCart] = useState(false)
    const [isUpdatingPersonas, setIsUpdatingPersonas] = useState(false)
    const [availableMixers, setAvailableMixers] = useState([])
    const [shotSelectorState, setShotSelectorState] = useState({
        open: false,
        shotProduct: null,
        selectedMixers: [],
    })

    // --- Derived values ---

    const requiredShotMixers = Number(shotSelectorState.shotProduct?.free_mixers_qty || 0)

    const canEditPersonas =
        currentComanda?.status === 'open' || currentComanda?.status === 'processing_payment'

    // --- Helpers ---

    function resetShotSelector() {
        setShotSelectorState({ open: false, shotProduct: null, selectedMixers: [] })
    }

    // --- Units ---

    async function loadUnits() {
        setStatus('Cargando mesas...')
        const { data, error } = await getUnitsWithStatus()

        if (error) {
            setStatus(`Error cargando mesas: ${error.message}`)
            return
        }

        setUnits(data || [])
        setStatus('Mesas cargadas.')
    }

    // --- Shot mixer ---

    async function openShotMixerSelector(product) {
        try {
            const freeMixersQty = Number(product?.free_mixers_qty || 0)

            if (freeMixersQty <= 0) {
                const { error } = await addShotWithFreeMixers({
                    comandaId: currentComanda.id,
                    shotProduct: product,
                    selectedMixers: [],
                    userId: currentUser?.id,
                })

                if (error) {
                    setStatus(`Error agregando shot: ${error.message}`)
                    return
                }

                await onLoadComanda(currentComanda.id)
                setStatus(`${product.name} agregado.`)
                return
            }

            const { data, error } = await getAvailableMixersForProduct(product.id)

            if (error) {
                setStatus(`Error cargando mixers: ${error.message}`)
                return
            }

            setAvailableMixers(data || [])
            setShotSelectorState({ open: true, shotProduct: product, selectedMixers: [] })
        } finally {
            setIsAddingProduct(false)
        }
    }

    function toggleMixerSelection(mixer) {
        setShotSelectorState((prev) => {
            if (prev.selectedMixers.length >= requiredShotMixers) return prev
            return { ...prev, selectedMixers: [...prev.selectedMixers, mixer] }
        })
    }

    function removeSelectedMixer(indexToRemove) {
        setShotSelectorState((prev) => ({
            ...prev,
            selectedMixers: prev.selectedMixers.filter((_, index) => index !== indexToRemove),
        }))
    }

    async function handleConfirmShotMixers() {
        if (!currentComanda?.id || !shotSelectorState.shotProduct) return

        if (shotSelectorState.selectedMixers.length > requiredShotMixers) {
            alert(`Puedes seleccionar hasta ${requiredShotMixers} mixer(s).`)
            return
        }

        setIsAddingProduct(true)

        try {
            const { error } = await addShotWithFreeMixers({
                comandaId: currentComanda.id,
                shotProduct: shotSelectorState.shotProduct,
                selectedMixers: shotSelectorState.selectedMixers,
                userId: currentUser?.id,
            })

            if (error) {
                setStatus(`Error agregando shot: ${error.message}`)
                return
            }

            await onLoadComanda(currentComanda.id)
            setStatus(`${shotSelectorState.shotProduct.name} agregado con mixers.`)
            resetShotSelector()
        } finally {
            setIsAddingProduct(false)
        }
    }

    // --- Cart ---

    async function handleAddProduct(product) {
        if (!requireOnline(isOnline, setStatus)) return
        if (!currentComanda?.id) return

        if (currentComanda.status !== 'open') {
            alert('Esta comanda no se puede editar.')
            return
        }

        if (currentMembership?.membership_plans?.product_id === product.id) {
            alert('La membresía ya está activada en esta comanda.')
            return
        }

        if (isAddingProduct || isChangingCart) return

        setIsAddingProduct(true)

        try {
            if (product.is_shot) {
                await openShotMixerSelector(product)
                return
            }

            const { error } = await addNormalProductToComanda({
                comandaId: currentComanda.id,
                product,
            })

            if (error) {
                setStatus(`Error agregando producto: ${error.message}`)
                return
            }

            await onLoadComanda(currentComanda.id)
            setStatus(`${product.name} agregado.`)
        } finally {
            setIsAddingProduct(false)
        }
    }

    async function handleIncreaseCartItem(item) {
        const product = productsById[item.product_id]

        if (!product) {
            setStatus('No se encontró el producto en catálogo para aumentar la cantidad.')
            return
        }

        const membershipProductId = currentMembership?.membership_plans?.product_id
        if (membershipProductId && item.product_id === membershipProductId) {
            alert('No puedes agregar más unidades del producto de membresía.')
            return
        }

        await handleAddProduct(product)
    }

    async function handleDecreaseCartItem(item) {
        if (!currentComanda?.id || !currentUser?.id) return

        if (currentComanda.status !== 'open') {
            alert('Esta comanda no se puede editar.')
            return
        }

        const membershipProductId = currentMembership?.membership_plans?.product_id
        if (membershipProductId && item.product_id === membershipProductId) {
            alert('No puedes eliminar el producto de membresía directamente. Cancela la membresía desde el panel de cliente.')
            return
        }

        const currentQty = Number(item.quantity || 0)
        const confirmed = window.confirm(
            currentQty <= 1
                ? '¿Eliminar este producto de la comanda?'
                : '¿Disminuir este producto?'
        )

        if (!confirmed) return
        if (isChangingCart || isAddingProduct) return

        setIsChangingCart(true)

        try {
            const { error } = await decreaseCartItem({
                comandaId: currentComanda.id,
                itemId: item.id,
                productId: item.product_id,
                currentQty,
                userId: currentUser.id,
            })

            if (error) {
                setStatus(`Error disminuyendo producto: ${error.message}`)
                return
            }

            await onLoadComanda(currentComanda.id)
            setStatus(
                currentQty <= 1
                    ? `${item.products?.name || 'Producto'} eliminado.`
                    : `${item.products?.name || 'Producto'} disminuido.`
            )
        } finally {
            setIsChangingCart(false)
        }
    }

    // --- Personas ---

    async function handlePersonasChange(delta) {
        if (!currentComanda?.id) return

        if (!canEditPersonas) {
            alert('Las personas solo se pueden editar con la comanda abierta o en cobro.')
            return
        }

        if (isUpdatingPersonas) return

        const nextPersonas = Math.max(0, Number(currentComanda.personas || 0) + delta)

        setIsUpdatingPersonas(true)

        try {
            const { data, error } = await updateComandaPersonas({
                comandaId: currentComanda.id,
                personas: nextPersonas,
            })

            if (error) {
                setStatus(`Error actualizando personas: ${error.message}`)
                return
            }

            setCurrentComanda((prev) => ({ ...prev, personas: data }))
            setStatus(`Personas actualizadas: ${data}.`)
        } finally {
            setIsUpdatingPersonas(false)
        }
    }

    return {
        // State
        units,
        selectedUnit,
        setSelectedUnit,
        isAddingProduct,
        isChangingCart,
        isUpdatingPersonas,
        availableMixers,
        shotSelectorState,
        // Derived
        requiredShotMixers,
        canEditPersonas,
        // Handlers
        loadUnits,
        resetShotSelector,
        handleAddProduct,
        handleIncreaseCartItem,
        handleDecreaseCartItem,
        handlePersonasChange,
        toggleMixerSelection,
        removeSelectedMixer,
        handleConfirmShotMixers,
    }
}
