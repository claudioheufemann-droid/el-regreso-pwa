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
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    if (localStorage.getItem('pwa-dismissed') === 'true') {
      setDismissed(true)
      return
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream
    if (ios) {
      setIsIOS(true)
      setShowBanner(true)
      return
    }

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
      background: 'rgba(8,8,12,0.97)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(212,175,55,0.25)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* iOS — pasos visuales */}
      {isIOS && (
        <div style={{ padding: '16px 18px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: showSteps ? 16 : 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-72x72.png" alt="El Regreso" style={{
              width: 44, height: 44, borderRadius: 11, flexShrink: 0,
              border: '1px solid rgba(212,175,55,0.3)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF', letterSpacing: -0.2 }}>
                Instalar El Regreso Control
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                Agrégala a tu pantalla de inicio
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => setShowSteps(s => !s)}
                style={{
                  padding: '7px 13px', background: 'rgba(212,175,55,0.15)',
                  border: '1px solid rgba(212,175,55,0.35)', borderRadius: 20,
                  fontSize: 11, fontWeight: 700, color: '#D4AF37', cursor: 'pointer',
                }}
              >
                {showSteps ? 'Cerrar' : 'Cómo →'}
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  width: 30, height: 30, background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%',
                  fontSize: 14, color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          </div>

          {/* Pasos expandibles */}
          {showSteps && (
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
            }}>
              {[
                {
                  icon: '⚠️',
                  color: '#E67E22',
                  text: <>Abre esta página en <strong style={{ color: '#E67E22' }}>Safari</strong> (no Chrome)</>,
                },
                {
                  icon: '⬆',
                  color: '#D4AF37',
                  text: <>Toca el ícono <strong style={{ color: '#D4AF37' }}>Compartir</strong> en la barra de Safari</>,
                  hint: 'El cuadrado con flecha arriba, en el centro de la barra inferior',
                },
                {
                  icon: '➕',
                  color: '#4A7A3A',
                  text: <>Selecciona <strong style={{ color: '#4A7A3A' }}>&ldquo;Añadir a pantalla de inicio&rdquo;</strong></>,
                  hint: 'Desliza el menú hacia abajo para encontrar la opción',
                },
                {
                  icon: '✅',
                  color: '#4A7A3A',
                  text: <>Toca <strong style={{ color: '#4A7A3A' }}>Añadir</strong> (arriba a la derecha) y listo</>,
                },
              ].map((step, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: '11px 14px', alignItems: 'flex-start',
                  borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: `${step.color}18`, border: `1px solid ${step.color}35`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: i === 1 ? 14 : 13, color: step.color, fontWeight: 900,
                  }}>{step.icon}</div>
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{step.text}</div>
                    {step.hint && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{step.hint}</div>
                    )}
                  </div>
                </div>
              ))}

              {/* Safari mockbar hint */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>Barra de Safari</div>
                <div style={{
                  background: '#1C1C1E', borderRadius: 10, padding: '8px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 16, opacity: 0.3 }}>◀</span>
                  <span style={{ fontSize: 16, opacity: 0.3 }}>▶</span>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 6, height: 26 }} />
                  <span style={{ fontSize: 20, color: '#D4AF37', fontWeight: 900 }}>⬆</span>
                  <span style={{ fontSize: 16, opacity: 0.3 }}>⧉</span>
                </div>
                <div style={{ fontSize: 10, color: '#D4AF37', marginTop: 5, textAlign: 'center', fontWeight: 600 }}>
                  ↑ Toca este ícono
                </div>
              </div>
            </div>
          )}

          {!showSteps && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <a href="/instalar" style={{ fontSize: 10, color: 'rgba(212,175,55,0.6)', textDecoration: 'none' }}>
                Ver guía completa
              </a>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>
          )}
        </div>
      )}

      {/* Android / Chrome — botón directo */}
      {!isIOS && (
        <div style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-72x72.png" alt="El Regreso" style={{
            width: 44, height: 44, borderRadius: 11, flexShrink: 0,
            border: '1px solid rgba(212,175,55,0.3)',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#F4EEDF' }}>Instalar El Regreso Control</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Acceso rápido desde tu pantalla de inicio</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleInstall}
              style={{
                padding: '9px 16px', background: '#D4AF37', border: 'none',
                borderRadius: 10, fontSize: 12, fontWeight: 800, color: '#0A0A0A',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Instalar
            </button>
            <button
              onClick={handleDismiss}
              style={{
                width: 30, height: 30, background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%',
                fontSize: 14, color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
