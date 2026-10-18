import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// How often an open tab asks the server whether a new version exists.
// Tablets stay open for days, so without this they would never notice.
const CHECK_EVERY_MS = 30 * 60 * 1000

/**
 * "New version available" banner. registerType is 'prompt', so a new version
 * waits until the user taps Actualizar (never reloads in the middle of an order).
 */
function UpdateBanner() {
    const [dismissed, setDismissed] = useState(false)

    const {
        needRefresh: [needRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return
            setInterval(() => {
                registration.update().catch(() => {})
            }, CHECK_EVERY_MS)
        },
    })

    if (!needRefresh || dismissed) return null

    return (
        <div
            role="status"
            style={{
                position: 'fixed',
                left: '50%',
                bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: '#16241a',
                border: '1px solid #2f6b44',
                borderRadius: '10px',
                color: '#e2e2e2',
                fontSize: '14px',
                boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            }}
        >
            <span>Hay una versión nueva del sistema.</span>
            <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                style={{
                    padding: '8px 14px',
                    borderRadius: '7px',
                    border: '1px solid #3f8f5b',
                    background: '#1f4d32',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                Actualizar
            </button>
            <button
                type="button"
                onClick={() => setDismissed(true)}
                style={{
                    padding: '8px 12px',
                    borderRadius: '7px',
                    border: '1px solid #2a2a2a',
                    background: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                }}
            >
                Después
            </button>
        </div>
    )
}

export default UpdateBanner
