'use client'

import { useState, useEffect } from 'react'

export default function PushSubscribe() {
  const [status, setStatus] = useState<'idle' | 'granted' | 'denied' | 'unsupported' | 'loading'>('idle')

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported'); return
    }
    if (Notification.permission === 'granted') setStatus('granted')
    else if (Notification.permission === 'denied') setStatus('denied')
  }, [])

  async function subscribe() {
    if (!('serviceWorker' in navigator)) return
    setStatus('loading')
    try {
      // Registrar SW
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Pedir permiso
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); return }

      // Suscribir al push
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { setStatus('unsupported'); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      // Guardar en servidor
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })

      setStatus('granted')
    } catch (e) {
      console.error('Push subscribe error:', e)
      setStatus('idle')
    }
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(base64)
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
  }

  if (status === 'unsupported' || status === 'denied' || status === 'granted') return null

  return (
    <button
      onClick={subscribe}
      disabled={status === 'loading'}
      style={{
        padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
        background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
        fontSize: 10, fontWeight: 600, color: '#D4AF37', letterSpacing: 0.5,
        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        opacity: status === 'loading' ? 0.6 : 1,
      }}
    >
      🔔 {status === 'loading' ? 'Activando...' : 'Activar alertas'}
    </button>
  )
}
