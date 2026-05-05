import { useState } from 'react'
import { supabase } from '../services/supabase'
import { getCashMovementConfig } from '../config/cashMovements'

/**
 * Manages shift lifecycle, cash movements, and shift panel state.
 *
 * @param {object} params
 * @param {object|null} params.currentUser
 * @param {string|null} params.currentShiftId
 * @param {function} params.setStatus
 * @param {function} params.onShiftClosed - Called after shift is successfully closed (clearAuth + navigate)
 */
export function useShift({ currentUser, currentShiftId, setStatus, onShiftClosed }) {
    const [cashPanelOpen, setCashPanelOpen] = useState(false)
    const [isSubmittingCash, setIsSubmittingCash] = useState(false)
    const [shiftPanelOpen, setShiftPanelOpen] = useState(false)

    // --- Internal helpers ---

    async function calculateShiftSummary() {
        if (!currentShiftId) {
            return { error: new Error('No hay turno activo.'), data: null }
        }

        const { data: shift, error: shiftError } = await supabase
            .from('shifts')
            .select('*')
            .eq('id', currentShiftId)
            .single()

        if (shiftError || !shift) {
            return { error: shiftError || new Error('No se pudo obtener el turno.'), data: null }
        }

        const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select(`
                *,
                comandas (
                    tip_total
                )
            `)
            .eq('shift_id', currentShiftId)

        if (paymentsError) {
            return { error: paymentsError, data: null }
        }

        const { data: cashMovements, error: cashMovementsError } = await supabase
            .from('cash_movements')
            .select('*')
            .eq('shift_id', currentShiftId)

        if (cashMovementsError) {
            return { error: cashMovementsError, data: null }
        }

        let totalEfectivo = 0
        let totalTarjeta = 0
        let totalTransferencia = 0
        let totalPropinas = 0
        let totalCambio = 0
        let totalWithdrawals = 0
        let totalDeposits = 0

        ;(payments || []).forEach((p) => {
            totalEfectivo += Number(p.efectivo || 0)
            totalTarjeta += Number(p.tarjeta || 0)
            totalTransferencia += Number(p.transferencia || 0)
            totalPropinas += Number((p.tip_amount ?? p.comandas?.tip_total) || 0)
            totalCambio += Number(p.change_given || 0)
        })

        ;(cashMovements || []).forEach((m) => {
            const amount = Number(m.amount || 0)
            if (m.source_location === 'drawer') totalWithdrawals += amount
            if (m.destination_location === 'drawer') totalDeposits += amount
        })

        const expectedCash =
            Number(shift.starting_cash || 0) +
            totalEfectivo +
            totalDeposits -
            totalWithdrawals

        return {
            error: null,
            data: {
                shift,
                totalEfectivo,
                totalTarjeta,
                totalTransferencia,
                totalPropinas,
                totalCambio,
                totalWithdrawals,
                totalDeposits,
                expectedCash,
            },
        }
    }

    // --- Public handlers ---

    async function fetchShiftPanelData() {
        const { data: summary, error } = await calculateShiftSummary()

        if (error || !summary) {
            return { data: null, error: error || new Error('No se pudo calcular el corte.') }
        }

        const { data: openComandas } = await supabase
            .from('comandas')
            .select('id')
            .in('status', ['open', 'pending_payment', 'processing_payment'])
            .gte('opened_at', summary.shift.opened_at)
            .limit(1)

        return {
            data: {
                summary,
                hasOpenComandas: !!(openComandas && openComandas.length > 0),
            },
            error: null,
        }
    }

    async function handleConfirmCloseShift(cashCounted) {
        if (!currentShiftId || !currentUser?.id) {
            return { error: new Error('No hay turno activo.') }
        }

        const { data: panelData, error: panelError } = await fetchShiftPanelData()

        if (panelError || !panelData) {
            return { error: panelError || new Error('No se pudo calcular el cierre.') }
        }

        if (panelData.hasOpenComandas) {
            return { error: new Error('Hay mesas abiertas. Ciérralas antes de cerrar el turno.') }
        }

        const { summary } = panelData
        const difference = cashCounted - Number(summary.expectedCash || 0)

        const { error: updateError } = await supabase
            .from('shifts')
            .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                closed_by_user_id: currentUser.id,
                cash_counted: cashCounted,
                difference,
                total_efectivo: summary.totalEfectivo,
                total_tarjeta: summary.totalTarjeta,
                total_transferencia: summary.totalTransferencia,
                total_propinas: summary.totalPropinas,
                total_retiros: summary.totalWithdrawals,
                expected_cash: summary.expectedCash,
            })
            .eq('id', currentShiftId)

        if (updateError) {
            return { error: updateError }
        }

        onShiftClosed()
        return { error: null }
    }

    async function handleCashMovementSubmit({ category, amount, note }) {
        if (!currentUser?.id || !currentShiftId) return

        const config = getCashMovementConfig(category)
        if (!config) return

        setIsSubmittingCash(true)

        const { error } = await supabase
            .from('cash_movements')
            .insert([{
                shift_id: currentShiftId,
                user_id: currentUser.id,
                type: config.type,
                amount,
                note,
                category,
                movement_nature: config.movementNature,
                source_location: config.sourceLocation,
                destination_location: config.destinationLocation,
            }])

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
