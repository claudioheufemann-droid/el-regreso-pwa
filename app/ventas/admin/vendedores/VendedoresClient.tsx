'use client'

/**
 * Gestión de vendedores (admin) — alta de cuentas con región.
 * Reemplaza la plantilla SQL: el gerente crea los vendedores desde la UI.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Check, Loader2, MapPin, Mail, KeyRound, User, Copy } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import { REGIONES_OPERATIVAS } from '@/lib/regiones'
import type { VendedorRow } from './page'

const G = '#D4AF37'

export default function VendedoresClient({ vendedores }: { vendedores: VendedorRow[] }) {
  const router = useRouter()
  const [nombre, setNombre]     = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('Regreso2026')
  const [region, setRegion]     = useState<string>(REGIONES_OPERATIVAS[2]) // Los Ríos
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [ok, setOk]             = useState<{ nombre: string; email: string; password: string } | null>(null)
  const [copiado, setCopiado]   = useState(false)

  async function crear() {
    setError(null); setOk(null); setLoading(true)
    try {
      const res = await fetch('/api/admin/crear-vendedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password, region }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al crear'); return }
      setOk({ nombre, email, password })
      setNombre(''); setEmail(''); setPassword('Regreso2026')
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const valido = nombre.trim() && /^\S+@\S+\.\S+$/.test(email) && password.length >= 6 && region

  // Agrupar vendedores existentes por región
  const porRegion = REGIONES_OPERATIVAS.map(r => ({
    region: r,
    lista: vendedores.filter(v => v.region === r),
  }))

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0A090F 0%, #080808 100%)', paddingBottom: 100 }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 16px 0' }}>
        <AppHeader eyebrow="Administración" title="Vendedores" />

        {/* ── Éxito ── */}
        {ok && (
          <div style={{
            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: 16, padding: '14px 16px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Check size={16} color="#4ADE80" />
              <p style={{ fontSize: 14, fontWeight: 800, color: '#4ADE80' }}>{ok.nombre} creado</p>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              Entrega estas credenciales al vendedor (deberá cambiar la clave al primer ingreso):
            </p>
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, color: '#F0EDE8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ok.email}</p>
                <p style={{ fontSize: 12, color: G, fontFamily: 'monospace' }}>{ok.password}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(`${ok.email} / ${ok.password}`); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }}
                style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                {copiado ? <Check size={15} color="#4ADE80" /> : <Copy size={15} color="rgba(255,255,255,0.5)" />}
              </button>
            </div>
          </div>
        )}

        {/* ── Formulario ── */}
        <div style={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.07)', borderTop: `2px solid ${G}`, borderRadius: 16, padding: '16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <UserPlus size={16} color={G} />
            <p style={{ fontSize: 13, fontWeight: 800, color: '#F0EDE8' }}>Nuevo vendedor</p>
          </div>

          <Field icon={User}     label="Nombre">
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan Pérez" style={inp} />
          </Field>
          <Field icon={Mail}     label="Email de acceso">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="juan.perez@elregresobeer.com" type="email" autoCapitalize="none" style={inp} />
          </Field>
          <Field icon={KeyRound} label="Contraseña inicial">
            <input value={password} onChange={e => setPassword(e.target.value)} style={inp} />
          </Field>
          <Field icon={MapPin}   label="Región">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {REGIONES_OPERATIVAS.map(r => (
                <button key={r} onClick={() => setRegion(r)} style={{
                  minHeight: 42, borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: region === r ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${region === r ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: region === r ? G : 'rgba(255,255,255,0.5)',
                }}>{r}</button>
              ))}
            </div>
          </Field>

          {error && <p style={{ fontSize: 12, color: '#F87171', marginTop: 4, marginBottom: 10 }}>{error}</p>}

          <button
            onClick={crear}
            disabled={!valido || loading}
            style={{
              width: '100%', minHeight: 48, marginTop: 6, borderRadius: 12, border: 'none',
              background: valido ? 'linear-gradient(135deg, #E5C45A, #B8962E)' : 'rgba(255,255,255,0.06)',
              color: valido ? '#080808' : 'rgba(255,255,255,0.3)',
              fontSize: 14, fontWeight: 900, cursor: valido ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Creando…</> : <><UserPlus size={16} /> Crear vendedor</>}
          </button>
        </div>

        {/* ── Vendedores actuales por región ── */}
        <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
          Vendedores activos
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {porRegion.map(({ region: r, lista }) => (
            <div key={r} style={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: lista.length ? 8 : 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#F0EDE8' }}>{r}</span>
                <span style={{ fontSize: 10, color: lista.length ? G : 'rgba(255,255,255,0.25)' }}>
                  {lista.length ? `${lista.length} vendedor${lista.length > 1 ? 'es' : ''}` : 'Sin asignar'}
                </span>
              </div>
              {lista.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(212,175,55,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: G, flexShrink: 0 }}>
                    {v.nombre.split(' ').slice(0,2).map(s => s[0]?.toUpperCase()).join('')}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.email}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#F0EDE8', fontSize: 16, outline: 'none',
}

function Field({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
        <Icon size={11} /> {label}
      </label>
      {children}
    </div>
  )
}
