import { supabase } from './supabase'

/**
 * Logs a JS crash to the error_log table.
 * Called from ErrorBoundary.componentDidCatch — fire and forget, never throws.
 * User is read from the local Supabase session cache (no network request).
 */
export async function logError({ message, stack, route }) {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('error_log').insert({
            error_message: (message ?? 'Unknown error').slice(0, 500),
            stack:         (stack ?? '').slice(0, 2000),
            user_id:       user?.id ?? null,
            route:         route ?? null,
        })
    } catch {
        // Logging must never throw — crash reporting is best-effort
    }
}
