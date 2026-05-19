'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      setError('Credenciales incorrectas')
      setLoading(false)
      return
    }

    // Fetch role to decide where to redirect
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (profile?.is_admin) {
        router.push('/')
      } else {
        router.push('/ventas')
      }
    } else {
      router.push('/')
    }

    router.refresh()
  }

  const inputBase = {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--cream)',
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 text-3xl"
            style={{ background: 'var(--gold)' }}
          >
            🍺
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--cream)' }}>El Regreso Beer</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Plataforma de Control</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@elregresobeer.com"
              required
              className="w-full px-4 py-3 rounded-xl placeholder-gray-600 outline-none transition-all"
              style={inputBase}
              onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl placeholder-gray-600 outline-none transition-all"
              style={inputBase}
              onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: '#FF4444' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-black transition-opacity mt-2"
            style={{ background: 'var(--gold)', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center mt-8 text-xs" style={{ color: 'var(--muted)' }}>
          Cervecería El Regreso · Valdivia, Chile
        </p>
      </div>
    </div>
  )
}
