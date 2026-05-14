import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const ROLE_PRIORITY = ['admin', 'trainer', 'trainee']

const useAuthStore = create(persist(
  (set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,

    login: (user, token) => set({ user, token, isAuthenticated: true }),
    logout: () => set({ user: null, token: null, isAuthenticated: false }),
    updateUser: (user) => set({ user }),

    getRoles: () => {
      const user = get().user
      if (!user) return []
      return user.roles?.length ? user.roles : [user.role].filter(Boolean)
    },

    hasRole: (role) => get().getRoles().includes(role),

    hasAnyRole: (...roles) => roles.some((r) => get().getRoles().includes(r)),

    // Returns the most privileged role from BOTH fields combined
    // admin > trainer > trainee — never blindly returns roles[0]
    primaryRole: () => {
      const user = get().user
      if (!user) return null
      const all = [...new Set([...(user.roles || []), ...(user.role ? [user.role] : [])])]
      return ROLE_PRIORITY.find((r) => all.includes(r)) || null
    },
  }),
  { name: 'lms-auth' }
))

export { useAuthStore }
export default useAuthStore