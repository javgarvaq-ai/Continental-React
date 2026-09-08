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
        .select('id, unit_id, status, customer_name, rp_name, rp_cortesia')
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
        let rpName = ''
        let rpCortesia = false

        if (activeComanda) {
            visualStatus = activeComanda.status
            customerName = activeComanda.customer_name || ''
            rpName = activeComanda.rp_name || ''
            rpCortesia = Boolean(activeComanda.rp_cortesia)
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
            rpName,
            rpCortesia,
        }
    })

    return { data: mappedUnits, error: null }
}