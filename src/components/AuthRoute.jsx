import { Navigate } from 'react-router-dom'

function AuthRoute({ children }) {
    const storedUser = localStorage.getItem('continentalCurrentUser')

    if (!storedUser) {
        return <Navigate to="/login" replace />
    }

    const user = JSON.parse(storedUser)

    if (user.role !== 'admin') {
        return <Navigate to="/pos" replace />
    }

    return children
}

export default AuthRoute