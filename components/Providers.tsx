'use client'

import { UserProvider } from '@/lib/userContext'
import type { AppUser } from '@/lib/auth'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import InstallPWA from '@/components/ui/InstallPWA'
import NotifPrompt from '@/components/ui/NotifPrompt'

export default function Providers({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: AppUser | null
}) {
  // Limpiar badge al abrir la app
  useEffect(() => {
    if ('clearAppBadge' in navigator) {
      (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {})
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.active?.postMessage({ type: 'CLEAR_BADGE' })
      }).catch(() => {})
    }
  }, [])

  return (
    <UserProvider initialUser={initialUser}>
      {children}
      <InstallPWA />
      {initialUser && <NotifPrompt />}
    </UserProvider>
  )
}
