/**
 * Programa de RP — la matemática de la comisión.
 *
 * Función pura, sin Supabase y sin React, para que se pueda probar sola
 * y para que el reporte y la UI nunca calculen distinto. Mismo criterio
 * que utils/ledger.js.
 *
 * Escalones (sobre el consumo COMPLETO de la cuenta, no sobre el
 * excedente):
 *     menos de $300 .... no comisiona
 *     $300 a $999 ...... 5%
 *     $1,000 o más ..... 10%
 *
 * Y una descalificación: si el RP pidió cortesía para esa mesa y la
 * cuenta no llegó a $1,000, esa cuenta no comisiona nada — ni el 5%.
 * Las cortesías ya se dieron por delante, así que el número tiene que
 * haber sido real. Para el cliente es transparente: no se le dice nada
 * ni se le cobra.
 *
 * La base es `comandas.final_total`, que NO incluye propina — la propina
 * vive aparte en `tip_total` / `payments.tip_amount`. O sea la regla de
 * "comisión sobre consumo, nunca sobre propina" sale sola.
 */

export const RP_MIN_COMISION   = 300
export const RP_UMBRAL_ALTO    = 1000
export const RP_RATE_BAJA      = 0.05
export const RP_RATE_ALTA      = 0.10

export const RP_MOTIVO = {
    CORTESIA_SIN_ALCANZAR: 'cortesia_sin_alcanzar',
    BAJO_MINIMO:           'bajo_minimo',
}

export const RP_MOTIVO_LABEL = {
    [RP_MOTIVO.CORTESIA_SIN_ALCANZAR]: `Llevó cortesía y no llegó a $${RP_UMBRAL_ALTO.toLocaleString('es-MX')}`,
    [RP_MOTIVO.BAJO_MINIMO]:           `Menos de $${RP_MIN_COMISION.toLocaleString('es-MX')}`,
}

/**
 * @param {object}  args
 * @param {number}  args.total     consumo de la cuenta (sin propina)
 * @param {boolean} args.cortesia  si esa mesa llevó trago de cortesía
 * @returns {{ rate: number, amount: number, motivo: string|null }}
 */
export function rpCommission({ total, cortesia = false } = {}) {
    const monto = Number(total || 0)

    if (cortesia && monto < RP_UMBRAL_ALTO) {
        return { rate: 0, amount: 0, motivo: RP_MOTIVO.CORTESIA_SIN_ALCANZAR }
    }

    if (monto < RP_MIN_COMISION) {
        return { rate: 0, amount: 0, motivo: RP_MOTIVO.BAJO_MINIMO }
    }

    const rate = monto < RP_UMBRAL_ALTO ? RP_RATE_BAJA : RP_RATE_ALTA

    return {
        rate,
        amount: Math.round(monto * rate * 100) / 100,
        motivo: null,
    }
}

/** Suma un arreglo de comandas ya cobradas para el corte semanal. */
export function rpSummary(comandas = []) {
    return comandas.reduce((acc, c) => {
        const { rate, amount, motivo } = rpCommission({
            total:    c.final_total,
            cortesia: c.rp_cortesia,
        })

        acc.cuentas       += 1
        acc.venta         += Number(c.final_total || 0)
        acc.comision      += amount
        if (motivo) acc.descalificadas += 1
        if (c.rp_cortesia) acc.conCortesia += 1

        acc.detalle.push({ ...c, rate, amount, motivo })
        return acc
    }, { cuentas: 0, venta: 0, comision: 0, descalificadas: 0, conCortesia: 0, detalle: [] })
}
