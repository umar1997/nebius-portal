import { create } from 'zustand'

interface AdminState {
  adminToken: string | null
  setAdminToken: (token: string) => void
  clearAdminToken: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
  adminToken: null,
  setAdminToken: (token) => set({ adminToken: token }),
  clearAdminToken: () => set({ adminToken: null }),
}))
