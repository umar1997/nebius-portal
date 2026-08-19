import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminStore } from '../stores/useAdminStore'
import { useAuthStore } from '../stores/useAuthStore'

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { adminToken } = useAdminStore()
  const { user, isInitializing } = useAuthStore()

  // Wait for session restore before deciding.
  if (isInitializing) return null

  const isSuperAdmin = !!adminToken
  const isDbAdmin    = user?.role === 'admin'

  if (!isSuperAdmin && !isDbAdmin) {
    // DB admin users arrive here via /login; env superadmin via /admin.
    return <Navigate to={user ? '/' : '/admin'} replace />
  }

  return <>{children}</>
}
