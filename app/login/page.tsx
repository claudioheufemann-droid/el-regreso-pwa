'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

function LaIdaLogoLogin() {
  const [useImg, setUseImg] = useState(true)
  if (useImg) {
    return (
      <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
        <Image src="/logo-laida.png" alt="La Ida Kombucha" fill
          style={{ objectFit: 'contain', filter: 'invert(1) drop-shadow(0 0 10px rgba(255,255,255,0.2))' }}
          onError={() => setUseImg(false)} priority />
      </div>
    )
  }
  return (
    <svg width="100" height="100" viewBox="0 0 200 200" fill="none">
      <path d="M20 110 A80 80 0 0 1 180 110" stroke="white" strokeWidth="7" fill="none" strokeLinecap="round"/>
      <path d="M40 110 L75 55 L100 80 L125 45 L160 110Z" fill="white" opacity="0.9"/>
      <path d="M85 110 Q100 130 130 155 Q150 165 170 168" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.9"/>
      <line x1="112" y1="138" x2="112" y2="155" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <rect x="108" y="130" width="14" height="9" rx="2" fill="white" opacity="0.9"/>
      <rect x="18" y="150" width="164" height="38" rx="8" fill="white"/>
      <text x="100" y="164" textAnchor="middle" fontSize="10" fontWeight="900" fill="#0a0a0a" fontFamily="system-ui" letterSpacing="2">LA IDA</text>
      <text x="100" y="178" textAnchor="middle" fontSize="8" fontWeight="700" fill="#333" fontFamily="system-ui" letterSpacing="3">KOMBUCHA</text>
    </svg>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError('')
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'elregresobeer.com' }, // restringe al dominio corporativo
      },
    })
    if (oauthError) {
      setError('Error al conectar con Google. Intenta con email y contraseña.')
      setGoogleLoading(false)
    }
    // Si no hay error, el navegador redirige a Google — no hacemos nada más
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
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      router.push(profile?.is_admin ? '/' : '/ventas')
    } else {
      router.push('/')
    }
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0A0A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Logos — El Regreso + La Ida */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 28 }}>
          <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
            <Image
              src="/logo.png"
              alt="El Regreso Beer Co."
              fill
              style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 24px rgba(212,175,55,0.55))' }}
              priority
            />
          </div>
          <div style={{ width: 1, height: 70, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.18), transparent)', flexShrink: 0 }} />
          <LaIdaLogoLogin />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 900, letterSpacing: '3px',
            color: '#D4AF37', textTransform: 'uppercase', margin: 0,
            lineHeight: 1.1,
          }}>
            El Regreso Control
          </h1>
          <p style={{
            fontSize: 11, color: '#7A7268', marginTop: 8,
            letterSpacing: '3px', textTransform: 'uppercase', fontWeight: 500,
          }}>
            Sistema Operativo Ejecutivo
          </p>
        </div>

        {/* Form Card */}
        <div style={{
          background: '#141414',
          border: '1px solid rgba(212,175,55,0.15)',
          borderRadius: 20,
          padding: '32px 28px',
        }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Email */}
            <div>
              <label style={{
                display: 'block', fontSize: 10, fontWeight: 700,
                color: '#D4AF37', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8,
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@elregresobeer.com"
                required
                autoComplete="email"
                style={{
                  width: '100%', padding: '14px 16px',
                  background: '#F5F0E8', border: '1px solid rgba(212,175,55,0.2)',
                  borderRadius: 12, fontSize: 15, color: '#1A1410',
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
                onFocus={e => e.target.style.borderColor = '#D4AF37'}
                onBlur={e => e.target.style.borderColor = 'rgba(212,175,55,0.2)'}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block', fontSize: 10, fontWeight: 700,
                color: '#D4AF37', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8,
              }}>
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  autoComplete="current-password"
                  style={{
                    width: '100%', padding: '14px 48px 14px 16px',
                    background: '#F5F0E8', border: '1px solid rgba(212,175,55,0.2)',
                    borderRadius: 12, fontSize: 15, color: '#1A1410',
                    outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => e.target.style.borderColor = '#D4AF37'}
                  onBlur={e => e.target.style.borderColor = 'rgba(212,175,55,0.2)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: 14, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#8A7A60', padding: 4, display: 'flex',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p style={{
                fontSize: 12, color: '#FF6B6B', textAlign: 'center',
                background: 'rgba(255,107,107,0.08)', padding: '10px 14px',
                borderRadius: 8, margin: 0,
              }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              style={{
                width: '100%', padding: '16px',
                background: loading ? '#8A7030' : '#D4AF37',
                border: 'none', borderRadius: 12,
                fontSize: 12, fontWeight: 800, letterSpacing: '2.5px',
                textTransform: 'uppercase', color: '#0A0A0A',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, transform 0.1s',
                marginTop: 4,
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#C9A430' }}
              onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#D4AF37' }}
            >
              {loading ? 'Verificando...' : 'Ingresar al Sistema'}
            </button>

            {/* Separador */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(212,175,55,0.15)' }} />
              <span style={{ fontSize: 10, color: '#5A5248', letterSpacing: 1, textTransform: 'uppercase' }}>o</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(212,175,55,0.15)' }} />
            </div>

            {/* Google OAuth */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              style={{
                width: '100%', padding: '14px 16px',
                background: googleLoading ? '#1C1C1C' : '#1F1F1F',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                fontSize: 13, fontWeight: 700, color: '#E8DFC8',
                cursor: googleLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'background 0.15s',
                opacity: googleLoading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!googleLoading) (e.currentTarget as HTMLElement).style.background = '#2A2A2A' }}
              onMouseLeave={e => { if (!googleLoading) (e.currentTarget as HTMLElement).style.background = '#1F1F1F' }}
            >
              {/* Google icon */}
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {googleLoading ? 'Redirigiendo a Google...' : 'Continuar con Google Workspace'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center', fontSize: 11, color: '#3A3530',
          marginTop: 24, letterSpacing: '0.5px',
        }}>
          Acceso restringido — Cervecería El Regreso
        </p>
      </div>
    </div>
  )
}
