import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

function AuthRoute({ children }) {
    const user = useAuthStore(state => state.user)

    if (!user) {
        return <Navigate to="/login" replace />
    }

    if (user.role !== 'admin') {
        return <Navigate to="/pos" replace />
    }

    return children
}

export default AuthRoute
