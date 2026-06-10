'use client'

import { useState } from 'react'
import { MessageCircle, X, Send, Edit3 } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type WAContexto = 'general' | 'mision' | 'visita' | 'campana'
export type AlertTipo  = 'rojo' | 'amarillo' | 'verde' | 'morado' | 'gris' | 'rm_urgente'

export interface WATarget {
  nombre: string
  telefono?: string | null
  contexto?: WAContexto
  alertTipo?: AlertTipo
  // Datos predictivos
  cicloPromedioDias?: number | null
  siguienteCompra?: string | null
  productoSugerido?: string | null
  litrosEstimados?: number | null
  subtitulo?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function fFecha(s: string): string {
  const d = s.split('T')[0].split('-')
  return `${parseInt(d[2])} ${MESES[parseInt(d[1]!)-1]}`
}

export function generarMensajeWA(t: WATarget): string {
  const producto = t.productoSugerido ?? 'cerveza'
  const litros   = t.litrosEstimados ? `${t.litrosEstimados}L` : 'tu pedido habitual'
  const ciclo    = t.cicloPromedioDias ? `cada ${t.cicloPromedioDias} días` : 'seguido'

  switch (t.alertTipo) {

    case 'rojo':
      return `Hola! ¿Cómo va todo por el local? Oye, sacando cuentas por acá creo que ya debes estar medio corto de la ${producto}. ¿Te mando unas cajitas hoy para que no te quedes seco el finde?`

    case 'amarillo':
      return `Hola! Paso a saludarte. ¿Cómo andamos de stock para esta semana? Avísame si necesitas que te reponga ${litros} y te lo dejo anotado al tiro.`

    case 'verde':
      return `Hola! Oye, te escribo porque sacamos una variedad Experimental nueva que está buenísima. Como sé que siempre llevas la ${producto}, pensé que te interesaría probarla. Acuérdate que podemos mezclar la caja de 24 con distintos sabores. ¿Te animas y te mando unas para probar?`

    case 'morado':
      return `Hola! Hace un tiempo que no nos coordinamos y quería pasarme a saludar. ¿Cómo están con el stock? Tenemos novedades en el portafolio y me gustaría contarte. ¿Cuándo es buen momento para hablar?`

    case 'gris':
      return `Hola! ¿Cómo va? Quería pasarte a dejar tu pedido semanal, pero veo que nos quedó pendiente la factura anterior en el sistema. ¿Te mando los datos bancarios del Banco de Chile para regularizar y te despacho al tiro para que no te quedes sin stock? ¡Avísame!`

    case 'rm_urgente':
      return `Hola! Te escribo rápido porque estoy cerrando el camión de los despachos que sale hoy a las 4:00 PM para Santiago. Saqué la cuenta de tu consumo y creo que si no te mando stock hoy, vas a andar súper justo de ${producto} para los próximos días. ¿Te anoto ${litros} al tiro antes de que cierre el despacho y te llega mañana mismo?`

    case 'mision' as AlertTipo:
    default: {
      if (t.contexto === 'visita')
        return `Hola! Estamos por la zona y quería saber si necesitás algo. ¿Tenés stock? ¿Necesitás hacer un pedido?`
      if (t.contexto === 'campana')
        return `Hola! Tenemos propuestas especiales y novedades que te pueden interesar. ¿Te cuento?`
      const cuando = t.siguienteCompra ? ` para el ${fFecha(t.siguienteCompra)}` : ' la próxima semana'
      return `Hola! Oye, según tu historial pedís ${ciclo} y estimo que podrías necesitar reabastecer${cuando}. ¿Coordinamos tu próximo pedido?`
    }
  }
}

// Etiqueta descriptiva del tipo de alerta para el modal
const ALERTA_LABEL: Record<AlertTipo, { label: string; color: string }> = {
  rojo:       { label: '🔴 Quiebre inminente',     color: '#F87171' },
  amarillo:   { label: '🟡 Ventana óptima',         color: '#FBBF24' },
  verde:      { label: '🟢 Oportunidad cross-sell', color: '#4ADE80' },
  morado:     { label: '🟣 Cliente en fuga',        color: '#C084FC' },
  gris:       { label: '⚪ Cobranza pendiente',     color: '#94A3B8' },
  rm_urgente: { label: '⏰ Corte RM hoy 4PM',       color: '#FB923C' },
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function WAModal({ target, onClose }: { target: WATarget; onClose: () => void }) {
  const [msg, setMsg] = useState(() => generarMensajeWA(target))

  const waHref = target.telefono
    ? `https://wa.me/${target.telefono.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`

  const alertInfo = target.alertTipo ? ALERTA_LABEL[target.alertTipo] : null

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', zIndex:9999,
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
            <p style={{ fontSize:12, color:'var(--muted)', marginBottom: alertInfo ? 6 : 0 }}>
              <strong style={{ color:'var(--cream)' }}>{target.nombre}</strong>
              {target.subtitulo && <span> · {target.subtitulo}</span>}
              {target.telefono && <span style={{ color:'#25D366' }}> · {target.telefono}</span>}
            </p>
            {alertInfo && (
              <span style={{
                fontSize:10, fontWeight:800, color: alertInfo.color,
                background: `${alertInfo.color}18`, border: `1px solid ${alertInfo.color}30`,
                padding:'2px 8px', borderRadius:20,
              }}>
                {alertInfo.label}
              </span>
            )}
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
          <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={10}
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
