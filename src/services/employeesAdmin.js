import { supabase } from './supabase'

export async function getAllEmployeesWithStatus() {
    const { data: employees, error } = await supabase
        .from('employees')
        .select('id, name, position, hourly_rate')
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

export async function createEmployee({ name, position, hourlyRate }) {
    return await supabase
        .from('employees')
        .insert([{
            name: name.trim(),
            position: position?.trim() || null,
            hourly_rate: Number(hourlyRate || 0),
            active: true,
        }])
        .select()
        .single()
}

export async function updateEmployee({ id, name, position, hourlyRate }) {
    return await supabase
        .from('employees')
        .update({
            name: name.trim(),
            position: position?.trim() || null,
            hourly_rate: Number(hourlyRate || 0),
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
