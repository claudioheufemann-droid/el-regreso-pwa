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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales incorrectas')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0F0F0F' }}>
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: '#F59E0B' }}>
            <span className="text-2xl font-black text-black">ER</span>
          </div>
          <h1 className="text-2xl font-bold text-white">El Regreso Beer</h1>
          <p className="text-sm mt-1" style={{ color: '#888' }}>Seguimiento de ventas</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#aaa' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@elregresobeer.com"
              required
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none focus:ring-2 transition-all"
              style={{ background: '#1A1A1A', border: '1px solid #2E2E2E' }}
              onFocus={e => (e.target.style.borderColor = '#F59E0B')}
              onBlur={e => (e.target.style.borderColor = '#2E2E2E')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#aaa' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none transition-all"
              style={{ background: '#1A1A1A', border: '1px solid #2E2E2E' }}
              onFocus={e => (e.target.style.borderColor = '#F59E0B')}
              onBlur={e => (e.target.style.borderColor = '#2E2E2E')}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-black transition-opacity mt-2"
            style={{ background: '#F59E0B', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
