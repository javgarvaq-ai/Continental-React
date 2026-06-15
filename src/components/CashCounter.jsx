import { useState, useEffect } from 'react'
import { money } from '../utils/money'

// Denominaciones del peso mexicano (billetes y monedas). Editable si hace falta.
const DENOMINATIONS = [
    { value: 1000, label: '$1,000' },
    { value: 500,  label: '$500' },
    { value: 200,  label: '$200' },
    { value: 100,  label: '$100' },
    { value: 50,   label: '$50' },
    { value: 20,   label: '$20' },
    { value: 10,   label: '$10' },
    { value: 5,    label: '$5' },
    { value: 2,    label: '$2' },
    { value: 1,    label: '$1' },
    { value: 0.5,  label: '$0.50' },
]

const storageKey = (id) => (id ? `cash-counter-${id}` : null)

function loadCounts(id) {
    const key = storageKey(id)
    if (!key) return {}
    try {
        const raw = localStorage.getItem(key)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

// Calculadora de conteo de efectivo. Solo ayuda visual; persiste en localStorage
// asociada a un id (shiftId en el corte, "opening" en la apertura) para que dure
// toda la etapa. No toca BD ni el cierre.
// Props:
//   - shiftId / storageId: llave de persistencia (storageId tiene prioridad).
//   - onTotalChange(total): callback opcional con el total contado en vivo.
function CashCounter({ shiftId, storageId, onTotalChange }) {
    const persistId = storageId ?? shiftId
    const [counts, setCounts] = useState(() => loadCounts(persistId))

    // Recargar si cambia la llave mientras está montado.
    useEffect(() => { setCounts(loadCounts(persistId)) }, [persistId])

    // Guardar en cada cambio (localStorage es barato).
    useEffect(() => {
        const key = storageKey(persistId)
        if (!key) return
        try { localStorage.setItem(key, JSON.stringify(counts)) } catch { /* ignore */ }
    }, [counts, persistId])

    function setCount(value, raw) {
        const n = Math.max(0, Math.floor(Number(raw) || 0))
        setCounts((prev) => ({ ...prev, [value]: n }))
    }

    function clearAll() {
        setCounts({})
        const key = storageKey(shiftId)
        if (key) { try { localStorage.removeItem(key) } catch { /* ignore */ } }
    }

    const total = DENOMINATIONS.reduce((s, d) => s + d.value * (Number(counts[d.value]) || 0), 0)

    // Reportar el total en vivo al padre (apertura: autollena el fondo).
    useEffect(() => {
        if (onTotalChange) onTotalChange(total)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [total])

    const rowStyle = { display: 'grid', gridTemplateColumns: '70px 1fr 110px', alignItems: 'center', gap: '8px', padding: '4px 0' }
    const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', fontSize: '15px', boxSizing: 'border-box', textAlign: 'center' }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', opacity: 0.6 }}>Denominación · cantidad · subtotal</span>
                <button
                    type="button"
                    onClick={clearAll}
                    style={{ background: '#222', border: '1px solid #444', color: '#aaa', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}
                >
                    Limpiar
                </button>
            </div>

            <div style={{ background: '#111', borderRadius: '10px', padding: '12px 14px' }}>
                {DENOMINATIONS.map((d) => {
                    const qty = Number(counts[d.value]) || 0
                    return (
                        <div key={d.value} style={rowStyle}>
                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{d.label}</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={counts[d.value] ? counts[d.value] : ''}
                                onChange={(e) => setCount(d.value, e.target.value)}
                                placeholder="0"
                                style={inputStyle}
                            />
                            <span style={{ fontSize: '14px', textAlign: 'right', opacity: qty ? 1 : 0.4 }}>
                                {money(d.value * qty)}
                            </span>
                        </div>
                    )
                })}

                <div style={{ borderTop: '1px solid #2a2a2a', margin: '8px 0 6px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '15px', fontWeight: 'bold' }}>Total contado</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#66bb6a' }}>{money(total)}</span>
                </div>
            </div>
        </div>
    )
}

export default CashCounter
