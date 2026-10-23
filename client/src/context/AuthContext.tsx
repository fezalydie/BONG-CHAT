import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from '@/lib/api'
import type { AuthUser } from '@/types/user'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (data: { identifier: string; password: string }) => Promise<void>
  register: (data: { username: string; email: string; displayName?: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  unreadNotifications: number
  setUnreadNotifications: Dispatch<SetStateAction<number>>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await api<any>('/auth/me')
      setUser(data.user)
      setUnreadNotifications(data.unreadNotifications ?? 0)
    } catch {
      setUser(null)
      setUnreadNotifications(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // The API layer fires this when a request comes back 401 after the session
  // has expired. Clearing the user sends ProtectedRoute back to /auth.
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      setUnreadNotifications(0)
    }
    window.addEventListener('bongchat:unauthorized', onUnauthorized)
    return () => window.removeEventListener('bongchat:unauthorized', onUnauthorized)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (payload: { identifier: string; password: string }) => {
        const data = await api<any>('/auth/login', { method: 'POST', body: JSON.stringify(payload) })
        setUser(data.user)
        setUnreadNotifications(data.unreadNotifications ?? 0)
      },
      register: async (payload: { username: string; email: string; displayName?: string; password: string }) => {
        const data = await api<any>('/auth/register', { method: 'POST', body: JSON.stringify(payload) })
        setUser(data.user)
        setUnreadNotifications(data.unreadNotifications ?? 0)
      },
      logout: async () => {
        await api<any>('/auth/logout', { method: 'POST' })
        setUser(null)
        setUnreadNotifications(0)
      },
      refresh,
      setUser,
      unreadNotifications,
      setUnreadNotifications,
    }),
    [user, loading, unreadNotifications],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
