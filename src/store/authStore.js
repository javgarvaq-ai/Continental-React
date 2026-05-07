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

    // Called on app load to validate:
    // 1. The stored shiftId is still open in the DB
    // 2. The stored user still exists, is active, and has the same role
    // If either check fails, clears auth and redirects to login.
    verifySession: async () => {
        const { shiftId, user } = useAuthStore.getState()

        if (!shiftId) return

        // Check shift is still open
        const { data: shift, error: shiftError } = await supabase
            .from('shifts')
            .select('id, status')
            .eq('id', shiftId)
            .single()

        if (shiftError || !shift || shift.status !== 'open') {
            localStorage.removeItem('continentalCurrentUser')
            localStorage.removeItem('continentalCurrentShiftId')
            set({ user: null, shiftId: null })
            return
        }

        // Check user is still active and role hasn't changed
        if (user?.id) {
            const { data: freshUser, error: userError } = await supabase
                .from('users')
                .select('id, active, role')
                .eq('id', user.id)
                .single()

            if (userError || !freshUser || !freshUser.active || freshUser.role !== user.role) {
                localStorage.removeItem('continentalCurrentUser')
                localStorage.removeItem('continentalCurrentShiftId')
                set({ user: null, shiftId: null })
                return
            }
        }
    },
}))
