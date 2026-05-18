'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type UserRole = 'admin' | 'vendedor'

export interface AppUser {
  nombre: string
  role: UserRole
}

interface UserContextType {
  user: AppUser | null
  setUser: (u: AppUser) => void
  logout: () => void
  isAdmin: boolean
  isLoaded: boolean
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  logout: () => {},
  isAdmin: false,
  isLoaded: false,
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AppUser | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('elregreso_user')
      if (stored) setUserState(JSON.parse(stored))
    } catch {}
    setIsLoaded(true)
  }, [])

  function setUser(u: AppUser) {
    setUserState(u)
    localStorage.setItem('elregreso_user', JSON.stringify(u))
  }

  function logout() {
    setUserState(null)
    localStorage.removeItem('elregreso_user')
  }

  return (
    <UserContext.Provider value={{
      user,
      setUser,
      logout,
      isAdmin: user?.role === 'admin',
      isLoaded,
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
