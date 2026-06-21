'use client'

import { UserProvider } from '@/lib/userContext'
import type { AppUser } from '@/lib/auth'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import InstallPWA from '@/components/ui/InstallPWA'
import NotifPrompt from '@/components/ui/NotifPrompt'
import OfflineBadge from '@/components/ui/OfflineBadge'

export default function Providers({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: AppUser | null
}) {
  // Cuando el SW nuevo toma control → recargar para mostrar contenido actualizado
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    // Forzar que el SW nuevo instale y tome control inmediatamente
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.update())
    }).catch(() => {})
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

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

  // Forzar actualización de caché cuando hay nueva versión del SW
  useEffect(() => {
    const CURRENT_CACHE = 'el-regreso-v20'
    const FLAG = 'sw-cache-cleared-v20'

    if (!('serviceWorker' in navigator) || sessionStorage.getItem(FLAG)) return

    async function clearAndUpdate() {
      try {
        // Revisar si existe caché vieja
        const keys = await caches.keys()
        const hasOld = keys.some(k => k !== CURRENT_CACHE)
        if (!hasOld) return

        // Forzar update del SW registrado
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.update()))

        // Borrar todas las caches viejas
        await Promise.all(keys.filter(k => k !== CURRENT_CACHE).map(k => caches.delete(k)))

        sessionStorage.setItem(FLAG, '1')
        window.location.reload()
      } catch {
        // Silencioso — no bloquear la app
      }
    }

    clearAndUpdate()
  }, [])

  return (
    <UserProvider initialUser={initialUser}>
      {children}
      <InstallPWA />
      {initialUser && <NotifPrompt />}
      {initialUser && <OfflineBadge />}
    </UserProvider>
  )
}
