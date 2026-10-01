'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Database, Loader2 } from 'lucide-react'

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

  useEffect(() => {
    let vigente = true
    fetch('/api/agente/conversacion')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!vigente || !d?.conversacion_id) return
        setConversacionId(d.conversacion_id)
        // Si el usuario ya alcanzó a escribir algo mientras cargaba, no se lo pisamos.
        setMensajes(actuales => (actuales.length ? actuales : d.mensajes))
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
  }, [conversacionId])

  return { mensajes, cargando, enviar, limpiar, recargar }
}

/* ── Markdown mínimo (negrita, cursiva, listas) sin HTML crudo ─────────────── */

function enLinea(texto: string, clave: string) {
  return texto.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((trozo, i) => {
    if (trozo.startsWith('**') && trozo.endsWith('**') && trozo.length > 4) return <strong key={`${clave}${i}`}>{trozo.slice(2, -2)}</strong>
    if (trozo.startsWith('*') && trozo.endsWith('*') && trozo.length > 2) return <em key={`${clave}${i}`}>{trozo.slice(1, -1)}</em>
    return <Fragment key={`${clave}${i}`}>{trozo}</Fragment>
  })
}

function TextoFormateado({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('\n').map((linea, i) => {
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

/* ── Vista del chat ───────────────────────────────────────────────────────── */

export function VistaChat({ mensajes, cargando, enviar, tema, ejemplos, deshabilitado, maxAlto, idCampo }: {
  mensajes: Mensaje[]
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

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensajes, cargando])

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
            <p style={{ fontSize: 13, fontWeight: 700, color: T.texto }}>Pregúntame lo que quieras de la base de datos.</p>
            <p style={{ fontSize: 12, color: T.apagado, marginTop: 4, lineHeight: 1.5 }}>Clientes, ventas, deuda, cobros y stock. Solo leo datos: no modifico nada.</p>
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
