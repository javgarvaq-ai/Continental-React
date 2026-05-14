export function requireOnline(isOnline, setStatus) {
    if (isOnline) return true

    if (typeof setStatus === 'function') {
        setStatus({ message: 'Sin conexión. Verifica tu red.', type: 'warning' })
    }

    return false
}