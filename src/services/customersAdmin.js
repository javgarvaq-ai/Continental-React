import { supabase } from './supabase'

export async function getAllCustomers() {
    const { data, error } = await supabase
        .from('customers')
        .select(`
            *,
            customer_memberships (
                id, month, status,
                membership_plans ( name, price_monthly )
            )
        `)
        .order('customer_number', { ascending: true })
    return { data, error }
}

export async function createCustomer({ customer_number, name, phone, email }) {
    const { data, error } = await supabase
        .from('customers')
        .insert([{
            customer_number: parseInt(customer_number, 10),
            name: name.trim(),
            phone: phone?.trim() || null,
            email: email?.trim() || null,
        }])
        .select()
        .single()
    return { data, error }
}

export async function updateCustomer({ id, name, phone, email }) {
    const { data, error } = await supabase
        .from('customers')
        .update({
            name: name.trim(),
            phone: phone?.trim() || null,
            email: email?.trim() || null,
        })
        .eq('id', id)
        .select()
        .single()
    return { data, error }
}

export async function getNextCustomerNumber() {
    // Column is now integer — order is always numeric, no parseInt needed.
    const { data, error } = await supabase
        .from('customers')
        .select('customer_number')
        .order('customer_number', { ascending: false })
        .limit(1)

    if (error || !data || data.length === 0) return 1

    const last = data[0].customer_number
    return isNaN(last) ? 1 : last + 1
}

export async function getCustomerBenefitUsage(customerId) {
    const { data, error } = await supabase
        .from('membership_benefit_usage')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
    return { data, error }
}