'use client'

import { UserProvider } from '@/lib/userContext'
import type { AppUser } from '@/lib/auth'
import type { ReactNode } from 'react'
import InstallPWA from '@/components/ui/InstallPWA'
import NotifPrompt from '@/components/ui/NotifPrompt'

export default function Providers({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: AppUser | null
}) {
  return (
    <UserProvider initialUser={initialUser}>
      {children}
      <InstallPWA />
      {initialUser && <NotifPrompt />}
    </UserProvider>
  )
}
