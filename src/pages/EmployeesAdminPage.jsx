import { useState, useEffect, useCallback } from 'react'
import { useStatus } from '../hooks/useStatus'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'
import {
    getAllEmployeesWithStatus,
    checkInEmployee,
    checkOutEmployee,
    createEmployee,
    updateEmployee,
    deactivateEmployee,
    getEmployeeTimeLogs,
    updateTimeLog,
} from '../services/employeesAdmin'
import { getActiveUsers } from '../services/users'
import { isStaleOpenLog } from '../utils/timeLogs'

function formatTime(isoStr) {
    if (!isoStr) return ''
    return new Date(isoStr).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
}

function formatDate(isoStr) {
    if (!isoStr) return ''
    return new Date(isoStr).toLocaleDateString('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })
}

function formatDuration(inIso, outIso) {
    if (!inIso || !outIso) return null
    const mins = Math.round((new Date(outIso) - new Date(inIso)) / 60000)
    if (mins < 60) return `${mins} min`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** ISO → valor para <input type="datetime-local"> en hora local del navegador */
function isoToLocalInput(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(value) {
    return value ? new Date(value).toISOString() : null
}

const inputStyle = {
    padding: '7px 10px',
    borderRadius: '6px',
    border: '1px solid #2a2a2a',
    background: '#0e0e0e',
    color: '#e2e2e2',
    fontSize: '13px',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
}

const labelStyle = {
    display: 'block',
    fontSize: '10px',
    color: '#555',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
}

function EmployeesAdminPage() {
    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    const [employees, setEmployees] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const { status, statusColor, setStatus } = useStatus('')

    // Add form
    const [showAddForm, setShowAddForm] = useState(false)
    const [newName, setNewName] = useState('')
    const [newPosition, setNewPosition] = useState('')
    const [newHourlyRate, setNewHourlyRate] = useState('')
    const [newUserId, setNewUserId] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Inline edit
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({ name: '', position: '', hourlyRate: '', userId: '' })
    const [isSavingEdit, setIsSavingEdit] = useState(false)

    // Deactivate confirm
    const [confirmingDeactivateId, setConfirmingDeactivateId] = useState(null)

    // History modal
    const [historyDialog, setHistoryDialog] = useState({ open: false, employee: null, logs: [], loading: false })

    // Log correction (dentro del modal de historial)
    const [editingLog, setEditingLog] = useState(null)   // { id, inVal, outVal, note }
    const [isSavingLog, setIsSavingLog] = useState(false)
    const [logStatus, setLogStatus] = useState('')

    const load = useCallback(async () => {
        const [empResult, usersResult] = await Promise.all([
            getAllEmployeesWithStatus(),
            getActiveUsers(),
        ])
        if (empResult.error) { setStatus('Error cargando empleados.'); return }
        setEmployees(empResult.data || [])
        if (!usersResult.error) setUsers(usersResult.data || [])
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    async function handleToggle(emp) {
        if (emp.isCheckedIn) {
            const { error } = await checkOutEmployee({ logId: emp.currentLog.id })
            if (error) { setStatus('Error al registrar salida.'); return }
            setStatus(`Salida registrada: ${emp.name}`)
        } else {
            const { error } = await checkInEmployee({ employeeId: emp.id })
            if (error) { setStatus('Error al registrar entrada.'); return }
            setStatus(`Entrada registrada: ${emp.name}`)
        }
        load()
    }

    async function handleAddEmployee(e) {
        e.preventDefault()
        if (!newName.trim() || isSubmitting) return
        setIsSubmitting(true)
        const { error } = await createEmployee({ name: newName, position: newPosition, hourlyRate: newHourlyRate, userId: newUserId || null })
        if (error) { setStatus(`Error: ${error.message}`); setIsSubmitting(false); return }
        setNewName('')
        setNewPosition('')
        setNewHourlyRate('')
        setNewUserId('')
        setShowAddForm(false)
        setIsSubmitting(false)
        setStatus('Empleado agregado.')
        load()
    }

    function startEdit(emp) {
        setEditingId(emp.id)
        setEditForm({ name: emp.name, position: emp.position || '', hourlyRate: emp.hourly_rate ? String(emp.hourly_rate) : '', userId: emp.user_id || '' })
    }

    function cancelEdit() {
        setEditingId(null)
        setEditForm({ name: '', position: '', hourlyRate: '', userId: '' })
    }

    /** Usuarios disponibles para ligar: activos y no ligados a OTRO empleado */
    function availableUsers(currentEmpId = null) {
        return users.filter(u =>
            !employees.some(e => e.user_id === u.id && e.id !== currentEmpId)
        )
    }

    function linkedUserName(emp) {
        if (!emp.user_id) return null
        return users.find(u => u.id === emp.user_id)?.name || '(usuario inactivo)'
    }

    async function handleSaveEdit(empId) {
        if (!editForm.name.trim() || isSavingEdit) return
        setIsSavingEdit(true)
        const { error } = await updateEmployee({ id: empId, name: editForm.name, position: editForm.position, hourlyRate: editForm.hourlyRate, userId: editForm.userId || null })
        if (error) { setStatus(`Error actualizando: ${error.message}`); setIsSavingEdit(false); return }
        setIsSavingEdit(false)
        cancelEdit()
        setStatus('Empleado actualizado.')
        load()
    }

    async function handleDeactivate(emp) {
        if (confirmingDeactivateId !== emp.id) {
            setConfirmingDeactivateId(emp.id)
            setTimeout(() => setConfirmingDeactivateId(null), 3000)
            return
        }
        setConfirmingDeactivateId(null)
        const { error } = await deactivateEmployee({ id: emp.id })
        if (error) { setStatus('Error al dar de baja.'); return }
        setStatus(`${emp.name} dado de baja.`)
        load()
    }

    async function handleOpenHistory(emp) {
        setEditingLog(null)
        setLogStatus('')
        setHistoryDialog({ open: true, employee: emp, logs: [], loading: true })
        const { data, error } = await getEmployeeTimeLogs({ employeeId: emp.id })
        if (error) {
            setHistoryDialog(d => ({ ...d, loading: false }))
            setStatus('Error cargando historial.')
            return
        }
        setHistoryDialog(d => ({ ...d, logs: data || [], loading: false }))
    }

    function startEditLog(log) {
        setLogStatus('')
        setEditingLog({
            id: log.id,
            inVal: isoToLocalInput(log.checked_in_at),
            outVal: isoToLocalInput(log.checked_out_at),
            note: log.note || '',
        })
    }

    async function handleSaveLog() {
        if (!editingLog || isSavingLog) return
        if (!editingLog.inVal) { setLogStatus('La entrada es obligatoria.'); return }
        const inIso = localInputToIso(editingLog.inVal)
        const outIso = localInputToIso(editingLog.outVal)
        if (outIso && new Date(outIso) <= new Date(inIso)) {
            setLogStatus('La salida debe ser posterior a la entrada.')
            return
        }
        setIsSavingLog(true)
        const { error } = await updateTimeLog({
            id: editingLog.id,
            checkedInAt: inIso,
            checkedOutAt: outIso,
            note: editingLog.note,
            editedBy: currentUser?.id,
        })
        setIsSavingLog(false)
        if (error) { setLogStatus(error.message || 'Error guardando corrección.'); return }
        setEditingLog(null)
        setLogStatus('Corrección guardada.')
        // recargar logs del modal + estado de tarjetas (por si cerró un log abierto)
        const { data } = await getEmployeeTimeLogs({ employeeId: historyDialog.employee.id })
        setHistoryDialog(d => ({ ...d, logs: data || [] }))
        load()
    }

    const onShift = employees.filter(e => e.isCheckedIn).length

    if (!isAdmin) return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666', minHeight: '100vh', background: '#0e0e0e' }}>
            Acceso denegado.
        </div>
    )

    return (
        <div style={{ padding: '20px', paddingLeft: '216px', minHeight: '100vh', background: '#0e0e0e', color: '#e2e2e2' }}>
            <AdminNav currentPath="/admin/employees" />

            {/* Page header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 700, color: '#e8e8e8' }}>
                        Empleados
                    </h2>
                    <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>
                        {loading ? '...' : `${onShift} ${onShift === 1 ? 'empleado' : 'empleados'} en turno ahora`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => { setShowAddForm(v => !v); cancelEdit() }}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #2a2a2a',
                        background: '#1a1a1a',
                        color: '#aaa',
                        cursor: 'pointer',
                        fontSize: '13px',
                    }}
                >
                    {showAddForm ? 'Cancelar' : '+ Agregar empleado'}
                </button>
            </div>

            {/* Status message */}
            {status && (
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: statusColor }}>{status}</p>
            )}

            {/* Add employee form */}
            {showAddForm && (
                <form
                    onSubmit={handleAddEmployee}
                    style={{
                        marginBottom: '20px',
                        padding: '16px',
                        background: '#141414',
                        border: '1px solid #222',
                        borderRadius: '8px',
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                    }}
                >
                    <div style={{ flex: '1 1 160px' }}>
                        <label style={labelStyle}>Nombre</label>
                        <input
                            autoFocus
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Nombre completo"
                            style={inputStyle}
                        />
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                        <label style={labelStyle}>Puesto</label>
                        <input
                            value={newPosition}
                            onChange={e => setNewPosition(e.target.value)}
                            placeholder="Mesero, Cocina, Barra…"
                            style={inputStyle}
                        />
                    </div>
                    <div style={{ flex: '1 1 100px' }}>
                        <label style={labelStyle}>$/Hora</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={newHourlyRate}
                            onChange={e => setNewHourlyRate(e.target.value)}
                            placeholder="0.00"
                            style={inputStyle}
                        />
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                        <label style={labelStyle}>Usuario (checador)</label>
                        <select
                            value={newUserId}
                            onChange={e => setNewUserId(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="">Sin usuario</option>
                            {availableUsers().map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={!newName.trim() || isSubmitting}
                        style={{
                            padding: '8px 18px',
                            borderRadius: '6px',
                            border: '1px solid #2a5a3a',
                            background: '#1a3a2a',
                            color: '#4ade80',
                            fontWeight: '600',
                            cursor: !newName.trim() || isSubmitting ? 'default' : 'pointer',
                            fontSize: '13px',
                            opacity: !newName.trim() || isSubmitting ? 0.5 : 1,
                        }}
                    >
                        Guardar
                    </button>
                </form>
            )}

            {/* Employee grid */}
            {loading ? (
                <p style={{ color: '#444', fontSize: '14px' }}>Cargando...</p>
            ) : employees.length === 0 ? (
                <p style={{ color: '#444', fontSize: '14px' }}>No hay empleados registrados aún.</p>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '10px',
                }}>
                    {employees.map(emp => (
                        <div
                            key={emp.id}
                            style={{
                                backgroundColor: '#161616',
                                border: '1px solid #2a2a2a',
                                borderLeft: `3px solid ${emp.isCheckedIn ? '#4ade80' : '#2a2a2a'}`,
                                borderRadius: '8px',
                                padding: '14px 12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                            }}
                        >
                            {/* Name / edit section */}
                            {editingId === emp.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div>
                                        <label style={labelStyle}>Nombre</label>
                                        <input
                                            autoFocus
                                            value={editForm.name}
                                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(emp.id)}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Puesto</label>
                                        <input
                                            value={editForm.position}
                                            onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(emp.id)}
                                            placeholder="Puesto (opcional)"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>$/Hora</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={editForm.hourlyRate}
                                            onChange={e => setEditForm(f => ({ ...f, hourlyRate: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(emp.id)}
                                            placeholder="0.00"
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Usuario (checador)</label>
                                        <select
                                            value={editForm.userId}
                                            onChange={e => setEditForm(f => ({ ...f, userId: e.target.value }))}
                                            style={inputStyle}
                                        >
                                            <option value="">Sin usuario</option>
                                            {availableUsers(emp.id).map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleSaveEdit(emp.id)}
                                            disabled={!editForm.name.trim() || isSavingEdit}
                                            style={{
                                                flex: 1,
                                                padding: '5px 0',
                                                borderRadius: '5px',
                                                border: '1px solid #2a5a3a',
                                                background: '#1a3a2a',
                                                color: '#4ade80',
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {isSavingEdit ? '...' : 'Guardar'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={cancelEdit}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '5px',
                                                border: '1px solid #2a2a2a',
                                                background: 'transparent',
                                                color: '#555',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#e2e2e2', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {emp.name}
                                        </div>
                                        {emp.position && (
                                            <div style={{ fontSize: '12px', color: '#555' }}>{emp.position}</div>
                                        )}
                                        {emp.hourly_rate > 0 && (
                                            <div style={{ fontSize: '11px', color: '#3a3a3a', marginTop: '2px' }}>
                                                ${Number(emp.hourly_rate).toFixed(2)}/hr
                                            </div>
                                        )}
                                        <div style={{ fontSize: '11px', color: emp.user_id ? '#3a5a8a' : '#3a3a3a', marginTop: '2px' }}>
                                            {emp.user_id ? `⎋ ${linkedUserName(emp)}` : 'Sin usuario (no puede checar)'}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => startEdit(emp)}
                                        title="Editar"
                                        style={{
                                            padding: '3px 7px',
                                            borderRadius: '4px',
                                            border: '1px solid #2a2a2a',
                                            background: 'transparent',
                                            color: '#444',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                        }}
                                    >
                                        ✎
                                    </button>
                                </div>
                            )}

                            {/* Status + check-in time */}
                            {editingId !== emp.id && (
                                <div>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: emp.isCheckedIn ? '#4ade801a' : '#1e1e1e',
                                        color: emp.isCheckedIn ? '#4ade80' : '#444',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        letterSpacing: '0.04em',
                                    }}>
                                        {emp.isCheckedIn ? 'En turno' : 'Fuera'}
                                    </span>
                                    {emp.isCheckedIn && emp.currentLog?.checked_in_at && (
                                        <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>
                                            Entrada: {formatTime(emp.currentLog.checked_in_at)}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action buttons */}
                            {editingId !== emp.id && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleToggle(emp)}
                                        style={{
                                            width: '100%',
                                            padding: '6px 0',
                                            borderRadius: '5px',
                                            border: emp.isCheckedIn ? '1px solid #3d2a1a' : '1px solid #2a5a3a',
                                            background: emp.isCheckedIn ? '#2a1a0e' : '#1a3a2a',
                                            color: emp.isCheckedIn ? '#fb923c' : '#4ade80',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {emp.isCheckedIn ? 'Registrar salida' : 'Registrar entrada'}
                                    </button>

                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenHistory(emp)}
                                            style={{
                                                flex: 1,
                                                padding: '5px 0',
                                                borderRadius: '5px',
                                                border: '1px solid #2a2a2a',
                                                background: 'transparent',
                                                color: '#555',
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Historial
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeactivate(emp)}
                                            title="Dar de baja"
                                            style={{
                                                padding: '5px 8px',
                                                borderRadius: '5px',
                                                border: confirmingDeactivateId === emp.id ? '1px solid #ef4444' : '1px solid #2a2a2a',
                                                background: confirmingDeactivateId === emp.id ? '#3d1a1a' : 'transparent',
                                                color: confirmingDeactivateId === emp.id ? '#ef4444' : '#333',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {confirmingDeactivateId === emp.id ? '¿Baja?' : '✕'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Time Log History Modal ── */}
            {historyDialog.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '440px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: 700, color: '#e8e8e8' }}>
                                    {historyDialog.employee?.name}
                                </h3>
                                <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>
                                    Últimos registros de entrada/salida
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setHistoryDialog({ open: false, employee: null, logs: [], loading: false })}
                                style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #2a2a2a', background: 'transparent', color: '#555', cursor: 'pointer', fontSize: '14px' }}
                            >
                                ✕
                            </button>
                        </div>

                        {logStatus && (
                            <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: logStatus.includes('guardada') ? '#4ade80' : '#f87171' }}>
                                {logStatus}
                            </p>
                        )}

                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {historyDialog.loading ? (
                                <p style={{ color: '#444', fontSize: '13px' }}>Cargando...</p>
                            ) : historyDialog.logs.length === 0 ? (
                                <p style={{ color: '#444', fontSize: '13px' }}>Sin registros aún.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {historyDialog.logs.map(log => {
                                        const duration = formatDuration(log.checked_in_at, log.checked_out_at)
                                        const stillIn = !log.checked_out_at
                                        const isStale = stillIn && isStaleOpenLog(log.checked_in_at)
                                        const isEditingThis = editingLog?.id === log.id

                                        if (isEditingThis) {
                                            return (
                                                <div
                                                    key={log.id}
                                                    style={{
                                                        padding: '12px',
                                                        borderRadius: '7px',
                                                        background: '#0e0e0e',
                                                        border: '1px solid #3a5a8a',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '8px',
                                                    }}
                                                >
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                        <div>
                                                            <label style={labelStyle}>Entrada</label>
                                                            <input
                                                                type="datetime-local"
                                                                value={editingLog.inVal}
                                                                onChange={e => setEditingLog(l => ({ ...l, inVal: e.target.value }))}
                                                                style={inputStyle}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={labelStyle}>Salida (vacío = abierta)</label>
                                                            <input
                                                                type="datetime-local"
                                                                value={editingLog.outVal}
                                                                onChange={e => setEditingLog(l => ({ ...l, outVal: e.target.value }))}
                                                                style={inputStyle}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Nota de la corrección</label>
                                                        <input
                                                            value={editingLog.note}
                                                            onChange={e => setEditingLog(l => ({ ...l, note: e.target.value }))}
                                                            placeholder="Ej. olvidó checar salida"
                                                            style={inputStyle}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveLog}
                                                            disabled={isSavingLog}
                                                            style={{ flex: 1, padding: '6px 0', borderRadius: '5px', border: '1px solid #2a5a3a', background: '#1a3a2a', color: '#4ade80', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                                        >
                                                            {isSavingLog ? 'Guardando...' : 'Guardar corrección'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingLog(null)}
                                                            style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #2a2a2a', background: 'transparent', color: '#555', fontSize: '12px', cursor: 'pointer' }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div
                                                key={log.id}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: '7px',
                                                    background: isStale ? '#3d1a1a' : stillIn ? '#1a3a2a' : '#0e0e0e',
                                                    border: `1px solid ${isStale ? '#7f1d1d' : stillIn ? '#2a5a3a' : '#1e1e1e'}`,
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 1fr auto auto',
                                                    gap: '4px 10px',
                                                    alignItems: 'center',
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Entrada</div>
                                                    <div style={{ fontSize: '13px', color: '#e2e2e2', fontWeight: 600 }}>{formatTime(log.checked_in_at)}</div>
                                                    <div style={{ fontSize: '11px', color: '#444' }}>{formatDate(log.checked_in_at)}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Salida</div>
                                                    {stillIn ? (
                                                        <div style={{ fontSize: '12px', color: isStale ? '#ef4444' : '#4ade80', fontWeight: 600 }}>
                                                            {isStale ? 'Abierta +16h — cerrar' : 'En turno'}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div style={{ fontSize: '13px', color: '#e2e2e2', fontWeight: 600 }}>{formatTime(log.checked_out_at)}</div>
                                                            <div style={{ fontSize: '11px', color: '#444' }}>{formatDate(log.checked_out_at)}</div>
                                                        </>
                                                    )}
                                                    {(log.source === 'admin' || log.edited_at) && (
                                                        <div style={{ fontSize: '9px', color: '#5a4a2a', marginTop: '2px' }}>
                                                            {log.source === 'admin' ? 'manual' : ''}{log.source === 'admin' && log.edited_at ? ' · ' : ''}{log.edited_at ? 'editado' : ''}
                                                            {log.note ? ` — ${log.note}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#666', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                    {duration || ''}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => startEditLog(log)}
                                                    title="Corregir registro"
                                                    style={{ padding: '3px 7px', borderRadius: '4px', border: '1px solid #2a2a2a', background: 'transparent', color: '#444', fontSize: '12px', cursor: 'pointer' }}
                                                >
                                                    ✎
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default EmployeesAdminPage
