/**
 * RPs (referidos) dados de alta.
 *
 * Es una lista de NOMBRES, no de ids: en `comandas.rp_name` se guarda el
 * string tal cual. Eso significa que si mañana quitas a alguien de aquí,
 * sus comandas viejas siguen siendo legibles en el reporte — a cambio de
 * que cambiarle la escritura a un nombre ("Juan" -> "Juan P.") parte el
 * histórico en dos. Si le vas a cambiar el nombre a alguien, avísame y
 * corremos un UPDATE para unificar.
 *
 * Mientras esté vacío, el selector de RP no aparece en el diálogo de
 * abrir mesa y el POS se comporta exactamente igual que antes.
 *
 * Cuando esto pase de ~15 nombres, deja de ser un archivo de config y
 * toca hacerle su tabla con su pantalla de admin. Con los amigos
 * cercanos del arranque, esto sobra.
 */

export const RP_OPTIONS = ['Prueba 1', 'Prueba 2', 'Prueba 3']

export function isKnownRp(name) {
    return RP_OPTIONS.includes(name)
}
