import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Nómina (Fase 3): cierre semanal inmutable + reapertura + historial de pagos.
// payroll_records es snapshot de solo-INSERT; reabrir = anular vía RPC.
// Todas las queries filtran `voided_at IS NULL` para ver solo filas activas.
// ─────────────────────────────────────────────────────────────────────────────

/** Filas de nómina ACTIVAS (no anuladas) de una semana. */
export async function getWeekPayroll({ weekStart }) {
    const ws = typeof weekStart === 'string' ? weekStart : weekStart.toISOString().slice(0, 10)
    return await supabase
        .from('payroll_records')
        .select('id, employee_id, week_start, planned_hours, actual_hours, hourly_rate_snapshot, total_pay, notes, created_at')
        .eq('week_start', ws)
        .is('voided_at', null)
}

/**
 * Cierra la semana: inserta una fila por empleado con el cálculo vigente.
 * `rows`: [{ employeeId, weekStart, plannedHours, actualHours, hourlyRate, totalPay, notes }]
 * Snapshot inmutable — si ya existe una semana activa, el índice único parcial
 * lanza 23505 y devolvemos un mensaje amigable (hay que reabrir primero).
 */
export async function closePayrollWeek({ rows, createdBy }) {
    const payload = (rows || []).map(r => ({
        employee_id: r.employeeId,
        week_start: r.weekStart,
        planned_hours: r.plannedHours,
        actual_hours: r.actualHours,
        hourly_rate_snapshot: r.hourlyRate,
        total_pay: r.totalPay,
        notes: r.notes || null,
        created_by: createdBy,
    }))

    const { data, error } = await supabase
        .from('payroll_records')
        .insert(payload)
        .select()

    if (error && error.code === '23505') {
        return { data: null, error: new Error('Esta semana ya está cerrada. Reábrela para volver a calcular.') }
    }
    return { data, error }
}

/**
 * Reabre (anula) todas las filas activas de la semana vía RPC void_payroll_week.
 * RAISE/rpcError y rpcResult.ok se manejan por separado (lesson del proyecto).
 */
export async function reopenPayrollWeek({ weekStart }) {
    const ws = typeof weekStart === 'string' ? weekStart : weekStart.toISOString().slice(0, 10)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('void_payroll_week', { p_week_start: ws })

    if (rpcError) {
        return { error: new Error('Error al reabrir la semana. Intenta de nuevo.') }
    }
    if (rpcResult && !rpcResult.ok) {
        return { error: new Error(rpcResult.error || 'No se pudo reabrir la semana.') }
    }
    return { error: null }
}

/** Historial de pagos de un empleado (semanas activas, más reciente primero). */
export async function getPayrollHistoryByEmployee({ employeeId, limit = 26 }) {
    return await supabase
        .from('payroll_records')
        .select('id, week_start, planned_hours, actual_hours, hourly_rate_snapshot, total_pay, notes, created_at')
        .eq('employee_id', employeeId)
        .is('voided_at', null)
        .order('week_start', { ascending: false })
        .limit(limit)
}
