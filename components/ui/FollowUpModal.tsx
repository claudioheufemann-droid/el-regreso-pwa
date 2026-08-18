'use client'

import { useState } from 'react'
import { X, Calendar, Check, Bell } from 'lucide-react'

export interface FollowUp {
  id: string
  cliente_nombre_fantasia: string
  vendedor: string
  nota: string
  fecha_recordatorio: string
  estado: 'pendiente' | 'completado'
  completado_at: string | null
  created_at: string
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const PRESETS = [
  { label: 'Mañana',     days: 1  },
  { label: '3 días',     days: 3  },
  { label: '1 semana',   days: 7  },
  { label: '2 semanas',  days: 14 },
  { label: '1 mes',      days: 30 },
]

export default function FollowUpModal({
  clienteNombre, onClose, onCreado,
}: {
  clienteNombre: string
  onClose: () => void
  onCreado?: (fu: FollowUp) => void
}) {
  const tomorrow = addDays(1)
  const [nota, setNota]           = useState('')
  const [fecha, setFecha]         = useState(addDays(7))
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function guardar() {
    if (!nota.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_nombre_fantasia: clienteNombre, nota: nota.trim(), fecha_recordatorio: fecha }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error')
      const data: FollowUp = await res.json()
      onCreado?.(data)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20,
        padding:24, maxWidth:420, width:'100%', display:'flex', flexDirection:'column', gap:18 }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <Bell size={16} color="#D4AF37"/>
              <h2 style={{ fontSize:15, fontWeight:900, color:'var(--cream)' }}>Nuevo recordatorio</h2>
            </div>
            <p style={{ fontSize:12, color:'var(--muted)' }}>{clienteNombre}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{
            background:'none', border:'none', cursor:'pointer', color:'var(--muted)',
            minWidth:44, minHeight:44, display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
            <X size={18}/>
          </button>
        </div>

        {/* Nota */}
        <div>
          <p style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>
            ¿Qué hay que hacer?
          </p>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3}
            placeholder="Ej: Llamar para confirmar pedido de barriles / Volver en 2 semanas para ver si cambió de local…"
            style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:12, padding:'12px 14px', color:'var(--cream)', fontSize:13, lineHeight:1.6,
              resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}/>
        </div>

        {/* Fecha con presets */}
        <div>
          <p style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>
            ¿Cuándo recordar?
          </p>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
            {PRESETS.map(p => {
              const d = addDays(p.days)
              const active = fecha === d
              return (
                <button key={p.days} onClick={() => setFecha(d)} style={{
                  padding:'6px 12px', minHeight:36, borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
                  background: active ? 'rgba(212,175,55,0.15)' : 'var(--surface2)',
                  border: `1px solid ${active ? 'rgba(212,175,55,0.5)' : 'var(--border)'}`,
                  color: active ? '#D4AF37' : 'var(--muted)', transition:'all 0.15s',
                }}>
                  {p.label}
                </button>
              )
            })}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Calendar size={14} color="var(--muted)"/>
            <input type="date" value={fecha} min={tomorrow}
              onChange={e => setFecha(e.target.value)}
              style={{ flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:10, padding:'9px 12px', color:'var(--cream)', fontSize:13,
                outline:'none', colorScheme:'dark', minHeight:44 }}/>
          </div>
        </div>

        {error && <p style={{ fontSize:12, color:'#F87171', textAlign:'center' }}>{error}</p>}

        {/* Acciones */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} disabled={saving} style={{
            flex:1, minHeight:48, borderRadius:12, border:'1px solid var(--border)',
            background:'transparent', color:'var(--muted)', fontSize:13, cursor:'pointer' }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving || !nota.trim()} style={{
            flex:2, minHeight:48, borderRadius:12, border:'none',
            background: saving || !nota.trim() ? 'rgba(212,175,55,0.4)' : '#D4AF37',
            color:'#0A0A0A', fontSize:13, fontWeight:800, cursor: saving || !nota.trim() ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Check size={16}/> {saving ? 'Guardando…' : 'Crear recordatorio'}
          </button>
        </div>
      </div>
    </div>
  )
}
