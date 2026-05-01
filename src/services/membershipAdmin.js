import { supabase } from './supabase'

// ── PLANS ──────────────────────────────────────────
export async function getAllMembershipPlans() {
    return await supabase
        .from('membership_plans')
        .select(`
            *,
            membership_plan_benefits (
                *,
                membership_benefit_products (
                    *,
                    products ( id, name, price )
                )
            )
        `)
        .order('created_at', { ascending: true })
}

export async function createMembershipPlan({ name, price_monthly }) {
    return await supabase
        .from('membership_plans')
        .insert([{ name: name.trim(), price_monthly }])
        .select()
        .single()
}

export async function updateMembershipPlan({ id, name, price_monthly, active }) {
    return await supabase
        .from('membership_plans')
        .update({ name: name.trim(), price_monthly, active })
        .eq('id', id)
        .select()
        .single()
}

// ── BENEFITS ───────────────────────────────────────
export async function createBenefit({ plan_id, benefit_type, discount_percentage, milestone_visits }) {
    return await supabase
        .from('membership_plan_benefits')
        .insert([{
            plan_id,
            benefit_type,
            discount_percentage: discount_percentage || null,
            milestone_visits: milestone_visits || null,
        }])
        .select()
        .single()
}

export async function deleteBenefit({ id }) {
    // First delete linked products
    await supabase
        .from('membership_benefit_products')
        .delete()
        .eq('benefit_id', id)

    return await supabase
        .from('membership_plan_benefits')
        .delete()
        .eq('id', id)
}

// ── BENEFIT PRODUCTS ───────────────────────────────
export async function addBenefitProduct({ benefit_id, product_id }) {
    return await supabase
        .from('membership_benefit_products')
        .insert([{ benefit_id, product_id }])
        .select()
        .single()
}

export async function removeBenefitProduct({ id }) {
    return await supabase
        .from('membership_benefit_products')
        .delete()
        .eq('id', id)
}

// ── PRODUCTS CATALOG (for selection) ──────────────
export async function getProductsForBenefitSelection() {
    return await supabase
        .from('products')
        .select('id, name, price, categories(name)')
        .eq('active', true)
        .order('name', { ascending: true })
}