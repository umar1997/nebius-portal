import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/useAuthStore'
import { authApi } from './lib/api'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import Toast from './components/Toast'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import AppGrid from './pages/AppGrid'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'

export default function App() {
  const { setAuth, setInitialized } = useAuthStore()

  // Silently restore the user session from a stored refresh token on page load.
  // This runs once — if it fails the user is treated as logged out.
  useEffect(() => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) {
      setInitialized()
      return
    }

    authApi
      .refresh(refreshToken)
      .then(async ({ accessToken }) => {
        const user = await authApi.me(accessToken)
        setAuth(accessToken, user)
      })
      .catch(() => {
        localStorage.removeItem('refreshToken')
        setInitialized()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrowserRouter>
      <Toast />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected — user */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppGrid />
            </RequireAuth>
          }
        />

        {/* Admin */}
        <Route path="/admin" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAdmin>
              <AdminUsers />
            </RequireAdmin>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
