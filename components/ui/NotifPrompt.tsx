'use client'

/**
 * NotifPrompt — aparece automáticamente si el usuario no tiene
 * notificaciones activadas. Se descarta y no vuelve a aparecer.
 */
import { useState, useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function NotifPrompt() {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // No mostrar si: no soportado, ya granted, ya descartado
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission === 'granted') return
    if (Notification.permission === 'denied') return
    if (localStorage.getItem('notif-prompt-dismissed') === 'true') return

    // Esperar 3s para no aparecer inmediatamente al entrar
    const t = setTimeout(() => setShow(true), 3000)
    return () => clearTimeout(t)
  }, [])

  function dismiss() {
    localStorage.setItem('notif-prompt-dismissed', 'true')
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
      if (!vapidKey) { setLoading(false); dismiss(); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })

      setDone(true)
      setTimeout(() => setShow(false), 2000)
    } catch (e) {
      console.error('Push subscribe error:', e)
      setLoading(false)
      dismiss()
    }
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 9000,
      background: '#111827',
      border: '1px solid rgba(59,130,246,0.35)',
      borderRadius: 18,
      padding: '16px 18px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.15)',
      display: 'flex', alignItems: 'flex-start', gap: 14,
      animation: 'slideUp 0.3s ease',
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Ícono */}
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
        🔔
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {done ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#4ADE80', marginBottom: 2 }}>✓ Notificaciones activadas</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Recibirás alertas de tareas en este dispositivo.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF', marginBottom: 3 }}>Activar notificaciones</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, marginBottom: 12 }}>
              Recibe alertas cuando te asignen tareas, haya comentarios o vencimientos.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={activate} disabled={loading} style={{
                flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                color: '#fff', fontSize: 13, fontWeight: 800,
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
              }}>
                {loading ? 'Activando...' : 'Activar ahora'}
              </button>
              <button onClick={dismiss} style={{
                padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.4)', fontSize: 12,
              }}>
                Después
              </button>
            </div>
          </>
        )}
      </div>

      {/* Cerrar */}
      {!done && (
        <button onClick={dismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 16, flexShrink: 0, lineHeight: 1, padding: 0 }}>✕</button>
      )}
    </div>
  )
}
