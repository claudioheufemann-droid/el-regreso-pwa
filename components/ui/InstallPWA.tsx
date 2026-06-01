'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPWA() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Ya instalada como PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // Ya descartado antes
    if (localStorage.getItem('pwa-dismissed') === 'true') {
      setDismissed(true)
      return
    }

    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Detectar iOS (Safari)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
    if (ios) {
      setIsIOS(true)
      setShowBanner(true)
      return
    }

    // Android / Chrome: escuchar evento beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function handleInstall() {
    if (prompt) {
      prompt.prompt()
      prompt.userChoice.then(({ outcome }) => {
        if (outcome === 'accepted') setIsInstalled(true)
        setShowBanner(false)
      })
    }
  }

  function handleDismiss() {
    localStorage.setItem('pwa-dismissed', 'true')
    setShowBanner(false)
    setDismissed(true)
  }

  if (isInstalled || dismissed || !showBanner) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      padding: '16px 16px max(16px, env(safe-area-inset-bottom))',
      background: 'rgba(10,10,10,0.97)',
      backdropFilter: 'blur(16px)',
      borderTop: '1px solid rgba(212,175,55,0.2)',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Ícono */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-72x72.png" alt="El Regreso" style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, border: '1px solid rgba(212,175,55,0.3)' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF', marginBottom: 2 }}>
            Instalar El Regreso Control
          </div>
          {isIOS ? (
            <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.5 }}>
              Toca <strong style={{ color: '#D4AF37' }}>Compartir</strong> <span style={{ fontSize: 14 }}>⬆</span> y luego{' '}
              <strong style={{ color: '#D4AF37' }}>&ldquo;Añadir a pantalla de inicio&rdquo;</strong>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.5 }}>
              Instala la app para acceso rápido desde tu pantalla de inicio
            </div>
          )}

          {!isIOS && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={handleInstall}
                style={{
                  flex: 1, padding: '10px 0', background: '#D4AF37', border: 'none',
                  borderRadius: 10, fontSize: 13, fontWeight: 800, color: '#0A0A0A',
                  cursor: 'pointer',
                }}
              >
                Instalar app
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  padding: '10px 14px', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                  fontSize: 12, color: '#7A7268', cursor: 'pointer',
                }}
              >
                Ahora no
              </button>
            </div>
          )}

          {isIOS && (
            <button
              onClick={handleDismiss}
              style={{
                marginTop: 8, background: 'none', border: 'none',
                fontSize: 11, color: '#5A5248', cursor: 'pointer', padding: 0,
              }}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
