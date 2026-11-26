import { create } from 'zustand'
import type { CurrentMembership, User } from '@/types'
import { apiService, setAccessToken } from '@/services/api'

interface AuthState {
  user: User | null
  currentOrg: CurrentMembership | null
  organizations: CurrentMembership[]
  isAuthenticated: boolean
  isLoading: boolean

  initAuth: () => Promise<void>
  login: (credentials: { email: string; password: string }) => Promise<void>
  register: (payload: {
    name: string
    email: string
    password: string
    organization_name: string
  }) => Promise<void>
  logout: () => Promise<void>
  updateUser: (updatedUser: Partial<User>) => void
  setCurrentOrg: (org: CurrentMembership) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  currentOrg: null,
  organizations: [],
  isAuthenticated: false,
  isLoading: true,

  initAuth: async () => {
    set({ isLoading: true })
    try {
      // Attempt silent session restoration via HttpOnly refresh cookie
      const tokenRes = await apiService.auth.refresh()
      setAccessToken(tokenRes.access_token)

      const me = await apiService.auth.getMe()
      set({
        user: me.user,
        currentOrg: me.current_organization,
        organizations: me.organizations,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch {
      setAccessToken(null)
      set({
        user: null,
        currentOrg: null,
        organizations: [],
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  login: async (credentials) => {
    set({ isLoading: true })
    try {
      const res = await apiService.auth.login(credentials)
      setAccessToken(res.access_token)

      const me = await apiService.auth.getMe()
      set({
        user: me.user,
        currentOrg: me.current_organization,
        organizations: me.organizations,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  register: async (payload) => {
    set({ isLoading: true })
    try {
      const res = await apiService.auth.register(payload)
      setAccessToken(res.access_token)

      const me = await apiService.auth.getMe()
      set({
        user: me.user,
        currentOrg: me.current_organization,
        organizations: me.organizations,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: async () => {
    set({ isLoading: true })
    try {
      await apiService.auth.logout()
    } catch {
      // Proceed with local cleanup regardless
    } finally {
      setAccessToken(null)
      set({
        user: null,
        currentOrg: null,
        organizations: [],
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  updateUser: (updated) => {
    const current = get().user
    if (current) {
      set({ user: { ...current, ...updated } })
    }
  },

  setCurrentOrg: (org) => {
    set({ currentOrg: org })
  },
}))
