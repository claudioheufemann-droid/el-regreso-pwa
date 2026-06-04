'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPass]   = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [googleLoading, setGLoading]  = useState(false)
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
        @keyframes lr-spin {
          from { transform: rotate(0deg) } to { transform: rotate(360deg) }
        }
        .lr-input::placeholder { color: rgba(255,255,255,0.22); }
        .lr-input:-webkit-autofill,
        .lr-input:-webkit-autofill:hover,
        .lr-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px #111009 inset;
          -webkit-text-fill-color: #E8DFC8;
          transition: background-color 5000s ease-in-out 0s;
        }
        .lr-input:focus { outline: none; }
        .lr-input:focus { border-color: rgba(212,175,55,0.45) !important; background: #181408 !important; }
        .lr-submit:hover:not(:disabled) {
          background: #C8A42A !important;
          box-shadow: 0 6px 24px rgba(212,175,55,0.28) !important;
        }
        .lr-google:hover:not(:disabled) {
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.2) !important;
        }
        .lr-forgot:hover { color: #D4AF37 !important; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: '#0A0906',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'system-ui', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        overflowX: 'hidden',
      }}>

        {/* ══════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════ */}
        <div style={{
          position: 'relative',
          height: '52vh',
          minHeight: 320,
          maxHeight: 460,
          overflow: 'hidden',
          flexShrink: 0,
        }}>

          {/* Foto */}
          <Image
            src="/vehicles/fleet.jpg"
            alt="El Regreso Beer Co."
            fill
            style={{
              objectFit: 'cover',
              objectPosition: 'center 38%',
              filter: 'brightness(0.62) saturate(0.88) contrast(1.08)',
            }}
            priority
          />

          {/* Gradiente oscuro principal */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `
              linear-gradient(
                180deg,
                rgba(10,9,6,0.38) 0%,
                rgba(10,9,6,0.10) 28%,
                rgba(10,9,6,0.55) 72%,
                #0A0906 100%
              )
            `,
          }} />

          {/* Viñeta lateral */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, rgba(10,9,6,0.45) 0%, transparent 30%, transparent 70%, rgba(10,9,6,0.45) 100%)',
          }} />

          {/* ── Overlay de datos (gráfico línea + barras) ── */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 400 240"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Línea tendencia ascendente */}
            <polyline
              points="0,195 35,188 68,178 100,182 135,162 168,155 200,148 232,138 265,122 298,108 330,95 365,82 400,70"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="1.8"
              opacity="0.55"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Área bajo la línea */}
            <polygon
              points="0,195 35,188 68,178 100,182 135,162 168,155 200,148 232,138 265,122 298,108 330,95 365,82 400,70 400,240 0,240"
              fill="url(#goldGrad)"
              opacity="0.08"
            />
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity="1"/>
                <stop offset="100%" stopColor="#D4AF37" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {/* Nodos en la línea */}
            {[[68,178],[168,155],[298,108],[400,70]].map(([cx,cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="3" fill="#D4AF37" opacity="0.75" />
            ))}

            {/* Barras verticales — esquina inferior derecha */}
            {[
              [280, 195, 12], [295, 185, 12], [310, 200, 12],
              [325, 175, 12], [340, 190, 12], [355, 170, 12],
              [370, 183, 12], [385, 160, 12],
            ].map(([x, y, h], i) => (
              <rect
                key={i}
                x={x} y={y}
                width={9} height={h}
                fill="#D4AF37"
                opacity={i === 7 ? 0.5 : 0.28}
                rx="1.5"
              />
            ))}

            {/* Puntos decorativos dispersos */}
            <circle cx="50" cy="155" r="1.5" fill="#D4AF37" opacity="0.3" />
            <circle cx="120" cy="130" r="1.5" fill="#D4AF37" opacity="0.3" />
            <circle cx="220" cy="110" r="1.5" fill="#D4AF37" opacity="0.25" />
          </svg>

          {/* ── Contenido hero: logo + título ── */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            paddingTop: 'max(env(safe-area-inset-top), 16px)',
            paddingBottom: 48,
            gap: 12,
          }}>
            {/* Logo */}
            <div style={{ position: 'relative', width: 84, height: 84 }}>
              <Image
                src="/logo.png"
                alt="El Regreso Beer Co."
                fill
                style={{
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 18px rgba(212,175,55,0.65)) drop-shadow(0 2px 10px rgba(0,0,0,0.9))',
                }}
                priority
              />
            </div>

            {/* Tipografía */}
            <div style={{ textAlign: 'center', userSelect: 'none' }}>
              <h1 style={{
                fontSize: 'clamp(28px, 7vw, 42px)',
                fontWeight: 900,
                letterSpacing: '6px',
                color: '#FFFFFF',
                textTransform: 'uppercase',
                margin: '0 0 2px',
                lineHeight: 1,
                textShadow: '0 2px 20px rgba(0,0,0,0.85)',
              }}>
                EL REGRESO
              </h1>

              {/* Línea decorativa + CONTROL */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '5px 0 0' }}>
                <div style={{ width: 22, height: 1, background: 'rgba(212,175,55,0.5)' }} />
                <p style={{
                  fontSize: 'clamp(14px, 3.5vw, 20px)',
                  fontWeight: 300,
                  letterSpacing: '10px',
                  color: '#D4AF37',
                  textTransform: 'uppercase',
                  margin: 0,
                  lineHeight: 1,
                }}>
                  CONTROL
                </p>
                <div style={{ width: 22, height: 1, background: 'rgba(212,175,55,0.5)' }} />
              </div>

              {/* Subtítulo */}
              <p style={{
                fontSize: 11.5,
                color: 'rgba(255,255,255,0.48)',
                margin: '10px 0 0',
                fontWeight: 400,
                letterSpacing: '0.3px',
              }}>
                Plataforma de Gestión Comercial y Operacional
              </p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            CARD LOGIN
        ══════════════════════════════════════════════ */}
        <div style={{
          flex: 1,
          background: '#161411',
          borderRadius: '22px 22px 0 0',
          marginTop: -22,
          padding: '30px 22px 44px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>

          <div style={{ width: '100%', maxWidth: 440 }}>

            {/* Encabezado card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(212,175,55,0.07)',
                border: '1px solid rgba(212,175,55,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(212,175,55,0.75)" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <h2 style={{
                  fontSize: 18, fontWeight: 700, color: '#F0E8D4',
                  margin: 0, lineHeight: 1.2, letterSpacing: '-0.2px',
                }}>
                  Bienvenido
                </h2>
                <p style={{
                  fontSize: 12.5, color: 'rgba(255,255,255,0.3)',
                  margin: '2px 0 0', fontWeight: 400,
                }}>
                  Ingresa tus credenciales para continuar.
                </p>
              </div>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>

              {/* Email */}
              <div>
                <label style={{
                  display: 'block', fontSize: 9, fontWeight: 700,
                  color: 'rgba(212,175,55,0.6)', letterSpacing: '2.5px',
                  textTransform: 'uppercase', marginBottom: 7,
                }}>
                  Correo Corporativo
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{
                    position: 'absolute', left: 14, top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'rgba(255,255,255,0.22)', flexShrink: 0,
                    pointerEvents: 'none',
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
                      width: '100%', padding: '14px 16px 14px 42px',
                      background: '#111009',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12, fontSize: 14, color: '#E8DFC8',
                      boxSizing: 'border-box', fontFamily: 'inherit',
                      transition: 'border-color 0.18s, background 0.18s',
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{
                  display: 'block', fontSize: 9, fontWeight: 700,
                  color: 'rgba(212,175,55,0.6)', letterSpacing: '2.5px',
                  textTransform: 'uppercase', marginBottom: 7,
                }}>
                  Contraseña
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} style={{
                    position: 'absolute', left: 14, top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'rgba(255,255,255,0.22)',
                    pointerEvents: 'none',
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
                      width: '100%', padding: '14px 46px 14px 42px',
                      background: '#111009',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12, fontSize: 14, color: '#E8DFC8',
                      boxSizing: 'border-box', fontFamily: 'inherit',
                      transition: 'border-color 0.18s, background 0.18s',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    style={{
                      position: 'absolute', right: 13, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(255,255,255,0.25)', padding: 4,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Olvidaste contraseña */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
                <button
                  type="button"
                  className="lr-forgot"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11.5, color: 'rgba(212,175,55,0.45)',
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
                  fontSize: 12, color: '#FF7575', textAlign: 'center',
                  background: 'rgba(255,107,107,0.06)', padding: '10px 14px',
                  borderRadius: 10, margin: 0,
                  border: '1px solid rgba(255,107,107,0.14)',
                }}>
                  {error}
                </p>
              )}

              {/* Botón Ingresar */}
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="lr-submit"
                style={{
                  width: '100%', padding: '15px 22px',
                  background: loading ? 'rgba(212,175,55,0.4)' : '#D4AF37',
                  border: 'none', borderRadius: 12,
                  fontSize: 13, fontWeight: 700, letterSpacing: '1.5px',
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
                      style={{ animation: 'lr-spin 0.8s linear infinite', flexShrink: 0 }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Verificando...
                  </>
                ) : (
                  <>
                    Ingresar
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
              </button>

              {/* Separador */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '1px' }}>o</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="lr-google"
                style={{
                  width: '100%', padding: '14px 16px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  fontSize: 13, fontWeight: 600, color: '#C8BEA4',
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(212,175,55,0.07)',
              border: '1px solid rgba(212,175,55,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 5,
            }}>
              {/* Trigo / shield */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l3 9H9l3-9z" fill="rgba(212,175,55,0.55)"/>
                <path d="M12 11v10" stroke="rgba(212,175,55,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9 15c-2-1-3-3-3-5h6" stroke="rgba(212,175,55,0.45)" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
                <path d="M15 15c2-1 3-3 3-5h-6" stroke="rgba(212,175,55,0.45)" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(244,238,223,0.55)', fontWeight: 600, margin: 0 }}>
              Cervecería El Regreso
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', margin: 0, fontWeight: 400 }}>
              Plataforma Corporativa
            </p>
            <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.4)', margin: '5px 0 0', fontWeight: 600, letterSpacing: '1.5px' }}>
              v2.0
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
