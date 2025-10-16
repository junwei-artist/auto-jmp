'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi } from './api'

interface User {
  id: string
  email: string
  is_admin: boolean
  is_guest: boolean
  created_at?: string
  last_login?: string
}

interface AuthContextType {
  user: User | null
  login: (accessToken: string, refreshToken: string, userId: string, isGuest: boolean, isAdmin: boolean) => void
  logout: () => void
  register: (email: string, password: string) => Promise<void>
  createGuestSession: () => Promise<void>
  isLoading: boolean
  ready: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Check for existing session on mount
    const token = localStorage.getItem('access_token')
    const userId = localStorage.getItem('user_id')
    const isGuest = localStorage.getItem('is_guest') === 'true'
    
    if (token && userId) {
      // Validate token and get user info from backend
      validateTokenAndGetUser()
    } else {
      setIsLoading(false)
      setReady(true)       // ✅ Mark ready even if no session
    }
  }, [])

  const validateTokenAndGetUser = async () => {
    try {
      const userData = await authApi.getCurrentUser()
      setUser({
        id: userData.id,
        email: userData.email,
        is_admin: userData.is_admin,
        is_guest: userData.is_guest,
        created_at: userData.created_at,
        last_login: userData.last_login,
      })
    } catch (error) {
      console.error('Token validation failed:', error)
      // Clear invalid tokens
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_id')
      localStorage.removeItem('is_guest')
      setUser(null)
    } finally {
      setIsLoading(false)
      setReady(true)       // ✅ Always mark auth ready after validation finishes
    }
  }

  const login = (accessToken: string, refreshToken: string, userId: string, isGuest: boolean, isAdmin: boolean) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    localStorage.setItem('user_id', userId)
    localStorage.setItem('is_guest', isGuest.toString())
    
    // Get user info from backend
    validateTokenAndGetUser()
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('is_guest')
    setUser(null)
  }

  const register = async (email: string, password: string) => {
    const response = await authApi.register(email, password)
    login(
      response.access_token,
      response.refresh_token,
      response.user_id,
      response.is_guest,
      response.is_admin
    )
  }

  const createGuestSession = async () => {
    const response = await authApi.createGuestSession()
    login(
      response.access_token,
      '', // Guest tokens don't have refresh tokens
      response.user_id,
      response.is_guest,
      false // Guests are not admin
    )
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, register, createGuestSession, isLoading, ready }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useAuthReady() {
  const { ready, user } = useAuth()
  return { isAuthReady: ready && !!user }
}
