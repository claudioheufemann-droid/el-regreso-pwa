'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

const APP_URL = 'https://el-regreso-pwa.vercel.app'

export default function InstalarPage() {
  const [os, setOs] = useState<'ios' | 'android' | 'other'>('other')
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Detectar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    // Detectar OS
    const ua = navigator.userAgent
    if (/iphone|ipad|ipod/i.test(ua)) setOs('ios')
    else if (/android/i.test(ua)) setOs('android')
  }, [])

  if (installed) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h1 style={styles.title}>¡Ya está instalada!</h1>
          <p style={styles.sub}>La app El Regreso Control ya está en tu pantalla de inicio.</p>
          <a href="/" style={styles.btn}>Abrir la app</a>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo + título */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <Image src="/logo.png" alt="El Regreso" width={72} height={72}
            style={{ filter: 'invert(1)', borderRadius: 18, marginBottom: 12, border: '1px solid rgba(212,175,55,0.3)' }} />
          <h1 style={styles.title}>El Regreso Control</h1>
          <p style={styles.sub}>Instala la app en tu celular</p>
        </div>

        {/* URL para compartir / QR */}
        <div style={{
          marginBottom: 24, padding: '16px 18px', background: 'rgba(212,175,55,0.06)',
          borderRadius: 16, border: '1px solid rgba(212,175,55,0.18)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(212,175,55,0.6)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            Comparte este enlace con tu equipo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,175,55,0.2)',
              borderRadius: 8, padding: '9px 12px', fontSize: 11, color: '#D4AF37',
              fontFamily: 'monospace', letterSpacing: 0.3, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {APP_URL}/instalar
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(APP_URL + '/instalar')}
              style={{
                flexShrink: 0, padding: '9px 14px', background: '#D4AF37',
                border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 800,
                color: '#0A0A0A', cursor: 'pointer',
              }}
            >
              Copiar
            </button>
          </div>
        </div>

        {/* Tabs OS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4 }}>
          {(['ios', 'android'] as const).map(tab => (
            <button key={tab} onClick={() => setOs(tab)} style={{
              flex: 1, padding: '10px', border: 'none', borderRadius: 9, cursor: 'pointer',
              background: os === tab ? '#D4AF37' : 'transparent',
              color: os === tab ? '#0A0A0A' : 'rgba(255,255,255,0.4)',
              fontSize: 13, fontWeight: 800,
            }}>
              {tab === 'ios' ? '🍎 iPhone' : '🤖 Android'}
            </button>
          ))}
        </div>

        {/* iPhone steps */}
        {os === 'ios' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={styles.alertBox}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ fontSize: 13, color: '#E67E22', fontWeight: 600 }}>
                Debes usar <strong>Safari</strong>. No funciona en Chrome ni otro navegador.
              </span>
            </div>

            {[
              {
                n: '1',
                icon: '🌐',
                title: 'Abre Safari',
                desc: 'Busca Safari en tu iPhone y abre esta página:',
                extra: <div style={styles.urlBox}>{APP_URL}/instalar</div>,
              },
              {
                n: '2',
                icon: '⬆️',
                title: 'Toca el botón Compartir',
                desc: 'Es el ícono del cuadrado con flecha, en la barra inferior del navegador.',
                extra: (
                  <div style={styles.mockBar}>
                    <span style={{ opacity: 0.3, fontSize: 18 }}>◀</span>
                    <span style={{ opacity: 0.3, fontSize: 18 }}>▶</span>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 8, height: 32 }} />
                    <span style={{ fontSize: 22, color: '#D4AF37', fontWeight: 900 }}>⬆</span>
                    <span style={{ opacity: 0.3, fontSize: 18 }}>⧉</span>
                  </div>
                ),
              },
              {
                n: '3',
                icon: '📲',
                title: 'Toca "Añadir a pantalla de inicio"',
                desc: 'Desliza hacia abajo en el menú que aparece y selecciona esa opción.',
                extra: (
                  <div style={styles.menuMock}>
                    <div style={styles.menuItem}>
                      <span>📋</span><span>Copiar</span>
                    </div>
                    <div style={styles.menuItem}>
                      <span>🔖</span><span>Añadir marcador</span>
                    </div>
                    <div style={{ ...styles.menuItem, background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: 8 }}>
                      <span>➕</span><strong style={{ color: '#D4AF37' }}>Añadir a pantalla de inicio</strong>
                    </div>
                  </div>
                ),
              },
              {
                n: '4',
                icon: '✅',
                title: 'Toca "Añadir"',
                desc: 'Confirma arriba a la derecha. La app queda en tu pantalla de inicio.',
                extra: null,
              },
            ].map(step => (
              <div key={step.n} style={styles.step}>
                <div style={styles.stepNum}>{step.n}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>{step.icon}</span>
                    <strong style={{ fontSize: 14, color: '#F4EEDF' }}>{step.title}</strong>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px', lineHeight: 1.5 }}>{step.desc}</p>
                  {step.extra}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Android steps */}
        {os === 'android' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...styles.alertBox, borderColor: 'rgba(52,168,83,0.4)', background: 'rgba(52,168,83,0.08)' }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontSize: 13, color: '#34A853', fontWeight: 600 }}>
                En Android es más fácil. Usa <strong>Chrome</strong>.
              </span>
            </div>

            {[
              {
                n: '1',
                icon: '🌐',
                title: 'Abre Chrome',
                desc: 'Abre esta página en Google Chrome:',
                extra: <div style={styles.urlBox}>{APP_URL}</div>,
              },
              {
                n: '2',
                icon: '📲',
                title: 'Toca "Instalar app"',
                desc: 'Aparece un banner automático en la parte inferior. Toca el botón.',
                extra: (
                  <div style={{ background: '#1E1E1E', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/icon-72x72.png" alt="" style={{ width: 40, height: 40, borderRadius: 10 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#F4EEDF' }}>El Regreso Control</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Instala la app</div>
                    </div>
                    <div style={{ background: '#D4AF37', color: '#0A0A0A', fontSize: 11, fontWeight: 800, padding: '6px 12px', borderRadius: 8 }}>Instalar</div>
                  </div>
                ),
              },
              {
                n: '3',
                icon: '✅',
                title: '¡Listo!',
                desc: 'La app queda instalada en tu pantalla de inicio y menú de apps.',
                extra: null,
              },
            ].map(step => (
              <div key={step.n} style={styles.step}>
                <div style={styles.stepNum}>{step.n}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>{step.icon}</span>
                    <strong style={{ fontSize: 14, color: '#F4EEDF' }}>{step.title}</strong>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px', lineHeight: 1.5 }}>{step.desc}</p>
                  {step.extra}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>
            ¿Ya instalaste? Abre la app desde tu pantalla de inicio
          </p>
          <a href="/" style={styles.btn}>Ir a la aplicación →</a>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', background: '#07070D',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '24px 16px 48px', fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%', maxWidth: 480,
    background: '#0F0F18', border: '1px solid rgba(212,175,55,0.15)',
    borderRadius: 24, padding: '28px 24px',
  },
  title: { fontSize: 22, fontWeight: 900, color: '#F4EEDF', margin: '0 0 6px', textAlign: 'center', letterSpacing: -0.5 },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0, textAlign: 'center' },
  btn: {
    display: 'inline-block', padding: '14px 28px', background: '#D4AF37',
    color: '#0A0A0A', borderRadius: 12, fontWeight: 800, fontSize: 13,
    textDecoration: 'none', letterSpacing: 0.3,
  },
  step: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  stepNum: {
    width: 28, height: 28, borderRadius: '50%', background: 'rgba(212,175,55,0.15)',
    border: '1px solid rgba(212,175,55,0.35)', color: '#D4AF37',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 900, flexShrink: 0, marginTop: 2,
  },
  alertBox: {
    display: 'flex', gap: 10, alignItems: 'center',
    background: 'rgba(230,126,34,0.08)', border: '1px solid rgba(230,126,34,0.3)',
    borderRadius: 12, padding: '12px 14px',
  },
  urlBox: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '8px 12px', fontSize: 12,
    color: '#D4AF37', fontFamily: 'monospace', letterSpacing: 0.5,
  },
  mockBar: {
    background: '#1C1C1E', borderRadius: 12, padding: '10px 14px',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  menuMock: {
    background: '#1C1C1E', borderRadius: 12, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.6)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
}
