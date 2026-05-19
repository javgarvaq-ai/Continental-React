import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

function ProtectedRoute({ children }) {
    const user        = useAuthStore(state => state.user)
    const shiftId     = useAuthStore(state => state.shiftId)
    const isVerifying = useAuthStore(state => state.isVerifying)

    // Wait for verifySession to finish before making any redirect decision.
    // Without this, a slow DB check would flash the user to /login on reload.
    if (isVerifying) return null

    if (!user || !shiftId) {
        return <Navigate to="/login" replace />
    }

    return children
}

export default ProtectedRoute
