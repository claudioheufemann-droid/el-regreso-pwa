'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Bot, SlidersHorizontal, TriangleAlert, Brain, Check, X, Trash2 } from 'lucide-react'
import { VistaChat, useChatAgente } from '@/components/agente/ChatAgente'

export interface ConfigAgente {
  configurado: boolean
  parametros: [string, string][]
  reglas: string[]
  glosario: string[]
  ejemplos: string[]
  consultas: { nombre: string; descripcion: string; parametros: string[] }[]
}

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8',
  line: '#E2E8F0', blue: '#2563EB', blueSoft: '#EFF6FF', amber: '#D97706', amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A', red: '#DC2626', redSoft: '#FEF2F2', green: '#059669',
}

export default function AgenteClient({ config }: { config: ConfigAgente }) {
  const chat = useChatAgente()
  const [vista, setVista] = useState<'chat' | 'memoria' | 'sistema'>('chat')

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
            {([['chat', 'Chat', Bot], ['memoria', 'Memoria', Brain], ['sistema', 'Sistema y parámetros', SlidersHorizontal]] as const).map(([id, label, Icono]) => (
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
            <VistaChat {...chat} tema="claro" ejemplos={config.ejemplos} deshabilitado={!config.configurado} maxAlto="58vh" idCampo="pregunta-agente" />
          </div>
        ) : vista === 'memoria' ? (
          <PanelMemoria />
        ) : (
          <PanelSistema config={config} />
        )}
      </div>
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

interface FilaMemoria { id: number; ambito: 'global' | 'usuario'; tipo: string; contenido: string; estado: 'pendiente' | 'activa'; fuente: string; propia: boolean }
interface UsoSemana {
  dias: number; preguntas: number; sin_respuesta: number; tokens_entrada: number; tokens_salida: number; tokens_cacheados: number
  promedio_por_pregunta: number | null; modelos: { modelo: string; preguntas: number }[]
}

const fNum = (n: number) => n.toLocaleString('es-CL')

function PanelMemoria() {
  const [datos, setDatos] = useState<{ memorias: FilaMemoria[]; uso: UsoSemana } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('regla')
  const [global, setGlobal] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  const [version, setVersion] = useState(0)
  useEffect(() => {
    let vigente = true
    fetch('/api/agente/memoria')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then(d => { if (vigente) { setDatos(d); setError(null) } })
      .catch(() => { if (vigente) setError('No se pudo cargar la memoria.') })
    return () => { vigente = false }
  }, [version])
  const cargar = () => setVersion(v => v + 1)

  async function llamar(metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo?: unknown, query = '') {
    setOcupado(true)
    try {
      const r = await fetch(`/api/agente/memoria${query}`, {
        method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      })
      if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? 'No se pudo completar la acción.')
      else { setError(null); cargar() }
    } finally {
      setOcupado(false)
    }
  }

  const pendientes = datos?.memorias.filter(m => m.estado === 'pendiente') ?? []
  const activas = datos?.memorias.filter(m => m.estado === 'activa') ?? []
  const boton = { border: 'none', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: ocupado ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 } as const

  const Fila = ({ m }: { m: FilaMemoria }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: `1px solid ${C.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>{m.contenido}</p>
        <p style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>
          {m.tipo} · {m.ambito === 'global' ? 'para todos' : 'solo tuya'} · {m.fuente === 'agente' ? 'propuesta del asistente' : m.fuente === 'semilla' ? 'conocimiento inicial' : 'agregada por un administrador'}
        </p>
      </div>
      {m.estado === 'pendiente' && (
        <>
          <button disabled={ocupado} onClick={() => llamar('PATCH', { id: m.id, estado: 'activa' })} style={{ ...boton, background: C.green, color: '#fff' }}><Check size={13} /> Aprobar</button>
          <button disabled={ocupado} onClick={() => llamar('PATCH', { id: m.id, estado: 'rechazada' })} style={{ ...boton, background: C.redSoft, color: C.red }}><X size={13} /> Rechazar</button>
        </>
      )}
      {m.estado === 'activa' && (
        <button disabled={ocupado} onClick={() => llamar('DELETE', undefined, `?id=${m.id}`)} aria-label="Borrar" title="Borrar" style={{ ...boton, background: 'transparent', color: C.faint }}><Trash2 size={14} /></button>
      )}
    </div>
  )

  return (
    <>
      <div style={{ background: C.blueSoft, border: '1px solid #BFDBFE', borderRadius: 11, padding: '12px 14px', fontSize: 12.5, color: C.text, lineHeight: 1.7 }}>
        Lo que el asistente recuerda entre conversaciones. Solo entra a cada pregunta lo <strong>activo y relevante</strong> (un puñado de líneas),
        así puede crecer sin gastar más. Lo que propone el propio asistente para <strong>todos</strong> queda pendiente hasta que lo apruebes:
        los datos de la base no pueden enseñarle reglas solos.
      </div>

      {error && <p style={{ fontSize: 12.5, color: C.red }}>{error}</p>}

      {datos && (
        <Seccion titulo={`Uso de tokens — últimos ${datos.uso.dias} días`}>
          {datos.uso.preguntas === 0 ? (
            <p style={{ fontSize: 12.5, color: C.muted }}>Todavía no hay preguntas registradas.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {([
                ['Preguntas', fNum(datos.uso.preguntas)],
                ['Sin respuesta útil', fNum(datos.uso.sin_respuesta)],
                ['Tokens por pregunta', datos.uso.promedio_por_pregunta != null ? fNum(datos.uso.promedio_por_pregunta) : '—'],
                ['Tokens de entrada', fNum(datos.uso.tokens_entrada)],
                ['Tokens de salida', fNum(datos.uso.tokens_salida)],
                ['Entrada reutilizada de caché', datos.uso.tokens_entrada > 0 ? `${fNum(datos.uso.tokens_cacheados)} (${Math.round((datos.uso.tokens_cacheados / datos.uso.tokens_entrada) * 100)}%)` : '—'],
                ['Modelo más usado', datos.uso.modelos[0]?.modelo ?? '—'],
              ] as const).map(([k, v]) => (
                <div key={k}>
                  <p style={{ fontSize: 11, color: C.muted }}>{k}</p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{v}</p>
                </div>
              ))}
            </div>
          )}
        </Seccion>
      )}

      {pendientes.length > 0 && (
        <Seccion titulo={`Propuestas por aprobar (${pendientes.length})`}>
          {pendientes.map(m => <Fila key={m.id} m={m} />)}
        </Seccion>
      )}

      <Seccion titulo={`Memoria activa (${activas.length})`}>
        {!datos ? <p style={{ fontSize: 12.5, color: C.muted }}>Cargando…</p> : activas.length === 0
          ? <p style={{ fontSize: 12.5, color: C.muted }}>Aún no hay nada guardado.</p>
          : activas.map(m => <Fila key={m.id} m={m} />)}
      </Seccion>

      <Seccion titulo="Enseñarle algo">
        <form onSubmit={e => { e.preventDefault(); if (texto.trim().length >= 5) { void llamar('POST', { contenido: texto, tipo, ambito: global ? 'global' : 'usuario' }); setTexto('') } }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            id="memoria-nueva" value={texto} onChange={e => setTexto(e.target.value)} maxLength={500} rows={3}
            placeholder='Ej: "Café Black Mamba" aparece como "Mamba" en ventas.'
            style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.bg, fontSize: 13, color: C.text, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select id="memoria-tipo" value={tipo} onChange={e => setTipo(e.target.value)} style={{ padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, fontSize: 12.5 }}>
              {['regla', 'alias', 'esquema', 'preferencia', 'dato'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.text }}>
              <input id="memoria-global" type="checkbox" checked={global} onChange={e => setGlobal(e.target.checked)} /> Para todos los administradores
            </label>
            <button type="submit" disabled={ocupado || texto.trim().length < 5} style={{ ...boton, marginLeft: 'auto', background: C.blue, color: '#fff', padding: '9px 16px', opacity: texto.trim().length < 5 ? 0.5 : 1 }}>Guardar</button>
          </div>
        </form>
      </Seccion>
    </>
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
