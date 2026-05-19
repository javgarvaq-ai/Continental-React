import { supabase } from './supabase'

// Note: intentionally omits `role` — this query runs before auth (TO anon policy)
// and is used only to build the user selector on the login screen.
// Exposing role pre-auth leaks the org structure to anyone who opens the URL.
export async function getActiveUsers() {
    const { data, error } = await supabase
        .from('users')
        .select('id, name, active')
        .eq('active', true)
        .order('name')

    return { data, error }
}

/**
 * Returns a single active user by id.
 * Used by authStore.verifySession to confirm the session user is still active.
 */
export async function getUserById(userId) {
    const { data, error } = await supabase
        .from('users')
        .select('id, name, role, active')
        .eq('id', userId)
        .eq('active', true)
        .single()

    return { data, error }
}

/**
 * Returns { exists: boolean } — whether any user rows exist at all.
 * Used by SetupAdminPage to decide whether to show setup or redirect.
 */
export async function checkUsersExist() {
    const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

    return { exists: (count || 0) > 0, error }
}
