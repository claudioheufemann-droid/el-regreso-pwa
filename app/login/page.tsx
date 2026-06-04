'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPass] = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [googleLoading, setGLoading]= useState(false)
  const router   = useRouter()
  const supabase = createClient()

  async function handleGoogleLogin() {
    setGLoading(true)
    setError('')
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'elregresobeer.com' },
      },
    })
    if (oauthError) {
      setError('Error al conectar con Google. Intenta con email y contraseña.')
      setGLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users').select('is_admin').eq('id', user.id).single()
      router.push(profile?.is_admin ? '/' : '/ventas')
    } else {
      router.push('/')
    }
    router.refresh()
  }

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
        .lr-input::placeholder { color: rgba(255,255,255,0.18); }
        .lr-input:-webkit-autofill,
        .lr-input:-webkit-autofill:hover,
        .lr-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px #0C0A07 inset;
          -webkit-text-fill-color: #E8DFC8;
          transition: background-color 5000s ease-in-out 0s;
        }
        .lr-input:focus { outline: none; }
        .lr-btn-submit:hover:not(:disabled) {
          background: #C9A430 !important;
          box-shadow: 0 8px 28px rgba(212,175,55,0.22) !important;
        }
        .lr-btn-google:hover:not(:disabled) {
          background: rgba(255,255,255,0.04) !important;
          border-color: rgba(255,255,255,0.18) !important;
        }
        .lr-forgot:hover { color: #D4AF37 !important; }
        @media (min-width: 900px) {
          .lr-root { flex-direction: row !important; }
          .lr-hero { width: 55% !important; height: 100vh !important; max-height: none !important; flex-shrink: 0 !important; }
          .lr-panel { width: 45% !important; justify-content: center !important; padding-top: 0 !important; overflow-y: auto; }
          .lr-panel-inner { margin-top: 0 !important; }
          .lr-subtitle { margin-top: 0 !important; }
        }
      `}</style>

      <div className="lr-root" style={{
        minHeight: '100vh',
        background: '#050402',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'system-ui', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>

        {/* ════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════ */}
        <div className="lr-hero" style={{
          position: 'relative',
          width: '100%',
          height: '52vh',
          minHeight: 300,
          maxHeight: 480,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Background image */}
          <Image
            src="/vehicles/fleet.jpg"
            alt="El Regreso Beer Co. — Flota de distribución"
            fill
            style={{ objectFit: 'cover', objectPosition: 'center 35%' }}
            priority
          />

          {/* Cinematic overlays */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(5,4,2,0.5) 0%, rgba(5,4,2,0.1) 30%, rgba(5,4,2,0.7) 75%, #050402 100%)',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, rgba(5,4,2,0.35) 100%)',
          }} />

          {/* Hero brand content */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 'env(safe-area-inset-top, 20px) 24px 56px',
            gap: 14,
          }}>
            {/* Logo */}
            <div style={{ position: 'relative', width: 86, height: 86 }}>
              <Image
                src="/logo.png"
                alt="El Regreso Beer Co."
                fill
                style={{
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 22px rgba(212,175,55,0.55)) drop-shadow(0 2px 12px rgba(0,0,0,0.9))',
                }}
                priority
              />
            </div>

            {/* Typography */}
            <div style={{ textAlign: 'center', userSelect: 'none' }}>
              <p style={{
                fontSize: 9.5, fontWeight: 600, letterSpacing: '5px',
                color: 'rgba(212,175,55,0.55)', textTransform: 'uppercase',
                margin: '0 0 6px',
              }}>
                Cervecería
              </p>
              <h1 style={{
                fontSize: 'clamp(30px, 7.5vw, 44px)',
                fontWeight: 900, letterSpacing: '5px',
                color: '#F4EEDF', textTransform: 'uppercase',
                margin: '0 0 4px', lineHeight: 1,
                textShadow: '0 2px 24px rgba(0,0,0,0.9)',
              }}>
                EL REGRESO
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ width: 28, height: 1, background: 'rgba(212,175,55,0.35)' }} />
                <p style={{
                  fontSize: 'clamp(13px, 3.2vw, 18px)',
                  fontWeight: 300, letterSpacing: '10px',
                  color: '#D4AF37', textTransform: 'uppercase',
                  margin: 0,
                }}>
                  CONTROL
                </p>
                <div style={{ width: 28, height: 1, background: 'rgba(212,175,55,0.35)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            PANEL LOGIN
        ════════════════════════════════════════════ */}
        <div className="lr-panel" style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 20px 48px',
        }}>

          <div className="lr-panel-inner" style={{
            width: '100%',
            maxWidth: 440,
            marginTop: -16,
          }}>

            {/* Subtitle */}
            <p className="lr-subtitle" style={{
              textAlign: 'center',
              fontSize: 10, color: 'rgba(212,175,55,0.38)',
              letterSpacing: '2px', textTransform: 'uppercase',
              margin: '0 0 24px', fontWeight: 500,
            }}>
              Plataforma de Gestión Comercial y Operacional
            </p>

            {/* ── Card ── */}
            <div style={{
              background: 'rgba(13, 11, 8, 0.96)',
              border: '1px solid rgba(212,175,55,0.1)',
              borderRadius: 22,
              padding: '28px 24px 24px',
              boxShadow: `
                0 32px 80px rgba(0,0,0,0.85),
                0 0 0 1px rgba(255,255,255,0.025) inset,
                0 1px 0 rgba(255,255,255,0.04) inset
              `,
            }}>

              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 26 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: 'rgba(212,175,55,0.07)',
                  border: '1px solid rgba(212,175,55,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(212,175,55,0.75)" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <h2 style={{
                    fontSize: 17, fontWeight: 700,
                    color: '#F0EAD8', margin: 0, lineHeight: 1.25,
                    letterSpacing: '-0.2px',
                  }}>
                    Bienvenido
                  </h2>
                  <p style={{
                    fontSize: 12, color: 'rgba(255,255,255,0.28)',
                    margin: '2px 0 0', fontWeight: 400, lineHeight: 1.4,
                  }}>
                    Ingresa tus credenciales para continuar.
                  </p>
                </div>
              </div>

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── Email ── */}
                <div>
                  <label style={{
                    display: 'block', fontSize: 9, fontWeight: 700,
                    color: 'rgba(212,175,55,0.5)', letterSpacing: '2.5px',
                    textTransform: 'uppercase', marginBottom: 7,
                  }}>
                    Correo Corporativo
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={14} style={{
                      position: 'absolute', left: 13, top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
                    }} />
                    <input
                      className="lr-input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="tu@elregresobeer.com"
                      required
                      autoComplete="email"
                      style={{
                        width: '100%', padding: '13px 16px 13px 40px',
                        background: '#0C0A07',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 11, fontSize: 14, color: '#E8DFC8',
                        boxSizing: 'border-box', fontFamily: 'inherit',
                        transition: 'border-color 0.2s, background 0.2s',
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = 'rgba(212,175,55,0.4)'
                        e.target.style.background   = '#131008'
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = 'rgba(255,255,255,0.07)'
                        e.target.style.background   = '#0C0A07'
                      }}
                    />
                  </div>
                </div>

                {/* ── Password ── */}
                <div>
                  <label style={{
                    display: 'block', fontSize: 9, fontWeight: 700,
                    color: 'rgba(212,175,55,0.5)', letterSpacing: '2.5px',
                    textTransform: 'uppercase', marginBottom: 7,
                  }}>
                    Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{
                      position: 'absolute', left: 13, top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
                    }} />
                    <input
                      className="lr-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Ingresa tu contraseña"
                      required
                      autoComplete="current-password"
                      style={{
                        width: '100%', padding: '13px 46px 13px 40px',
                        background: '#0C0A07',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 11, fontSize: 14, color: '#E8DFC8',
                        boxSizing: 'border-box', fontFamily: 'inherit',
                        transition: 'border-color 0.2s, background 0.2s',
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = 'rgba(212,175,55,0.4)'
                        e.target.style.background   = '#131008'
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = 'rgba(255,255,255,0.07)'
                        e.target.style.background   = '#0C0A07'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      style={{
                        position: 'absolute', right: 12, top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.22)', padding: 4,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Forgot password */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -2 }}>
                  <button
                    type="button"
                    className="lr-forgot"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, color: 'rgba(212,175,55,0.42)',
                      fontWeight: 500, padding: 0, fontFamily: 'inherit',
                      transition: 'color 0.15s',
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                {/* Error */}
                {error && (
                  <p style={{
                    fontSize: 12, color: '#FF7070', textAlign: 'center',
                    background: 'rgba(255,107,107,0.06)', padding: '10px 14px',
                    borderRadius: 9, margin: 0,
                    border: '1px solid rgba(255,107,107,0.14)',
                  }}>
                    {error}
                  </p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="lr-btn-submit"
                  style={{
                    width: '100%', padding: '15px 20px',
                    background: loading ? 'rgba(212,175,55,0.45)' : '#D4AF37',
                    border: 'none', borderRadius: 11,
                    fontSize: 12, fontWeight: 700, letterSpacing: '2px',
                    textTransform: 'uppercase', color: '#0A0700',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s, box-shadow 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    marginTop: 4,
                  }}
                >
                  {loading ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Verificando...
                    </>
                  ) : (
                    <>
                      Ingresar
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </>
                  )}
                </button>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                  <span style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.18)',
                    letterSpacing: '1px', textTransform: 'uppercase',
                  }}>o</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                </div>

                {/* Google */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading || loading}
                  className="lr-btn-google"
                  style={{
                    width: '100%', padding: '13px 16px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 11,
                    fontSize: 13, fontWeight: 600, color: '#BFB59A',
                    cursor: googleLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    transition: 'background 0.15s, border-color 0.15s',
                    opacity: googleLoading ? 0.55 : 1,
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {googleLoading ? 'Redirigiendo a Google...' : 'Continuar con Google Workspace'}
                </button>

              </form>
            </div>

            {/* ── Footer ── */}
            <div style={{
              marginTop: 36,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            }}>
              {/* Shield icon */}
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(212,175,55,0.06)',
                border: '1px solid rgba(212,175,55,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 6,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                    stroke="rgba(212,175,55,0.55)" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                  {/* Wheat grain detail */}
                  <path d="M9 11.5c1-1 2.5-1 3 0M12 11.5v3" stroke="rgba(212,175,55,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p style={{
                fontSize: 13, color: 'rgba(244,238,223,0.55)',
                fontWeight: 600, margin: 0, letterSpacing: '0.2px',
              }}>
                Cervecería El Regreso
              </p>
              <p style={{
                fontSize: 11, color: 'rgba(255,255,255,0.17)',
                margin: 0, fontWeight: 400,
              }}>
                Plataforma Corporativa
              </p>
              <p style={{
                fontSize: 10, color: 'rgba(212,175,55,0.35)',
                margin: '5px 0 0', fontWeight: 600, letterSpacing: '1.5px',
              }}>
                v2.0
              </p>
            </div>

          </div>
        </div>

      </div>
    </>
  )
}
