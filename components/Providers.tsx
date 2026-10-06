'use client'

import { UserProvider } from '@/lib/userContext'
import { GlobalSearchProvider } from '@/lib/globalSearchContext'
import type { AppUser } from '@/lib/auth'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { accesoAsistente } from '@/lib/agente/alcance'
import InstallPWA from '@/components/ui/InstallPWA'
import NotifPrompt from '@/components/ui/NotifPrompt'
import OfflineBadge from '@/components/ui/OfflineBadge'
import GlobalSearch from '@/components/ui/GlobalSearch'

// Sólo quien tiene acceso al asistente (lib/agente/alcance.ts) y sólo en el navegador: el código del chat no se descarga para el resto.
const AgenteFlotante = dynamic(() => import('@/components/agente/AgenteFlotante'), { ssr: false })

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
        {/* Admins y puede_usar_asistente: toda la base. Vendedores con cartera: modo cartera (lib/agente/alcance.ts). */}
        {accesoAsistente(initialUser ?? null) && <AgenteFlotante />}
      </GlobalSearchProvider>
    </UserProvider>
  )
}
