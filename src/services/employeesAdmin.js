import { supabase } from './supabase'

export async function getAllEmployeesWithStatus() {
    const { data: employees, error } = await supabase
        .from('employees')
        .select('id, name, position, hourly_rate, user_id')
        .eq('active', true)
        .order('name', { ascending: true })

    if (error) return { data: null, error }

    const { data: openLogs } = await supabase
        .from('employee_time_logs')
        .select('id, employee_id, checked_in_at')
        .is('checked_out_at', null)

    const logMap = new Map((openLogs || []).map(log => [log.employee_id, log]))

    const enriched = (employees || []).map(emp => ({
        ...emp,
        isCheckedIn: logMap.has(emp.id),
        currentLog: logMap.get(emp.id) || null,
    }))

    return { data: enriched, error: null }
}

export async function checkInEmployee({ employeeId }) {
    return await supabase
        .from('employee_time_logs')
        .insert([{ employee_id: employeeId, checked_in_at: new Date().toISOString() }])
        .select()
        .single()
}

export async function checkOutEmployee({ logId }) {
    return await supabase
        .from('employee_time_logs')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('id', logId)
}

export async function createEmployee({ name, position, hourlyRate, userId }) {
    return await supabase
        .from('employees')
        .insert([{
            name: name.trim(),
            position: position?.trim() || null,
            hourly_rate: Number(hourlyRate || 0),
            user_id: userId || null,
            active: true,
        }])
        .select()
        .single()
}

export async function updateEmployee({ id, name, position, hourlyRate, userId }) {
    return await supabase
        .from('employees')
        .update({
            name: name.trim(),
            position: position?.trim() || null,
            hourly_rate: Number(hourlyRate || 0),
            user_id: userId || null,
        })
        .eq('id', id)
        .select()
        .single()
}

export async function getEmployeeTimeLogs({ employeeId, limit = 30 }) {
    return await supabase
        .from('employee_time_logs')
        .select('id, checked_in_at, checked_out_at')
        .eq('employee_id', employeeId)
        .order('checked_in_at', { ascending: false })
        .limit(limit)
}

export async function deactivateEmployee({ id }) {
    return await supabase
        .from('employees')
        .update({ active: false })
        .eq('id', id)
}

/**
 * Checador: estado del empleado ligado al usuario de la sesión.
 * Devuelve null en data si el usuario no tiene empleado activo ligado.
 */
export async function getMyEmployeeStatus({ userId }) {
    const { data: emp, error } = await supabase
        .from('employees')
        .select('id, name')
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle()

    if (error) return { data: null, error }
    if (!emp) return { data: null, error: null }

    const { data: log, error: logError } = await supabase
        .from('employee_time_logs')
        .select('id, checked_in_at')
        .eq('employee_id', emp.id)
        .is('checked_out_at', null)
        .maybeSingle()

    if (logError) return { data: null, error: logError }

    return {
        data: {
            ...emp,
            isCheckedIn: !!log,
            checkedInAt: log?.checked_in_at || null,
        },
        error: null,
    }
}

/**
 * Checador: toggle atómico entrada/salida del usuario de la sesión (RPC).
 * Devuelve { data: { action: 'in'|'out', at, checkedInAt, employeeName }, error }.
 */
export async function clockSelf() {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('clock_self')

    // RAISE EXCEPTION → branch rpcError (lesson: manejar ambos branches)
    if (rpcError) {
        return { data: null, error: new Error('Error al checar. Intenta de nuevo.') }
    }

    if (rpcResult && !rpcResult.ok) {
        return { data: null, error: new Error(rpcResult.error || 'Error al checar.') }
    }

    return {
        data: {
            action: rpcResult.action,
            at: rpcResult.at,
            checkedInAt: rpcResult.checked_in_at || null,
            employeeName: rpcResult.employee_name,
        },
        error: null,
    }
}
