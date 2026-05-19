const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

// Formats a numeric value as Mexican pesos: $1,234.56
// Using Intl.NumberFormat avoids manual toFixed() and adds thousands separator,
// which matters at 5-figure bottle prices where misreading $10000 vs $1,000.0 is a real risk.
export function money(value) {
    return MXN.format(Number(value || 0))
}
