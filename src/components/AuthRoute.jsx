import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

function AuthRoute({ children }) {
    const user        = useAuthStore(state => state.user)
    const isVerifying = useAuthStore(state => state.isVerifying)

    // Wait for verifySession to finish before making any redirect decision.
    if (isVerifying) return null

    if (!user) {
        return <Navigate to="/login" replace />
    }

    if (user.role !== 'admin') {
        return <Navigate to="/pos" replace state={{ accessDenied: true }} />
    }

    return children
}

export default AuthRoute
