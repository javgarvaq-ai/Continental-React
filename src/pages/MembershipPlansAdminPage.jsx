import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    getAllMembershipPlans,
    createMembershipPlan,
    updateMembershipPlan,
    createBenefit,
    deleteBenefit,
    addBenefitProduct,
    removeBenefitProduct,
    getProductsForBenefitSelection,
} from '../services/membershipAdmin'
import AdminNav from '../components/AdminNav'
import { useAuthStore } from '../store/authStore'


const BENEFIT_LABELS = {
    discount: '% Descuento',
    free_product: 'Producto Gratis (cada visita)',
    free_bottle_milestone: 'Botella Gratis (cada N visitas)',
}

function MembershipPlansAdminPage() {
    const navigate = useNavigate()
    const [plans, setPlans] = useState([])
    const [allProducts, setAllProducts] = useState([])
    const [status, setStatus] = useState('Loading...')
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    // New plan form
    const [newName, setNewName] = useState('')
    const [newPrice, setNewPrice] = useState('')

    // Edit plan
    const [editingPlanId, setEditingPlanId] = useState(null)
    const [editForm, setEditForm] = useState({ name: '', price_monthly: '' })

    // Add benefit
    const [addingBenefitToPlanId, setAddingBenefitToPlanId] = useState(null)
    const [newBenefitType, setNewBenefitType] = useState('discount')
    const [newBenefitDiscount, setNewBenefitDiscount] = useState('')
    const [newBenefitMilestone, setNewBenefitMilestone] = useState('4')

    // Add product to benefit
    const [addingProductToBenefitId, setAddingProductToBenefitId] = useState(null)
    const [selectedProductId, setSelectedProductId] = useState('')

    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'admin'

    useEffect(() => {
        loadAll()
    }, [])

    async function loadAll() {
        setLoading(true)
        const [plansResult, productsResult] = await Promise.all([
            getAllMembershipPlans(),
            getProductsForBenefitSelection(),
        ])
        if (plansResult.error) {
            setStatus(`Error: ${plansResult.error.message}`)
            setLoading(false)
            return
        }
        setPlans(plansResult.data || [])
        setAllProducts(productsResult.data || [])
        setStatus('Plans loaded.')
        setLoading(false)
    }

    async function handleCreatePlan(e) {
        e.preventDefault()
        if (!isAdmin) return
        if (!newName.trim() || !newPrice) { setStatus('Name and price are required.'); return }
        setIsSaving(true)
        const { error } = await createMembershipPlan({
            name: newName,
            price_monthly: Number(newPrice),
        })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setNewName('')
        setNewPrice('')
        setStatus('Plan created.')
        setIsSaving(false)
        await loadAll()
    }

    async function handleUpdatePlan(id) {
        if (!isAdmin) return
        setIsSaving(true)
        const { error } = await updateMembershipPlan({
            id,
            name: editForm.name,
            price_monthly: Number(editForm.price_monthly),
            active: true,
            product_id: editForm.product_id || null,
        })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setEditingPlanId(null)
        setStatus('Plan updated.')
        setIsSaving(false)
        await loadAll()
    }

    async function handleTogglePlanActive(plan) {
        if (!isAdmin) return
        setIsSaving(true)
        const { error } = await updateMembershipPlan({
            id: plan.id,
            name: plan.name,
            price_monthly: plan.price_monthly,
            active: !plan.active,
        })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setStatus(`Plan ${!plan.active ? 'activated' : 'deactivated'}.`)
        setIsSaving(false)
        await loadAll()
    }

    async function handleAddBenefit(planId) {
        if (!isAdmin) return
        if (newBenefitType === 'discount' && (!newBenefitDiscount || Number(newBenefitDiscount) <= 0)) {
            setStatus('Enter a valid discount percentage.')
            return
        }
        setIsSaving(true)
        const { error } = await createBenefit({
            plan_id: planId,
            benefit_type: newBenefitType,
            discount_percentage: newBenefitType === 'discount' ? Number(newBenefitDiscount) : null,
            milestone_visits: newBenefitType === 'free_bottle_milestone' ? Number(newBenefitMilestone) : null,
        })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setAddingBenefitToPlanId(null)
        setNewBenefitType('discount')
        setNewBenefitDiscount('')
        setNewBenefitMilestone('4')
        setStatus('Benefit added.')
        setIsSaving(false)
        await loadAll()
    }

    async function handleDeleteBenefit(benefitId) {
        if (!isAdmin) return
        const confirmed = window.confirm('Delete this benefit and all its product assignments?')
        if (!confirmed) return
        setStatus('Deleting benefit...')
        const { error } = await deleteBenefit({ id: benefitId })
        if (error) { setStatus(`Error: ${error.message}`); return }
        setStatus('Benefit deleted.')
        await loadAll()
    }

    async function handleAddProductToBenefit(benefitId) {
        if (!isAdmin || !selectedProductId) return
        setIsSaving(true)
        const { error } = await addBenefitProduct({
            benefit_id: benefitId,
            product_id: selectedProductId,
        })
        if (error) { setStatus(`Error: ${error.message}`); setIsSaving(false); return }
        setSelectedProductId('')
        setAddingProductToBenefitId(null)
        setStatus('Product added to benefit.')
        setIsSaving(false)
        await loadAll()
    }

    async function handleRemoveBenefitProduct(productEntryId) {
        if (!isAdmin) return
        const confirmed = window.confirm('Remove this product from the benefit?')
        if (!confirmed) return
        const { error } = await removeBenefitProduct({ id: productEntryId })
        if (error) { setStatus(`Error: ${error.message}`); return }
        setStatus('Product removed.')
        await loadAll()
    }

    if (!isAdmin) {
        return <div style={{ padding: '24px', color: 'white', background: '#111', minHeight: '100vh' }}>Access denied. Admin only.</div>
    }

    return (
        <div style={{ minHeight: '100vh', background: '#111', color: 'white', padding: '24px', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>

                <AdminNav currentPath="/admin/membership-plans" />

                <h1 style={{ marginTop: 0 }}>Membership Plans</h1>
                <p style={{ opacity: 0.85 }}>{status}</p>

                {/* CREATE PLAN */}
                <div style={{ background: '#181818', border: '1px solid #2f2f2f', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
                    <h2 style={{ marginTop: 0 }}>New Plan</h2>
                    <form onSubmit={handleCreatePlan} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px' }}>Plan Name</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g. Membresía VIP"
                                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '220px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px' }}>Monthly Price ($)</label>
                            <input
                                type="number"
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                placeholder="e.g. 1000"
                                min="0"
                                style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '140px' }}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isSaving || !newName.trim() || !newPrice}
                            style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: isSaving || !newName.trim() || !newPrice ? '#555' : '#2e7d32', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                            {isSaving ? 'Creating...' : 'Create Plan'}
                        </button>
                    </form>
                </div>

                {/* PLANS LIST */}
                {loading ? <div>Loading plans...</div> : plans.length === 0 ? <div>No plans yet.</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {plans.map((plan) => (
                            <div key={plan.id} style={{ background: '#181818', border: `1px solid ${plan.active ? '#2e7d32' : '#555'}`, borderRadius: '16px', padding: '20px' }}>

                                {/* PLAN HEADER */}
                                {editingPlanId === plan.id ? (
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '200px' }}
                                        />
                                        <input
                                            type="number"
                                            value={editForm.price_monthly}
                                            onChange={(e) => setEditForm(p => ({ ...p, price_monthly: e.target.value }))}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', width: '120px' }}
                                        />
                                        <select
                                            value={editForm.product_id || ''}
                                            onChange={(e) => setEditForm(p => ({ ...p, product_id: e.target.value || null }))}
                                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white' }}
                                        >
                                            <option value="">Sin producto vinculado</option>
                                            {allProducts.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} — ${p.price}</option>
                                            ))}
                                        </select>
                                        <button onClick={() => handleUpdatePlan(plan.id)} disabled={isSaving} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                                        <button onClick={() => setEditingPlanId(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                        <div>
                                            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{plan.name}</span>
                                            <span style={{ marginLeft: '12px', opacity: 0.7 }}>${plan.price_monthly}/mes</span>
                                            <span style={{ marginLeft: '12px', fontSize: '12px', padding: '2px 8px', borderRadius: '10px', background: plan.active ? '#1b5e20' : '#555' }}>{plan.active ? 'Activo' : 'Inactivo'}</span>
                                            {plan.product_id ? (
                                                <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.6 }}>
                                                    🔗 {allProducts.find(p => p.id === plan.product_id)?.name || 'Producto vinculado'}
                                                </span>
                                            ) : (
                                                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#f57c00' }}>⚠ Sin producto vinculado</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => { setEditingPlanId(plan.id); setEditForm({ name: plan.name, price_monthly: plan.price_monthly, product_id: plan.product_id || '' }) }} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer' }}>Edit</button>
                                            <button onClick={() => handleTogglePlanActive(plan)} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: plan.active ? '#b71c1c' : '#2e7d32', color: 'white', cursor: 'pointer' }}>{plan.active ? 'Deactivate' : 'Activate'}</button>
                                        </div>
                                    </div>
                                )}

                                {/* BENEFITS */}
                                <div style={{ borderTop: '1px solid #333', paddingTop: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <span style={{ fontWeight: 'bold', opacity: 0.85 }}>Benefits</span>
                                        <button
                                            onClick={() => setAddingBenefitToPlanId(addingBenefitToPlanId === plan.id ? null : plan.id)}
                                            style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                        >
                                            + Add Benefit
                                        </button>
                                    </div>

                                    {/* ADD BENEFIT FORM */}
                                    {addingBenefitToPlanId === plan.id && (
                                        <div style={{ background: '#111', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                                <div>
                                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Benefit Type</label>
                                                    <select
                                                        value={newBenefitType}
                                                        onChange={(e) => setNewBenefitType(e.target.value)}
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white' }}
                                                    >
                                                        <option value="discount">% Descuento</option>
                                                        <option value="free_product">Producto Gratis (cada visita)</option>
                                                        <option value="free_bottle_milestone">Botella Gratis (cada N visitas)</option>
                                                    </select>
                                                </div>
                                                {newBenefitType === 'discount' && (
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>Discount %</label>
                                                        <input
                                                            type="number"
                                                            value={newBenefitDiscount}
                                                            onChange={(e) => setNewBenefitDiscount(e.target.value)}
                                                            placeholder="e.g. 10"
                                                            min="1" max="100"
                                                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white', width: '100px' }}
                                                        />
                                                    </div>
                                                )}
                                                {newBenefitType === 'free_bottle_milestone' && (
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>After every N visits</label>
                                                        <input
                                                            type="number"
                                                            value={newBenefitMilestone}
                                                            onChange={(e) => setNewBenefitMilestone(e.target.value)}
                                                            min="1"
                                                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white', width: '100px' }}
                                                        />
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => handleAddBenefit(plan.id)}
                                                    disabled={isSaving}
                                                    style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                                                >
                                                    Add
                                                </button>
                                                <button
                                                    onClick={() => setAddingBenefitToPlanId(null)}
                                                    style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                            {(newBenefitType === 'free_product' || newBenefitType === 'free_bottle_milestone') && (
                                                <p style={{ margin: '10px 0 0', fontSize: '12px', opacity: 0.7 }}>
                                                    After adding the benefit, you can assign eligible products to it below.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* BENEFITS LIST */}
                                    {(!plan.membership_plan_benefits || plan.membership_plan_benefits.length === 0) ? (
                                        <div style={{ opacity: 0.5, fontSize: '13px' }}>No benefits configured yet.</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {plan.membership_plan_benefits.map((benefit) => (
                                                <div key={benefit.id} style={{ background: '#1a1a1a', borderRadius: '10px', padding: '12px', border: '1px solid #2a2a2a' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                        <div>
                                                            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{BENEFIT_LABELS[benefit.benefit_type]}</span>
                                                            {benefit.benefit_type === 'discount' && (
                                                                <span style={{ marginLeft: '10px', color: '#4da3ff' }}>{benefit.discount_percentage}%</span>
                                                            )}
                                                            {benefit.benefit_type === 'free_bottle_milestone' && (
                                                                <span style={{ marginLeft: '10px', color: '#ffa726' }}>cada {benefit.milestone_visits} visitas</span>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteBenefit(benefit.id)}
                                                            style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#b71c1c', color: 'white', cursor: 'pointer', fontSize: '12px' }}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>

                                                    {/* PRODUCT LIST for this benefit */}
                                                    {(benefit.benefit_type === 'free_product' || benefit.benefit_type === 'free_bottle_milestone') && (
                                                        <div style={{ paddingTop: '8px', borderTop: '1px solid #333' }}>
                                                            <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '6px' }}>Eligible products:</div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                                                {(benefit.membership_benefit_products || []).map((bp) => (
                                                                    <span key={bp.id} style={{ background: '#222', border: '1px solid #444', borderRadius: '6px', padding: '4px 10px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        {bp.products?.name}
                                                                        <button
                                                                            onClick={() => handleRemoveBenefitProduct(bp.id)}
                                                                            style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', lineHeight: 1, padding: 0 }}
                                                                        >×</button>
                                                                    </span>
                                                                ))}
                                                                {(benefit.membership_benefit_products || []).length === 0 && (
                                                                    <span style={{ opacity: 0.5, fontSize: '12px' }}>No products assigned yet.</span>
                                                                )}
                                                            </div>

                                                            {addingProductToBenefitId === benefit.id ? (
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                    <select
                                                                        value={selectedProductId}
                                                                        onChange={(e) => setSelectedProductId(e.target.value)}
                                                                        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: 'white', flex: 1 }}
                                                                    >
                                                                        <option value="">Select product...</option>
                                                                        {allProducts
                                                                            .filter(p => !(benefit.membership_benefit_products || []).some(bp => bp.product_id === p.id))
                                                                            .map(p => (
                                                                                <option key={p.id} value={p.id}>{p.name} — ${p.price}</option>
                                                                            ))
                                                                        }
                                                                    </select>
                                                                    <button
                                                                        onClick={() => handleAddProductToBenefit(benefit.id)}
                                                                        disabled={!selectedProductId || isSaving}
                                                                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                                    >
                                                                        Add
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setAddingProductToBenefitId(null); setSelectedProductId('') }}
                                                                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => { setAddingProductToBenefitId(benefit.id); setSelectedProductId('') }}
                                                                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #444', background: '#222', color: 'white', cursor: 'pointer', fontSize: '12px' }}
                                                                >
                                                                    + Add Product
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default MembershipPlansAdminPage