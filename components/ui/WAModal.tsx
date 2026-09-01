'use client'

import { useState } from 'react'
import { MessageCircle, X, Send, Edit3 } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type WAContexto = 'general' | 'mision' | 'visita' | 'campana' | 'barril' | 'cobranza'
export type AlertTipo  = 'rojo' | 'amarillo' | 'verde' | 'morado' | 'gris' | 'rm_urgente' | 'cobranza'

/** Un documento vencido, tal como se lista en el mensaje de cobranza. */
export interface WADocumento {
  pedido: string
  fechaEmision: string
  fechaVencimiento: string
  diasMora: number
  monto: number
}

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
  // Barriles pendientes de devolución
  cantidadBarriles?: number | null
  // Cobranza — nombre de la persona con la que se habla de pagos, días exactos
  // de mora del documento más antiguo y el detalle de lo que se está cobrando.
  contacto?: string | null
  diasVencida?: number | null
  montoVencido?: number | null
  documentos?: WADocumento[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function fFecha(s: string): string {
  const d = s.split('T')[0].split('-')
  return `${parseInt(d[2])} ${MESES[parseInt(d[1]!)-1]}`
}

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0,
})

/**
 * Mensaje de cobranza. Va con nombre de la persona, no sólo el del local: es
 * la diferencia entre un mensaje que se lee y uno que se ignora. Si todavía no
 * hay contacto cargado, saluda al local y sigue funcionando igual.
 */
function mensajeCobranza(t: WATarget): string {
  const empresa = t.nombre
  const saludo = t.contacto?.trim()
    ? `Hola ${t.contacto.trim()}, de ${empresa}.`
    : `Hola, ${empresa}.`

  const dias = t.diasVencida ?? 0
  const cuanto = dias > 0
    ? `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
    : 'pendiente'
  const monto = t.montoVencido ? ` por un monto de ${CLP.format(t.montoVencido)}` : ''

  // Como máximo 4 documentos: más que eso el mensaje se vuelve un muro de
  // texto en el celular y se pierde justo lo que uno quiere que lean.
  const docs = (t.documentos ?? []).slice(0, 4)
  const resto = (t.documentos?.length ?? 0) - docs.length
  const detalle = docs.length
    ? '\n\n' + docs
        .map(d => `• N° ${d.pedido.replace(/^0+/, '')} del ${fFecha(d.fechaEmision)} — venció el ${fFecha(d.fechaVencimiento)} (${d.diasMora} ${d.diasMora === 1 ? 'día' : 'días'}) — ${CLP.format(d.monto)}`)
        .join('\n') +
      (resto > 0 ? `\n• y ${resto} documento${resto === 1 ? '' : 's'} más` : '')
    : ''

  return `${saludo} Te escribo desde El Regreso Beer porque tienes una deuda vencida ${cuanto}${monto}.${detalle}\n\nNecesitamos que puedas regularizarla lo antes posible. Si ya hiciste la transferencia, mándame el comprobante y la descontamos al tiro. ¡Gracias!`
}

export function generarMensajeWA(t: WATarget): string {
  const producto = t.productoSugerido ?? 'cerveza'
  const litros   = t.litrosEstimados ? `${t.litrosEstimados}L` : 'tu pedido habitual'
  const ciclo    = t.cicloPromedioDias ? `cada ${t.cicloPromedioDias} días` : 'seguido'

  if (t.contexto === 'cobranza' || t.alertTipo === 'cobranza') return mensajeCobranza(t)

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
      if (t.contexto === 'barril') {
        const cantidad = t.cantidadBarriles ?? 1
        const pl = cantidad !== 1
        const tipoTxt = t.productoSugerido ? ` (${t.productoSugerido})` : ''
        return `Hola! Te escribimos de El Regreso Beer a ${t.nombre}. Tienen actualmente ${cantidad} barril${pl ? 'es' : ''}${tipoTxt} nuestro${pl ? 's' : ''} pendiente${pl ? 's' : ''} de devolución. Necesitamos recuperarlo${pl ? 's' : ''} lo antes posible, ¿qué día podemos pasar a retirarlo${pl ? 's' : ''}?`
      }
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
  cobranza:   { label: '💰 Deuda vencida',          color: '#F87171' },
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
