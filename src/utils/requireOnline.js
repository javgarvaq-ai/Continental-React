export function requireOnline(isOnline, setStatus) {
    if (isOnline) return true

    if (typeof setStatus === 'function') {
        setStatus('Sin conexión. Usa comandas manuales y captura después cuando regrese internet.')
    }

    window.alert('Sin conexión. Usa comandas manuales y captura después cuando regrese internet.')
    return false
}