import { useState } from 'react'
import { getCashMovementConfig } from '../config/cashMovements'
import { requireOnline } from '../utils/requireOnline'
import {
    getShiftSummary,
    getOpenComandas,
    getShiftFolios,
    closeShift,
    addCashMovement,
    getShiftById,
} from '../services/shifts'

// Rol manager: mismo set permitido que en CashMovementPanel.jsx (guard defensivo
// del lado del cliente — la fuente de verdad de la UI es el componente, esto
// solo protege el submit por si algo enviara una categoría fuera de esa lista).
const MANAGER_ALLOWED_CATEGORIES = ['propinas_entregadas', 'pago_proveedor_caja', 'gasto_operativo_caja']

/**
 * Manages shift lifecycle, cash movements, and shift panel state.
 *
 * @param {object} params
 * @param {object|null} params.currentUser
 * @param {string|null} params.currentShiftId
 * @param {boolean} params.isOnline
 * @param {function} params.setStatus
 * @param {function} params.onShiftClosed - Called after shift is successfully closed (clearAuth + navigate)
 */
export function useShift({ currentUser, currentShiftId, isOnline, setStatus, onShiftClosed }) {
    const [cashPanelOpen, setCashPanelOpen] = useState(false)
    const [isSubmittingCash, setIsSubmittingCash] = useState(false)
    const [shiftPanelOpen, setShiftPanelOpen] = useState(false)

    // --- Public handlers ---

    async function fetchShiftPanelData() {
        if (!currentShiftId) {
            return { data: null, error: new Error('No hay turno activo.') }
        }

        const { data: summary, error: summaryError } = await getShiftSummary(currentShiftId)
        if (summaryError || !summary) {
            return { data: null, error: summaryError || new Error('No se pudo calcular el corte.') }
        }

        // Filter by status only — no date filter so ghost comandas
        // from before the shift can't slip past and block close.
        // Split by status: 'open' can close the shift with a warning
        // (the sale attaches to whichever shift is active when it's
        // finally paid — see tasks/todo.md 2026-08-06). 'pending_payment'/
        // 'processing_payment' are mid-checkout and hard-block close —
        // never overridable, even with forceCloseWithOpenTables.
        const { data: openComandas, error: openComandasError } = await getOpenComandas()
        if (openComandasError) {
            return { data: null, error: openComandasError }
        }
        // Lista informativa de folios del turno (no afecta el corte ni el cierre).
        const { data: paidFolios, error: foliosError } = await getShiftFolios(currentShiftId)
        if (foliosError) {
            return { data: null, error: foliosError }
        }
        const openFolios = (openComandas || [])
            .map(c => ({
                folio: c.folio,
                status: c.status,
                unitName: c.units?.name || '',
                customerName: c.customer_name || '',
            }))
            .sort((a, b) => Number(a.folio || 0) - Number(b.folio || 0))

        const openTableNames = (openComandas || [])
            .filter(c => c.status === 'open')
            .map(c => c.units?.name)
            .filter(Boolean)
        const blockingTableNames = (openComandas || [])
            .filter(c => c.status === 'pending_payment' || c.status === 'processing_payment')
            .map(c => c.units?.name)
            .filter(Boolean)

        return {
            data: {
                summary,
                paidFolios: paidFolios || [],
                openFolios,
                openTableNames,
                blockingTableNames,
                hasOpenTables: openTableNames.length > 0,
                hasBlockingTables: blockingTableNames.length > 0,
            },
            error: null,
        }
    }

    /**
     * @param {number} cashCounted
     * @param {object} [opts]
     * @param {boolean} [opts.forceCloseWithOpenTables] - Must be true to close
     *   the shift when there are 'open' (unpaid) comandas. Set by ShiftPanel
     *   after the user double-confirms. Comandas mid-checkout (pending_payment/
     *   processing_payment) always hard-block, regardless of this flag.
     */
    async function handleConfirmCloseShift(cashCounted, { forceCloseWithOpenTables = false } = {}) {
        if (!requireOnline(isOnline, setStatus)) return { error: new Error('Sin conexión.') }
        if (!currentShiftId || !currentUser?.id) {
            return { error: new Error('No hay turno activo.') }
        }

        const { data: panelData, error: panelError } = await fetchShiftPanelData()
        if (panelError || !panelData) {
            return { error: panelError || new Error('No se pudo calcular el cierre.') }
        }

        if (panelData.hasBlockingTables) {
            const names = panelData.blockingTableNames.join(', ')
            return { error: new Error(`Mesas en proceso de cobro: ${names}. Termina el cobro antes de cerrar el turno.`) }
        }

        if (panelData.hasOpenTables && !forceCloseWithOpenTables) {
            const names = panelData.openTableNames.join(', ')
            return { error: new Error(`Mesas abiertas sin cobrar: ${names}. Confirma de nuevo para cerrar el turno de todos modos.`) }
        }

        const { data: updatedShift, error: updateError } = await closeShift(
            currentShiftId,
            currentUser.id,
            cashCounted,
            panelData.summary
        )

        if (updateError) return { error: updateError }

        if (!updatedShift || updatedShift.length === 0) {
            return { error: new Error('El turno ya fue cerrado por otro usuario.') }
        }

        onShiftClosed()
        return { error: null }
    }

    // Devuelve true si se registró (PosPage lo ignora; la pantalla admin lo usa para recargar).
    async function handleCashMovementSubmit({ category, amount, note }) {
        if (!requireOnline(isOnline, setStatus)) return false
        if (!currentUser?.id || !currentShiftId) return false

        if (currentUser.role === 'manager' && !MANAGER_ALLOWED_CATEGORIES.includes(category)) {
            setStatus('No tienes permiso para registrar este tipo de movimiento.')
            return false
        }

        const config = getCashMovementConfig(category)
        if (!config) return false

        setIsSubmittingCash(true)

        // El shiftId vive en memoria/localStorage: si el turno se cerró en otro
        // dispositivo, el movimiento quedaría ligado a un turno cerrado.
        const { data: shift, error: shiftError } = await getShiftById(currentShiftId)
        if (shiftError || shift?.status !== 'open') {
            setIsSubmittingCash(false)
            setStatus(shiftError
                ? `Error verificando turno: ${shiftError.message}`
                : 'El turno ya fue cerrado. Vuelve a iniciar sesión para registrar movimientos.')
            return false
        }

        const { error } = await addCashMovement({
            shiftId:             currentShiftId,
            userId:              currentUser.id,
            type:                config.type,
            amount,
            note,
            category,
            movementNature:      config.movementNature,
            sourceLocation:      config.sourceLocation,
            destinationLocation: config.destinationLocation,
        })

        setIsSubmittingCash(false)

        if (error) {
            setStatus(`Error registrando movimiento: ${error.message}`)
            return false
        }

        setCashPanelOpen(false)
        setStatus('Movimiento de caja registrado correctamente.')
        return true
    }

    return {
        // State
        cashPanelOpen,
        setCashPanelOpen,
        isSubmittingCash,
        shiftPanelOpen,
        setShiftPanelOpen,
        // Handlers
        fetchShiftPanelData,
        handleConfirmCloseShift,
        handleCashMovementSubmit,
    }
}
