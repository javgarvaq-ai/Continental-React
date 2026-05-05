import { create } from 'zustand'
import { supabase } from '../services/supabase'

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

    // Called on app load to validate the stored shiftId is still open in the DB.
    // If the shift was closed externally (or never existed), clears auth so the
    // user is redirected to login instead of operating in a ghost session.
    verifySession: async () => {
        const { shiftId } = useAuthStore.getState()

        if (!shiftId) return

        const { data: shift, error } = await supabase
            .from('shifts')
            .select('id, status')
            .eq('id', shiftId)
            .single()

        if (error || !shift || shift.status !== 'open') {
            localStorage.removeItem('continentalCurrentUser')
            localStorage.removeItem('continentalCurrentShiftId')
            set({ user: null, shiftId: null })
        }
    },
}))
