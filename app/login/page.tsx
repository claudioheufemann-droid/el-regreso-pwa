'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <Image
            src="/logo.png"
            alt="El Regreso Beer Co."
            width={160}
            height={160}
            style={{ filter: 'invert(1)', objectFit: 'contain' }}
            priority
          />
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
              disabled={loading}
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
