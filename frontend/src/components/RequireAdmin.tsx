import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminStore } from '../stores/useAdminStore'

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { adminToken } = useAdminStore()

  if (!adminToken) {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}
