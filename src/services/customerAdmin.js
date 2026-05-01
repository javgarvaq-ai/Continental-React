import { supabase } from './supabase'

export async function getAllCustomers() {
    return await supabase
        .from('customers')
        .select(`
            *,
            customer_memberships (
                id, month, status,
                membership_plans ( name, price_monthly )
            )
        `)
        .order('customer_number', { ascending: true })
}

export async function getCustomerByNumber(customerNumber) {
    return await supabase
        .from('customers')
        .select(`
            *,
            customer_memberships (
                id, month, status,
                membership_plans ( name, price_monthly )
            )
        `)
        .eq('customer_number', customerNumber)
        .single()
}

export async function createCustomer({ customer_number, name, phone, email }) {
    return await supabase
        .from('customers')
        .insert([{
            customer_number: customer_number.trim(),
            name: name.trim(),
            phone: phone?.trim() || null,
            email: email?.trim() || null,
        }])
        .select()
        .single()
}

export async function updateCustomer({ id, name, phone, email }) {
    return await supabase
        .from('customers')
        .update({
            name: name.trim(),
            phone: phone?.trim() || null,
            email: email?.trim() || null,
        })
        .eq('id', id)
        .select()
        .single()
}

export async function getNextCustomerNumber() {
    const { data, error } = await supabase
        .from('customers')
        .select('customer_number')
        .order('created_at', { ascending: false })
        .limit(1)

    if (error || !data || data.length === 0) return '0001'

    const last = parseInt(data[0].customer_number, 10)
    if (isNaN(last)) return '0001'
    return String(last + 1).padStart(4, '0')
}

export async function getCustomerBenefitUsage(customerId) {
    return await supabase
        .from('membership_benefit_usage')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
}