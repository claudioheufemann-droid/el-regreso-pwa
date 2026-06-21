'use client'

/**
 * Indicador global de conexión + sincronización pendiente.
 * Arranca el auto-flush de la cola offline (lib/offlineQueue) y muestra
 * un banner discreto cuando hay datos guardados localmente esperando subir.
 */
import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { startAutoFlush, onQueueChange } from '@/lib/offlineQueue'

export default function OfflineBadge() {
  const [online, setOnline] = useState(true)
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    startAutoFlush(supabase)

    setOnline(navigator.onLine)
    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const unsub = onQueueChange(setPendientes)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      unsub()
    }
  }, [])

  if (online && pendientes === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 'max(10px, env(safe-area-inset-top, 10px))', left: '50%',
      transform: 'translateX(-50%)', zIndex: 9500,
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '7px 14px', borderRadius: 20,
      background: online ? 'rgba(212,175,55,0.95)' : 'rgba(40,15,15,0.95)',
      border: `1px solid ${online ? 'rgba(212,175,55,0.4)' : 'rgba(248,113,113,0.4)'}`,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(8px)',
      fontSize: 11, fontWeight: 700,
      color: online ? '#080808' : '#F87171',
      whiteSpace: 'nowrap',
    }}>
      {online
        ? <><RefreshCw size={12} style={{ animation: 'sync-spin 1s linear infinite' }} /> Sincronizando {pendientes} pendiente{pendientes !== 1 ? 's' : ''}…</>
        : <><WifiOff size={12} /> Sin conexión{pendientes > 0 ? ` · ${pendientes} guardado${pendientes !== 1 ? 's' : ''} local` : ''}</>
      }
      <style>{`@keyframes sync-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
