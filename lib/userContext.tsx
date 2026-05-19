'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { AppUser } from '@/lib/auth'

export type { AppUser }
export type UserRole = 'admin' | 'user'

interface UserContextType {
  user: AppUser | null
  isAdmin: boolean
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextType>({
  user: null,
  isAdmin: false,
  logout: async () => {},
})

export function UserProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: AppUser | null
}) {
  const router = useRouter()

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <UserContext.Provider
      value={{
        user: initialUser,
        isAdmin: initialUser?.isAdmin ?? false,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
