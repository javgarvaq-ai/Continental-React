import { Navigate } from 'react-router-dom'

function AuthRoute({ children }) {
    const storedUser = localStorage.getItem('continentalCurrentUser')

    if (!storedUser) {
        return <Navigate to="/login" replace />
    }

    let user
    try {
        user = JSON.parse(storedUser)
    } catch {
        localStorage.removeItem('continentalCurrentUser')
        return <Navigate to="/login" replace />
    }

    if (user.role !== 'admin') {
        return <Navigate to="/pos" replace />
    }

    return children
}

export default AuthRoute