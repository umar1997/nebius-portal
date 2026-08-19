import { create } from 'zustand'

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface AuthState {
  accessToken: string | null
  user: User | null
  isInitializing: boolean
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
  setInitialized: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitializing: true,
  setAuth: (token, user) => set({ accessToken: token, user, isInitializing: false }),
  clearAuth: () => set({ accessToken: null, user: null }),
  setInitialized: () => set({ isInitializing: false }),
}))
