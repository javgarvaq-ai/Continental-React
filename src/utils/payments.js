/**
 * Core payment math shared between the service layer (comandaCheckout)
 * and the UI hook (usePayment).
 *
 * Pure functions — no side effects, no imports.
 */

/**
 * Computes the authoritative payment breakdown from raw inputs.
 *
 * @param {Object} p
 * @param {number} p.total           - Bill total before tip
 * @param {number} p.efectivo        - Cash tendered by customer
 * @param {number} p.tarjeta         - Card amount
 * @param {number} p.transferencia   - Transfer amount
 * @param {number} p.propina         - Tip amount
 * @param {number} p.cambio          - Change to give back
 * @returns {{ totalDue: number, totalReceived: number, netCashApplied: number, totalPaid: number }}
 */
export function computePaymentBreakdown({
    total,
    efectivo,
    tarjeta,
    transferencia,
    propina,
    cambio,
}) {
    const safeTotal         = Number(total          || 0)
    const safeCash          = Number(efectivo        || 0)
    const safeTarjeta       = Number(tarjeta         || 0)
    const safeTransferencia = Number(transferencia   || 0)
    const safePropina       = Number(propina         || 0)
    const safeCambio        = Number(cambio          || 0)

    const totalDue       = safeTotal + safePropina
    const totalReceived  = safeCash + safeTarjeta + safeTransferencia
    const netCashApplied = Math.max(safeCash - safeCambio, 0)
    const totalPaid      = netCashApplied + safeTarjeta + safeTransferencia

    return { totalDue, totalReceived, netCashApplied, totalPaid }
}
