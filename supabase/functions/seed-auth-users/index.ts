// ONE-TIME SEED FUNCTION
// Creates Supabase Auth accounts for all existing users in the users table.
// Temp PIN: 000000 — admin must reset all PINs after running this.
//
// Run once via:
//   npx supabase functions invoke seed-auth-users --no-verify-jwt
//
// Delete or disable this function after running.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TEMP_PIN = '000000'

serve(async (_req) => {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SB_SERVICE_ROLE_KEY')!
    const adminClient    = createClient(supabaseUrl, serviceRoleKey)

    // Fetch all users that don't yet have a Supabase Auth account
    // We detect this by checking if their email exists in auth.users
    const { data: users, error: fetchError } = await adminClient
        .from('users')
        .select('id, name, email')
        .order('created_at', { ascending: true })

    if (fetchError) {
        return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    const results = []

    for (const user of users ?? []) {
        const email = user.email || `${user.id}@continental.bar`

        // Try to create the Auth account
        const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
            email,
            password: TEMP_PIN,
            email_confirm: true,
        })

        if (createError) {
            // If error is "already exists", skip silently
            if (createError.message?.includes('already been registered')) {
                results.push({ id: user.id, name: user.name, status: 'already_exists' })
                continue
            }
            results.push({ id: user.id, name: user.name, status: 'error', error: createError.message })
            continue
        }

        // The auth user ID must match our users.id
        // If Supabase assigned a different UUID, update our users table
        if (authData.user && authData.user.id !== user.id) {
            // This shouldn't happen since we're passing the email only,
            // but if it does, we need to reconcile
            results.push({
                id: user.id,
                name: user.name,
                status: 'uuid_mismatch',
                authId: authData.user.id,
            })
            continue
        }

        // Update email in users table to ensure it matches
        await adminClient
            .from('users')
            .update({ email })
            .eq('id', user.id)

        results.push({ id: user.id, name: user.name, status: 'created', email })
    }

    return new Response(JSON.stringify({ ok: true, results }), {
        headers: { 'Content-Type': 'application/json' },
    })
})
