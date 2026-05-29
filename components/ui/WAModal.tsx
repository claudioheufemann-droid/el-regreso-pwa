'use client'

import { useState } from 'react'
import { MessageCircle, X, Send, Edit3 } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type WAContexto = 'general' | 'mision' | 'visita' | 'campana'

export interface WATarget {
  nombre: string
  telefono?: string | null
  contexto?: WAContexto
  cicloPromedioDias?: number | null
  siguienteCompra?: string | null
  subtitulo?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function fFecha(s: string): string {
  const d = s.split('T')[0].split('-')
  return `${parseInt(d[2])} ${MESES[parseInt(d[1])-1]}`
}

export function generarMensajeWA(t: WATarget): string {
  const nombre = t.nombre
  switch (t.contexto) {
    case 'mision': {
      const ciclo  = t.cicloPromedioDias ? `cada ${t.cicloPromedioDias} días` : 'tu ciclo habitual'
      const cuando = t.siguienteCompra ? ` para el ${fFecha(t.siguienteCompra)}` : ' la próxima semana'
      return `Hola ${nombre} 👋\n\nTe saluda El Regreso Beer Co. 🍺\n\nSegún tu historial de compras, pedís ${ciclo} y estimamos que podrías necesitar reabastecer${cuando}.\n\n¿Te gustaría coordinar tu próximo pedido? Con gusto te preparo una propuesta con las novedades de la semana.\n\n¡Saludos!\nEl Regreso Beer Co.`
    }
    case 'visita': {
      return `Hola ${nombre} 👋\n\nTe saluda El Regreso Beer Co. 🍺\n\nEstamos por la zona y queremos saber si necesitás algo. ¿Tenés stock de cervezas? ¿Necesitás hacer un pedido?\n\nTenemos novedades que te pueden interesar.\n\n¡Saludos!\nEl Regreso Beer Co.`
    }
    case 'campana': {
      return `Hola ${nombre} 👋\n\nTe saluda El Regreso Beer Co. 🍺\n\nTenemos propuestas especiales y novedades que te pueden interesar. ¿Podemos enviarte información?\n\n¡Saludos!\nEl Regreso Beer Co.`
    }
    default: {
      return `Hola ${nombre} 👋\n\nTe saluda El Regreso Beer Co. 🍺\n\n¿Cómo estamos? Queremos ponernos en contacto para ver cómo podemos ayudarte y si hay algo que necesites.\n\n¡Saludos!\nEl Regreso Beer Co.`
    }
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function WAModal({ target, onClose }: { target: WATarget; onClose: () => void }) {
  const [msg, setMsg] = useState(() => generarMensajeWA(target))

  const waHref = target.telefono
    ? `https://wa.me/${target.telefono.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose() }}
    >
      <div style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20,
        padding:24, maxWidth:480, width:'100%', display:'flex', flexDirection:'column', gap:16,
        maxHeight:'90vh', overflow:'auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'rgba(37,211,102,0.12)',
                border:'1px solid rgba(37,211,102,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <MessageCircle size={16} color="#25D366"/>
              </div>
              <h2 style={{ fontSize:15, fontWeight:900, color:'var(--cream)' }}>Mensaje WhatsApp</h2>
            </div>
            <p style={{ fontSize:12, color:'var(--muted)' }}>
              <strong style={{ color:'var(--cream)' }}>{target.nombre}</strong>
              {target.subtitulo && <span> · {target.subtitulo}</span>}
              {target.telefono && <span style={{ color:'#25D366' }}> · {target.telefono}</span>}
            </p>
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:0, flexShrink:0 }}>
            <X size={18}/>
          </button>
        </div>

        {/* Textarea */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Edit3 size={12} color="var(--muted)"/>
              <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>Edita el mensaje antes de enviar</span>
            </div>
            <span style={{ fontSize:10, color:'#555' }}>{msg.length} chars</span>
          </div>
          <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={11}
            style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:12, padding:'12px 14px', color:'var(--cream)', fontSize:13, lineHeight:1.6,
              resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}/>
        </div>

        <button onClick={()=>setMsg(generarMensajeWA(target))}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:11,
            textDecoration:'underline', textAlign:'left', padding:0 }}>
          Restablecer mensaje original
        </button>

        {/* Acciones */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:'11px', borderRadius:12, border:'1px solid var(--border)',
              background:'transparent', color:'var(--muted)', fontSize:13, cursor:'pointer' }}>
            Cancelar
          </button>
          <a href={waHref} target="_blank" rel="noreferrer" onClick={onClose}
            style={{ flex:2, padding:'11px', borderRadius:12, border:'none', cursor:'pointer',
              background:'#25D366', color:'#fff', fontSize:13, fontWeight:800,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8, textDecoration:'none' }}>
            <Send size={15}/> Abrir WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
