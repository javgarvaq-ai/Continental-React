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
    const currentMonth = getCurrentMonthDate()
    return await supabase
        .from('customer_memberships')
        .insert([{
            customer_id: customerId,
            plan_id: planId,
            month: currentMonth,
            status: 'active',
            paid_via_comanda_id: comandaId || null,
        }])
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
        .single()
}

export async function addFreeBenefitItemToComanda({ comandaId, productId }) {
    // Check if a free benefit item already exists for this comanda
    const { data: existing } = await supabase
        .from('comanda_items')
        .select('id')
        .eq('comanda_id', comandaId)
        .eq('is_free_benefit', true)
        .eq('status', 'active')
        .maybeSingle()

    if (existing) {
        return { error: new Error('Ya se agregó un producto gratis en esta visita.'), data: null }
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
    membershipPlanBenefits,
}) {
    const { data: customer } = await supabase
        .from('customers')
        .select('visit_count, bottle_credits_available')
        .eq('id', customerId)
        .single()

    const prevVisitCount = Number(customer?.visit_count || 0)
    const newVisitCount = prevVisitCount + 1

    const milestoneBenefit = (membershipPlanBenefits || []).find(
        b => b.benefit_type === 'free_bottle_milestone'
    )
    const milestoneVisits = Number(milestoneBenefit?.milestone_visits || 4)
    const prevCycles = milestoneBenefit ? Math.floor(prevVisitCount / milestoneVisits) : 0
    const newCycles = milestoneBenefit ? Math.floor(newVisitCount / milestoneVisits) : 0
    const earnedBottleCredit = milestoneBenefit && newCycles > prevCycles

    const { data: freeBenefitItems } = await supabase
        .from('comanda_items')
        .select('id, product_id')
        .eq('comanda_id', comandaId)
        .eq('is_free_benefit', true)
        .eq('status', 'active')

    const bottleBenefit = (membershipPlanBenefits || []).find(
        b => b.benefit_type === 'free_bottle_milestone'
    )
    const productBenefit = (membershipPlanBenefits || []).find(
        b => b.benefit_type === 'free_product'
    )

    const freeBottleItem = (freeBenefitItems || []).find(item =>
        (bottleBenefit?.membership_benefit_products || []).some(
            bp => bp.product_id === item.product_id
        )
    )

    const freeProductItem = (freeBenefitItems || []).find(item =>
        (productBenefit?.membership_benefit_products || []).some(
            bp => bp.product_id === item.product_id
        )
    )

    const currentBottleCredits = Number(customer?.bottle_credits_available || 0)
    const creditsAfterEarning = currentBottleCredits + (earnedBottleCredit ? 1 : 0)
    const creditsAfterRedemption = freeBottleItem
        ? Math.max(creditsAfterEarning - 1, 0)
        : creditsAfterEarning

    await supabase
        .from('customers')
        .update({
            visit_count: newVisitCount,
            bottle_credits_available: creditsAfterRedemption,
        })
        .eq('id', customerId)

    const usageEntries = []

    if (discountAmount > 0 && membershipId) {
        usageEntries.push({
            customer_id: customerId,
            customer_membership_id: membershipId,
            comanda_id: comandaId,
            benefit_type: 'discount',
            discount_percentage: discountPct,
            discount_amount_saved: discountAmount,
        })
    }

    if (freeProductItem && membershipId) {
        usageEntries.push({
            customer_id: customerId,
            customer_membership_id: membershipId,
            comanda_id: comandaId,
            benefit_type: 'free_product',
            free_product_id: freeProductItem.product_id,
            discount_amount_saved: 0,
        })
    }

    if (freeBottleItem && membershipId) {
        usageEntries.push({
            customer_id: customerId,
            customer_membership_id: membershipId,
            comanda_id: comandaId,
            benefit_type: 'free_bottle_milestone',
            free_bottle_product_id: freeBottleItem.product_id,
            discount_amount_saved: 0,
        })
    }

    if (usageEntries.length > 0) {
        await supabase.from('membership_benefit_usage').insert(usageEntries)
    }

    return { newVisitCount, earnedBottleCredit, newBottleCreditsAvailable: creditsAfterRedemption }
}