import { supabase } from './supabase'

export async function getWeeklyReportData({ startDate, endDate }) {
    const startIso = `${startDate}T00:00:00-06:00`
    const endIso = `${endDate}T23:59:59-06:00`

    const [paymentsResult, cashMovementsResult, comandasResult] = await Promise.all([
        supabase
            .from('payments')
            .select(`
                *,
                comandas (
                    id,
                    folio,
                    final_total,
                    tip_total,
                    status,
                    cobrado_at
                )
            `)
            .gte('created_at', startIso)
            .lte('created_at', endIso),

        supabase
            .from('cash_movements')
            .select('*')
            .gte('created_at', startIso)
            .lte('created_at', endIso),

        supabase
            .from('comandas')
            .select('*')
            .eq('status', 'paid')
            .gte('cobrado_at', startIso)
            .lte('cobrado_at', endIso),
    ])

    return {
        payments: paymentsResult.data || [],
        cashMovements: cashMovementsResult.data || [],
        comandas: comandasResult.data || [],
        error: paymentsResult.error || cashMovementsResult.error || comandasResult.error || null,
        paymentsError: paymentsResult.error,
        cashMovementsError: cashMovementsResult.error,
        comandasError: comandasResult.error,
    }
}
