'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Database, Loader2, Mail, Check, X, ClipboardList, BellRing, FileDown, ListChecks } from 'lucide-react'
import type { AccionBorrador, CorreoBorrador, ListaChequeo } from '@/lib/agente/correos'

export interface Mensaje {
  rol: 'usuario' | 'agente'
  texto: string
  herramientas?: string[]
  error?: boolean
}

export type TemaChat = 'claro' | 'oscuro'

const TEMAS = {
  claro: {
    fondo: '#F1F5F9', texto: '#0F172A', apagado: '#64748B', tenue: '#94A3B8', linea: '#E2E8F0',
    acento: '#2563EB', sobreAcento: '#FFFFFF', error: '#DC2626', errorFondo: '#FEF2F2', campo: '#F1F5F9',
  },
  oscuro: {
    fondo: '#1B1A18', texto: '#F4EEDF', apagado: '#9A938B', tenue: '#6B6560', linea: 'rgba(255,255,255,0.08)',
    acento: '#D4AF37', sobreAcento: '#0A0A0A', error: '#F87171', errorFondo: 'rgba(248,113,113,0.12)', campo: 'rgba(255,255,255,0.05)',
  },
} as const

/**
 * Estado de la conversación con el asistente. La conversación vive en la base
 * (agente_conversaciones): al montarse se carga la más reciente del usuario, así
 * que sobrevive a recargas y a cambiar de equipo, y al enviar sólo viaja la
 * pregunta nueva más el id de la conversación (el servidor arma el contexto).
 */
