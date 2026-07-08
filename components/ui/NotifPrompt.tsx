'use client'

/**
 * NotifPrompt — aparece automáticamente en TODOS los módulos.
 * Solicita permiso de notificaciones para recibir alertas de:
 * ventas, camiones, visitas, misiones, tareas.
 */
import { useState, useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function NotifPrompt() {
  const [show, setShow]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [needsInstall, setNeedsInstall] = useState(false)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    // Ya está activo — no mostrar
    if (Notification.permission === 'granted') {
      // Pero sí enviar APP_OPENED para limpiar badge al abrir
      navigator.serviceWorker.ready.then(reg => {
        reg.active?.postMessage({ type: 'APP_OPENED' })
      }).catch(() => {})
      return
    }
    // Bloqueado — no podemos hacer nada
    if (Notification.permission === 'denied') return
    // Ya descartado en este dispositivo — no volver a molestar (por 1 día, para insistir hasta que se active)
    const dismissed = localStorage.getItem('notif-dismissed-until')
    if (dismissed && Date.now() < parseInt(dismissed)) return

    // iOS Safari solo soporta Web Push si la app está instalada (Agregar a inicio)
    setNeedsInstall(isIos() && !isStandalone())

    // Mostrar prompt después de 2s
    const t = setTimeout(() => setShow(true), 2000)
    return () => clearTimeout(t)
  }, [])

  // Enviar APP_OPENED al SW cada vez que el usuario usa la app
  // (limpia el badge del ícono)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({ type: 'APP_OPENED' })
    }).catch(() => {})
  }, [])

  function dismiss() {
    // Recordar por 1 día — insistir hasta que se active en todos los dispositivos
    localStorage.setItem('notif-dismissed-until', String(Date.now() + 86400000))
    setShow(false)
  }

  async function activate() {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setLoading(false); dismiss(); return }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { setLoading(false); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })

      localStorage.removeItem('notif-dismissed-until')
      setDone(true)
      setTimeout(() => setShow(false), 2200)
    } catch (e) {
      console.error('Push subscribe error:', e)
      setLoading(false)
      dismiss()
    }
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'max(90px, calc(80px + env(safe-area-inset-bottom, 0px)))',
      left: 14, right: 14, zIndex: 9000,
      background: 'linear-gradient(135deg, #0F0E1A 0%, #111018 100%)',
      border: '1px solid rgba(212,175,55,0.3)',
      borderRadius: 20,
      padding: '16px 18px',
      boxShadow: '0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.08)',
      display: 'flex', alignItems: 'flex-start', gap: 14,
      animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
    }}>
      <style>{`@keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* Ícono */}
      <div style={{
        width: 44, height: 44, borderRadius: 13, flexShrink: 0,
        background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>
        🔔
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {done ? (
          <>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#4ADE80', marginBottom: 3 }}>
              ✓ Notificaciones activadas
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Recibirás alertas de ventas, camiones, visitas y tareas.
            </p>
          </>
        ) : needsInstall ? (
          <>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F0EDE8', marginBottom: 4 }}>
              Un paso más en iPhone
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55, marginBottom: 14 }}>
              Safari solo activa notificaciones si la app está instalada. Toca <strong style={{ color: '#F0EDE8' }}>Compartir</strong> (el ícono cuadrado con flecha) y luego <strong style={{ color: '#F0EDE8' }}>&quot;Agregar a inicio&quot;</strong>. Abre la app desde ese ícono y vuelve a activar aquí.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={dismiss}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 13, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
                }}
              >
                Entendido
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F0EDE8', marginBottom: 4 }}>
              Activar notificaciones
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55, marginBottom: 14 }}>
              Entérate al instante de ventas cargadas, camiones en ruta, visitas completadas, misiones con pedido y nuevas tareas.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={activate}
                disabled={loading}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #E5C45A, #B8962E)',
                  color: '#080808', fontSize: 13, fontWeight: 900,
                  opacity: loading ? 0.7 : 1,
                  boxShadow: '0 4px 18px rgba(212,175,55,0.3)',
                  letterSpacing: '-0.2px',
                }}
              >
                {loading ? 'Activando…' : 'Activar ahora'}
              </button>
              <button
                onClick={dismiss}
                style={{
                  padding: '11px 16px', borderRadius: 13, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600,
                }}
              >
                Después
              </button>
            </div>
          </>
        )}
      </div>

      {!done && (
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1, padding: 0 }}
        >
          ×
        </button>
      )}
    </div>
  )
}
