import { supabase } from './supabase'

export async function getUnitsWithStatus() {
    const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('*')
        .order('name', { ascending: true })

    if (unitsError) {
        return { data: null, error: unitsError }
    }

    const { data: activeComandas, error: comandasError } = await supabase
        .from('comandas')
        .select('id, unit_id, status, customer_name')
        .in('status', ['open', 'pending_payment', 'processing_payment'])

    if (comandasError) {
        return { data: null, error: comandasError }
    }

    const mappedUnits = (units || []).map((unit) => {
        const activeComanda = (activeComandas || []).find((c) => c.unit_id === unit.id)

        let visualStatus = 'free'
        let statusLabel = 'Libre'
        let statusColor = '#4ade80'
        let customerName = ''

        if (activeComanda) {
            visualStatus = activeComanda.status
            customerName = activeComanda.customer_name || ''
        }

        if (visualStatus === 'open') {
            statusLabel = 'Abierta'
            statusColor = '#60a5fa'
        }

        if (visualStatus === 'pending_payment') {
            statusLabel = 'Cuenta'
            statusColor = '#fb923c'
        }

        if (visualStatus === 'processing_payment') {
            statusLabel = 'Cobrando'
            statusColor = '#a78bfa'
        }

        return {
            ...unit,
            visualStatus,
            statusLabel,
            statusColor,
            customerName,
        }
    })

    return { data: mappedUnits, error: null }
}