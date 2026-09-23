'use client'

import { UserProvider } from '@/lib/userContext'
import { GlobalSearchProvider } from '@/lib/globalSearchContext'
import type { AppUser } from '@/lib/auth'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import InstallPWA from '@/components/ui/InstallPWA'
import NotifPrompt from '@/components/ui/NotifPrompt'
import OfflineBadge from '@/components/ui/OfflineBadge'
import GlobalSearch from '@/components/ui/GlobalSearch'

export default function Providers({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: AppUser | null
}) {
  // Limpiar badge al abrir la app y verificar SW de forma pasiva
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if ('clearAppBadge' in navigator) {
      (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {})
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({ type: 'CLEAR_BADGE' })
    }).catch(() => {})
  }, [])

  return (
    <UserProvider initialUser={initialUser}>
      <GlobalSearchProvider>
        {children}
        <InstallPWA />
        {initialUser && <NotifPrompt />}
        {initialUser && <OfflineBadge />}
        {initialUser && <GlobalSearch />}
      </GlobalSearchProvider>
    </UserProvider>
  )
}
