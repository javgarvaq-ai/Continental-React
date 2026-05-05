import { useMemo, useState } from 'react'
import {
    presentBill,
    reopenComanda,
    startPayment,
    confirmPayment,
} from '../services/comandaCheckout'
import { processMembershipOnPayment } from '../services/membership'
import { printTicket } from '../components/Ticket'
import { money } from '../utils/money'

function getPaymentSummary(totalCuenta, paymentData) {
    const efectivo = Number(paymentData.efectivo || 0)
    const tarjeta = Number(paymentData.tarjeta || 0)
    const transferencia = Number(paymentData.transferencia || 0)
    const totalRecibido = efectivo + tarjeta + transferencia

    let propina = Number(paymentData.propina || 0)
    if (efectivo <= 0 && !paymentData.propinaManual) {
        propina = Math.max(totalRecibido - Number(totalCuenta || 0), 0)
    }

    const totalConPropina = Number(totalCuenta || 0) + propina
    const pendiente = Math.max(totalConPropina - totalRecibido, 0)
    const cambio = efectivo > 0 ? Math.max(totalRecibido - totalConPropina, 0) : 0

    return { efectivo, tarjeta, transferencia, totalRecibido, propina, cambio, pendiente }
}

/**
 * Manages the full payment lifecycle for a comanda.
 *
 * @param {object} params
 * @param {object|null} params.currentUser
 * @param {string|null} params.currentShiftId
 * @param {object|null} params.currentComanda - Owned by PosPage
 * @param {function} params.setCurrentComanda - PosPage setter
 * @param {object|null} params.currentCustomer
 * @param {object|null} params.currentMembership
 * @param {number} params.membershipDiscountPct
 * @param {number} params.discountAmount
 * @param {number} params.cartTotal
 * @param {Array}  params.visibleCartItems
 * @param {object|null} params.selectedUnit
 * @param {function} params.setStatus
 * @param {function} params.onBackToUnits - handleBackToUnits(customStatus?) from PosPage
 * @param {function} params.onLoadUnits - loadUnits from useComanda
 */
