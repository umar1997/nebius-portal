import { useAuthStore } from '../stores/useAuthStore'
import { useAdminStore } from '../stores/useAdminStore'

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function silentRefresh(): Promise<string | null> {
  if (isRefreshing) return refreshPromise!
  const rt = localStorage.getItem('refreshToken')
  if (!rt) return null

  isRefreshing = true
  refreshPromise = fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(({ accessToken }: { accessToken: string }) => {
      useAuthStore.getState().setAuth(accessToken, useAuthStore.getState().user!)
      return accessToken
    })
    .catch(() => {
      localStorage.removeItem('refreshToken')
      useAuthStore.getState().clearAuth()
      return null
    })
    .finally(() => {
      isRefreshing = false
      refreshPromise = null
    })

  return refreshPromise
}

async function request<T>(
  path: string,
  options: RequestInit & { adminAuth?: boolean; noAuth?: boolean; _retry?: boolean } = {}
): Promise<T> {
  const { adminAuth, noAuth, _retry, ...fetchOptions } = options

  let token: string | null = null
  if (!noAuth) {
    if (adminAuth) {
      token = useAdminStore.getState().adminToken
    } else {
      token = useAuthStore.getState().accessToken
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((fetchOptions.headers as Record<string, string>) || {}),
  }

  const res = await fetch(`/api${path}`, { ...fetchOptions, headers })

  // On 401 for user routes, try a silent token refresh once then retry
  if (res.status === 401 && !noAuth && !adminAuth && !_retry) {
    const newToken = await silentRefresh()
    if (newToken) {
      return request<T>(path, { ...options, _retry: true })
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `Request failed (${res.status})`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface App {
  id: string
  name: string
  host: string
  port: number
  type: 'react' | 'gradio' | 'other'
  description?: string
  created_at: string
}

export interface User {
  id: string
  name: string
  email: string
  role: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  signup: (data: { name: string; email: string; password: string; confirmPassword: string }) =>
    request<{ message: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
      noAuth: true,
    }),

  login: (data: { email: string; password: string }) =>
    request<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
      noAuth: true,
    }),

  refresh: (refreshToken: string) =>
    request<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      noAuth: true,
    }),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  me: (token: string) =>
    request<AuthUser>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      noAuth: true,
    }),
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export const adminApi = {
  login: (data: { email: string; password: string }) =>
    request<{ accessToken: string; refreshToken: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify(data),
      noAuth: true,
    }),

  getUsers: () =>
    request<{ users: User[] }>('/admin/users', { adminAuth: true }).then((r) => r.users),

  getPendingUsers: () =>
    request<{ users: User[] }>('/admin/users/pending', { adminAuth: true }).then((r) => r.users),

  approveUser: (id: string) =>
    request<{ user: User }>(`/admin/users/${id}/approve`, {
      method: 'PATCH',
      adminAuth: true,
    }),

  rejectUser: (id: string) =>
    request<{ user: User }>(`/admin/users/${id}/reject`, {
      method: 'PATCH',
      adminAuth: true,
    }),

  deleteUser: (id: string) =>
    request<void>(`/admin/users/${id}`, { method: 'DELETE', adminAuth: true }),

  getNotificationsCount: () =>
    request<{ pendingCount: number }>('/admin/notifications/count', { adminAuth: true }),
}

// ─── Apps API ─────────────────────────────────────────────────────────────────

export const appsApi = {
  list: () => request<{ apps: App[] }>('/apps').then((r) => r.apps),

  create: (data: Omit<App, 'id' | 'created_at'>) =>
    request<{ app: App }>('/apps', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Omit<App, 'id' | 'created_at'>>) =>
    request<{ app: App }>(`/apps/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/apps/${id}`, { method: 'DELETE' }),

  health: (id: string) =>
    request<{ healthy: boolean; status: number; host: string; port: number }>(
      `/apps/${id}/health`
    ),
}
