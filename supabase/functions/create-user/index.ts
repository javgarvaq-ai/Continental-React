import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
        const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!
        const serviceRoleKey  = Deno.env.get('SB_SERVICE_ROLE_KEY')!

        // ── Verify caller has a valid session ────────────────
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return json({ error: 'No authorization header' }, 401)
        }

        const callerClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        })

        const { data: { user: callerAuth }, error: sessionError } = await callerClient.auth.getUser()
        if (sessionError || !callerAuth) {
            return json({ error: 'Invalid session' }, 401)
        }

        // ── Verify caller is an active admin ─────────────────
        const adminClient = createClient(supabaseUrl, serviceRoleKey)

        const { data: callerUser } = await adminClient
            .from('users')
            .select('role, active')
            .eq('id', callerAuth.id)
            .single()

        if (!callerUser || callerUser.role !== 'admin' || !callerUser.active) {
            return json({ error: 'Se requiere rol de administrador' }, 403)
        }

        // ── Parse and validate body ───────────────────────────
        const { name, role, pin } = await req.json()

        if (!name?.trim() || !role || !pin) {
            return json({ error: 'Faltan campos requeridos: name, role, pin' }, 400)
        }

        const validRoles = ['admin', 'manager', 'waiter']
        if (!validRoles.includes(role)) {
            return json({ error: 'Rol inválido' }, 400)
        }

        // ── Create Supabase Auth user ─────────────────────────
        // Use a temp email first, then update to UUID-based email once we have the ID
        const tempEmail = `temp_${crypto.randomUUID()}@continental.bar`

        const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
            email: tempEmail,
            password: pin,
            email_confirm: true,
        })

        if (createError || !authData.user) {
            return json({ error: createError?.message || 'Error creando cuenta de autenticación' }, 500)
        }

        const userId    = authData.user.id
        const realEmail = `${userId}@continental.bar`

        // Update to real UUID-based email
        await adminClient.auth.admin.updateUserById(userId, { email: realEmail })

        // ── Insert into users table ───────────────────────────
        const { data: newUser, error: insertError } = await adminClient
            .from('users')
            .insert([{
                id:     userId,
                name:   name.trim(),
                role,
                active: true,
                email:  realEmail,
            }])
            .select('id, name, role, active')
            .single()

        if (insertError) {
            // Rollback: delete the auth user so we don't leave orphaned accounts
            await adminClient.auth.admin.deleteUser(userId)
            return json({ error: insertError.message }, 500)
        }

        return json({ success: true, user: newUser })

    } catch (err) {
        return json({ error: err.message }, 500)
    }
})

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