export function usePayment({
    currentUser,
    currentShiftId,
    currentComanda,
    setCurrentComanda,
    currentCustomer,
    currentMembership,
    membershipDiscountPct,
    discountAmount,
    cartTotal,
    visibleCartItems,
    selectedUnit,
    setStatus,
    onBackToUnits,
    onLoadUnits,
}) {
    const [paymentData, setPaymentData] = useState({
        efectivo: '',
        tarjeta: '',
        transferencia: '',
        propina: '',
        propinaManual: false,
    })
    const [isUpdatingComandaStatus, setIsUpdatingComandaStatus] = useState(false)
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false)

    // --- Derived values ---

    const displayedTotal =
        currentComanda?.status === 'open'
            ? Math.max(cartTotal - discountAmount, 0)
            : Number(currentComanda?.final_total ?? cartTotal)

    const paymentSummary = useMemo(() => {
        return getPaymentSummary(displayedTotal, paymentData)
    }, [displayedTotal, paymentData])

    const propinaFieldValue = paymentData.propinaManual
        ? paymentData.propina
        : String(paymentSummary.propina || 0)

    // --- Helpers ---

    function resetPaymentState() {
        setPaymentData({
            efectivo: '',
            tarjeta: '',
            transferencia: '',
            propina: '',
            propinaManual: false,
        })
    }

    // --- Payment field handlers ---

    function handlePaymentFieldChange(field, value) {
        if (value === '') {
            setPaymentData((prev) => ({
                ...prev,
                [field]: '',
                ...(field === 'propina' ? { propinaManual: true } : {}),
            }))
            return
        }

        const numericValue = Number(value)
        if (Number.isNaN(numericValue) || numericValue < 0) return

        setPaymentData((prev) => ({
            ...prev,
            [field]: value,
            ...(field === 'propina' ? { propinaManual: true } : {}),
        }))
    }

    function handleResetAutoTip() {
        setPaymentData((prev) => ({ ...prev, propina: '', propinaManual: false }))
    }

    // --- Comanda status transitions ---

    async function handlePresentBill() {
        if (!currentComanda?.id || !currentUser?.id) return

        if (currentComanda.status !== 'open') {
            alert('Solo se puede presentar cuenta en una comanda abierta.')
            return
        }

        if (displayedTotal <= 0) {
            alert('La comanda no tiene productos.')
            return
        }

        if (isUpdatingComandaStatus) return

        setIsUpdatingComandaStatus(true)

        try {
            const cuentaAt = new Date().toISOString()

            const { error } = await presentBill({
                comandaId: currentComanda.id,
                userId: currentUser.id,
                total: displayedTotal,
            })

            if (error) {
                setStatus(`Error al presentar cuenta: ${error.message}`)
                return
            }

            printTicket({
                tipo: 'cuenta',
                comanda: {
                    ...currentComanda,
                    final_total: displayedTotal,
                    cuenta_at: cuentaAt,
                },
                items: visibleCartItems,
                unit: selectedUnit,
            })

            alert(`Cuenta cerrada, favor de tomar ticket. Total ${money(displayedTotal)}`)

            await onBackToUnits('Cuenta presentada correctamente.')
        } finally {
            setIsUpdatingComandaStatus(false)
        }
    }

    async function handleReopenComanda() {
        if (!currentComanda?.id || !currentUser?.id) return

        if (
            currentComanda.status === 'processing_payment' &&
            currentUser.role === 'waiter'
        ) {
            alert('No autorizado.')
            return
        }

        if (
            currentComanda.status !== 'pending_payment' &&
            currentComanda.status !== 'processing_payment'
        ) {
            alert('Esta comanda no está en estado reabrible.')
            return
        }

        if (isUpdatingComandaStatus) return

        setIsUpdatingComandaStatus(true)

        try {
            const { error } = await reopenComanda({
                comandaId: currentComanda.id,
                userId: currentUser.id,
                previousStatus: currentComanda.status,
            })

            if (error) {
                setStatus(`Error reabriendo comanda: ${error.message}`)
                return
            }

            setCurrentComanda((prev) => ({ ...prev, status: 'open' }))
            resetPaymentState()
            await onLoadUnits()
            setStatus('Comanda reabierta.')
        } finally {
            setIsUpdatingComandaStatus(false)
        }
    }

    async function handleStartPayment() {
        if (!currentComanda?.id || !currentUser?.id) return

        if (currentComanda.status !== 'pending_payment') {
            alert('Solo se puede iniciar cobro desde cuenta.')
            return
        }

        if (isUpdatingComandaStatus) return

        setIsUpdatingComandaStatus(true)

        try {
            const { error } = await startPayment({
                comandaId: currentComanda.id,
                userId: currentUser.id,
            })

            if (error) {
                setStatus(`Error iniciando cobro: ${error.message}`)
                return
            }

            setCurrentComanda((prev) => ({ ...prev, status: 'processing_payment' }))
            resetPaymentState()
            await onLoadUnits()
            setStatus('Cobro iniciado.')
        } finally {
            setIsUpdatingComandaStatus(false)
        }
    }

    async function handleConfirmPayment() {
        if (!currentComanda?.id || !currentUser?.id || !currentShiftId) return

        if (currentComanda.status !== 'processing_payment') {
            alert('La comanda no está en proceso de cobro.')
            return
        }

        if (paymentSummary.pendiente > 0) {
            alert('El monto pagado es insuficiente.')
            return
        }

        if (isConfirmingPayment) return

        setIsConfirmingPayment(true)

        try {
            const cobradoAt = new Date().toISOString()

            const { error, data } = await confirmPayment({
                comandaId: currentComanda.id,
                total: displayedTotal,
                userId: currentUser.id,
                shiftId: currentShiftId,
                efectivo: paymentSummary.efectivo,
                tarjeta: paymentSummary.tarjeta,
                transferencia: paymentSummary.transferencia,
                propina: paymentSummary.propina,
                cambio: Math.round(paymentSummary.cambio * 100) / 100,
            })

            if (error) {
                setStatus(`Error confirmando cobro: ${error.message}`)
                return
            }

            // Process membership if customer is assigned
            let membershipResult = null
            if (currentCustomer && currentMembership) {
                membershipResult = await processMembershipOnPayment({
                    customerId: currentCustomer.id,
                    membershipId: currentMembership.id,
                    comandaId: currentComanda.id,
                    discountPct: membershipDiscountPct,
                    discountAmount,
                    membershipPlanBenefits: currentMembership.membership_plans?.membership_plan_benefits || [],
                })

                if (membershipResult?.membershipWarning) {
                    alert(`Cobro registrado, pero hubo un problema con la membresía:\n${membershipResult.membershipWarning}\n\nAvisa al administrador.`)
                }
            }

            printTicket({
                tipo: 'pagado',
                comanda: {
                    ...currentComanda,
                    final_total: displayedTotal,
                    cobrado_at: cobradoAt,
                    tip_total: paymentSummary.propina,
                },
                items: visibleCartItems,
                unit: selectedUnit,
                payment: {
                    efectivo: Math.max(paymentSummary.efectivo - paymentSummary.cambio, 0),
                    tarjeta: paymentSummary.tarjeta,
                    transferencia: paymentSummary.transferencia,
                    total_paid:
                        Math.max(paymentSummary.efectivo - paymentSummary.cambio, 0) +
                        paymentSummary.tarjeta +
                        paymentSummary.transferencia,
                    change_given: paymentSummary.cambio,
                },
                membershipInfo: currentCustomer && currentMembership ? {
                    customerName: currentCustomer.name,
                    customerNumber: currentCustomer.customer_number,
                    planName: currentMembership.membership_plans?.name,
                    discountAmount,
                    discountPct: membershipDiscountPct,
                    newVisitCount: membershipResult?.newVisitCount,
                    bottleCredits: membershipResult?.newBottleCreditsAvailable,
                    earnedBottleCredit: membershipResult?.earnedBottleCredit,
                } : null,
            })

            if (data?.inventoryWarning) {
                alert(`Cobro registrado, pero inventario avisó: ${data.inventoryWarning}`)
            } else {
                let msg = 'Cobro registrado correctamente.'
                if (membershipResult?.earnedBottleCredit) {
                    msg += ` 🍾 ¡${currentCustomer.name} ganó un crédito de botella!`
                }
                alert(msg)
            }

            await onBackToUnits(
                data?.inventoryWarning
                    ? 'Cobro registrado con advertencia de inventario.'
                    : 'Cobro registrado correctamente.'
            )
        } finally {
            setIsConfirmingPayment(false)
        }
    }

    return {
        // State
        paymentData,
        isUpdatingComandaStatus,
        isConfirmingPayment,
        // Derived
        displayedTotal,
        paymentSummary,
        propinaFieldValue,
        // Handlers
        resetPaymentState,
        handlePaymentFieldChange,
        handleResetAutoTip,
        handlePresentBill,
        handleReopenComanda,
        handleStartPayment,
        handleConfirmPayment,
    }
}