export function useChatAgente() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [cargando, setCargando] = useState(false)
  const [conversacionId, setConversacionId] = useState<string | null>(null)
  const [correos, setCorreos] = useState<CorreoBorrador[]>([])
  const [acciones, setAcciones] = useState<AccionBorrador[]>([])
  const [listas, setListas] = useState<ListaChequeo[]>([])

  useEffect(() => {
    let vigente = true
    fetch('/api/agente/conversacion')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vigente || !d?.conversacion_id) return
        setConversacionId(d.conversacion_id)
        // Si el usuario ya alcanzó a escribir algo mientras cargaba, no se lo pisamos.
        setMensajes(actuales => (actuales.length ? actuales : d.mensajes))
        setCorreos(actuales => (actuales.length ? actuales : d.correos ?? []))
        setAcciones(actuales => (actuales.length ? actuales : d.acciones ?? []))
        setListas(actuales => (actuales.length ? actuales : d.listas ?? []))
      })
      .catch(() => { /* sin historial: se parte en blanco */ })
    return () => { vigente = false }
  }, [])

  const enviar = useCallback(async (texto: string) => {
    const pregunta = texto.trim()
    if (!pregunta || cargando) return
    setMensajes(m => [...m, { rol: 'usuario', texto: pregunta }])
    setCargando(true)
    try {
      const res = await fetch('/api/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: pregunta, conversacion_id: conversacionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.conversacion_id) setConversacionId(data.conversacion_id)
      if (!res.ok) throw new Error(data.error ?? 'No se pudo consultar al asistente.')
      setMensajes(m => [...m, {
        rol: 'agente', texto: data.respuesta,
        herramientas: [...new Set<string>((data.herramientas ?? []).map((h: { nombre: string }) => h.nombre))],
      }])
      if (Array.isArray(data.correos)) setCorreos(data.correos)
      if (Array.isArray(data.acciones)) setAcciones(data.acciones)
      if (Array.isArray(data.listas)) setListas(data.listas)
    } catch (e) {
      setMensajes(m => [...m, { rol: 'agente', texto: e instanceof Error ? e.message : 'Error de conexión.', error: true }])
    } finally {
      setCargando(false)
    }
  }, [conversacionId, cargando])

  /** Vuelve a leer la conversación guardada (otra pestaña o equipo pudo seguirla). No pisa una respuesta en curso. */
  const recargar = useCallback(async () => {
    if (cargando) return
    try {
      const r = await fetch('/api/agente/conversacion')
      const d = r.ok ? await r.json() : null
      if (d) {
        setConversacionId(d.conversacion_id ?? null)
        setMensajes(d.mensajes ?? [])
        setCorreos(d.correos ?? [])
        setAcciones(d.acciones ?? [])
        setListas(d.listas ?? [])
      }
    } catch { /* se queda con lo que hay */ }
  }, [cargando])

  /** "Nueva conversación": archiva la actual (el historial se conserva en la base) y parte en blanco. */
  const limpiar = useCallback(() => {
    if (conversacionId) {
      void fetch('/api/agente/conversacion', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: conversacionId }),
      }).catch(() => undefined)
    }
    setConversacionId(null)
    setMensajes([])
    setCorreos([])
    setAcciones([])
    setListas([])
  }, [conversacionId])

  /** Marca/desmarca un ítem de una lista. Optimista: si el servidor falla, vuelve atrás. */
  const marcarItem = useCallback(async (listaId: string, itemId: string, hecho: boolean): Promise<void> => {
    const cambiar = (h: boolean) => setListas(ls => ls.map(l => (l.id !== listaId ? l : {
      ...l, items: l.items.map(it => (it.id === itemId ? { ...it, hecho: h, hecho_at: h ? new Date().toISOString() : null } : it)),
    })))
    cambiar(hecho)
    try {
      const res = await fetch(`/api/agente/listas/${listaId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: itemId, hecho }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      if (Array.isArray(d.items)) setListas(ls => ls.map(l => (l.id === listaId ? { ...l, items: d.items } : l)))
    } catch {
      cambiar(!hecho)
    }
  }, [])

  /** Enviar o descartar un borrador de correo. Lo decide la persona: el asistente sólo lo propone. */
  const accionCorreo = useCallback(async (id: string, accion: 'enviar' | 'descartar', edicion?: EdicionCorreo): Promise<string | null> => {
    const previo = correos.find(c => c.id === id)
    setCorreos(cs => cs.map(c => (c.id === id ? { ...c, ...(edicion ?? {}), estado: accion === 'enviar' ? 'enviando' : 'descartado' } : c)))
    try {
      const res = await fetch(`/api/agente/correos/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, ...(edicion ?? {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'No se pudo completar la acción.')
      setCorreos(cs => cs.map(c => (c.id === id ? { ...c, estado: d.estado, enviado_at: d.enviado_at ?? c.enviado_at, error: null } : c)))
      return null
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión.'
      setCorreos(cs => cs.map(c => (c.id === id ? { ...(previo ?? c), ...(edicion ?? {}), estado: 'error', error: msg } : c)))
      return msg
    }
  }, [correos])

  /** Confirmar o descartar una tarea / aviso propuesto por el asistente. */
  const accionAccion = useCallback(async (id: string, accion: 'confirmar' | 'descartar'): Promise<void> => {
    setAcciones(as => as.map(a => (a.id === id ? { ...a, estado: accion === 'confirmar' ? 'ejecutando' : 'descartada' } : a)))
    try {
      const res = await fetch(`/api/agente/acciones/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'No se pudo completar la acción.')
      setAcciones(as => as.map(a => (a.id === id ? { ...a, estado: d.estado, error: null } : a)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión.'
      setAcciones(as => as.map(a => (a.id === id ? { ...a, estado: 'error', error: msg } : a)))
    }
  }, [])

  return { mensajes, cargando, enviar, limpiar, recargar, correos, accionCorreo, acciones, accionAccion, listas, marcarItem }
}

type Canal = CorreoBorrador['canal']
interface EdicionCorreo { asunto: string; cuerpo: string; canal: Canal }

/* ── Markdown mínimo (negrita, cursiva, listas) sin HTML crudo ─────────────── */

function enLinea(texto: string, clave: string) {
  return texto.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((trozo, i) => {
    if (trozo.startsWith('**') && trozo.endsWith('**') && trozo.length > 4) return <strong key={`${clave}${i}`}>{trozo.slice(2, -2)}</strong>
    if (trozo.startsWith('*') && trozo.endsWith('*') && trozo.length > 2) return <em key={`${clave}${i}`}>{trozo.slice(1, -1)}</em>
    return <Fragment key={`${clave}${i}`}>{trozo}</Fragment>
  })
}

/** Fila de tabla markdown ("| a | b |") → celdas. */
const celdas = (linea: string) => linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
const esSeparador = (linea: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea)

function descargarCsv(filas: string[][]) {
  const limpio = (v: string) => v.replace(/\*/g, '')
  const txt = '﻿' + filas.map(f => f.map(v => `"${limpio(v).replace(/"/g, '""')}"`).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
  const el = document.createElement('a'); el.href = url; el.download = `asistente-${new Date().toISOString().slice(0, 10)}.csv`; el.click(); URL.revokeObjectURL(url)
}

/** Tabla markdown del asistente: se ve como tabla (con scroll horizontal) y se puede bajar a Excel. */
function TablaChat({ filas, clave }: { filas: string[][]; clave: string }) {
  const [cabecera, ...cuerpo] = filas
  const esNumero = (v: string) => /\d/.test(v) && /^[-+$\d.,%\sL]+$/.test(v.replace(/\*/g, ''))
  return (
    <div style={{ margin: '6px 0' }}>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(127,127,127,0.25)' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead><tr>{cabecera.map((c, j) => (
            <th key={j} style={{ textAlign: 'left', padding: '6px 9px', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(127,127,127,0.25)' }}>{enLinea(c, `${clave}h${j}`)}</th>
          ))}</tr></thead>
          <tbody>
            {cuerpo.map((f, i) => (
              <tr key={i}>{f.map((c, j) => (
                <td key={j} style={{ padding: '5px 9px', whiteSpace: 'nowrap', textAlign: esNumero(c) ? 'right' : 'left', fontVariantNumeric: 'tabular-nums', borderTop: i ? '1px solid rgba(127,127,127,0.15)' : undefined }}>
                  {enLinea(c, `${clave}${i}-${j}`)}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => descargarCsv(filas)} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'inherit', opacity: 0.7, cursor: 'pointer' }}>
        <FileDown size={11} /> Excel (CSV)
      </button>
    </div>
  )
}

type Bloque = { tipo: 'linea'; linea: string } | { tipo: 'tabla'; filas: string[][] }

function TextoFormateado({ texto }: { texto: string }) {
  // Agrupa las líneas que forman una tabla markdown (cabecera + separador + filas).
  const lineas = texto.split('\n')
  const bloques: Bloque[] = []
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].trim().startsWith('|') && i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
      const filas = [celdas(lineas[i])]
      let j = i + 2
      while (j < lineas.length && lineas[j].trim().startsWith('|')) { filas.push(celdas(lineas[j])); j++ }
      bloques.push({ tipo: 'tabla', filas })
      i = j - 1
    } else bloques.push({ tipo: 'linea', linea: lineas[i] })
  }
  return (
    <>
      {bloques.map((b, i) => {
        if (b.tipo === 'tabla') return <TablaChat key={i} filas={b.filas} clave={`t${i}-`} />
        const linea = b.linea
        const vineta = linea.match(/^\s*[*-]\s+(.*)$/)
        const numero = linea.match(/^\s*(\d+)[.)]\s+(.*)$/)
        if (vineta) return <div key={i} style={{ display: 'flex', gap: 7, paddingLeft: 4 }}><span style={{ flexShrink: 0 }}>•</span><span style={{ minWidth: 0 }}>{enLinea(vineta[1], `${i}-`)}</span></div>
        if (numero) return <div key={i} style={{ display: 'flex', gap: 7, paddingLeft: 4 }}><span style={{ flexShrink: 0 }}>{numero[1]}.</span><span style={{ minWidth: 0 }}>{enLinea(numero[2], `${i}-`)}</span></div>
        if (!linea.trim()) return <div key={i} style={{ height: 6 }} />
        return <div key={i}>{enLinea(linea, `${i}-`)}</div>
      })}
    </>
  )
}

/* ── Borrador de correo: el asistente lo propone, la persona lo envía ───────── */

type AccionCorreo = (id: string, accion: 'enviar' | 'descartar', edicion?: EdicionCorreo) => Promise<string | null>
type AccionAccion = (id: string, accion: 'confirmar' | 'descartar') => Promise<void>

const CANALES: { valor: Canal; etiqueta: string }[] = [
  { valor: 'correo', etiqueta: 'Correo' },
  { valor: 'push', etiqueta: 'Notificación' },
  { valor: 'ambos', etiqueta: 'Ambos' },
]

function TarjetaCorreo({ correo, tema, onAccion, onEdicion }: {
  correo: CorreoBorrador; tema: TemaChat; onAccion?: AccionCorreo
  /** Avisa las ediciones hacia arriba: "Enviar todos" manda lo que se ve en cada tarjeta. */
  onEdicion?: (id: string, e: EdicionCorreo) => void
}) {
  const T = TEMAS[tema]
  const [asunto, setAsunto] = useState(correo.asunto)
  const [cuerpo, setCuerpo] = useState(correo.cuerpo)
  const [canal, setCanal] = useState<Canal>(correo.canal ?? 'correo')
  useEffect(() => { onEdicion?.(correo.id, { asunto, cuerpo, canal }) }, [correo.id, asunto, cuerpo, canal, onEdicion])
  const editable = correo.estado === 'pendiente' || correo.estado === 'error'
  const ocupado = correo.estado === 'enviando'
  const vacio = !asunto.trim() || !cuerpo.trim()

  // Enviado o descartado: una línea, sin el cuerpo (ya no queda nada que decidir).
  if (correo.estado === 'enviado' || correo.estado === 'descartado') {
    const enviado = correo.estado === 'enviado'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: enviado ? T.texto : T.tenue, padding: '8px 12px', borderRadius: 10, border: `1px solid ${T.linea}` }}>
        {enviado ? <Check size={13} color={T.acento} style={{ flexShrink: 0 }} /> : <X size={13} style={{ flexShrink: 0 }} />}
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {enviado ? (correo.canal === 'push' ? 'Notificación enviada' : correo.canal === 'ambos' ? 'Correo y notificación enviados' : 'Correo enviado') : 'Borrador descartado'} a <strong>{correo.destinatario_nombre}</strong>: {correo.asunto}
        </span>
      </div>
    )
  }

  const campo: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.linea}`, background: T.campo,
    color: T.texto, fontSize: 16, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ border: `1px solid ${T.acento}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: T.texto }}>
        <Mail size={13} color={T.acento} /> Borrador para {correo.destinatario_nombre}
        <span style={{ fontWeight: 500, color: T.apagado }}>· revísalo antes de enviar</span>
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: T.apagado }}>
        Asunto
        <input value={asunto} onChange={e => setAsunto(e.target.value)} disabled={!editable} maxLength={200} style={campo} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: T.apagado }}>
        Mensaje
        <textarea
          value={cuerpo} onChange={e => setCuerpo(e.target.value)} disabled={!editable} maxLength={5000}
          rows={Math.min(12, Math.max(5, cuerpo.split('\n').length + 1))}
          style={{ ...campo, lineHeight: 1.5, resize: 'vertical' }}
        />
      </label>
      <div role="group" aria-label="Enviar por" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 11, color: T.apagado }}>
        Enviar por
        {CANALES.map(c => (
          <button
            key={c.valor} onClick={() => setCanal(c.valor)} disabled={!editable} aria-pressed={canal === c.valor}
            style={{
              padding: '4px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${canal === c.valor ? T.acento : T.linea}`, background: canal === c.valor ? T.campo : 'transparent',
              color: canal === c.valor ? T.texto : T.apagado,
            }}
          >
            {c.etiqueta}
          </button>
        ))}
      </div>
      {correo.estado === 'error' && correo.error && (
        <p style={{ fontSize: 12, color: T.error, background: T.errorFondo, padding: '6px 9px', borderRadius: 8 }}>{correo.error}</p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => void onAccion?.(correo.id, 'descartar')} disabled={!editable || !onAccion}
          style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.linea}`, background: 'transparent', color: T.apagado, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
        >
          Descartar
        </button>
        <button
          onClick={() => void onAccion?.(correo.id, 'enviar', { asunto, cuerpo, canal })} disabled={!editable || ocupado || !onAccion || vacio}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none',
            background: T.acento, color: T.sobreAcento, fontSize: 12.5, fontWeight: 700, cursor: ocupado ? 'wait' : 'pointer',
            opacity: !editable || vacio ? 0.6 : 1,
          }}
        >
          {ocupado ? <Loader2 size={13} style={{ animation: 'agente-giro 1s linear infinite' }} /> : <Send size={13} />}
          {ocupado ? 'Enviando…' : correo.estado === 'error' ? 'Reintentar envío' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

/* ── Tarea o aviso propuesto: la persona lo confirma ─────────────────────── */

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

function TarjetaAccion({ accion, tema, onAccion }: { accion: AccionBorrador; tema: TemaChat; onAccion?: AccionAccion }) {
  const T = TEMAS[tema]
  const d = accion.datos as Record<string, string | number | undefined>
  const esTarea = accion.tipo === 'tarea'
  const Icono = esTarea ? ClipboardList : BellRing
  const etiquetaOk = esTarea ? 'Crear tarea' : accion.tipo === 'aviso_crear' ? 'Activar aviso' : 'Cancelar aviso'

  if (accion.estado === 'hecha' || accion.estado === 'descartada') {
    const hecha = accion.estado === 'hecha'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: hecha ? T.texto : T.tenue, padding: '8px 12px', borderRadius: 10, border: `1px solid ${T.linea}` }}>
        {hecha ? <Check size={13} color={T.acento} style={{ flexShrink: 0 }} /> : <X size={13} style={{ flexShrink: 0 }} />}
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {hecha ? (esTarea ? 'Tarea creada' : accion.tipo === 'aviso_crear' ? 'Aviso activado' : 'Aviso cancelado') : 'Descartado'}: {accion.titulo}
        </span>
      </div>
    )
  }
  const ocupado = accion.estado === 'ejecutando'
  return (
    <div style={{ border: `1px solid ${T.acento}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: T.texto }}>
        <Icono size={13} color={T.acento} /> {esTarea ? `Tarea para ${d.responsable ?? ''}` : 'Aviso semanal'}
        <span style={{ fontWeight: 500, color: T.apagado }}>· confirma para {esTarea ? 'crearla' : 'aplicarlo'}</span>
      </p>
      <p style={{ fontSize: 13, color: T.texto, fontWeight: 600, overflowWrap: 'anywhere' }}>{accion.titulo}</p>
      {esTarea && (
        <p style={{ fontSize: 12, color: T.apagado, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {d.descripcion ? `${d.descripcion}\n` : ''}Plazo: {String(d.plazo ?? '')} · Área: {String(d.area ?? 'Ventas')}
        </p>
      )}
      {accion.tipo === 'aviso_crear' && (
        <p style={{ fontSize: 12, color: T.apagado, lineHeight: 1.5 }}>
          Cada {DIAS[(Number(d.dia_semana) || 1) - 1]} te dejo un borrador por vendedor y te aviso. No se envía nada sin que lo apruebes.
        </p>
      )}
      {accion.estado === 'error' && accion.error && (
        <p style={{ fontSize: 12, color: T.error, background: T.errorFondo, padding: '6px 9px', borderRadius: 8 }}>{accion.error}</p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => void onAccion?.(accion.id, 'descartar')} disabled={ocupado || !onAccion}
          style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.linea}`, background: 'transparent', color: T.apagado, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
        >
          Descartar
        </button>
        <button
          onClick={() => void onAccion?.(accion.id, 'confirmar')} disabled={ocupado || !onAccion}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: T.acento, color: T.sobreAcento, fontSize: 12.5, fontWeight: 700, cursor: ocupado ? 'wait' : 'pointer' }}
        >
          {ocupado ? <Loader2 size={13} style={{ animation: 'agente-giro 1s linear infinite' }} /> : <Check size={13} />}
          {ocupado ? 'Aplicando…' : accion.estado === 'error' ? 'Reintentar' : etiquetaOk}
        </button>
      </div>
    </div>
  )
}

/* ── Lista para marcar (ej. carga del camión) ──────────────────────────────── */

type MarcarItem = (listaId: string, itemId: string, hecho: boolean) => Promise<void>

// Zona fija: la misma hora en el servidor y en el navegador (y es la hora de la bodega).
const horaCorta = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }) : '')

function TarjetaLista({ lista, tema, onMarcar }: { lista: ListaChequeo; tema: TemaChat; onMarcar?: MarcarItem }) {
  const T = TEMAS[tema]
  const [ocultarHechos, setOcultarHechos] = useState(false)
  const hechos = lista.items.filter(i => i.hecho).length
  const total = lista.items.length
  const completa = total > 0 && hechos === total
  const visibles = ocultarHechos ? lista.items.filter(i => !i.hecho) : lista.items

  return (
    <div style={{ border: `1px solid ${completa ? T.linea : T.acento}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <ListChecks size={14} color={T.acento} style={{ flexShrink: 0 }} />
        <p style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.texto, overflowWrap: 'anywhere' }}>{lista.titulo}</p>
        <span style={{ fontSize: 12, fontWeight: 700, color: completa ? T.acento : T.apagado, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{hechos} de {total}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: T.linea, overflow: 'hidden' }} aria-hidden>
        <div style={{ width: `${total ? (hechos / total) * 100 : 0}%`, height: '100%', background: T.acento, transition: 'width 200ms cubic-bezier(0.23, 1, 0.32, 1)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibles.map(it => (
          <label key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 2px', borderTop: `1px solid ${T.linea}`, cursor: onMarcar ? 'pointer' : 'default' }}>
            <input
              type="checkbox" checked={it.hecho} disabled={!onMarcar}
              onChange={e => void onMarcar?.(lista.id, it.id, e.target.checked)}
              style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0, accentColor: T.acento, cursor: 'pointer' }}
            />
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, color: it.hecho ? T.tenue : T.texto, textDecoration: it.hecho ? 'line-through' : 'none', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{it.texto}</span>
              {it.detalle && <span style={{ fontSize: 11.5, color: T.apagado, overflowWrap: 'anywhere', lineHeight: 1.45 }}>{it.detalle}</span>}
              {it.hecho && (it.hecho_por || it.hecho_at) && (
                <span style={{ fontSize: 11, color: T.tenue }}>✓ {it.hecho_por ?? ''}{it.hecho_at ? ` · ${horaCorta(it.hecho_at)}` : ''}</span>
              )}
            </span>
          </label>
        ))}
        {visibles.length === 0 && <p style={{ fontSize: 12, color: T.apagado, padding: '8px 2px', borderTop: `1px solid ${T.linea}` }}>Todo marcado.</p>}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {hechos > 0 && hechos < total && (
          <button onClick={() => setOcultarHechos(o => !o)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, fontWeight: 700, color: T.apagado, cursor: 'pointer' }}>
            {ocultarHechos ? `Mostrar los ${hechos} marcados` : 'Ocultar marcados'}
          </button>
        )}
        <button
          onClick={() => descargarCsv([['Ítem', 'Detalle', 'Marcado', 'Por', 'Hora'], ...lista.items.map(i => [i.texto, i.detalle ?? '', i.hecho ? 'Sí' : 'No', i.hecho_por ?? '', horaCorta(i.hecho_at)])])}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, fontSize: 11.5, fontWeight: 700, color: T.apagado, cursor: 'pointer' }}
        >
          <FileDown size={12} /> Excel (CSV)
        </button>
      </div>
    </div>
  )
}

