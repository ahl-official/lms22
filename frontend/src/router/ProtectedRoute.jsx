import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const ROLE_HOME = {
  admin: '/admin',
  trainer: '/trainer',
  trainee: '/trainee',
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />

  if (allowedRoles) {
    // Check BOTH roles array and legacy role string — whichever has the real value
    const rolesFromArray = user?.roles || []
    const roleFromString = user?.role ? [user.role] : []
    const allUserRoles = [...new Set([...rolesFromArray, ...roleFromString])]

    const hasAccess = allowedRoles.some((r) => allUserRoles.includes(r))

    if (!hasAccess) {
      // Redirect to home based on whichever role field has a non-trainee value
      const primaryRole =
        rolesFromArray.find((r) => r !== 'trainee') ||
        (user?.role !== 'trainee' ? user?.role : null) ||
        rolesFromArray[0] ||
        user?.role
      return <Navigate to={ROLE_HOME[primaryRole] || '/login'} replace />
    }
  }

  return children
}