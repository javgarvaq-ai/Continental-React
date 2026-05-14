import { supabase } from './supabase'

export function getCurrentMonthDate() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export async function getCustomerWithMembership(customerNumber) {
    const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_number', customerNumber.trim())
        .single()

    if (customerError || !customer) {
        return { data: null, error: new Error('Cliente no encontrado.') }
    }

    const currentMonth = getCurrentMonthDate()

    const { data: membership } = await supabase
        .from('customer_memberships')
        .select(`
            id, month, status, plan_id,
            membership_plans (
                id, name, price_monthly, product_id,
                membership_plan_benefits (
                    id, benefit_type, discount_percentage, milestone_visits,
                    membership_benefit_products (
                        id, product_id,
                        products ( id, name, price )
                    )
                )
            )
        `)
        .eq('customer_id', customer.id)
        .eq('month', currentMonth)
        .eq('status', 'active')
        .maybeSingle()

    return {
        data: { customer, activeMembership: membership || null },
        error: null,
    }
}

export async function getCustomerByIdWithMembership(customerId) {
    const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single()

    if (customerError || !customer) {
        return { data: null, error: customerError }
    }

    const currentMonth = getCurrentMonthDate()

    const { data: membership } = await supabase
        .from('customer_memberships')
        .select(`
            id, month, status, plan_id,
            membership_plans (
                id, name, price_monthly, product_id,
                membership_plan_benefits (
                    id, benefit_type, discount_percentage, milestone_visits,
                    membership_benefit_products (
                        id, product_id,
                        products ( id, name, price )
                    )
                )
            )
        `)
        .eq('customer_id', customerId)
        .eq('month', currentMonth)
        .eq('status', 'active')
        .maybeSingle()

    return {
        data: { customer, activeMembership: membership || null },
        error: null,
    }
}

export async function getAllActiveMembershipPlans() {
    return await supabase
        .from('membership_plans')
        .select(`
            id, name, price_monthly, product_id,
            membership_plan_benefits (
                id, benefit_type, discount_percentage, milestone_visits,
                membership_benefit_products (
                    id, product_id,
                    products ( id, name, price )
                )
            )
        `)
        .eq('active', true)
        .order('price_monthly', { ascending: true })
}

export async function activateMembership({ customerId, planId, comandaId }) {
    // Single atomic RPC: inserts customer_memberships + comanda_items in one transaction.
    // If either step fails the whole thing rolls back — no more $0 memberships.
    const { data: result, error: rpcError } = await supabase.rpc('activate_membership', {
        p_customer_id: customerId,
        p_plan_id:     planId,
        p_comanda_id:  comandaId,
    })

    if (rpcError) return { data: null, error: rpcError }
    if (!result?.ok) return { data: null, error: new Error(result?.error || 'Error activando membresía') }

    // Fetch the full membership row (with plan + benefits) that the UI needs
    return await supabase
        .from('customer_memberships')
        .select(`
            id, month, status, plan_id,
            membership_plans (
                id, name, price_monthly, product_id,
                membership_plan_benefits (
                    id, benefit_type, discount_percentage, milestone_visits,
                    membership_benefit_products (
                        id, product_id,
                        products ( id, name, price )
                    )
                )
            )
        `)
        .eq('id', result.membership_id)
        .single()
}

export async function addFreeBenefitItemToComanda({ comandaId, productId }) {
    // Guard: comanda must still be open before adding any free benefit item
    const { data: comandaRow, error: comandaError } = await supabase
        .from('comandas')
        .select('status')
        .eq('id', comandaId)
        .single()
    if (comandaError) return { error: comandaError }
    if (comandaRow.status !== 'open') {
        return { error: new Error('La comanda ya no está abierta. Recarga la página.') }
    }

    // Check if this specific free benefit product was already added to this comanda
    const { data: existing } = await supabase
        .from('comanda_items')
        .select('id')
        .eq('comanda_id', comandaId)
        .eq('product_id', productId)
        .eq('is_free_benefit', true)
        .eq('status', 'active')
        .maybeSingle()

    if (existing) {
        return { error: new Error('Ya se agregó ese producto gratis en esta visita.'), data: null }
    }

    return await supabase
        .from('comanda_items')
        .insert([{
            comanda_id: comandaId,
            product_id: productId,
            quantity: 1,
            unit_price: 0,
            status: 'active',
            is_free_benefit: true,
            is_free_mixer: false,
        }])
        .select('*, products:products!comanda_items_product_id_fkey(id, name, price)')
        .single()
}

