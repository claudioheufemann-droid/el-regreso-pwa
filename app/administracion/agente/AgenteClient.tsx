'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Send, Bot, User, Database, SlidersHorizontal, TriangleAlert, Loader2 } from 'lucide-react'

export interface ConfigAgente {
  configurado: boolean
  parametros: [string, string][]
  reglas: string[]
  glosario: string[]
  ejemplos: string[]
  consultas: { nombre: string; descripcion: string; parametros: string[] }[]
}

interface Mensaje {
  rol: 'usuario' | 'agente'
  texto: string
  herramientas?: string[]
  error?: boolean
}

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8',
  line: '#E2E8F0', blue: '#2563EB', blueSoft: '#EFF6FF', amber: '#D97706', amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A', red: '#DC2626', redSoft: '#FEF2F2', green: '#059669',
}

export default function AgenteClient({ config }: { config: ConfigAgente }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [entrada, setEntrada] = useState('')
  const [cargando, setCargando] = useState(false)
  const [vista, setVista] = useState<'chat' | 'sistema'>('chat')
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensajes, cargando])

  async function enviar(texto: string) {
    const pregunta = texto.trim()
    if (!pregunta || cargando) return
    const historial: Mensaje[] = [...mensajes, { rol: 'usuario', texto: pregunta }]
    setMensajes(historial)
    setEntrada('')
    setCargando(true)
    try {
      const res = await fetch('/api/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensajes: historial.filter(m => !m.error).map(m => ({ rol: m.rol, texto: m.texto })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'No se pudo consultar al asistente.')
      setMensajes([...historial, {
        rol: 'agente', texto: data.respuesta,
        herramientas: [...new Set<string>((data.herramientas ?? []).map((h: { nombre: string }) => h.nombre))],
      }])
    } catch (e) {
      setMensajes([...historial, { rol: 'agente', texto: e instanceof Error ? e.message : 'Error de conexión.', error: true }])
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 24px 40px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Link href="/administracion" style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={15} /> Volver a Administración
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Asistente de datos</h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.6, maxWidth: 560 }}>
              Pregúntale en lenguaje normal por clientes, ventas, deuda y stock. Responde sólo con lo que
              encuentra en la base de datos y no modifica nada.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 2, background: '#E2E8F0', borderRadius: 9, padding: 3 }}>
            {([['chat', 'Chat', Bot], ['sistema', 'Sistema y parámetros', SlidersHorizontal]] as const).map(([id, label, Icono]) => (
              <button
                key={id} onClick={() => setVista(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, background: vista === id ? C.card : 'transparent', color: vista === id ? C.text : C.muted,
                }}
              >
                <Icono size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        {!config.configurado && (
          <div style={{ display: 'flex', gap: 9, background: C.amberSoft, border: `1px solid ${C.amberBorder}`, borderRadius: 11, padding: '12px 14px' }}>
            <TriangleAlert size={16} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
              Falta la clave gratuita de Gemini. Créala en <strong>aistudio.google.com/apikey</strong> y agrégala
              como variable de entorno <code>GEMINI_API_KEY</code> (local y en Vercel).
            </p>
          </div>
        )}

        {vista === 'chat' ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 460 }}>
            <div style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '58vh', overflowY: 'auto' }}>
              {mensajes.length === 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Prueba preguntando:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                    {config.ejemplos.map(e => (
                      <button
                        key={e} onClick={() => enviar(e)} disabled={!config.configurado}
                        style={{
                          textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.bg,
                          fontSize: 13, color: C.text, cursor: config.configurado ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensajes.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.rol === 'usuario' ? 'row-reverse' : 'row' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 100, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: m.rol === 'usuario' ? C.blue : m.error ? C.redSoft : C.bg, color: m.rol === 'usuario' ? '#fff' : m.error ? C.red : C.muted,
                  }}>
                    {m.rol === 'usuario' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div style={{ maxWidth: '82%' }}>
                    <div style={{
                      padding: '10px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                      background: m.rol === 'usuario' ? C.blue : m.error ? C.redSoft : C.bg,
                      color: m.rol === 'usuario' ? '#fff' : m.error ? C.red : C.text,
                    }}>
                      {m.texto}
                    </div>
                    {m.herramientas && m.herramientas.length > 0 && (
                      <p style={{ fontSize: 11, color: C.faint, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Database size={11} /> consultó: {m.herramientas.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {cargando && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13 }}>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Consultando la base de datos…
                </div>
              )}
              <div ref={fin} />
            </div>

            <form
              onSubmit={e => { e.preventDefault(); void enviar(entrada) }}
              style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${C.line}` }}
            >
              <input
                id="pregunta-agente" value={entrada} onChange={e => setEntrada(e.target.value)} maxLength={800}
                placeholder="Ej: ¿Cuánto compra Café Central?" disabled={!config.configurado || cargando}
                style={{ flex: 1, padding: '10px 13px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.bg, fontSize: 13.5, color: C.text, outline: 'none' }}
              />
              <button
                type="submit" disabled={!config.configurado || cargando || !entrada.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 10, border: 'none', background: C.blue,
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !config.configurado || cargando || !entrada.trim() ? 0.5 : 1,
                }}
              >
                <Send size={14} /> Enviar
              </button>
            </form>
          </div>
        ) : (
          <PanelSistema config={config} />
        )}
      </div>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>{titulo}</h2>
      {children}
    </div>
  )
}

function PanelSistema({ config }: { config: ConfigAgente }) {
  return (
    <>
      <div style={{ background: C.blueSoft, border: '1px solid #BFDBFE', borderRadius: 11, padding: '12px 14px', fontSize: 12.5, color: C.text, lineHeight: 1.7 }}>
        Todo esto vive en la carpeta <code>lib/agente/</code> del proyecto: <code>sistema.ts</code> (parámetros, reglas y
        glosario) y <code>consultas/</code> (lo que puede leer de Supabase). Para enseñarle algo nuevo se agrega una consulta
        al catálogo — ver <code>lib/agente/README.md</code>.
      </div>

      <Seccion titulo="Parámetros">
        {config.parametros.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
            <span style={{ color: C.muted }}>{k}</span>
            <span style={{ color: C.text, fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </Seccion>

      <Seccion titulo={`Consultas que sabe hacer (${config.consultas.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {config.consultas.map(c => (
            <div key={c.nombre}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                <code>{c.nombre}</code>
                <span style={{ fontWeight: 500, color: C.faint, marginLeft: 8, fontSize: 11.5 }}>{c.parametros.join(' · ')}</span>
              </p>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginTop: 2 }}>{c.descripcion}</p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Reglas que sigue">
        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
          {config.reglas.map(r => <li key={r}>{r}</li>)}
        </ul>
      </Seccion>

      <Seccion titulo="Glosario del negocio">
        <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
          {config.glosario.map(g => <li key={g}>{g}</li>)}
        </ul>
      </Seccion>
    </>
  )
}
