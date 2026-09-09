'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, Lock, Eye, EyeOff } from 'lucide-react'

interface VendedorOpcion { id: string; nombre: string }

/**
 * /identificarse — reemplazo de login SOLO mientras LOGIN_DESACTIVADO_TEMPORAL
 * esté activo (lib/auth.ts). El vendedor elige su nombre e ingresa su PIN de
 * 4 dígitos (ver app/api/vendedor/identificarse/route.ts); si calza, queda
 * viendo su propia interfaz — cartera, misiones y "Lo que gano yo" — igual
 * que si hubiera iniciado sesión. Nadie más puede verla porque cada PIN
 * sólo desbloquea SU propio vendedorId, nunca el de otro.
 *
 * Mismo lenguaje visual que /login (fondo #050402, card #13110D, acento
 * dorado #D4AF37) porque cumple el mismo rol: es la puerta de entrada.
 */
export default function IdentificarsePage() {
  const router = useRouter()
  const [vendedores, setVendedores] = useState<VendedorOpcion[] | null>(null)
  const [vendedorId, setVendedorId] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/vendedor/lista-identificacion')
      .then(r => r.json())
      .then(d => setVendedores(Array.isArray(d) ? d : []))
      .catch(() => setVendedores([]))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!vendedorId || pin.length !== 4) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/vendedor/identificarse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendedorId, pin }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo verificar el PIN.')
        setLoading(false)
        return
      }
      router.push('/ventas')
      router.refresh()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes id-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .id-input::placeholder { color: rgba(255,255,255,0.2); }
        .id-input:focus { outline:none; border-color:rgba(212,175,55,0.45)!important; background:#141008!important; }
        .id-select:focus { outline:none; border-color:rgba(212,175,55,0.45)!important; }
        .id-submit:hover:not(:disabled) { background:#C8A42A!important; box-shadow:0 6px 20px rgba(212,175,55,0.25)!important; }
      `}</style>

      <div style={{
        minHeight: '100dvh',
        background: '#050402',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'system-ui',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      }}>
        <div style={{
          width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column',
          border: '1px solid rgba(212,175,55,0.4)',
          borderRadius: 20,
          background: '#13110D',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          padding: '24px 20px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 15, flexShrink: 0,
              background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={22} color="rgba(212,175,55,0.8)" />
            </div>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, color: '#F0E8D4', margin: 0, lineHeight: 1.2 }}>
                ¿Quién eres?
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', margin: '1px 0 0' }}>
                Identifícate para ver tu comisión.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.55)',
                letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 6,
              }}>
                Tu nombre
              </label>
              <select
                className="id-select"
                value={vendedorId}
                onChange={e => setVendedorId(e.target.value)}
                required
                disabled={vendedores === null}
                style={{
                  width: '100%', padding: '12px 14px', background: '#0E0C09',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11,
                  fontSize: 14, color: vendedorId ? '#E8DFC8' : 'rgba(255,255,255,0.35)',
                  boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              >
                <option value="">
                  {vendedores === null ? 'Cargando…' : 'Selecciona tu nombre'}
                </option>
                {vendedores?.map(v => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.55)',
                letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 6,
              }}>
                PIN (4 dígitos)
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={13} style={{
                  position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.22)', pointerEvents: 'none',
                }} />
                <input
                  className="id-input"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  style={{
                    width: '100%', padding: '12px 44px 12px 38px', background: '#0E0C09',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11,
                    fontSize: 16, letterSpacing: 4, color: '#E8DFC8', boxSizing: 'border-box',
                    fontFamily: 'inherit', transition: 'border-color 0.18s, background 0.18s',
                  }}
                />
                <button type="button" onClick={() => setShowPin(v => !v)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.25)', padding: 4, display: 'flex', alignItems: 'center',
                }}>
                  {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p style={{
                fontSize: 11.5, color: '#FF7575', textAlign: 'center',
                background: 'rgba(255,107,107,0.06)', padding: '8px 12px', borderRadius: 9, margin: 0,
                border: '1px solid rgba(255,107,107,0.14)',
              }}>{error}</p>
            )}

            <button type="submit" disabled={loading || !vendedorId || pin.length !== 4} className="id-submit" style={{
              width: '100%', padding: '13px 20px',
              background: loading ? 'rgba(212,175,55,0.4)' : '#D4AF37',
              border: 'none', borderRadius: 11, fontSize: 12, fontWeight: 700,
              letterSpacing: '1.5px', textTransform: 'uppercase', color: '#0A0700',
              cursor: loading || !vendedorId || pin.length !== 4 ? 'not-allowed' : 'pointer',
              opacity: !vendedorId || pin.length !== 4 ? 0.5 : 1,
              transition: 'background 0.15s, box-shadow 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              marginTop: 2,
            }}>
              {loading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" style={{ animation: 'id-spin 0.8s linear infinite', flexShrink: 0 }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : 'Ver mi comisión'}
            </button>
          </form>
        </div>

        <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.18)', marginTop: 16, textAlign: 'center' }}>
          Cervecería El Regreso
        </p>
      </div>
    </>
  )
}
