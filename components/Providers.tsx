'use client'

import { UserProvider } from '@/lib/userContext'
import type { AppUser } from '@/lib/auth'
import type { ReactNode } from 'react'

export default function Providers({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: AppUser | null
}) {
  return <UserProvider initialUser={initialUser}>{children}</UserProvider>
}
