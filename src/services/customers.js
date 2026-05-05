import { supabase } from './supabase'

export async function createCustomer({ customerNumber, name, phone }) {
    const { data, error } = await supabase
        .from('customers')
        .insert([{
            customer_number: customerNumber,
            name: name.trim(),
            phone: phone?.trim() || null,
        }])
        .select()
        .single()

    return { data, error }
}
