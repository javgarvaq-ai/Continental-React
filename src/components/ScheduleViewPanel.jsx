import { useState, useEffect } from 'react'
import { getAllEmployeesWithStatus } from '../services/employeesAdmin'
import { getWeekSchedule, getWeekStart, toDateString } from '../services/scheduleAdmin'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const GRID_SLOTS = [
    '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
    '23:00', '00:00', '01:00',
]

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

function formatWeekLabel(weekStart) {
    const end = addDays(new Date(weekStart + 'T12:00:00'), 6)
    const opts = { day: 'numeric', month: 'short' }
    return `${new Date(weekStart + 'T12:00:00').toLocaleDateString('es-MX', opts)} – ${end.toLocaleDateString('es-MX', opts)}`
}

function formatDateShort(weekStart, dayIndex) {
    return addDays(new Date(weekStart + 'T12:00:00'), dayIndex).getDate()
}

function timeToMins(t) {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
}

function shiftCoversSlot(startTime, endTime, slot) {
    const slotMins = timeToMins(slot)
    let sMins = timeToMins(startTime)
    let eMins = timeToMins(endTime)
    if (eMins <= sMins) eMins += 24 * 60
    const normalizedSlot = slotMins < 6 * 60 ? slotMins + 24 * 60 : slotMins
    return normalizedSlot >= sMins && normalizedSlot < eMins
}

// ── Component ─────────────────────────────────────────────────────────────────

function ScheduleViewPanel({ open, onClose }) {
    const todayWeekStart = toDateString(getWeekStart())
    const nextWeekStart = toDateString(getWeekStart(addDays(new Date(todayWeekStart + 'T12:00:00'), 7)))

    const [activeWeek, setActiveWeek] = useState(todayWeekStart)
    const [employees, setEmployees] = useState([])
    const [shifts, setShifts] = useState([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return
        async function load() {
            setLoading(true)
            const [empResult, shiftResult] = await Promise.all([
                getAllEmployeesWithStatus(),
                getWeekSchedule({ weekStart: activeWeek }),
            ])
            if (!empResult.error) setEmployees(empResult.data || [])
            if (!shiftResult.error) setShifts(shiftResult.data || [])
            setLoading(false)
        }
        load()
    }, [open, activeWeek])

    if (!open) return null

    const empColorMap = Object.fromEntries(
        employees.map((e, i) => [e.id, EMP_COLORS[i % EMP_COLORS.length]])
    )

    const shiftMap = Object.fromEntries(
        shifts.map(s => [`${s.employee_id}_${s.day_of_week}`, s])
    )

    const hasAnyShift = shifts.length > 0

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000,
                padding: '16px',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div style={{
                background: '#141414',
                border: '1px solid #242424',
                borderRadius: '14px',
                width: '100%',
                maxWidth: '780px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '18px 20px 14px',
                    borderBottom: '1px solid #1e1e1e',
                    flexShrink: 0,
                }}>
                    <div>
                        <h3 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: 700, color: '#e8e8e8' }}>
                            Horario semanal
                        </h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                            {formatWeekLabel(activeWeek)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '6px 10px', borderRadius: '6px',
                            border: '1px solid #2a2a2a', background: 'transparent',
                            color: '#94a3b8', fontSize: '16px', cursor: 'pointer',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Week tabs */}
                <div style={{ display: 'flex', gap: '6px', padding: '12px 20px 0', flexShrink: 0 }}>
                    {[
                        { label: 'Esta semana', week: todayWeekStart },
                        { label: 'Próxima semana', week: nextWeekStart },
                    ].map(({ label, week }) => (
                        <button
                            key={week}
                            type="button"
                            onClick={() => setActiveWeek(week)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                border: activeWeek === week ? '1px solid #3a5a3a' : '1px solid #2a2a2a',
                                background: activeWeek === week ? '#1a3a2a' : 'transparent',
                                color: activeWeek === week ? '#4ade80' : '#94a3b8',
                                fontSize: '12px',
                                fontWeight: activeWeek === week ? 600 : 400,
                                cursor: 'pointer',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 20px' }}>
                    {loading ? (
                        <p style={{ color: '#94a3b8', fontSize: '13px', margin: '20px 0' }}>Cargando...</p>
                    ) : !hasAnyShift ? (
                        <p style={{ color: '#94a3b8', fontSize: '13px', margin: '20px 0' }}>
                            No hay turnos programados para esta semana.
                        </p>
                    ) : (
                        <>
                            {/* Legend */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                {employees.map((emp, i) => {
                                    const color = EMP_COLORS[i % EMP_COLORS.length]
                                    if (!shifts.some(s => s.employee_id === emp.id)) return null
                                    return (
                                        <div key={emp.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '3px 10px', borderRadius: '4px',
                                            background: color.bg, border: `1px solid ${color.border}`,
                                        }}>
                                            <span style={{ fontSize: '12px', color: color.text, fontWeight: 600 }}>
                                                {emp.name.split(' ')[0]}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Grid */}
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ borderCollapse: 'collapse', minWidth: '520px', width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '52px', padding: '5px 6px', fontSize: '10px', color: '#64748b', textAlign: 'left', borderBottom: '1px solid #1e1e1e' }}>
                                                Hora
                                            </th>
                                            {DAYS.map((d, i) => (
                                                <th key={d} style={{ padding: '5px 3px', fontSize: '10px', color: '#94a3b8', textAlign: 'center', borderBottom: '1px solid #1e1e1e', minWidth: '60px' }}>
                                                    <div>{d}</div>
                                                    <div style={{ fontSize: '9px', color: '#64748b' }}>{formatDateShort(activeWeek, i)}</div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {GRID_SLOTS.map(slot => (
                                            <tr key={slot}>
                                                <td style={{ padding: '2px 6px', fontSize: '10px', color: '#64748b', borderBottom: '1px solid #0f0f0f', whiteSpace: 'nowrap' }}>
                                                    {slot}
                                                </td>
                                                {Array.from({ length: 7 }, (_, dayIdx) => {
                                                    const working = employees.filter(emp => {
                                                        const shift = shiftMap[`${emp.id}_${dayIdx}`]
                                                        return shift && shiftCoversSlot(shift.start_time, shift.end_time, slot)
                                                    })
                                                    return (
                                                        <td key={dayIdx} style={{
                                                            padding: '2px 2px',
                                                            borderBottom: '1px solid #0f0f0f',
                                                            borderLeft: '1px solid #0f0f0f',
                                                            verticalAlign: 'top',
                                                        }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', minHeight: '18px' }}>
                                                                {working.map(emp => {
                                                                    const color = empColorMap[emp.id]
                                                                    return (
                                                                        <span key={emp.id} style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            width: '20px', height: '16px',
                                                                            borderRadius: '3px',
                                                                            background: color?.bg || '#1a1a1a',
                                                                            border: `1px solid ${color?.border || '#333'}`,
                                                                            color: color?.text || '#aaa',
                                                                            fontSize: '9px',
                                                                            fontWeight: 700,
                                                                        }}>
                                                                            {emp.name.charAt(0).toUpperCase()}
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
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ScheduleViewPanel
