import bcrypt from 'bcryptjs'
import { supabase } from './supabase'

export async function getAllUsers() {
    return await supabase
        .from('users')
        .select('id, name, role, active, created_at')
        .order('created_at', { ascending: true })
}

export async function createUser({ name, role, pin }) {
    const pinHash = await bcrypt.hash(pin, 10)

    return await supabase.from('users').insert([
        {
            name: name.trim(),
            role,
            pin_hash: pinHash,
            active: true,
        },
    ])
}

export async function updateUserActive({ userId, active }) {
    return await supabase
        .from('users')
        .update({ active })
        .eq('id', userId)
}

export async function resetUserPin({ userId, pin }) {
    const pinHash = await bcrypt.hash(pin, 10)

    return await supabase
        .from('users')
        .update({ pin_hash: pinHash })
        .eq('id', userId)
}