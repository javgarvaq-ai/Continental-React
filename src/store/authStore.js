import { create } from 'zustand'
import { supabase } from '../services/supabase'
import { getShiftById } from '../services/shifts'
import { getUserById } from '../services/users'

export const useAuthStore = create((set, get) => ({
    user:    null,
    shiftId: localStorage.getItem('continentalCurrentShiftId') || null,

    // Called on successful login + shift open
    setAuth: (user, shiftId) => {
        localStorage.setItem('continentalCurrentShiftId', shiftId)
        set({ user, shiftId })
    },

    // Called on shift close — signs out of Supabase Auth and clears everything
    clearAuth: async () => {
        localStorage.removeItem('continentalCurrentShiftId')
        set({ user: null, shiftId: null })
        await supabase.auth.signOut()
    },

    // Called when an employee finishes their turn but the shift stays open.
    // Signs out of Supabase Auth so the next employee can sign in with their own PIN.
    clearUser: async () => {
        set({ user: null })
        await supabase.auth.signOut()
    },

    // Called on app load to restore session state.
    // Checks:
    //   1. A shiftId exists in localStorage
    //   2. That shift is still open in the DB
    //   3. A valid Supabase Auth session exists
    //   4. The session's user is still active in our users table
    // Clears auth and signs out if any check fails.
    verifySession: async () => {
        const { shiftId } = get()
        if (!shiftId) return

        // Check shift is still open
        const { data: shift, error: shiftError } = await getShiftById(shiftId)
        if (shiftError || !shift || shift.status !== 'open') {
            localStorage.removeItem('continentalCurrentShiftId')
            set({ user: null, shiftId: null })
            await supabase.auth.signOut()
            return
        }

        // Check Supabase Auth session is still valid
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            localStorage.removeItem('continentalCurrentShiftId')
            set({ user: null, shiftId: null })
            return
        }

        // Get fresh user data — confirm still active and role unchanged
        const { data: freshUser, error: userError } = await getUserById(session.user.id)
        if (userError || !freshUser) {
            localStorage.removeItem('continentalCurrentShiftId')
            set({ user: null, shiftId: null })
            await supabase.auth.signOut()
            return
        }

        set({ user: freshUser })
    },
}))
