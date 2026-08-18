'use client'

import { useState } from 'react'
import { X, Phone, MapPin, MessageCircle, StickyNote, Check } from 'lucide-react'

export type TipoContacto = 'visita' | 'llamada' | 'whatsapp' | 'nota'
export type ResultadoContacto = 'pedido' | 'sin_pedido' | 'no_estaba' | 'reclamo' | 'seguimiento'

const TIPOS: { value: TipoContacto; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'visita',   label: 'Visita',   icon: <MapPin size={15}/>,        color: '#34D399' },
  { value: 'llamada',  label: 'Llamada',  icon: <Phone size={15}/>,         color: '#60A5FA' },
  { value: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={15}/>, color: '#25D366' },
  { value: 'nota',     label: 'Nota',     icon: <StickyNote size={15}/>,    color: '#D4AF37' },
]

const RESULTADOS: { value: ResultadoContacto; label: string; color: string }[] = [
  { value: 'pedido',      label: 'Hizo pedido',   color: '#34D399' },
  { value: 'sin_pedido',  label: 'Sin pedido',    color: '#F59E0B' },
  { value: 'no_estaba',   label: 'No estaba',     color: '#94A3B8' },
  { value: 'reclamo',     label: 'Reclamo',       color: '#F87171' },
  { value: 'seguimiento', label: 'Seguimiento',   color: '#60A5FA' },
]

export interface RegistrarContactoTarget {
  nombre: string
  tipoInicial?: TipoContacto
}

export default function RegistrarContactoModal({
  target, onClose, onRegistrado,
}: {
  target: RegistrarContactoTarget
  onClose: () => void
  onRegistrado?: () => void
}) {
  const [tipo, setTipo]           = useState<TipoContacto>(target.tipoInicial ?? 'visita')
  const [resultado, setResultado] = useState<ResultadoContacto | null>(null)
  const [notas, setNotas]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const esNota = tipo === 'nota'

  async function guardar() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/contactos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_nombre_fantasia: target.nombre,
          tipo,
          resultado: esNota ? null : resultado,
          notas: notas.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'No se pudo registrar')
      }
      onRegistrado?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20,
        padding:24, maxWidth:460, width:'100%', display:'flex', flexDirection:'column', gap:18,
        maxHeight:'90vh', overflow:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <h2 style={{ fontSize:15, fontWeight:900, color:'var(--cream)', marginBottom:3 }}>Registrar interacción</h2>
            <p style={{ fontSize:12, color:'var(--muted)' }}>
              <strong style={{ color:'var(--cream)' }}>{target.nombre}</strong>
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)',
              width:44, height:44, display:'flex', alignItems:'center', justifyContent:'flex-end', flexShrink:0 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Tipo */}
        <div>
          <p style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>Tipo</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
            {TIPOS.map(t => {
              const active = tipo === t.value
              return (
                <button key={t.value} onClick={() => setTipo(t.value)}
                  style={{
                    minHeight:64, padding:'10px 6px', borderRadius:12, cursor:'pointer',
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5,
                    background: active ? `${t.color}1A` : 'var(--surface2)',
                    border: `1px solid ${active ? `${t.color}60` : 'var(--border)'}`,
                    color: active ? t.color : 'var(--muted)', transition:'all 0.15s',
                  }}>
                  {t.icon}
                  <span style={{ fontSize:11, fontWeight:700 }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Resultado (no aplica a notas) */}
        {!esNota && (
          <div>
            <p style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>Resultado</p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {RESULTADOS.map(r => {
                const active = resultado === r.value
                return (
                  <button key={r.value} onClick={() => setResultado(active ? null : r.value)}
                    style={{
                      minHeight:40, padding:'8px 14px', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:700,
                      display:'flex', alignItems:'center', gap:6,
                      background: active ? `${r.color}1A` : 'var(--surface2)',
                      border: `1px solid ${active ? `${r.color}60` : 'var(--border)'}`,
                      color: active ? r.color : 'var(--muted)', transition:'all 0.15s',
                    }}>
                    {active && <Check size={13}/>}
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Nota */}
        <div>
          <p style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>
            {esNota ? 'Nota' : 'Nota (opcional)'}
          </p>
          <textarea
            value={notas} onChange={e => setNotas(e.target.value)} rows={4}
            placeholder={esNota ? 'Ej: El dueño avisó que cambia de local en marzo…' : 'Detalle de la conversación, acuerdos, próximos pasos…'}
            style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:12, padding:'12px 14px', color:'var(--cream)', fontSize:13, lineHeight:1.6,
              resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}/>
        </div>

        {error && (
          <p style={{ fontSize:12, color:'#F87171', textAlign:'center' }}>{error}</p>
        )}

        {/* Acciones */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex:1, minHeight:48, borderRadius:12, border:'1px solid var(--border)',
              background:'transparent', color:'var(--muted)', fontSize:13, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving || (esNota && !notas.trim())}
            style={{ flex:2, minHeight:48, borderRadius:12, border:'none',
              background: saving || (esNota && !notas.trim()) ? 'rgba(212,175,55,0.4)' : '#D4AF37',
              color:'#0A0A0A', fontSize:13, fontWeight:800, cursor: saving ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Check size={16}/> {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
