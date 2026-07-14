// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura del checador: agrupación de time logs por día operacional.
//
// Convenciones del sistema (mismas que reports/ledger):
// - Zona horaria del bar: UTC-6 fija.
// - Día operacional: corte a las 06:00 hora del bar. Una checada del lunes
//   01:30 (madrugada) pertenece al día operacional del DOMINGO.
// - Semana operacional: domingo → sábado (week_start = domingo, day_of_week 0-6).
//
// Sin dependencias de React ni Supabase — testeable directo en node.
// ─────────────────────────────────────────────────────────────────────────────

const BAR_UTC_OFFSET_MS = -6 * 3600 * 1000
const CUTOFF_MS = 6 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000

/** Redondea horas al cuarto de hora más cercano (15 min). */
export function roundQuarter(hours) {
    return Math.round(hours * 4) / 4
}

/**
 * Índice de día operacional (0=Dom … 6=Sáb) de un timestamp dentro de la
 * semana que inicia en weekStartStr ('YYYY-MM-DD', domingo).
 * Devuelve null si cae fuera de esa semana.
 */
export function operationalDayIndex(iso, weekStartStr) {
    const shifted = new Date(iso).getTime() + BAR_UTC_OFFSET_MS - CUTOFF_MS
    const dayStr = new Date(shifted).toISOString().slice(0, 10)
    const idx = Math.round(
        (Date.parse(dayStr + 'T00:00:00Z') - Date.parse(weekStartStr + 'T00:00:00Z')) / DAY_MS
    )
    return idx >= 0 && idx <= 6 ? idx : null
}

/**
 * Agrupa logs por empleado + día operacional.
 * Devuelve { 'empId_dayIdx': { hours, rawHours, firstInAt, hasOpen } }
 * - hours: suma de logs CERRADOS del día, redondeada a 15 min.
 * - firstInAt: primera entrada del día (para retardos).
 * - hasOpen: true si hay un log sin salida ese día (horas incompletas).
 */
export function summarizeLogsByEmpDay(logs, weekStartStr) {
    const map = {}
    for (const log of logs || []) {
        const idx = operationalDayIndex(log.checked_in_at, weekStartStr)
        if (idx === null) continue
        const key = `${log.employee_id}_${idx}`
        if (!map[key]) {
            map[key] = { rawHours: 0, firstInAt: log.checked_in_at, hasOpen: false }
        }
        const entry = map[key]
        if (new Date(log.checked_in_at) < new Date(entry.firstInAt)) {
            entry.firstInAt = log.checked_in_at
        }
        if (log.checked_out_at) {
            entry.rawHours += (new Date(log.checked_out_at) - new Date(log.checked_in_at)) / 3600000
        } else {
            entry.hasOpen = true
        }
    }
    for (const key of Object.keys(map)) {
        map[key].hours = roundQuarter(map[key].rawHours)
    }
    return map
}

/**
 * Minutos de retardo de la primera checada vs. la hora programada del turno.
 * startTime 'HH:MM[:SS]' pertenece al día operacional dayIdx; si es < 06:00
 * es madrugada, o sea el día calendario siguiente.
 * Devuelve 0 si llegó a tiempo o antes.
 */
export function lateMinutes(firstInAt, weekStartStr, dayIdx, startTime) {
    const [h, m] = startTime.split(':').map(Number)
    const dayOffset = h < 6 ? dayIdx + 1 : dayIdx
    const scheduledMs =
        Date.parse(weekStartStr + 'T00:00:00-06:00') + dayOffset * DAY_MS + (h * 60 + m) * 60000
    const diff = Math.round((new Date(firstInAt).getTime() - scheduledMs) / 60000)
    return diff > 0 ? diff : 0
}

/** ¿Ya terminó el día operacional dayIdx de la semana weekStartStr? (fin: 06:00 del día siguiente) */
export function isOperationalDayOver(weekStartStr, dayIdx, now = new Date()) {
    const endMs = Date.parse(weekStartStr + 'T06:00:00-06:00') + (dayIdx + 1) * DAY_MS
    return now.getTime() >= endMs
}

/** ¿Un log abierto lleva más de maxHours horas? (log olvidado) */
export function isStaleOpenLog(checkedInAt, maxHours = 16, now = new Date()) {
    return (now.getTime() - new Date(checkedInAt).getTime()) / 3600000 > maxHours
}
