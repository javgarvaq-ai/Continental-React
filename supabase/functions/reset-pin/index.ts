import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ALLOWED_ORIGIN controls the CORS origin for this function.
// Set it as a Supabase secret: supabase secrets set ALLOWED_ORIGIN=https://your-app.vercel.app
// Falls back to '*' if the secret is not set (safe during development, restrict before going live).
const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*'

const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
        const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
        const serviceRoleKey = Deno.env.get('SB_SERVICE_ROLE_KEY')!

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
        const { userId, pin } = await req.json()

        if (!userId || !pin) {
            return json({ error: 'Faltan campos requeridos: userId, pin' }, 400)
        }

        // ── Update Supabase Auth password ─────────────────────
        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
            password: pin,
        })

        if (updateError) {
            return json({ error: updateError.message }, 500)
        }

        return json({ success: true })

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
