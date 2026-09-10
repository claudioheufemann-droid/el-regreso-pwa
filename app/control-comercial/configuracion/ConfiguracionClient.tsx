'use client'

import { useEffect, useState } from 'react'
import { Plus, XCircle } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'

interface Territorio {
  id: number; territorio: string; tipo: 'geografico' | 'canal'; responsable: string
  nombres_erp: string[]; vigente_desde: string; vigente_hasta: string | null
}

export default function ConfiguracionClient() {
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [territorio, setTerritorio] = useState('')
  const [tipo, setTipo] = useState<'geografico' | 'canal'>('geografico')
  const [responsable, setResponsable] = useState('')
  const [nombresErp, setNombresErp] = useState('')
  const [vigenteDesde, setVigenteDesde] = useState(new Date().toISOString().slice(0, 10))
  const [guardando, setGuardando] = useState(false)

  function cargar() {
    setLoading(true)
    fetch('/api/control-comercial/territorios?todos=1')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar territorios')
        return r.json()
      })
      .then(setTerritorios)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(cargar, [])

  async function crear() {
    if (!territorio || !responsable || !nombresErp.trim()) return
    setGuardando(true)
    try {
      const res = await fetch('/api/control-comercial/territorios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          territorio, tipo, responsable, vigente_desde: vigenteDesde,
          nombres_erp: nombresErp.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo crear')
      setTerritorio(''); setResponsable(''); setNombresErp('')
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setGuardando(false)
    }
  }

  async function cerrarVigencia(id: number) {
    const res = await fetch('/api/control-comercial/territorios', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    if (res.ok) cargar()
  }

  const vigentes = territorios.filter(t => !t.vigente_hasta)
  const historicos = territorios.filter(t => t.vigente_hasta)

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow="Control Comercial" title="Configuración — Territorios" />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Nuevo territorio / reasignación</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
          <Field label="Territorio/Canal"><input value={territorio} onChange={e => setTerritorio(e.target.value)} placeholder="ej. Los Ríos" style={inputStyle()} /></Field>
          <Field label="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value as 'geografico' | 'canal')} style={inputStyle()}>
              <option value="geografico">Geográfico</option>
              <option value="canal">Canal</option>
            </select>
          </Field>
          <Field label="Responsable"><input value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Nombre canónico" style={inputStyle()} /></Field>
          <Field label="Vigente desde"><input type="date" value={vigenteDesde} onChange={e => setVigenteDesde(e.target.value)} style={inputStyle()} /></Field>
        </div>
        <Field label="Nombres en el ERP (separados por coma) — valores de ventas.vendedor_actual">
          <input value={nombresErp} onChange={e => setNombresErp(e.target.value)} placeholder="ej. Nicol Delgado, nicol.delgado@elregresobeer.com" style={{ ...inputStyle(), width: '100%' }} />
        </Field>
        <button onClick={crear} disabled={guardando} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, marginTop: 12,
          background: 'var(--gold)', color: '#0A0A0A', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: guardando ? 0.6 : 1,
        }}>
          <Plus size={15} /> Guardar
        </button>
        {error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
          Para reasignar un territorio existente: cierra la vigencia actual abajo y crea una fila nueva con el nuevo responsable — así el histórico de ventas queda con el responsable correcto de cada momento.
        </p>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Vigentes</h2>
        {loading ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vigentes.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{t.territorio} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {t.tipo}</span></p>
                  <p style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.responsable} · desde {t.vigente_desde} · ERP: {t.nombres_erp.join(', ')}</p>
                </div>
                <button onClick={() => cerrarVigencia(t.id)} title="Cerrar vigencia (reasignar)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
                  <XCircle size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {historicos.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Histórico</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historicos.map(t => (
              <p key={t.id} style={{ fontSize: 12, color: 'var(--muted)' }}>
                {t.territorio} · {t.responsable} · {t.vigente_desde} → {t.vigente_hasta}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{label}</label>
      {children}
    </div>
  )
}
function inputStyle(): React.CSSProperties {
  return { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }
}
