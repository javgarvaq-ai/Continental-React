import { Navigate } from 'react-router-dom'

function ProtectedRoute({ children }) {
    const savedUser = localStorage.getItem('continentalCurrentUser')
    const savedShiftId = localStorage.getItem('continentalCurrentShiftId')

    if (!savedUser || !savedShiftId) {
        return <Navigate to="/login" replace />
    }

    return children
}

export default ProtectedRoute