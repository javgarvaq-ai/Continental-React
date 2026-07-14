import { useState, useEffect, useCallback } from 'react'
import { useStatus } from '../hooks/useStatus'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'
import { getAllEmployeesWithStatus } from '../services/employeesAdmin'
import {
    getWeekSchedule,
    getWeekTimeLogs,
    upsertShift,
    deleteShift,
    updateActualHours,
    copyPreviousWeek,
    getWeekStart,
    toDateString,
} from '../services/scheduleAdmin'
import { getWeekPayroll, closePayrollWeek, reopenPayrollWeek } from '../services/payroll'
import { summarizeLogsByEmpDay, lateMinutes, isOperationalDayOver } from '../utils/timeLogs'

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Time slots for the visual grid: 11:00 → 02:00 (next day)
const GRID_SLOTS = [
    '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
    '23:00', '00:00', '01:00',
]

// One color per employee (cycles if more than 8)
const EMP_COLORS = [
    { bg: '#1a2e47', border: '#2a4a6a', text: '#93c5fd' },
    { bg: '#1a3a2a', border: '#2a5a3a', text: '#4ade80' },
    { bg: '#3a1a2a', border: '#5a2a3a', text: '#f9a8d4' },
    { bg: '#3a2a1a', border: '#5a4a2a', text: '#fbbf24' },
    { bg: '#2a1a3a', border: '#4a2a5a', text: '#c4b5fd' },
    { bg: '#1a3a3a', border: '#2a5a5a', text: '#67e8f9' },
    { bg: '#3a1a1a', border: '#5a2a2a', text: '#fca5a5' },
    { bg: '#2a2a1a', border: '#4a4a2a', text: '#d9f99d' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date, n) {
    const d = new Date(date)
    d.setDate(d.getDate() + n)
    return d
}

/** Devuelve el domingo (YYYY-MM-DD) de la semana desplazada `deltaWeeks` desde weekStartStr */
function shiftWeek(weekStartStr, deltaWeeks) {
    return toDateString(getWeekStart(addDays(new Date(weekStartStr + 'T12:00:00'), deltaWeeks * 7)))
}

function formatWeekLabel(weekStart) {
    const end = addDays(weekStart, 6)
    const opts = { day: 'numeric', month: 'short' }
    return `${new Date(weekStart + 'T12:00:00').toLocaleDateString('es-MX', opts)} – ${end.toLocaleDateString('es-MX', opts)}`
}

function formatDateShort(weekStart, dayIndex) {
    const d = addDays(new Date(weekStart + 'T12:00:00'), dayIndex)
    return d.getDate()
}

/** Convert "HH:MM" to minutes since midnight (handles 00:xx and 01:xx as post-midnight) */
function timeToMins(t) {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
}

/** Does the shift [start, end) cover the given slot hour? Handles overnight. */
function shiftCoversSlot(startTime, endTime, slot) {
    const slotMins = timeToMins(slot)
    let sMins = timeToMins(startTime)
    let eMins = timeToMins(endTime)

    // Overnight: end < start → add 24h to end
    if (eMins <= sMins) eMins += 24 * 60

    // Also normalize slotMins for overnight slots (00:xx, 01:xx treated as post-midnight)
    const normalizedSlot = slotMins < 6 * 60 ? slotMins + 24 * 60 : slotMins

    return normalizedSlot >= sMins && normalizedSlot < eMins
}

/** Compute scheduled hours from start/end times (handles overnight) */
function scheduledHours(startTime, endTime) {
    let s = timeToMins(startTime)
    let e = timeToMins(endTime)
    if (e <= s) e += 24 * 60
    return (e - s) / 60
}

function money(v) {
    return `$${Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
    padding: '6px 8px',
    borderRadius: '5px',
    border: '1px solid #2a2a2a',
    background: '#0e0e0e',
    color: '#e2e2e2',
    fontSize: '12px',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
}

const labelStyle = {
    display: 'block',
    fontSize: '10px',
    color: '#555',
    marginBottom: '3px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
}

const sectionTitle = {
    margin: '0 0 14px 0',
    fontSize: '11px',
    fontWeight: 700,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
}

// ── Main component ────────────────────────────────────────────────────────────

function ScheduleAdminPage() {
    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    const todayWeekStart = toDateString(getWeekStart())
    const nextWeekStart = toDateString(getWeekStart(addDays(new Date(todayWeekStart + 'T12:00:00'), 7)))

    const [activeWeek, setActiveWeek] = useState(todayWeekStart)   // 'current' or 'next'
    const [employees, setEmployees] = useState([])
    const [shifts, setShifts] = useState([])                    // raw rows from DB
    const [timeLogs, setTimeLogs] = useState([])                // checadas de la semana operacional
    const [payrollRows, setPayrollRows] = useState([])          // filas de nómina activas de la semana (cierre)
    const [loading, setLoading] = useState(true)
    const { status, statusColor, setStatus } = useStatus('')
    const [isCopying, setIsCopying] = useState(false)
    const [isAccepting, setIsAccepting] = useState(false)
    const [confirmingClose, setConfirmingClose] = useState(false)
    const [confirmingReopen, setConfirmingReopen] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const [isReopening, setIsReopening] = useState(false)

    // Editor state: which employee is open for editing
    const [editingEmpId, setEditingEmpId] = useState(null)
    const [editDays, setEditDays] = useState({})   // { dayIndex: { enabled, startTime, endTime } }
    const [isSavingSchedule, setIsSavingSchedule] = useState(false)

    // Actual hours editing
    const [editingActual, setEditingActual] = useState(null)    // { shiftId, value }

    // Active tab: 'grid' | 'editor' | 'pay'
    const [tab, setTab] = useState('grid')

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadEmployees = useCallback(async () => {
        const { data, error } = await getAllEmployeesWithStatus()
        if (!error) setEmployees(data || [])
    }, [])

    const loadShifts = useCallback(async () => {
        setLoading(true)
        const [scheduleResult, logsResult, payrollResult] = await Promise.all([
            getWeekSchedule({ weekStart: activeWeek }),
            getWeekTimeLogs({ weekStart: activeWeek }),
            getWeekPayroll({ weekStart: activeWeek }),
        ])
        if (!scheduleResult.error) setShifts(scheduleResult.data || [])
        if (!logsResult.error) setTimeLogs(logsResult.data || [])
        if (!payrollResult.error) setPayrollRows(payrollResult.data || [])
        setConfirmingClose(false)
        setConfirmingReopen(false)
        setLoading(false)
    }, [activeWeek])

    useEffect(() => { loadEmployees() }, [loadEmployees])
    useEffect(() => { loadShifts() }, [loadShifts])

    // ── Derived data ──────────────────────────────────────────────────────────

    // Map: employeeId → color index
    const empColorMap = Object.fromEntries(
        employees.map((e, i) => [e.id, EMP_COLORS[i % EMP_COLORS.length]])
    )

    // Map: "empId_dayOfWeek" → shift row
    const shiftMap = Object.fromEntries(
        shifts.map(s => [`${s.employee_id}_${s.day_of_week}`, s])
    )

    // Map: "empId_dayIdx" → { hours, firstInAt, hasOpen } desde el checador
    const logSummary = summarizeLogsByEmpDay(timeLogs, activeWeek)

    // ── Estado de la semana ─────────────────────────────────────────────────────
    const isPastWeek = activeWeek < todayWeekStart        // semana pasada → grid solo-lectura
    const weekClosed = payrollRows.length > 0             // nómina cerrada → horas bloqueadas

    /** Días con horas sugeridas del checador aún sin confirmar (celdas azules) */
    function pendingSuggestedCells() {
        return shifts.filter(s => {
            const sum = logSummary[`${s.employee_id}_${s.day_of_week}`]
            const hasActual = s.actual_hours !== null && s.actual_hours !== undefined
            return !hasActual && sum && !sum.hasOpen && sum.hours > 0
        })
    }

    // ── Editor helpers ────────────────────────────────────────────────────────

    function openEditor(emp) {
        if (editingEmpId === emp.id) { setEditingEmpId(null); return }
        setEditingEmpId(emp.id)

        const days = {}
        for (let d = 0; d < 7; d++) {
            const shift = shiftMap[`${emp.id}_${d}`]
            days[d] = shift
                ? { enabled: true, startTime: shift.start_time.slice(0, 5), endTime: shift.end_time.slice(0, 5) }
                : { enabled: false, startTime: '18:00', endTime: '02:00' }
        }
        setEditDays(days)
    }

    function toggleDay(d) {
        setEditDays(prev => ({
            ...prev,
            [d]: { ...prev[d], enabled: !prev[d].enabled }
        }))
    }

    function setDayTime(d, field, value) {
        setEditDays(prev => ({
            ...prev,
            [d]: { ...prev[d], [field]: value }
        }))
    }

    async function handleSaveSchedule() {
        if (!editingEmpId || isSavingSchedule) return
        if (isPastWeek) { setStatus('Semana pasada: el horario es de solo lectura.'); return }
        setIsSavingSchedule(true)
        setStatus('')

        const ops = []

        for (let d = 0; d < 7; d++) {
            const day = editDays[d]
            const existingShift = shiftMap[`${editingEmpId}_${d}`]

            if (day.enabled) {
                ops.push(upsertShift({
                    employeeId: editingEmpId,
                    weekStart: activeWeek,
                    dayOfWeek: d,
                    startTime: day.startTime,
                    endTime: day.endTime,
                }))
            } else if (existingShift) {
                ops.push(deleteShift({ id: existingShift.id }))
            }
        }

        const results = await Promise.all(ops)
        const failed = results.find(r => r.error)

        if (failed) {
            setStatus(`Error guardando horario: ${failed.error.message}`)
        } else {
            setStatus('Horario guardado.')
            setEditingEmpId(null)
            await loadShifts()
        }

        setIsSavingSchedule(false)
    }

    // ── Actual hours ──────────────────────────────────────────────────────────

    async function handleActualHoursSave(shiftId, value) {
        if (weekClosed) { setEditingActual(null); setStatus('Semana cerrada — reábrela para editar horas.'); return }
        const hrs = value === '' ? null : Number(value)
        if (hrs !== null && (isNaN(hrs) || hrs < 0 || hrs > 24)) {
            setStatus('Horas inválidas (0–24).')
            return
        }
        const { error } = await updateActualHours({ id: shiftId, actualHours: hrs })
        if (error) { setStatus('Error guardando horas.'); return }
        setEditingActual(null)
        await loadShifts()
    }

    /** Acepta de golpe todas las horas sugeridas por el checador (días sin actual_hours) */
    async function handleAcceptSuggested() {
        if (isAccepting) return
        if (weekClosed) { setStatus('Semana cerrada — reábrela para editar horas.'); return }
        const targets = shifts.filter(s => {
            const sum = logSummary[`${s.employee_id}_${s.day_of_week}`]
            return (s.actual_hours === null || s.actual_hours === undefined)
                && sum && !sum.hasOpen && sum.hours > 0
        })
        if (targets.length === 0) {
            setStatus('No hay horas sugeridas pendientes de aceptar.')
            return
        }
        setIsAccepting(true)
        const results = await Promise.all(targets.map(s =>
            updateActualHours({
                id: s.id,
                actualHours: logSummary[`${s.employee_id}_${s.day_of_week}`].hours,
            })
        ))
        const failed = results.find(r => r.error)
        setStatus(failed
            ? 'Error guardando algunas horas sugeridas.'
            : `${targets.length} día${targets.length !== 1 ? 's' : ''} confirmado${targets.length !== 1 ? 's' : ''} desde el checador.`)
        await loadShifts()
        setIsAccepting(false)
    }

    // ── Copy previous week ────────────────────────────────────────────────────

    async function handleCopyPrevWeek() {
        if (isCopying) return
        setIsCopying(true)
        setStatus('')
        const { error } = await copyPreviousWeek({ weekStart: activeWeek })
        if (error) {
            setStatus(error.message)
        } else {
            setStatus('Semana anterior copiada.')
            await loadShifts()
        }
        setIsCopying(false)
    }

    // ── Cerrar / reabrir semana (nómina) ──────────────────────────────────────

    async function handleCloseWeek() {
        if (isClosing || weekClosed) return

        // Validación: no dejar celdas azules (sugeridas del checador) sin confirmar
        const pending = pendingSuggestedCells()
        if (pending.length > 0) {
            setConfirmingClose(false)
            setStatus(`Hay ${pending.length} día${pending.length !== 1 ? 's' : ''} con horas sugeridas del checador sin confirmar. Acéptalas o corrígelas antes de cerrar.`)
            return
        }

        // Doble confirmación (patrón del proyecto)
        if (!confirmingClose) {
            setConfirmingClose(true)
            setStatus('')
            setTimeout(() => setConfirmingClose(false), 3000)
            return
        }
        setConfirmingClose(false)

        const rows = getPaySummary().map(r => ({
            employeeId: r.emp.id,
            weekStart: activeWeek,
            plannedHours: Number(r.plannedHrs.toFixed(2)),
            actualHours: Number(r.actualHrs.toFixed(2)),
            hourlyRate: r.rate,
            totalPay: Number((r.actualHrs * r.rate).toFixed(2)),
        }))

        if (rows.length === 0) {
            setStatus('No hay empleados con turnos para cerrar esta semana.')
            return
        }

        setIsClosing(true)
        setStatus('')
        const { error } = await closePayrollWeek({ rows, createdBy: currentUser?.id })
        if (error) {
            setStatus(error.message)
            setIsClosing(false)
            return
        }
        setStatus('Semana cerrada. Las horas quedan bloqueadas; usa "Reabrir semana" para editarlas.')
        await loadShifts()
        setIsClosing(false)
    }

    async function handleReopenWeek() {
        if (isReopening || !weekClosed) return

        if (!confirmingReopen) {
            setConfirmingReopen(true)
            setStatus('')
            setTimeout(() => setConfirmingReopen(false), 3000)
            return
        }
        setConfirmingReopen(false)

        setIsReopening(true)
        const { error } = await reopenPayrollWeek({ weekStart: activeWeek })
        if (error) {
            setStatus(error.message)
            setIsReopening(false)
            return
        }
        setStatus('Semana reabierta. Ya puedes editar horas; el cierre anterior queda en el historial como anulado.')
        await loadShifts()
        setIsReopening(false)
    }

    // ── Pay summary ───────────────────────────────────────────────────────────

    function getPaySummary() {
        return employees.map(emp => {
            const empShifts = shifts.filter(s => s.employee_id === emp.id)
            let plannedHrs = 0
            let actualHrs = 0
            let daysWorked = 0

            empShifts.forEach(s => {
                plannedHrs += scheduledHours(s.start_time, s.end_time)
                if (s.actual_hours !== null && s.actual_hours !== undefined) {
                    actualHrs += Number(s.actual_hours)
                    daysWorked++
                }
            })

            const rate = Number(emp.hourly_rate || 0)
            const dailyRate = rate * 8
            const useActual = actualHrs > 0
            const billableHrs = useActual ? actualHrs : plannedHrs
            const weeklyPay = rate > 0 ? billableHrs * rate : null

            return {
                emp,
                plannedHrs,
                actualHrs,
                daysWorked,
                dailyRate,
                weeklyPay,
                isEstimate: !useActual,
                rate,
            }
        }).filter(r => r.plannedHrs > 0 || r.actualHrs > 0)
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const tabBtn = (id, label) => (
        <button
            type="button"
            onClick={() => setTab(id)}
            style={{
                padding: '7px 16px',
                borderRadius: '6px',
                border: tab === id ? '1px solid #3a5a8a' : '1px solid #2a2a2a',
                background: tab === id ? '#1a2e47' : 'transparent',
                color: tab === id ? '#93c5fd' : '#555',
                fontSize: '13px',
                fontWeight: tab === id ? 600 : 400,
                cursor: 'pointer',
            }}
        >
            {label}
        </button>
    )

    if (!isAdmin) return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666', minHeight: '100vh', background: '#0e0e0e' }}>
            Acceso denegado.
        </div>
    )

    return (
        <div style={{ padding: '20px', paddingLeft: '216px', minHeight: '100vh', background: '#0e0e0e', color: '#e2e2e2' }}>
            <AdminNav currentPath="/admin/schedule" />

            {/* ── Page header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 700, color: '#e8e8e8' }}>Horarios</h2>
                    <p style={{ margin: 0, fontSize: '13px', color: '#555', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {formatWeekLabel(activeWeek)}
                        {isPastWeek && (
                            <span style={{ padding: '1px 7px', borderRadius: '4px', background: '#1e1e1e', color: '#777', fontSize: '11px', fontWeight: 600 }}>
                                Semana pasada
                            </span>
                        )}
                        {weekClosed && (
                            <span style={{ padding: '1px 7px', borderRadius: '4px', background: '#2a1a3a', color: '#c4b5fd', fontSize: '11px', fontWeight: 600 }}>
                                🔒 Nómina cerrada
                            </span>
                        )}
                    </p>
                </div>

                {/* Week selector */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                        type="button"
                        title="Semana anterior"
                        onClick={() => { setActiveWeek(shiftWeek(activeWeek, -1)); setEditingEmpId(null) }}
                        style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            border: '1px solid #2a2a2a',
                            background: '#1a1a1a',
                            color: '#888',
                            fontSize: '14px',
                            cursor: 'pointer',
                        }}
                    >
                        ←
                    </button>
                    <button
                        type="button"
                        onClick={() => { setActiveWeek(todayWeekStart); setEditingEmpId(null) }}
                        style={{
                            padding: '7px 14px',
                            borderRadius: '6px',
                            border: activeWeek === todayWeekStart ? '1px solid #3a5a3a' : '1px solid #2a2a2a',
                            background: activeWeek === todayWeekStart ? '#1a3a2a' : '#1a1a1a',
                            color: activeWeek === todayWeekStart ? '#4ade80' : '#666',
                            fontSize: '13px',
                            fontWeight: activeWeek === todayWeekStart ? 600 : 400,
                            cursor: 'pointer',
                        }}
                    >
                        Esta semana
                    </button>
                    <button
                        type="button"
                        title="Semana siguiente"
                        onClick={() => { setActiveWeek(shiftWeek(activeWeek, 1)); setEditingEmpId(null) }}
                        style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            border: '1px solid #2a2a2a',
                            background: '#1a1a1a',
                            color: '#888',
                            fontSize: '14px',
                            cursor: 'pointer',
                        }}
                    >
                        →
                    </button>
                    <button
                        type="button"
                        onClick={() => { setActiveWeek(nextWeekStart); setEditingEmpId(null) }}
                        style={{
                            padding: '7px 14px',
                            borderRadius: '6px',
                            border: activeWeek === nextWeekStart ? '1px solid #3a5a3a' : '1px solid #2a2a2a',
                            background: activeWeek === nextWeekStart ? '#1a3a2a' : '#1a1a1a',
                            color: activeWeek === nextWeekStart ? '#4ade80' : '#666',
                            fontSize: '13px',
                            fontWeight: activeWeek === nextWeekStart ? 600 : 400,
                            cursor: 'pointer',
                        }}
                    >
                        Próxima semana
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyPrevWeek}
                        disabled={isCopying}
                        style={{
                            padding: '7px 14px',
                            borderRadius: '6px',
                            border: '1px solid #2a2a2a',
                            background: '#1a1a1a',
                            color: isCopying ? '#333' : '#888',
                            fontSize: '13px',
                            cursor: isCopying ? 'default' : 'pointer',
                        }}
                    >
                        {isCopying ? 'Copiando...' : '↙ Copiar semana anterior'}
                    </button>
                </div>
            </div>

            {/* Status */}
            {status && (
                <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: statusColor }}>{status}</p>
            )}

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                {tabBtn('grid', 'Vista semanal')}
                {tabBtn('editor', 'Editar horario')}
                {tabBtn('pay', 'Horas y pagos')}
            </div>

            {loading ? (
                <p style={{ color: '#444', fontSize: '14px' }}>Cargando...</p>
            ) : (
                <>
                    {/* ══════════════════════════════════════════════
                        TAB: GRID VIEW
                    ══════════════════════════════════════════════ */}
                    {tab === 'grid' && (
                        <div style={{ overflowX: 'auto' }}>
                            {/* Employee legend */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                                {employees.map((emp, i) => {
                                    const color = EMP_COLORS[i % EMP_COLORS.length]
                                    const hasShifts = shifts.some(s => s.employee_id === emp.id)
                                    if (!hasShifts) return null
                                    return (
                                        <div key={emp.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '4px 10px', borderRadius: '4px',
                                            background: color.bg, border: `1px solid ${color.border}`,
                                        }}>
                                            <span style={{ fontSize: '12px', color: color.text, fontWeight: 600 }}>
                                                {emp.name.split(' ')[0]}
                                            </span>
                                        </div>
                                    )
                                })}
                                {employees.every(emp => !shifts.some(s => s.employee_id === emp.id)) && (
                                    <p style={{ color: '#444', fontSize: '13px', margin: 0 }}>
                                        No hay turnos programados. Ve a "Editar horario" para agregar.
                                    </p>
                                )}
                            </div>

                            {/* Grid */}
                            <table style={{ borderCollapse: 'collapse', minWidth: '600px', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '60px', padding: '6px 8px', fontSize: '11px', color: '#555', textAlign: 'left', borderBottom: '1px solid #1e1e1e' }}>
                                            Hora
                                        </th>
                                        {DAYS.map((d, i) => (
                                            <th key={d} style={{ padding: '6px 4px', fontSize: '11px', color: '#666', textAlign: 'center', borderBottom: '1px solid #1e1e1e', minWidth: '70px' }}>
                                                <div>{d}</div>
                                                <div style={{ fontSize: '10px', color: '#333' }}>{formatDateShort(activeWeek, i)}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {GRID_SLOTS.map(slot => (
                                        <tr key={slot}>
                                            <td style={{ padding: '3px 8px', fontSize: '11px', color: '#444', borderBottom: '1px solid #111', whiteSpace: 'nowrap' }}>
                                                {slot}
                                            </td>
                                            {Array.from({ length: 7 }, (_, dayIdx) => {
                                                const working = employees.filter(emp => {
                                                    const shift = shiftMap[`${emp.id}_${dayIdx}`]
                                                    return shift && shiftCoversSlot(shift.start_time, shift.end_time, slot)
                                                })
                                                return (
                                                    <td key={dayIdx} style={{
                                                        padding: '2px 3px',
                                                        borderBottom: '1px solid #111',
                                                        borderLeft: '1px solid #111',
                                                        verticalAlign: 'top',
                                                    }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', minHeight: '20px' }}>
                                                            {working.map((emp, ei) => {
                                                                const color = empColorMap[emp.id]
                                                                const initial = emp.name.charAt(0).toUpperCase()
                                                                return (
                                                                    <span key={emp.id} style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        width: '22px', height: '18px',
                                                                        borderRadius: '3px',
                                                                        background: color?.bg || '#1a1a1a',
                                                                        border: `1px solid ${color?.border || '#333'}`,
                                                                        color: color?.text || '#aaa',
                                                                        fontSize: '10px',
                                                                        fontWeight: 700,
                                                                    }}>
                                                                        {initial}
                                                                    </span>
                                                                )
                                                            })}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════
                        TAB: EDITOR
                    ══════════════════════════════════════════════ */}
                    {tab === 'editor' && isPastWeek && (
                        <div style={{ padding: '20px', borderRadius: '8px', border: '1px solid #1e1e1e', background: '#121212', color: '#777', fontSize: '13px' }}>
                            Esta es una semana pasada — el horario es de solo lectura. Puedes verlo en "Vista semanal" y ajustar horas reales en "Horas y pagos".
                        </div>
                    )}
                    {tab === 'editor' && !isPastWeek && (
                        <div>
                            <p style={sectionTitle}>Selecciona un empleado para editar su semana</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {employees.map(emp => {
                                    const color = empColorMap[emp.id]
                                    const isOpen = editingEmpId === emp.id
                                    const empShifts = shifts.filter(s => s.employee_id === emp.id)

                                    return (
                                        <div key={emp.id} style={{
                                            borderRadius: '8px',
                                            border: isOpen ? `1px solid ${color?.border || '#333'}` : '1px solid #1e1e1e',
                                            background: isOpen ? (color?.bg || '#1a1a1a') : '#121212',
                                            overflow: 'hidden',
                                        }}>
                                            {/* Employee row header */}
                                            <button
                                                type="button"
                                                onClick={() => openEditor(emp)}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '12px 14px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: 600, color: isOpen ? (color?.text || '#e2e2e2') : '#c0c0c0' }}>
                                                        {emp.name}
                                                    </span>
                                                    {emp.position && (
                                                        <span style={{ fontSize: '11px', color: '#444' }}>{emp.position}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '11px', color: '#444' }}>
                                                        {empShifts.length > 0 ? `${empShifts.length} día${empShifts.length !== 1 ? 's' : ''}` : 'Sin turnos'}
                                                    </span>
                                                    <span style={{ fontSize: '12px', color: '#333' }}>{isOpen ? '▲' : '▼'}</span>
                                                </div>
                                            </button>

                                            {/* Day editor */}
                                            {isOpen && (
                                                <div style={{ padding: '0 14px 16px' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                                                        {Array.from({ length: 7 }, (_, d) => {
                                                            const day = editDays[d] || { enabled: false, startTime: '18:00', endTime: '02:00' }
                                                            return (
                                                                <div key={d} style={{
                                                                    padding: '10px',
                                                                    borderRadius: '6px',
                                                                    border: day.enabled ? '1px solid #2a4a2a' : '1px solid #1e1e1e',
                                                                    background: day.enabled ? '#0e1e0e' : '#0a0a0a',
                                                                }}>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', marginBottom: day.enabled ? '8px' : 0 }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={day.enabled}
                                                                            onChange={() => toggleDay(d)}
                                                                            style={{ accentColor: '#4ade80' }}
                                                                        />
                                                                        <span style={{ fontSize: '13px', fontWeight: 600, color: day.enabled ? '#e2e2e2' : '#444' }}>
                                                                            {DAYS_FULL[d]}
                                                                        </span>
                                                                    </label>
                                                                    {day.enabled && (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                            <div>
                                                                                <label style={labelStyle}>Entrada</label>
                                                                                <input
                                                                                    type="time"
                                                                                    value={day.startTime}
                                                                                    onChange={e => setDayTime(d, 'startTime', e.target.value)}
                                                                                    style={inputStyle}
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label style={labelStyle}>Salida</label>
                                                                                <input
                                                                                    type="time"
                                                                                    value={day.endTime}
                                                                                    onChange={e => setDayTime(d, 'endTime', e.target.value)}
                                                                                    style={inputStyle}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveSchedule}
                                                            disabled={isSavingSchedule}
                                                            style={{
                                                                padding: '8px 20px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #2a5a3a',
                                                                background: '#1a3a2a',
                                                                color: '#4ade80',
                                                                fontWeight: 600,
                                                                fontSize: '13px',
                                                                cursor: isSavingSchedule ? 'default' : 'pointer',
                                                                opacity: isSavingSchedule ? 0.5 : 1,
                                                            }}
                                                        >
                                                            {isSavingSchedule ? 'Guardando...' : 'Guardar horario'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingEmpId(null)}
                                                            style={{
                                                                padding: '8px 14px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #2a2a2a',
                                                                background: 'transparent',
                                                                color: '#555',
                                                                fontSize: '13px',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════
                        TAB: HOURS & PAY
                    ══════════════════════════════════════════════ */}
                    {tab === 'pay' && (
                        <div>
                            {/* Actual hours entry grid */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '8px', flexWrap: 'wrap' }}>
                                <p style={{ ...sectionTitle, margin: 0 }}>Horas trabajadas por día</p>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {!weekClosed && (
                                        <button
                                            type="button"
                                            onClick={handleAcceptSuggested}
                                            disabled={isAccepting}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '6px',
                                                border: '1px solid #2a4a6a',
                                                background: '#0e1624',
                                                color: isAccepting ? '#3a4a5a' : '#93c5fd',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: isAccepting ? 'default' : 'pointer',
                                            }}
                                        >
                                            {isAccepting ? 'Aceptando...' : '✓ Aceptar sugeridas del checador'}
                                        </button>
                                    )}
                                    {weekClosed ? (
                                        <button
                                            type="button"
                                            onClick={handleReopenWeek}
                                            disabled={isReopening}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '6px',
                                                border: confirmingReopen ? '1px solid #b45309' : '1px solid #4a3a6a',
                                                background: confirmingReopen ? '#3a2a0e' : '#1e1630',
                                                color: confirmingReopen ? '#fbbf24' : '#c4b5fd',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: isReopening ? 'default' : 'pointer',
                                            }}
                                        >
                                            {isReopening ? 'Reabriendo...' : confirmingReopen ? '¿Reabrir? Confirmar' : '🔓 Reabrir semana'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleCloseWeek}
                                            disabled={isClosing}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '6px',
                                                border: confirmingClose ? '1px solid #b45309' : '1px solid #2a5a3a',
                                                background: confirmingClose ? '#3a2a0e' : '#1a3a2a',
                                                color: confirmingClose ? '#fbbf24' : '#4ade80',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: isClosing ? 'default' : 'pointer',
                                            }}
                                        >
                                            {isClosing ? 'Cerrando...' : confirmingClose ? '¿Cerrar semana? Confirmar' : '🔒 Cerrar semana'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div style={{ overflowX: 'auto', marginBottom: '28px' }}>
                                <table style={{ borderCollapse: 'collapse', minWidth: '600px', width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ padding: '8px 10px', fontSize: '11px', color: '#555', textAlign: 'left', borderBottom: '1px solid #1e1e1e', width: '140px' }}>
                                                Empleado
                                            </th>
                                            {DAYS.map((d, i) => (
                                                <th key={d} style={{ padding: '8px 6px', fontSize: '11px', color: '#555', textAlign: 'center', borderBottom: '1px solid #1e1e1e' }}>
                                                    <div>{d}</div>
                                                    <div style={{ fontSize: '10px', color: '#333' }}>{formatDateShort(activeWeek, i)}</div>
                                                </th>
                                            ))}
                                            <th style={{ padding: '8px 10px', fontSize: '11px', color: '#555', textAlign: 'right', borderBottom: '1px solid #1e1e1e' }}>
                                                Total hrs
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employees.map(emp => {
                                            const empShifts = shifts.filter(s => s.employee_id === emp.id)
                                            if (empShifts.length === 0) return null
                                            const totalActual = empShifts.reduce((sum, s) => sum + (s.actual_hours !== null && s.actual_hours !== undefined ? Number(s.actual_hours) : 0), 0)
                                            const totalPlanned = empShifts.reduce((sum, s) => sum + scheduledHours(s.start_time, s.end_time), 0)

                                            return (
                                                <tr key={emp.id}>
                                                    <td style={{ padding: '8px 10px', fontSize: '13px', color: '#c0c0c0', borderBottom: '1px solid #111', fontWeight: 500 }}>
                                                        {emp.name.split(' ')[0]}
                                                    </td>
                                                    {Array.from({ length: 7 }, (_, d) => {
                                                        const shift = shiftMap[`${emp.id}_${d}`]
                                                        const isEditingThis = editingActual?.shiftId === shift?.id
                                                        const sum = logSummary[`${emp.id}_${d}`]
                                                        const sugHours = sum && !sum.hasOpen && sum.hours > 0 ? sum.hours : null
                                                        const hasActual = !!shift && shift.actual_hours !== null && shift.actual_hours !== undefined
                                                        const editedDiff = hasActual && sugHours !== null && Number(shift.actual_hours) !== sugHours
                                                        const late = shift && sum ? lateMinutes(sum.firstInAt, activeWeek, d, shift.start_time) : 0
                                                        const isAbsent = !!shift && !sum && !hasActual && isOperationalDayOver(activeWeek, d)

                                                        // Colores: confirmado (verde) / editado ≠ checador (ámbar) / sugerido (azul) / sin datos (gris)
                                                        let cellBorder = '1px solid #222'
                                                        let cellBg = '#111'
                                                        let cellColor = '#333'
                                                        if (hasActual && editedDiff) {
                                                            cellBorder = '1px solid #5a4a2a'; cellBg = '#1e1a0e'; cellColor = '#fbbf24'
                                                        } else if (hasActual) {
                                                            cellBorder = '1px solid #2a5a3a'; cellBg = '#0e1e0e'; cellColor = '#4ade80'
                                                        } else if (sugHours !== null) {
                                                            cellBorder = '1px solid #2a4a6a'; cellBg = '#0e1624'; cellColor = '#93c5fd'
                                                        }

                                                        return (
                                                            <td key={d} style={{ padding: '4px 4px', borderBottom: '1px solid #111', textAlign: 'center' }}>
                                                                {shift ? (
                                                                    weekClosed ? (
                                                                        <span
                                                                            title="Semana cerrada — reábrela para editar"
                                                                            style={{
                                                                                display: 'inline-block',
                                                                                padding: '3px 8px',
                                                                                borderRadius: '4px',
                                                                                border: cellBorder,
                                                                                background: cellBg,
                                                                                color: cellColor,
                                                                                fontSize: '12px',
                                                                                minWidth: '40px',
                                                                            }}
                                                                        >
                                                                            {hasActual
                                                                                ? `${shift.actual_hours}h`
                                                                                : `(${scheduledHours(shift.start_time, shift.end_time).toFixed(0)}h)`}
                                                                        </span>
                                                                    ) : isEditingThis ? (
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            max="24"
                                                                            step="0.5"
                                                                            autoFocus
                                                                            value={editingActual.value}
                                                                            onChange={e => setEditingActual(a => ({ ...a, value: e.target.value }))}
                                                                            onBlur={e => handleActualHoursSave(shift.id, e.target.value)}
                                                                            onKeyDown={e => {
                                                                                if (e.key === 'Enter') handleActualHoursSave(shift.id, editingActual.value)
                                                                                if (e.key === 'Escape') setEditingActual(null)
                                                                            }}
                                                                            style={{ ...inputStyle, width: '52px', textAlign: 'center', padding: '4px' }}
                                                                        />
                                                                    ) : (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setEditingActual({
                                                                                    shiftId: shift.id,
                                                                                    value: hasActual
                                                                                        ? String(shift.actual_hours)
                                                                                        : sugHours !== null ? String(sugHours) : '',
                                                                                })}
                                                                                title={sugHours !== null
                                                                                    ? `Checador: ${sugHours}h — click para aceptar o corregir`
                                                                                    : 'Click para editar horas'}
                                                                                style={{
                                                                                    padding: '3px 8px',
                                                                                    borderRadius: '4px',
                                                                                    border: cellBorder,
                                                                                    background: cellBg,
                                                                                    color: cellColor,
                                                                                    fontSize: '12px',
                                                                                    cursor: 'pointer',
                                                                                    minWidth: '40px',
                                                                                }}
                                                                            >
                                                                                {hasActual
                                                                                    ? `${shift.actual_hours}h`
                                                                                    : sugHours !== null
                                                                                        ? `≈${sugHours}h`
                                                                                        : `(${scheduledHours(shift.start_time, shift.end_time).toFixed(0)}h)`
                                                                                }
                                                                            </button>
                                                                            {(late >= 15 || isAbsent || sum?.hasOpen) && (
                                                                                <div style={{ fontSize: '9px', marginTop: '2px', lineHeight: 1.3, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                                                    {late >= 15 && <span style={{ color: '#f87171' }}>+{late}m tarde</span>}
                                                                                    {isAbsent && <span style={{ color: '#ef4444', fontWeight: 700 }}>FALTA</span>}
                                                                                    {sum?.hasOpen && <span style={{ color: '#fb923c' }}>checada abierta</span>}
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )
                                                                ) : sum ? (
                                                                    <span
                                                                        title="Checó sin turno programado ese día"
                                                                        style={{ color: '#fb923c', fontSize: '11px' }}
                                                                    >
                                                                        {sum.hasOpen ? '⏱' : `${sum.hours}h`} <span style={{ color: '#5a3a1a', fontSize: '9px' }}>s/turno</span>
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: '#222', fontSize: '11px' }}>—</span>
                                                                )}
                                                            </td>
                                                        )
                                                    })}
                                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #111', textAlign: 'right', fontSize: '13px' }}>
                                                        {totalActual > 0 ? (
                                                            <span style={{ color: '#4ade80', fontWeight: 600 }}>{totalActual}h</span>
                                                        ) : (
                                                            <span style={{ color: '#444' }}>({totalPlanned.toFixed(0)}h est.)</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#333' }}>
                                    <span style={{ color: '#93c5fd' }}>≈ azul</span> = sugerido por el checador (click para aceptar o corregir) ·{' '}
                                    <span style={{ color: '#4ade80' }}>verde</span> = confirmado ·{' '}
                                    <span style={{ color: '#fbbf24' }}>ámbar</span> = editado distinto al checador ·{' '}
                                    (gris) = horas planeadas sin checadas. Redondeo a 15 min, día operacional con corte 06:00.
                                </p>
                            </div>

                            {/* Pay summary */}
                            <p style={sectionTitle}>Resumen de pago semanal{weekClosed ? ' — cerrada (snapshot)' : ''}</p>
                            {weekClosed ? (() => {
                                const empById = Object.fromEntries(employees.map(e => [e.id, e]))
                                const snapRows = payrollRows
                                    .map(r => ({ ...r, emp: empById[r.employee_id] }))
                                    .sort((a, b) => (a.emp?.name || '').localeCompare(b.emp?.name || ''))
                                if (snapRows.length === 0) {
                                    return <p style={{ color: '#444', fontSize: '13px' }}>Sin filas de nómina en esta semana.</p>
                                }
                                const totalPay = snapRows.reduce((s, r) => s + Number(r.total_pay || 0), 0)
                                const closedAt = payrollRows[0]?.created_at
                                return (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ borderCollapse: 'collapse', minWidth: '500px', width: '100%' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
                                                    {['Empleado', 'Puesto', '$/Hora', 'Planeadas', 'Reales', 'Sueldo'].map(h => (
                                                        <th key={h} style={{ padding: '8px 10px', fontSize: '11px', color: '#555', textAlign: h === 'Empleado' || h === 'Puesto' ? 'left' : 'right', whiteSpace: 'nowrap' }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {snapRows.map(r => (
                                                    <tr key={r.id} style={{ borderBottom: '1px solid #111' }}>
                                                        <td style={{ padding: '9px 10px', fontSize: '13px', color: '#c0c0c0', fontWeight: 500 }}>{r.emp?.name || '(baja)'}</td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#444' }}>{r.emp?.position || '—'}</td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#555', textAlign: 'right' }}>{Number(r.hourly_rate_snapshot) > 0 ? money(r.hourly_rate_snapshot) : '—'}</td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#444', textAlign: 'right' }}>{Number(r.planned_hours).toFixed(1)}h</td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#4ade80', textAlign: 'right', fontWeight: 600 }}>{Number(r.actual_hours).toFixed(1)}h</td>
                                                        <td style={{ padding: '9px 10px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: '#e2e2e2' }}>{money(r.total_pay)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ borderTop: '1px solid #2a2a2a' }}>
                                                    <td colSpan={5} style={{ padding: '10px 10px', fontSize: '12px', color: '#555', textAlign: 'right' }}>Total pagado semana</td>
                                                    <td style={{ padding: '10px 10px', fontSize: '15px', fontWeight: 700, color: '#e2e2e2', textAlign: 'right' }}>{money(totalPay)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#333' }}>
                                            Snapshot inmutable{closedAt ? ` cerrado el ${new Date(closedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. Sueldo = horas reales × tarifa vigente al cierre. Reábrela para recalcular.
                                        </p>
                                    </div>
                                )
                            })() : (() => {
                                const rows = getPaySummary()
                                if (rows.length === 0) {
                                    return <p style={{ color: '#444', fontSize: '13px' }}>Sin turnos programados esta semana.</p>
                                }
                                const totalPay = rows.reduce((s, r) => s + (r.weeklyPay || 0), 0)
                                return (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ borderCollapse: 'collapse', minWidth: '500px', width: '100%' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
                                                    {['Empleado', 'Puesto', '$/Hora', '$/Día ref.', 'Días', 'Horas', 'Sueldo semana'].map(h => (
                                                        <th key={h} style={{ padding: '8px 10px', fontSize: '11px', color: '#555', textAlign: h === 'Empleado' || h === 'Puesto' ? 'left' : 'right', whiteSpace: 'nowrap' }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map(({ emp, plannedHrs, actualHrs, daysWorked, dailyRate, weeklyPay, isEstimate, rate }) => (
                                                    <tr key={emp.id} style={{ borderBottom: '1px solid #111' }}>
                                                        <td style={{ padding: '9px 10px', fontSize: '13px', color: '#c0c0c0', fontWeight: 500 }}>{emp.name}</td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#444' }}>{emp.position || '—'}</td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#555', textAlign: 'right' }}>
                                                            {rate > 0 ? money(rate) : '—'}
                                                        </td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#444', textAlign: 'right' }}>
                                                            {dailyRate > 0 ? money(dailyRate) : '—'}
                                                        </td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', color: '#555', textAlign: 'right' }}>
                                                            {daysWorked > 0 ? daysWorked : shifts.filter(s => s.employee_id === emp.id).length}
                                                        </td>
                                                        <td style={{ padding: '9px 10px', fontSize: '12px', textAlign: 'right' }}>
                                                            {actualHrs > 0
                                                                ? <span style={{ color: '#4ade80', fontWeight: 600 }}>{actualHrs}h</span>
                                                                : <span style={{ color: '#444' }}>{plannedHrs.toFixed(0)}h est.</span>
                                                            }
                                                        </td>
                                                        <td style={{ padding: '9px 10px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>
                                                            {weeklyPay !== null
                                                                ? <span style={{ color: isEstimate ? '#666' : '#e2e2e2' }}>
                                                                    {money(weeklyPay)}{isEstimate ? ' *' : ''}
                                                                  </span>
                                                                : <span style={{ color: '#333' }}>—</span>
                                                            }
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            {totalPay > 0 && (
                                                <tfoot>
                                                    <tr style={{ borderTop: '1px solid #2a2a2a' }}>
                                                        <td colSpan={6} style={{ padding: '10px 10px', fontSize: '12px', color: '#555', textAlign: 'right' }}>
                                                            Total estimado semana
                                                        </td>
                                                        <td style={{ padding: '10px 10px', fontSize: '15px', fontWeight: 700, color: '#e2e2e2', textAlign: 'right' }}>
                                                            {money(totalPay)}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                        <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#333' }}>
                                            * Estimado basado en horas planeadas. Ingresa horas reales para un cálculo definitivo.
                                        </p>
                                    </div>
                                )
                            })()}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default ScheduleAdminPage
// fase3: nómina (cierre/reapertura/navegación)
