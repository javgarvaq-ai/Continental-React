import { useState } from 'react'
import { supabase } from '../services/supabase'
import {
    searchCustomerByQuery,
    getAllActiveMembershipPlans,
    activateMembership,
    cancelMembershipOnComanda,
    addFreeBenefitItemToComanda,
} from '../services/membership'
import { addNormalProductToComanda } from '../services/products'
import { getNextCustomerNumber } from '../services/customersAdmin'

/**
 * Manages all customer and membership state for a comanda session.
 *
 * @param {object} params
 * @param {object|null} params.currentComanda - The active comanda object
 * @param {number} params.cartTotal - Current cart total (to compute membership discount)
 * @param {function} params.setStatus - PosPage status setter
 * @param {function} params.onUpdateComanda - Callback to patch comanda fields in parent state
 * @param {function} params.onReloadComanda - Callback to reload comanda view after item changes
 */
export function useCustomer({ currentComanda, cartTotal, setStatus, onUpdateComanda, onReloadComanda }) {
    const [currentCustomer, setCurrentCustomer] = useState(null)
    const [currentMembership, setCurrentMembership] = useState(null)
    const [membershipRenewalState, setMembershipRenewalState] = useState({
        open: false,
        plans: [],
        selectedPlanId: '',
    })
    const [freeBenefitState, setFreeBenefitState] = useState({
        open: false,
        type: null,
        benefit: null,
    })
    const [isProcessingMembership, setIsProcessingMembership] = useState(false)
    const [customerSearchState, setCustomerSearchState] = useState({
        open: false,
        query: '',
        results: [],
        notFound: false,
        showCreateForm: false,
        newName: '',
        newPhone: '',
    })
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false)

    // --- Derived values ---

    const membershipDiscountBenefit = currentMembership?.membership_plans?.membership_plan_benefits?.find(
        b => b.benefit_type === 'discount'
    )
    const membershipDiscountPct = Number(membershipDiscountBenefit?.discount_percentage || 0)
    const discountAmount = membershipDiscountPct > 0
        ? Math.round(cartTotal * (membershipDiscountPct / 100) * 100) / 100
        : 0

    // --- Helpers ---

    function resetCustomerState() {
        setCurrentCustomer(null)
        setCurrentMembership(null)
        setMembershipRenewalState({ open: false, plans: [], selectedPlanId: '' })
        setFreeBenefitState({ open: false, type: null, benefit: null })
        setCustomerSearchState({
            open: false,
            query: '',
            results: [],
            notFound: false,
            showCreateForm: false,
            newName: '',
            newPhone: '',
        })
    }

    // --- Handlers ---

    async function handleSearchCustomer() {
        if (!customerSearchState.query.trim()) return
        setIsSearchingCustomer(true)
        setCustomerSearchState(p => ({ ...p, notFound: false, results: [] }))

        const { data } = await searchCustomerByQuery(customerSearchState.query.trim())

        if (data && data.length > 0) {
            setCustomerSearchState(p => ({ ...p, results: data, notFound: false }))
        } else {
            setCustomerSearchState(p => ({ ...p, results: [], notFound: true }))
        }
        setIsSearchingCustomer(false)
    }

    async function handleAssignCustomer(customerData) {
        if (!currentComanda?.id) return
        setIsProcessingMembership(true)

        await supabase
            .from('comandas')
            .update({
                customer_id: customerData.customer.id,
                customer_name: customerData.customer.name,
            })
            .eq('id', currentComanda.id)

        onUpdateComanda({
            customer_id: customerData.customer.id,
            customer_name: customerData.customer.name,
        })
        setCurrentCustomer(customerData.customer)
        setCurrentMembership(customerData.activeMembership)
        setCustomerSearchState({
            open: false, query: '', results: [], notFound: false,
            showCreateForm: false, newName: '', newPhone: '',
        })
        setIsProcessingMembership(false)
        setStatus(`Cliente asignado: ${customerData.customer.name}`)
    }

    async function handleCreateAndAssignCustomer() {
        if (!customerSearchState.newName.trim() || !currentComanda?.id) return
        setIsProcessingMembership(true)

        const nextNumber = await getNextCustomerNumber()

        const { data: newCustomer, error } = await supabase
            .from('customers')
            .insert([{
                customer_number: nextNumber,
                name: customerSearchState.newName.trim(),
                phone: customerSearchState.newPhone.trim() || null,
            }])
            .select()
            .single()

        if (error || !newCustomer) {
            setStatus(`Error creando cliente: ${error?.message}`)
            setIsProcessingMembership(false)
            return
        }

        await supabase
            .from('comandas')
            .update({ customer_id: newCustomer.id, customer_name: newCustomer.name })
            .eq('id', currentComanda.id)

        onUpdateComanda({ customer_id: newCustomer.id, customer_name: newCustomer.name })
        setCurrentCustomer(newCustomer)
        setCurrentMembership(null)
        setCustomerSearchState({
            open: false, query: '', results: [], notFound: false,
            showCreateForm: false, newName: '', newPhone: '',
        })
        setIsProcessingMembership(false)
        setStatus(`Cliente creado y asignado: ${newCustomer.name} #${newCustomer.customer_number}`)
    }

    async function handleOpenMembershipRenewal() {
        setIsProcessingMembership(true)
        const { data, error } = await getAllActiveMembershipPlans()

        if (error || !data || data.length === 0) {
            alert('No hay planes de membresía activos configurados.')
            setIsProcessingMembership(false)
            return
        }

        setMembershipRenewalState({ open: true, plans: data, selectedPlanId: data[0].id })
        setIsProcessingMembership(false)
    }

    async function handleActivateMembership() {
        if (!currentCustomer || !currentComanda?.id || !membershipRenewalState.selectedPlanId) return
        setIsProcessingMembership(true)

        const selectedPlan = membershipRenewalState.plans.find(
            p => p.id === membershipRenewalState.selectedPlanId
        )

        const { data: newMembership, error: membershipError } = await activateMembership({
            customerId: currentCustomer.id,
            planId: membershipRenewalState.selectedPlanId,
            comandaId: currentComanda.id,
        })

        if (membershipError || !newMembership) {
            alert(`Error activando membresía: ${membershipError?.message}`)
            setIsProcessingMembership(false)
            return
        }

        if (selectedPlan?.product_id) {
            const { data: product } = await supabase
                .from('products')
                .select('*')
                .eq('id', selectedPlan.product_id)
                .single()

            if (product) {
                await addNormalProductToComanda({ comandaId: currentComanda.id, product })
                await onReloadComanda(currentComanda.id)
            }
        }

        setCurrentMembership(newMembership)
        setMembershipRenewalState({ open: false, plans: [], selectedPlanId: '' })
        setIsProcessingMembership(false)
        setStatus('Membresía activada correctamente.')
    }

    async function handleCancelMembership() {
        if (!currentMembership || !currentComanda?.id) return

        const confirmed = window.confirm(
            `¿Cancelar la membresía "${currentMembership.membership_plans?.name}"? ` +
            `Se eliminará el cargo y todos los beneficios usados en esta comanda.`
        )
        if (!confirmed) return

        setIsProcessingMembership(true)

        const { error } = await cancelMembershipOnComanda({
            membershipId: currentMembership.id,
            comandaId: currentComanda.id,
            productId: currentMembership.membership_plans?.product_id || null,
        })

        if (error) {
            alert(`Error cancelando membresía: ${error.message}`)
            setIsProcessingMembership(false)
            return
        }

        setCurrentMembership(null)
        await onReloadComanda(currentComanda.id)
        setIsProcessingMembership(false)
        setStatus('Membresía cancelada y cargo removido.')
    }

    function handleOpenFreeBenefitSelector(type) {
        if (!currentMembership) return
        const benefit = currentMembership.membership_plans?.membership_plan_benefits?.find(
            b => b.benefit_type === type
        )
        if (!benefit) return
        setFreeBenefitState({ open: true, type, benefit })
    }

    async function handleAddFreeBenefit(productId) {
        if (!currentComanda?.id || !productId) return
        setIsProcessingMembership(true)

        const { error } = await addFreeBenefitItemToComanda({
            comandaId: currentComanda.id,
            productId,
        })

        if (error) {
            setStatus(`Error agregando beneficio: ${error.message}`)
            setIsProcessingMembership(false)
            return
        }

        await onReloadComanda(currentComanda.id)
        setFreeBenefitState({ open: false, type: null, benefit: null })
        setIsProcessingMembership(false)
        setStatus('Beneficio agregado.')
    }

    return {
        // State
        currentCustomer,
        setCurrentCustomer,
        currentMembership,
        setCurrentMembership,
        customerSearchState,
        setCustomerSearchState,
        membershipRenewalState,
        setMembershipRenewalState,
        freeBenefitState,
        setFreeBenefitState,  // exposed for direct close actions in JSX
        isProcessingMembership,
        isSearchingCustomer,
        // Derived
        membershipDiscountPct,
        discountAmount,
        // Handlers
        resetCustomerState,
        handleSearchCustomer,
        handleAssignCustomer,
        handleCreateAndAssignCustomer,
        handleOpenMembershipRenewal,
        handleActivateMembership,
        handleCancelMembership,
        handleOpenFreeBenefitSelector,
        handleAddFreeBenefit,
    }
}