/* ── Vista del chat ───────────────────────────────────────────────────────── */

export function VistaChat({ mensajes, cargando, enviar, tema, ejemplos, deshabilitado, maxAlto, idCampo, correos = [], accionCorreo, acciones = [], accionAccion, listas = [], marcarItem, esVendedor }: {
  mensajes: Mensaje[]
  /** Borradores de correo que propuso el asistente en esta conversación. */
  correos?: CorreoBorrador[]
  accionCorreo?: AccionCorreo
  /** Tareas y avisos propuestos, pendientes de confirmar. */
  acciones?: AccionBorrador[]
  accionAccion?: AccionAccion
  /** Listas para marcar (checklists) creadas por el asistente. */
  listas?: ListaChequeo[]
  marcarItem?: MarcarItem
  /** Vendedor (no admin): el asistente sólo ve su cartera. Cambia el texto de bienvenida. */
  esVendedor?: boolean
  cargando: boolean
  enviar: (texto: string) => void | Promise<void>
  tema: TemaChat
  ejemplos: string[]
  deshabilitado?: boolean
  /** Alto máximo del área de mensajes (la página usa 58vh; la burbuja la deja crecer con flex). */
  maxAlto?: string
  idCampo: string
}) {
  const T = TEMAS[tema]
  const [entrada, setEntrada] = useState('')
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensajes, cargando, correos.length, acciones.length, listas.length])

  // "Enviar todos": manda cada borrador pendiente tal como se ve en su tarjeta (con sus ediciones).
  const ediciones = useRef(new Map<string, EdicionCorreo>())
  const registrarEdicion = useCallback((id: string, e: EdicionCorreo) => { ediciones.current.set(id, e) }, [])
  const pendientes = correos.filter(c => c.estado === 'pendiente')
  const [confirmarTodos, setConfirmarTodos] = useState(false)
  const [enviandoTodos, setEnviandoTodos] = useState(false)
  const enviarTodos = async () => {
    if (!accionCorreo) return
    setEnviandoTodos(true)
    for (const c of pendientes) await accionCorreo(c.id, 'enviar', ediciones.current.get(c.id))
    setEnviandoTodos(false)
    setConfirmarTodos(false)
  }

  const mandar = () => {
    if (!entrada.trim() || cargando || deshabilitado) return
    void enviar(entrada)
    setEntrada('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: '1 1 auto', minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', ...(maxAlto ? { maxHeight: maxAlto } : {}) }}>
        {mensajes.length === 0 && (
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.texto }}>{esVendedor ? 'Pregúntame por tu cartera.' : 'Pregúntame lo que quieras de la base de datos.'}</p>
            <p style={{ fontSize: 12, color: T.apagado, marginTop: 4, lineHeight: 1.5 }}>
              {esVendedor
                ? 'Quiénes de tus clientes están por pedir, qué ofrecerles, qué tienes por cobrar, barriles en clientes y stock. Solo veo tu cartera.'
                : 'Clientes, ventas, deuda, cobros y stock. Solo leo datos: no modifico nada. Si me lo pides, preparo correos, tareas y avisos para los vendedores, y tú decides si se envían.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
              {ejemplos.map(e => (
                <button
                  key={e} onClick={() => void enviar(e)} disabled={deshabilitado || cargando}
                  style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.linea}`, background: T.campo, fontSize: 12.5, color: T.texto, cursor: deshabilitado ? 'not-allowed' : 'pointer', lineHeight: 1.4 }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, flexDirection: m.rol === 'usuario' ? 'row-reverse' : 'row' }}>
            <div style={{
              width: 26, height: 26, borderRadius: 100, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: m.rol === 'usuario' ? T.acento : m.error ? T.errorFondo : T.campo,
              color: m.rol === 'usuario' ? T.sobreAcento : m.error ? T.error : T.apagado,
            }}>
              {m.rol === 'usuario' ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div style={{ maxWidth: '84%', minWidth: 0 }}>
              <div style={{
                padding: '9px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, overflowWrap: 'anywhere',
                background: m.rol === 'usuario' ? T.acento : m.error ? T.errorFondo : T.campo,
                color: m.rol === 'usuario' ? T.sobreAcento : m.error ? T.error : T.texto,
              }}>
                {m.rol === 'usuario' ? m.texto : <TextoFormateado texto={m.texto} />}
              </div>
              {m.herramientas && m.herramientas.length > 0 && (
                <p style={{ fontSize: 10.5, color: T.tenue, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Database size={10} /> consultó: {m.herramientas.join(', ')}
                </p>
              )}
            </div>
          </div>
        ))}

        {pendientes.length >= 2 && accionCorreo && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderRadius: 10, background: T.campo, fontSize: 12, color: T.texto }}>
            {confirmarTodos
              ? <span style={{ minWidth: 0 }}>¿Enviar {pendientes.length} borradores a {pendientes.map(c => c.destinatario_nombre).join(', ')}?</span>
              : <span>{pendientes.length} borradores sin enviar</span>}
            <div style={{ display: 'flex', gap: 6 }}>
              {confirmarTodos && (
                <button onClick={() => setConfirmarTodos(false)} disabled={enviandoTodos}
                  style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.linea}`, background: 'transparent', color: T.apagado, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
              )}
              <button onClick={() => (confirmarTodos ? void enviarTodos() : setConfirmarTodos(true))} disabled={enviandoTodos}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: 'none', background: T.acento, color: T.sobreAcento, fontSize: 12, fontWeight: 700, cursor: enviandoTodos ? 'wait' : 'pointer' }}>
                {enviandoTodos ? <Loader2 size={12} style={{ animation: 'agente-giro 1s linear infinite' }} /> : <Send size={12} />}
                {enviandoTodos ? 'Enviando…' : confirmarTodos ? 'Sí, enviar todos' : `Enviar los ${pendientes.length}`}
              </button>
            </div>
          </div>
        )}
        {correos.map(c => <TarjetaCorreo key={c.id} correo={c} tema={tema} onAccion={accionCorreo} onEdicion={registrarEdicion} />)}
        {acciones.map(a => <TarjetaAccion key={a.id} accion={a} tema={tema} onAccion={accionAccion} />)}
        {listas.map(l => <TarjetaLista key={l.id} lista={l} tema={tema} onMarcar={marcarItem} />)}

        {cargando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.apagado, fontSize: 12.5 }}>
            <Loader2 size={14} style={{ animation: 'agente-giro 1s linear infinite' }} /> Consultando la base de datos…
          </div>
        )}
        <div ref={fin} />
      </div>

      <form onSubmit={e => { e.preventDefault(); mandar() }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${T.linea}` }}>
        <input
          id={idCampo} value={entrada} onChange={e => setEntrada(e.target.value)} maxLength={800}
          placeholder="Ej: ¿Cuánto nos deben en total?" disabled={deshabilitado || cargando} autoComplete="off"
          style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.linea}`, background: T.campo, fontSize: 16, color: T.texto, outline: 'none' }}
        />
        <button
          type="submit" aria-label="Enviar" disabled={deshabilitado || cargando || !entrada.trim()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 14px', borderRadius: 10, border: 'none',
            background: T.acento, color: T.sobreAcento, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: deshabilitado || cargando || !entrada.trim() ? 0.5 : 1,
          }}
        >
          <Send size={14} />
        </button>
      </form>
      <style>{'@keyframes agente-giro{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}
