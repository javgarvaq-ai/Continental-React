import { useState } from 'react'

const DEPOSIT_CATEGORIES = [
    { key: 'regreso_resguardo', label: 'Regreso de resguardo', sublabel: 'Casa → Caja' },
    { key: 'retiro_banco_a_caja', label: 'Retiro de banco', sublabel: 'Banco → Caja' },
    { key: 'aportacion_socio', label: 'Aportación socio', sublabel: 'Socio → Caja' },
    { key: 'ajuste_ingreso', label: 'Ajuste de ingreso', sublabel: 'Corrección' },
]

const WITHDRAWAL_CATEGORIES = [
    { key: 'resguardo_casa', label: 'Resguardo a casa', sublabel: 'Caja → Casa' },
    { key: 'deposito_banco', label: 'Depósito a banco', sublabel: 'Caja → Banco' },
    { key: 'pago_proveedor_caja', label: 'Pago proveedor', sublabel: 'Desde caja' },
    { key: 'pago_proveedor_banco', label: 'Pago proveedor', sublabel: 'Desde banco' },
    { key: 'pago_proveedor_resguardo', label: 'Pago proveedor', sublabel: 'Desde resguardo' },
    { key: 'nomina_caja', label: 'Nómina', sublabel: 'Desde caja' },
    { key: 'nomina_banco', label: 'Nómina', sublabel: 'Desde banco' },
    { key: 'renta_caja', label: 'Renta', sublabel: 'Desde caja' },
    { key: 'renta_banco', label: 'Renta', sublabel: 'Desde banco' },
    { key: 'propinas_entregadas', label: 'Propinas entregadas', sublabel: 'Desde caja' },
    { key: 'gasto_operativo_caja', label: 'Gasto operativo', sublabel: 'Desde caja' },
    { key: 'gasto_operativo_banco', label: 'Gasto operativo', sublabel: 'Desde banco' },
]

function CashMovementPanel({ open, onClose, onSubmit, isSubmitting }) {
    const [section, setSection] = useState('deposit')
    const [selectedCategory, setSelectedCategory] = useState(null)
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')

    if (!open) return null

    const categories = section === 'deposit' ? DEPOSIT_CATEGORIES : WITHDRAWAL_CATEGORIES

    function handleSectionChange(newSection) {
        setSection(newSection)
        setSelectedCategory(null)
        setAmount('')
        setNote('')
    }

    function handleClose() {
        setSection('deposit')
        setSelectedCategory(null)
        setAmount('')
        setNote('')
        onClose()
    }

    function handleAmountChange(e) {
        const val = e.target.value
        if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
            setAmount(val)
        }
    }

    function handleSubmit() {
        if (!selectedCategory || !amount || !note.trim()) return
        onSubmit({ category: selectedCategory, amount: Number(amount), note: note.trim() })
        setSelectedCategory(null)
        setAmount('')
        setNote('')
    }

    const canSubmit = selectedCategory && Number(amount) > 0 && note.trim() && !isSubmitting

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
        }}>
            <div style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '16px',
                padding: '24px',
                width: '100%',
                maxWidth: '560px',
                maxHeight: '90vh',
                overflowY: 'auto',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px' }}>Movimiento de caja</h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
                    >
                        ✕
                    </button>
                </div>

                {/* Section tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <button
                        type="button"
                        onClick={() => handleSectionChange('deposit')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            background: section === 'deposit' ? '#1f4d32' : '#2a2a2a',
                            color: section === 'deposit' ? '#66bb6a' : '#aaa',
                        }}
                    >
                        ➕ Entrada
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSectionChange('withdrawal')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            background: section === 'withdrawal' ? '#4a1c1c' : '#2a2a2a',
                            color: section === 'withdrawal' ? '#ef9a9a' : '#aaa',
                        }}
                    >
                        ➖ Salida
                    </button>
                </div>

                {/* Category grid */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '8px' }}>Tipo de movimiento</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {categories.map((cat) => (
                            <button
                                key={cat.key}
                                type="button"
                                onClick={() => setSelectedCategory(cat.key)}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: selectedCategory === cat.key
                                        ? `2px solid ${section === 'deposit' ? '#66bb6a' : '#ef9a9a'}`
                                        : '2px solid transparent',
                                    background: selectedCategory === cat.key ? '#222' : '#111',
                                    color: 'white',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{cat.label}</div>
                                <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>{cat.sublabel}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Amount */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', opacity: 0.6, marginBottom: '6px' }}>
                        Monto
                    </label>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={handleAmountChange}
                        placeholder="0.00"
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #444',
                            background: '#111',
                            color: 'white',
                            fontSize: '16px',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Note */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', opacity: 0.6, marginBottom: '6px' }}>
                        Motivo / referencia
                    </label>
                    <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Descripción del movimiento"
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid #444',
                            background: '#111',
                            color: 'white',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Submit */}
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '10px',
                        border: 'none',
                        background: !canSubmit
                            ? '#555'
                            : section === 'deposit' ? '#2e7d32' : '#c62828',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '15px',
                        cursor: canSubmit ? 'pointer' : 'default',
                    }}
                >
                    {isSubmitting ? 'Registrando...' : `Registrar ${section === 'deposit' ? 'entrada' : 'salida'}`}
                </button>
            </div>
        </div>
    )
}

export default CashMovementPanel
