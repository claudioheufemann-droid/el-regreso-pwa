'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, CheckCircle2 } from 'lucide-react'

/**
 * Destino final del link de recuperación de contraseña (ver botón "¿Olvidaste
 * tu contraseña?" en /login → resetPasswordForEmail con
 * redirectTo=/auth/callback?next=/reset-password). Al llegar acá ya hay una
 * sesión temporal de recuperación activa (el intercambio de código ocurrió en
 * /auth/callback) — esta página sólo pide la contraseña nueva y llama a
 * updateUser(), no valida credenciales de nuevo.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [checkingSesion, setCheckingSesion] = useState(true)
  const [haySesion, setHaySesion] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHaySesion(!!user)
      setCheckingSesion(false)
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError('No se pudo actualizar la contraseña. El link puede haber expirado — pide uno nuevo.')
      return
    }
    setDone(true)
    setTimeout(() => router.push('/'), 2500)
  }

  return (
    <div style={{
      height: '100dvh', minHeight: '100dvh', background: '#050402',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: "'system-ui',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <style>{`
        .rp-input::placeholder { color: rgba(255,255,255,0.2); }
        .rp-input:focus { outline:none; border-color:rgba(212,175,55,0.45)!important; background:#141008!important; }
        .rp-submit:hover:not(:disabled) { background:#C8A42A!important; }
      `}</style>

      <div style={{ position: 'relative', width: 64, height: 64, marginBottom: 20 }}>
        <Image src="/logo.png" alt="El Regreso" fill sizes="64px" style={{ objectFit: 'contain' }} />
      </div>

      <div style={{
        width: '100%', maxWidth: 420, border: '1px solid rgba(212,175,55,0.4)', borderRadius: 20,
        background: '#13110D', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', padding: '24px 22px',
      }}>
        {checkingSesion ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '20px 0' }}>
            Verificando link…
          </p>
        ) : done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle2 size={40} style={{ color: '#4ADE80', margin: '0 auto 14px' }} />
            <p style={{ color: '#F0E8D4', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Contraseña actualizada</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12.5 }}>Entrando…</p>
          </div>
        ) : !haySesion ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <p style={{ color: '#F0E8D4', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Link inválido o vencido</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12.5, marginBottom: 18 }}>
              Pide un nuevo correo de recuperación desde la pantalla de inicio de sesión.
            </p>
            <button onClick={() => router.push('/login')} style={{
              background: '#D4AF37', color: '#080808', border: 'none', borderRadius: 11,
              padding: '11px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              Ir a inicio de sesión
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F0E8D4', margin: '0 0 4px' }}>Nueva contraseña</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '0 0 18px' }}>
              Elige una contraseña nueva para tu cuenta.
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.55)',
                  letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 6 }}>
                  Contraseña nueva
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={13} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                    color: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
                  <input className="rp-input" type={showPassword ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required
                    autoComplete="new-password"
                    style={{ width: '100%', padding: '11px 44px 11px 38px', background: '#0E0C09',
                      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, fontSize: 14, color: '#E8DFC8',
                      boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 4,
                    display: 'flex', alignItems: 'center' }}>
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.55)',
                  letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 6 }}>
                  Confirmar contraseña
                </label>
                <input className="rp-input" type={showPassword ? 'text' : 'password'} value={confirm}
                  onChange={e => setConfirm(e.target.value)} placeholder="Repite la contraseña" required
                  autoComplete="new-password"
                  style={{ width: '100%', padding: '11px 14px', background: '#0E0C09',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, fontSize: 14, color: '#E8DFC8',
                    boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              {error && (
                <p style={{ fontSize: 11.5, color: '#FF7575', textAlign: 'center', background: 'rgba(255,107,107,0.06)',
                  padding: '8px 12px', borderRadius: 9, margin: 0, border: '1px solid rgba(255,107,107,0.14)' }}>{error}</p>
              )}

              <button type="submit" className="rp-submit" disabled={loading} style={{
                background: '#D4AF37', color: '#080808', border: 'none', borderRadius: 11, padding: '12px 0',
                fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4,
                opacity: loading ? 0.6 : 1,
              }}>
                {loading ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
