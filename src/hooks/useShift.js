import { useState } from 'react'
import { getCashMovementConfig } from '../config/cashMovements'
import { requireOnline } from '../utils/requireOnline'
import {
    getShiftSummary,
    getOpenComandas,
    closeShift,
    addCashMovement,
} from '../services/shifts'

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
        const { data: openComandas } = await getOpenComandas()
        const openUnitNames = (openComandas || [])
            .map(c => c.units?.name)
            .filter(Boolean)

        return {
            data: {
                summary,
                hasOpenComandas: openUnitNames.length > 0,
                openUnitNames,
            },
            error: null,
        }
    }

    async function handleConfirmCloseShift(cashCounted) {
        if (!requireOnline(isOnline, setStatus)) return { error: new Error('Sin conexión.') }
        if (!currentShiftId || !currentUser?.id) {
            return { error: new Error('No hay turno activo.') }
        }

        const { data: panelData, error: panelError } = await fetchShiftPanelData()
        if (panelError || !panelData) {
            return { error: panelError || new Error('No se pudo calcular el cierre.') }
        }

        if (panelData.hasOpenComandas) {
            const names = panelData.openUnitNames.join(', ')
            return { error: new Error(`Mesas abiertas: ${names}. Ciérralas antes de cerrar el turno.`) }
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

    async function handleCashMovementSubmit({ category, amount, note }) {
        if (!requireOnline(isOnline, setStatus)) return
        if (!currentUser?.id || !currentShiftId) return

        const config = getCashMovementConfig(category)
        if (!config) return

        setIsSubmittingCash(true)

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
            return
        }

        setCashPanelOpen(false)
        setStatus('Movimiento de caja registrado correctamente.')
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
