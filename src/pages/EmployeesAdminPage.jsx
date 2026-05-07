import { useState, useEffect, useCallback } from 'react'
import AdminNav from '../components/AdminNav'
import {
    getAllEmployeesWithStatus,
    checkInEmployee,
    checkOutEmployee,
    createEmployee,
    deactivateEmployee,
} from '../services/employeesAdmin'

function formatTime(isoStr) {
    if (!isoStr) return ''
    return new Date(isoStr).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
}

const inputStyle = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #2a2a2a',
    background: '#0e0e0e',
    color: '#e2e2e2',
    fontSize: '14px',
}

function EmployeesAdminPage() {
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState('')
    const [showAddForm, setShowAddForm] = useState(false)
    const [newName, setNewName] = useState('')
    const [newPosition, setNewPosition] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const load = useCallback(async () => {
        const { data, error } = await getAllEmployeesWithStatus()
        if (error) {
            setStatus('Error cargando empleados.')
            return
        }
        setEmployees(data || [])
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
        const { error } = await createEmployee({ name: newName, position: newPosition })
        if (error) {
            setStatus(`Error: ${error.message}`)
            setIsSubmitting(false)
            return
        }
        setNewName('')
        setNewPosition('')
        setShowAddForm(false)
        setIsSubmitting(false)
        setStatus('Empleado agregado.')
        load()
    }

    async function handleDeactivate(emp) {
        const confirmed = window.confirm(`¿Dar de baja a "${emp.name}"? Se ocultará del sistema.`)
        if (!confirmed) return
        const { error } = await deactivateEmployee({ id: emp.id })
        if (error) { setStatus('Error al dar de baja.'); return }
        setStatus(`${emp.name} dado de baja.`)
        load()
    }

    const onShift = employees.filter(e => e.isCheckedIn).length

    return (
        <div style={{ padding: '20px', minHeight: '100vh', background: '#0e0e0e', color: '#e2e2e2' }}>
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
                    onClick={() => setShowAddForm(v => !v)}
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
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#888' }}>{status}</p>
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
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Nombre
                        </label>
                        <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="Nombre completo"
                            style={{ ...inputStyle, width: '200px' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Puesto
                        </label>
                        <input
                            value={newPosition}
                            onChange={e => setNewPosition(e.target.value)}
                            placeholder="Mesero, Cocina, Barra…"
                            style={{ ...inputStyle, width: '200px' }}
                        />
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
                <p style={{ color: '#444', fontSize: '14px' }}>No hay empleados registrados aún. Agrega el primero.</p>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
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
                                justifyContent: 'space-between',
                                minHeight: '110px',
                            }}
                        >
                            {/* Name + position */}
                            <div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#e2e2e2', marginBottom: '3px' }}>
                                    {emp.name}
                                </div>
                                {emp.position && (
                                    <div style={{ fontSize: '12px', color: '#555' }}>{emp.position}</div>
                                )}
                            </div>

                            {/* Status + actions */}
                            <div style={{ marginTop: '10px' }}>
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
                                    <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
                                        Entrada: {formatTime(emp.currentLog.checked_in_at)}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleToggle(emp)}
                                        style={{
                                            flex: 1,
                                            padding: '5px 0',
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
                                    <button
                                        type="button"
                                        onClick={() => handleDeactivate(emp)}
                                        title="Dar de baja"
                                        style={{
                                            padding: '5px 8px',
                                            borderRadius: '5px',
                                            border: '1px solid #2a2a2a',
                                            background: 'transparent',
                                            color: '#444',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default EmployeesAdminPage
