import { create } from 'zustand'

function loadFromStorage() {
    try {
        const user = localStorage.getItem('continentalCurrentUser')
        const shiftId = localStorage.getItem('continentalCurrentShiftId')
        return {
            user: user ? JSON.parse(user) : null,
            shiftId: shiftId || null,
        }
    } catch {
        return { user: null, shiftId: null }
    }
}

export const useAuthStore = create((set) => ({
    ...loadFromStorage(),

    // Called on successful login
    setAuth: (user, shiftId) => {
        localStorage.setItem('continentalCurrentUser', JSON.stringify(user))
        localStorage.setItem('continentalCurrentShiftId', shiftId)
        set({ user, shiftId })
    },

    // Called on logout or shift close
    clearAuth: () => {
        localStorage.removeItem('continentalCurrentUser')
        localStorage.removeItem('continentalCurrentShiftId')
        set({ user: null, shiftId: null })
    },

    // Called on user change without closing the shift
    clearUser: () => {
        localStorage.removeItem('continentalCurrentUser')
        set({ user: null })
    },
}))
