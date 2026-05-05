import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getAllCustomers,
    createCustomer,
    updateCustomer,
    getNextCustomerNumber,
    getCustomerBenefitUsage,
} from '../services/customersAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'


function formatMonth(monthStr) {
    if (!monthStr) return ''
    const d = new Date(monthStr)
    return d.toLocaleString('es-MX', { month: 'long', year: 'numeric' })
}

function getCurrentMonthDate() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function CustomersAdminPage() {
    const navigate = useNavigate()
    const [customers, setCustomers] = useState([])
    const [status, setStatus] = useState('Loading...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [search, setSearch] = useState('')

    // New customer form
    const [newNumber, setNewNumber] = useState('')
    const [newName, setNewName] = useState('')
    const [newPhone, setNewPhone] = useState('')
    const [newEmail, setNewEmail] = useState('')

    // Edit
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({ name: '', phone: '', email: '' })

    // Detail view
    const [viewingCustomer, setViewingCustomer] = useState(null)
    const [usageHistory, setUsageHistory] = useState([])
    const [loadingUsage, setLoadingUsage] = useState(false)

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => {
        loadCustomers()
        loadNextNumber()
    }, [])

    async function loadCustomers() {
        setLoading(true)
        const { data, error } = await getAllCustomers()
        if (error) {
            setStatus(`Error: ${error.message}`)
            setLoading(false)
            return
        }
        setCustomers(data || [])
        setStatus(`${(data || []).length} customers loaded.`)
        setLoading(false)
    }

    async function loadNextNumber() {
        const next = await getNextCustomerNumber()
        setNewNumber(next)
    }

    async function handleCreate(e) {
        e.preventDefault()
        if (!isAdmin) return
        if (!newNumber.trim() || !newName.trim()) {
            setStatus('Customer number and name are required.')
            return
        }
        setIsSaving(true)
        setStatus('Creating customer...')
        const { error } = await createCustomer({
            customer_number: newNumber,
            name: newName,
            phone: newPhone,
            email: newEmail,
        })
        if (error) {
            setStatus(`Error: ${error.message}`)
            setIsSaving(false)
            return
        }
        setNewName('')
        setNewPhone('')
        setNewEmail('')
        setStatus('Customer created.')
        setIsSaving(false)
        await loadCustomers()
        await loadNextNumber()
    }

    async function handleUpdate(id) {
        if (!isAdmin) return
        if (!editForm.name.trim()) { setStatus('Name is required.'); return }
        setIsSaving(true)
        const { error } = await updateCustomer({ id, ...editForm })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setEditingId(null)
        setStatus('Customer updated.')
        setIsSaving(false)
        await loadCustomers()
    }

    async function handleViewDetail(customer) {
        setViewingCustomer(customer)
        setLoadingUsage(true)
        const { data } = await getCustomerBenefitUsage(customer.id)
        setUsageHistory(data || [])
        setLoadingUsage(false)
    }

    const currentMonth = getCurrentMonthDate()

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.customer_number.includes(search)
    )

    function getActiveMembership(customer) {
        return (customer.customer_memberships || []).find(
            m => m.month === currentMonth && m.status === 'active'
        )
    }

    function getTotalSaved(usageHistory) {
        return usageHistory.reduce((sum, u) => sum + Number(u.discount_amount_saved || 0), 0)
    }

    if (!isAdmin) {
        return <div style={{ padding: '24px', color: 'white', background: '#111', minHeight: '100vh' }}>Access denied. Admin only.</div>
    }

    return (
        <div style={{ minHeight: '100vh', background: '#111', color: 'white', padding: '24px', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

                <AdminNav currentPath="/admin/customers" />

                <h1 style={{ marginTop: 0 }}>Customers</h1>
                <p style={{ opacity: 0.85 }}>{status}</p>

                {/* DETAIL MODAL */}
                {viewingCustomer && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                        <div style={{ background: '#181818', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #2f2f2f' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h2 style={{ margin: 0 }}>#{viewingCustomer.customer_number} — {viewingCustomer.name}</h2>
                                <button onClick={() => setViewingCustomer(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
                            </div>

                            <div style={{ marginBottom: '16px', opacity: 0.8, fontSize: '14px' }}>
                                {viewingCustomer.phone && <div>📞 {viewingCustomer.phone}</div>}
                                {viewingCustomer.email && <div>✉️ {viewingCustomer.email}</div>}
                                <div>🏆 Visitas totales: <strong>{viewingCustomer.visit_count}</strong></div>
                                <div>🍾 Créditos de botella disponibles: <strong>{viewingCustomer.bottle_credits_available}</strong></div>
                            </div>

                            <h3 style={{ marginBottom: '8px' }}>Historial de membresías</h3>
                            {(viewingCustomer.customer_memberships || []).length === 0 ? (
                                <div style={{ opacity: 0.5, fontSize: '13px', marginBottom: '16px' }}>Sin membresías registradas.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                                    {[...viewingCustomer.customer_memberships]
                                        .sort((a, b) => b.month.localeCompare(a.month))
                                        .map(m => (
                                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#111', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}>
                                                <span>{formatMonth(m.month)} — {m.membership_plans?.name}</span>
                                                <span style={{ color: m.status === 'active' ? '#66bb6a' : '#888' }}>{m.status === 'active' ? 'Activa' : 'Expirada'}</span>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}

                            <h3 style={{ marginBottom: '8px' }}>Ahorros y beneficios</h3>
                            {loadingUsage ? (
                                <div style={{ opacity: 0.5, fontSize: '13px' }}>Loading...</div>
                            ) : usageHistory.length === 0 ? (
                                <div style={{ opacity: 0.5, fontSize: '13px' }}>Sin beneficios aplicados aún.</div>
                            ) : (
                                <>
                                    <div style={{ marginBottom: '10px', fontSize: '14px', color: '#66bb6a' }}>
                                        Total ahorrado: <strong>${getTotalSaved(usageHistory).toFixed(2)}</strong>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {usageHistory.map(u => (
                                            <div key={u.id} style={{ background: '#111', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', opacity: 0.85 }}>
                                                <div>{new Date(u.created_at).toLocaleDateString('es-MX')} — {u.benefit_type}</div>
                                                {u.discount_amount_saved > 0 && <div style={{ color: '#66bb6a' }}>Ahorro: ${Number(u.discount_amount_saved).toFixed(2)}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>

                    {/* CREATE FORM */}
                    <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px' }}>
                        <h2 style={{ marginTop: 0 }}>New Customer</h2>
                        <form onSubmit={handleCreate}>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Customer # (auto)</label>
                                <input
                                    type="text"
                                    value={newNumber}
                                    onChange={(e) => setNewNumber(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Name *</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Customer name"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Phone</label>
                                <input
                                    type="text"
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    placeholder="Optional"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Email</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="Optional"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', boxSizing: 'border-box' }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSaving || !newName.trim() || !newNumber.trim()}
                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: isSaving || !newName.trim() || !newNumber.trim() ? '#555' : '#2e7d32', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                {isSaving ? 'Creating...' : 'Create Customer'}
                            </button>
                        </form>
                    </div>

                    {/* CUSTOMERS LIST */}
                    <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h2 style={{ margin: 0 }}>Customers</h2>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name or #..."
                                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '200px' }}
                            />
                        </div>

                        {loading ? <div>Loading...</div> : filteredCustomers.length === 0 ? (
                            <div style={{ opacity: 0.5 }}>No customers found.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {filteredCustomers.map(customer => {
                                    const activeMembership = getActiveMembership(customer)
                                    return (
                                        <div key={customer.id} style={{ border: '1px solid #333', borderRadius: '12px', padding: '14px', background: '#121212' }}>
                                            {editingId === customer.id ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                                                    <input type="text" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                                                    <input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ padding: '8px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={() => handleUpdate(customer.id)} disabled={isSaving} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                                                        <button onClick={() => setEditingId(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{customer.name}</span>
                                                            <span style={{ opacity: 0.6, fontSize: '13px' }}>#{customer.customer_number}</span>
                                                            {activeMembership ? (
                                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#1b5e20', color: '#66bb6a' }}>
                                                                    {activeMembership.membership_plans?.name}
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#333', color: '#888' }}>
                                                                    Sin membresía activa
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '4px' }}>
                                                            Visitas: {customer.visit_count} · Créditos botella: {customer.bottle_credits_available}
                                                            {customer.phone && ` · ${customer.phone}`}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            onClick={() => handleViewDetail(customer)}
                                                            style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#333', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                        >
                                                            Ver detalle
                                                        </button>
                                                        <button
                                                            onClick={() => { setEditingId(customer.id); setEditForm({ name: customer.name, phone: customer.phone || '', email: customer.email || '' }) }}
                                                            style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                        >
                                                            Edit
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CustomersAdminPage