export async function processMembershipOnPayment({
    customerId,
    membershipId,
    comandaId,
    discountPct,
    discountAmount,
    milestoneVisits,
}) {
    const { data: result, error } = await supabase.rpc('process_membership_on_payment', {
        p_customer_id:      customerId,
        p_membership_id:    membershipId,
        p_comanda_id:       comandaId,
        p_discount_pct:     discountPct    || 0,
        p_discount_amount:  discountAmount || 0,
        p_milestone_visits: milestoneVisits || 0,
    })

    if (error) {
        return {
            data: null,
            error: null, // don't fail the payment — surface as warning instead
            warning: `No se pudo procesar la membresía: ${error.message}`,
        }
    }

    if (result?.already_processed) {
        return { data: { newVisitCount: null, earnedBottleCredit: false, newBottleCreditsAvailable: null, membershipWarning: null }, error: null }
    }

    return {
        data: {
            newVisitCount:             result?.new_visit_count      ?? null,
            earnedBottleCredit:        result?.earned_bottle_credit ?? false,
            newBottleCreditsAvailable: result?.new_bottle_credits   ?? null,
            membershipWarning: result?.milestone_config_missing
                ? 'El plan tiene beneficio "botella gratis" pero no tiene milestone_visits configurado — no se otorgó crédito. Revisa la configuración del plan.'
                : null,
        },
        error: null,
    }
}
export async function searchCustomerByQuery(query) {
    const trimmed = query.trim().replace(/[%_]/g, '\\$&')
    const isNumber = /^\d+$/.test(trimmed)
    const currentMonth = getCurrentMonthDate()

    const membershipSelect = `
        id, month, status, plan_id,
        membership_plans (
            id, name, price_monthly, product_id,
            membership_plan_benefits (
                id, benefit_type, discount_percentage, milestone_visits,
                membership_benefit_products (
                    id, product_id,
                    products ( id, name, price )
                )
            )
        )
    `

    if (isNumber) {
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('*')
            .eq('customer_number', trimmed)
            .maybeSingle()

        if (customerError || !customer) {
            return { data: [], error: null }
        }

        const { data: membership } = await supabase
            .from('customer_memberships')
            .select(membershipSelect)
            .eq('customer_id', customer.id)
            .eq('month', currentMonth)
            .eq('status', 'active')
            .maybeSingle()

        return { data: [{ customer, activeMembership: membership || null }], error: null }
    }

    const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .ilike('name', `%${trimmed}%`)
        .limit(5)

    if (customersError || !customers || customers.length === 0) {
        return { data: [], error: null }
    }

    const results = await Promise.all(
        customers.map(async (customer) => {
            const { data: membership } = await supabase
                .from('customer_memberships')
                .select(membershipSelect)
                .eq('customer_id', customer.id)
                .eq('month', currentMonth)
                .eq('status', 'active')
                .maybeSingle()

            return { customer, activeMembership: membership || null }
        })
    )

    return { data: results, error: null }
}
export async function cancelMembershipOnComanda({ membershipId, comandaId, productId }) {
    // 1. Soft-delete the membership record (preserve audit trail)
    const { error: updateError } = await supabase
        .from('customer_memberships')
        .update({ status: 'cancelled' })
        .eq('id', membershipId)

    if (updateError) return { error: updateError }

    // 2. Void the membership product line on the comanda if it exists
    if (productId) {
        await supabase
            .from('comanda_items')
            .update({ status: 'cancelled' })
            .eq('comanda_id', comandaId)
            .eq('product_id', productId)
            .eq('status', 'active')
    }

    // 3. Void any free benefit items that were added as part of this membership
    await supabase
        .from('comanda_items')
        .update({ status: 'cancelled' })
        .eq('comanda_id', comandaId)
        .eq('is_free_benefit', true)
        .eq('status', 'active')

    return { error: null }
}