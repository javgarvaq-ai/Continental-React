import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

function ProtectedRoute({ children }) {
    const user = useAuthStore(state => state.user)
    const shiftId = useAuthStore(state => state.shiftId)

    if (!user || !shiftId) {
        return <Navigate to="/login" replace />
    }

    return children
}

export default ProtectedRoute
