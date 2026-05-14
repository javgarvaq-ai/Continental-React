import { supabase } from './supabase'

/** Returns the Sunday of the week containing `date` (defaults to today) */
export function getWeekStart(date = new Date()) {
    const d = new Date(date)
    const day = d.getDay() // 0=Sun, 1=Mon, …, 6=Sat
    d.setDate(d.getDate() - day) // rewind to Sunday
    d.setHours(0, 0, 0, 0)
    return d
}

/** Format a Date as YYYY-MM-DD */
export function toDateString(date) {
    return date.toISOString().slice(0, 10)
}

/** Fetch all shifts for a given week_start (Date or string) */
export async function getWeekSchedule({ weekStart }) {
    const ws = typeof weekStart === 'string' ? weekStart : toDateString(weekStart)
    return await supabase
        .from('employee_schedule_shifts')
        .select('*')
        .eq('week_start', ws)
        .order('day_of_week', { ascending: true })
}

/**
 * Insert or update a shift for one employee on one day of a week.
 * Uses upsert on the unique (employee_id, week_start, day_of_week) constraint.
 */
export async function upsertShift({ employeeId, weekStart, dayOfWeek, startTime, endTime, notes }) {
    const ws = typeof weekStart === 'string' ? weekStart : toDateString(weekStart)
    return await supabase
        .from('employee_schedule_shifts')
        .upsert(
            {
                employee_id: employeeId,
                week_start: ws,
                day_of_week: dayOfWeek,
                start_time: startTime,
                end_time: endTime,
                notes: notes || null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'employee_id,week_start,day_of_week' }
        )
        .select()
        .single()
}

/** Delete a single shift by id */
export async function deleteShift({ id }) {
    return await supabase
        .from('employee_schedule_shifts')
        .delete()
        .eq('id', id)
}

/** Record actual hours worked for a shift */
export async function updateActualHours({ id, actualHours }) {
    return await supabase
        .from('employee_schedule_shifts')
        .update({ actual_hours: actualHours, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
}

/**
 * Copy all shifts from the previous week into the target week.
 * Skips days that already have a shift in the target week.
 */
export async function copyPreviousWeek({ weekStart }) {
    const ws = typeof weekStart === 'string' ? new Date(weekStart + 'T12:00:00') : new Date(weekStart)
    const prevWs = new Date(ws)
    prevWs.setDate(prevWs.getDate() - 7)
    const prevWsStr = toDateString(prevWs)
    const wsStr = typeof weekStart === 'string' ? weekStart : toDateString(weekStart)

    const { data: prevShifts, error } = await supabase
        .from('employee_schedule_shifts')
        .select('*')
        .eq('week_start', prevWsStr)

    if (error || !prevShifts || prevShifts.length === 0) {
        return { error: error || new Error('No hay turno previo para copiar.'), data: null }
    }

    // Get existing shifts for target week to avoid overwriting
    const { data: existing } = await supabase
        .from('employee_schedule_shifts')
        .select('employee_id, day_of_week')
        .eq('week_start', wsStr)

    const existingSet = new Set(
        (existing || []).map(s => `${s.employee_id}_${s.day_of_week}`)
    )

    const toInsert = prevShifts
        .filter(s => !existingSet.has(`${s.employee_id}_${s.day_of_week}`))
        .map(({ employee_id, day_of_week, start_time, end_time, notes }) => ({
            employee_id,
            week_start: wsStr,
            day_of_week,
            start_time,
            end_time,
            notes,
            actual_hours: null,
        }))

    if (toInsert.length === 0) {
        return { error: new Error('Todos los turnos ya existen en esta semana.'), data: null }
    }

    const { data, error: insertError } = await supabase
        .from('employee_schedule_shifts')
        .insert(toInsert)
        .select()

    return { data, error: insertError }
}
