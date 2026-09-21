'use client'

/**
 * Indicador global de conexión + sincronización pendiente.
 * Arranca el auto-flush de la cola offline (lib/offlineQueue) y muestra
 * un banner discreto cuando hay datos guardados localmente esperando subir.
 */
import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { startAutoFlush, onQueueChange, onSesionPerdida } from '@/lib/offlineQueue'
import { startPhotoAutoFlush, onPhotoQueueChange } from '@/lib/offlinePhotoQueue'

export default function OfflineBadge() {
  const [online, setOnline] = useState(true)
  const [pendientesDatos, setPendientesDatos] = useState(0)
  const [pendientesFotos, setPendientesFotos] = useState(0)
  const [sesionPerdida, setSesionPerdida] = useState(false)
  const pendientes = pendientesDatos + pendientesFotos

  useEffect(() => {
    const supabase = createClient()
    startAutoFlush(supabase)
    startPhotoAutoFlush(supabase)

    setOnline(navigator.onLine)
    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // El navegador pausa el timer de auto-refresh de supabase-js mientras la
    // pestaña/PWA está en segundo plano (pantalla apagada, app minimizada en
    // terreno). Sin esto el token queda vencido y el próximo flush de la
    // cola offline sale no-autenticado — ver lib/offlineQueue.ts.
    const onVisible = () => {
      if (document.visibilityState === 'visible') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    if (document.visibilityState === 'visible') supabase.auth.startAutoRefresh()

    const unsub1 = onQueueChange(setPendientesDatos)
    const unsub2 = onPhotoQueueChange(setPendientesFotos)
    // Sesión muerta (refresh token invalidado): antes esto era indistinguible
    // de un corte de red — se reintentaba en silencio, se descartaba a los
    // ~10min y el badge de "sincronizando" desaparecía como si todo hubiera
    // quedado guardado, aunque la visita/jornada nunca se cerró de verdad.
    const unsub3 = onSesionPerdida(setSesionPerdida)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      unsub1()
      unsub2()
      unsub3()
    }
  }, [])

  if (!sesionPerdida && online && pendientes === 0) return null

  if (sesionPerdida) {
    return (
      <button
        onClick={() => { window.location.href = '/login' }}
        style={{
          position: 'fixed', top: 'max(10px, var(--safe-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 9500, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 14px', borderRadius: 20, border: '1px solid rgba(248,113,113,0.5)',
          background: 'rgba(127,29,29,0.95)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)', fontSize: 11, fontWeight: 700,
          color: '#FEE2E2', whiteSpace: 'nowrap',
        }}
      >
        <AlertTriangle size={12} />
        Tu sesión expiró{pendientes > 0 ? ` · ${pendientes} sin guardar` : ''} · Toca para volver a entrar
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 'max(10px, var(--safe-top))', left: '50%',
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
