'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import {
  MessageCircle, Search, ChevronDown, ChevronUp, MapPin,
  Send, X, CheckSquare, Square, Clock, Zap, Users,
} from 'lucide-react'
import { useUser } from '@/lib/userContext'

interface FrequencyStat {
  ultima_compra: string | null
  dias_sin_compra: number | null
  ciclo_promedio_dias: number | null
  total_pedidos: number
  alert_level: string
  dias_para_siguiente: number | null
  siguiente_compra_estimada: string | null
  // Scoring fields (RFM model)
  score?: number
  segmento?: string
  confianza_score?: string
  litros_totales?: number
  revenue_total?: number
  pedidos_por_mes?: number
}

interface Cliente {
  id: number
  nombre_fantasia: string | null
  razon_social: string | null
  categoria: string | null
  vendedor: string | null
  localidad: string | null
  localidad_entrega: string | null
  ruta_despacho: string | null
  telefono: string | null
  lat: number | null
  lng: number | null
  ultimoContacto: { fecha: string; tipo: string; vendedor: string } | null
  ultimoPedido: { ultimaFecha: string; litrosPeriodo: number; ventaPeriodo: number } | null
  frecuencia: FrequencyStat | null
}

interface Props {
  clientes: Cliente[]
  periodo: { nombre: string; fecha_inicio: string; fecha_fin: string } | null
  totalesPorVendedor: Record<string, { litros: number; venta: number }>
}

function diasDesde(fechaStr: string | null | undefined): number | null {
  if (!fechaStr) return null
  const diff = Date.now() - new Date(fechaStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatFecha(fechaStr: string | null | undefined) {
  if (!fechaStr) return '—'
  const d = new Date(fechaStr)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d.getDate()} ${meses[d.getMonth()]}`
}

function urgencyColor(dias: number | null) {
  if (dias === null) return '#F87171'
  if (dias <= 7) return '#34D399'
  if (dias <= 14) return '#F59E0B'
  return '#F87171'
}

// ── WhatsApp Campaign Modal ────────────────────────────────────────────────
interface CampanaProps {
  seleccionados: Cliente[]
  onClose: () => void
}

function CampanaWhatsApp({ seleccionados, onClose }: CampanaProps) {
  const conTelefono = seleccionados.filter(c => c.telefono)
  const [mensaje, setMensaje] = useState('Hola {nombre}, te saluda El Regreso Beer Co. 🍺 ¿Cómo están? ¿Les interesa hacer un pedido esta semana?')
  const [delaySeg, setDelaySeg] = useState(45)
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [countdown, setCountdown] = useState(0)

  async function iniciarCampana() {
    if (conTelefono.length === 0) return
    setCorriendo(true)
    setProgreso(0)

    for (let i = 0; i < conTelefono.length; i++) {
      const c = conTelefono[i]
      const nombre = c.nombre_fantasia ?? ''
      const texto = mensaje.replace(/{nombre}/g, nombre)
      const phone = c.telefono!.replace(/\D/g, '')
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(texto)}`

      window.open(url, '_blank')
      setProgreso(i + 1)

      // Countdown between messages
      if (i < conTelefono.length - 1) {
        const jitter = Math.floor(Math.random() * 15) // +0-15s random
        const total = delaySeg + jitter
        for (let s = total; s > 0; s--) {
          setCountdown(s)
          await new Promise(r => setTimeout(r, 1000))
        }
        setCountdown(0)
      }
    }

    setCorriendo(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget && !corriendo) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 560, background: '#141414',
        border: '1px solid #2A2A2A', borderRadius: '20px 20px 0 0',
        padding: '20px 20px 32px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={18} style={{ color: '#25D366' }} />
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Campaña WhatsApp</h2>
          </div>
          {!corriendo && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#1A1A1A', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>SELECCIONADOS</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{seleccionados.length}</p>
          </div>
          <div style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#25D366', marginBottom: 3 }}>CON TELÉFONO</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{conTelefono.length}</p>
          </div>
        </div>

        {/* Mensaje */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6 }}>MENSAJE (usa {'{nombre}'} para personalizar)</p>
          <textarea
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            disabled={corriendo}
            rows={4}
            style={{
              width: '100%', background: '#1A1A1A', border: '1px solid #333',
              borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13,
              resize: 'vertical', fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Delay */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6 }}>
            DEMORA ENTRE MENSAJES: <span style={{ color: '#D4AF37' }}>{delaySeg}s base + hasta 15s aleatorio</span>
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {[30, 45, 60, 90, 120].map(s => (
              <button
                key={s}
                onClick={() => setDelaySeg(s)}
                disabled={corriendo}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: corriendo ? 'not-allowed' : 'pointer',
                  background: delaySeg === s ? '#D4AF37' : '#1A1A1A',
                  color: delaySeg === s ? '#080808' : '#888',
                }}
              >
                {s}s
              </button>
            ))}
          </div>
          <p style={{ fontSize: 10, color: '#444', marginTop: 6 }}>
            ⚠ Meta recomienda mínimo 30s entre mensajes para evitar restricciones
          </p>
        </div>

        {/* Progreso */}
        {(corriendo || progreso > 0) && (
          <div style={{ background: '#1A1A1A', borderRadius: 12, padding: '14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                {corriendo ? `Enviando ${progreso} de ${conTelefono.length}...` : `✅ Campaña completada — ${progreso} mensajes`}
              </span>
              {countdown > 0 && (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#D4AF37' }}>⏱ {countdown}s</span>
              )}
            </div>
            <div style={{ height: 6, background: '#2A2A2A', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, background: '#25D366',
                width: `${(progreso / conTelefono.length) * 100}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {/* Lista de destinatarios */}
        <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 16 }}>
          {conTelefono.map((c, i) => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0', borderBottom: '1px solid #1E1E1E',
              opacity: progreso > i ? 0.5 : 1,
            }}>
              <span style={{ fontSize: 12, color: progreso > i ? '#34D399' : '#ccc' }}>
                {progreso > i ? '✓ ' : ''}{c.nombre_fantasia}
              </span>
              <span style={{ fontSize: 11, color: '#555' }}>{c.telefono}</span>
            </div>
          ))}
          {seleccionados.filter(c => !c.telefono).length > 0 && (
            <p style={{ fontSize: 11, color: '#F87171', padding: '6px 0' }}>
              ⚠ {seleccionados.filter(c => !c.telefono).length} cliente(s) sin teléfono — se omitirán
            </p>
          )}
        </div>

        {/* Botón */}
        <button
          onClick={corriendo ? undefined : iniciarCampana}
          disabled={conTelefono.length === 0 || corriendo}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 14, fontWeight: 800, fontSize: 15,
            cursor: conTelefono.length === 0 || corriendo ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: corriendo ? '#1A1A1A' : 'rgba(37,211,102,0.15)',
            border: corriendo ? 'none' : '1px solid rgba(37,211,102,0.3)',
            color: corriendo ? '#555' : '#25D366',
          } as React.CSSProperties}
        >
          {corriendo ? (
            <>⏳ En progreso — no cierres la pantalla</>
          ) : progreso === conTelefono.length && progreso > 0 ? (
            <>✅ Campaña completada</>
          ) : (
            <><Send size={18} /> Iniciar campaña ({conTelefono.length} mensajes)</>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Segment color helpers ──────────────────────────────────────────────────
const SEG_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'rgba(212,175,55,0.12)', text: '#D4AF37', border: 'rgba(212,175,55,0.3)' },
  B: { bg: 'rgba(52,211,153,0.1)',  text: '#34D399', border: 'rgba(52,211,153,0.25)' },
  C: { bg: 'rgba(96,165,250,0.1)',  text: '#60A5FA', border: 'rgba(96,165,250,0.25)' },
  D: { bg: 'rgba(245,158,11,0.1)',  text: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
  E: { bg: 'rgba(248,113,113,0.08)',text: '#F87171', border: 'rgba(248,113,113,0.2)' },
}
const ALERT_COLOR: Record<string, string> = {
  critico: '#EF4444', vencido: '#F87171', proximo: '#F59E0B',
}
const ALERT_LABEL: Record<string, string> = {
  critico: '🔴 Urgente', vencido: '⚠ Vencido', proximo: '⏰ Próximo',
}

// ── ClienteCard ────────────────────────────────────────────────────────────
function ClienteCard({
  cliente, isAdmin, modoSeleccion, seleccionado, onToggleSelect,
}: {
  cliente: Cliente
  isAdmin: boolean
  modoSeleccion: boolean
  seleccionado: boolean
  onToggleSelect: (id: number) => void
}) {
  const router = useRouter()
  const diasContacto = diasDesde(cliente.ultimoContacto?.fecha)
  const seg = cliente.frecuencia?.segmento
  const score = cliente.frecuencia?.score
  const alertLevel = cliente.frecuencia?.alert_level
  const diasSin = cliente.frecuencia?.dias_sin_compra
  const ciclo = cliente.frecuencia?.ciclo_promedio_dias
  const segStyle = seg ? (SEG_STYLE[seg] ?? SEG_STYLE.E) : null
  const hasAlert = alertLevel && ['critico', 'vencido', 'proximo'].includes(alertLevel)
  const alertColor = alertLevel ? (ALERT_COLOR[alertLevel] ?? null) : null

  const waUrl = cliente.telefono
    ? `https://wa.me/${cliente.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${cliente.nombre_fantasia ?? ''}, te saluda El Regreso Beer Co. 🍺`)}`
    : null

  function handleClick() {
    if (modoSeleccion) onToggleSelect(cliente.id)
    else router.push(`/ventas/clientes/${cliente.id}`)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        background: seleccionado ? 'rgba(37,211,102,0.05)' : '#141414',
        border: `1px solid ${seleccionado ? 'rgba(37,211,102,0.3)' : alertLevel === 'critico' ? 'rgba(239,68,68,0.18)' : '#202020'}`,
        borderRadius: 14, padding: '11px 13px',
        cursor: 'pointer', transition: 'border-color 0.15s',
        display: 'flex', alignItems: 'flex-start', gap: 11,
      }}
    >
      {/* Checkbox */}
      {modoSeleccion && (
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          {seleccionado
            ? <CheckSquare size={18} style={{ color: '#25D366' }} />
            : <Square size={18} style={{ color: '#444' }} />
          }
        </div>
      )}

      {/* Segment badge */}
      {segStyle && seg && !modoSeleccion && (
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: segStyle.bg, border: `1px solid ${segStyle.border}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: segStyle.text, lineHeight: 1 }}>{seg}</span>
          {score != null && <span style={{ fontSize: 8, fontWeight: 700, color: segStyle.text, opacity: 0.75 }}>{score}pts</span>}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name + contact badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: '#fff', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cliente.nombre_fantasia}
          </p>
          {diasContacto === null ? (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0, background: 'rgba(248,113,113,0.1)', color: '#F87171', border: '1px solid rgba(248,113,113,0.2)' }}>
              Sin contacto
            </span>
          ) : diasContacto <= 7 ? (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0, background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)' }}>
              {diasContacto === 0 ? 'Hoy' : diasContacto === 1 ? 'Ayer' : `${diasContacto}d`}
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0, background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.18)' }}>
              {diasContacto}d
            </span>
          )}
        </div>

        {/* Tags row */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {(cliente.localidad_entrega || cliente.localidad) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <MapPin size={9} style={{ color: '#555' }} />
              <span style={{ fontSize: 10, color: '#555' }}>{cliente.localidad_entrega || cliente.localidad}</span>
            </div>
          )}
          {cliente.vendedor && (
            <span style={{ fontSize: 10, fontWeight: 700, color: cliente.vendedor === 'Javier Badilla' ? '#F59E0B' : cliente.vendedor === 'Carlos Urrejola' ? '#60A5FA' : '#888' }}>
              {cliente.vendedor.split(' ')[0]}
            </span>
          )}
          {cliente.categoria && (
            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#1C1C1C', color: '#666' }}>
              {cliente.categoria}
            </span>
          )}
          {cliente.ultimoPedido && (
            <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>
              {formatFecha(cliente.ultimoPedido.ultimaFecha)}
            </span>
          )}
        </div>

        {/* Alert bar */}
        {hasAlert && alertColor && (
          <div style={{
            marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={10} style={{ color: alertColor }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: alertColor }}>
                {ALERT_LABEL[alertLevel!]}
              </span>
              <span style={{ fontSize: 10, color: '#555' }}>· {diasSin}d / {ciclo}d</span>
            </div>
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  padding: '3px 9px', borderRadius: 8,
                  background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)',
                  color: '#25D366', fontSize: 10, fontWeight: 700, textDecoration: 'none',
                }}
              >
                <MessageCircle size={11} /> WA
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── RutaSection ────────────────────────────────────────────────────────────
function RutaSection({ ruta, clientes, isAdmin, modoSeleccion, seleccionados, onToggleSelect }: {
  ruta: string
  clientes: Cliente[]
  isAdmin: boolean
  modoSeleccion: boolean
  seleccionados: Set<number>
  onToggleSelect: (id: number) => void
}) {
  const [open, setOpen] = useState(true)
  const sinContactoReciente = clientes.filter(c => {
    const dias = diasDesde(c.ultimoContacto?.fecha)
    return dias === null || dias > 14
  }).length

  const todosSeleccionados = clientes.every(c => seleccionados.has(c.id))

  function toggleAll() {
    if (todosSeleccionados) {
      clientes.forEach(c => { if (seleccionados.has(c.id)) onToggleSelect(c.id) })
    } else {
      clientes.forEach(c => { if (!seleccionados.has(c.id)) onToggleSelect(c.id) })
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 12, background: '#1A1A1A',
          marginBottom: open ? 8 : 0,
        }}
      >
        <button
          onClick={() => setOpen(!open)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          <MapPin size={14} style={{ color: '#D4AF37' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{ruta}</span>
          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, background: '#2A2A2A', color: '#888', fontWeight: 700 }}>
            {clientes.length}
          </span>
          {sinContactoReciente > 0 && (
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'rgba(248,113,113,0.15)', color: '#F87171', fontWeight: 700 }}>
              {sinContactoReciente} sin contacto
            </span>
          )}
          {open ? <ChevronUp size={15} style={{ color: '#555', marginLeft: 'auto' }} /> : <ChevronDown size={15} style={{ color: '#555', marginLeft: 'auto' }} />}
        </button>

        {modoSeleccion && (
          <button
            onClick={toggleAll}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: todosSeleccionados ? 'rgba(37,211,102,0.15)' : '#2A2A2A',
              border: 'none', cursor: 'pointer',
              color: todosSeleccionados ? '#25D366' : '#888',
              marginLeft: 8, flexShrink: 0,
            }}
          >
            {todosSeleccionados ? 'Quitar todos' : 'Seleccionar todos'}
          </button>
        )}
      </div>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6 }}>
          {clientes.map(c => (
            <ClienteCard
              key={c.id}
              cliente={c}
              isAdmin={isAdmin}
              modoSeleccion={modoSeleccion}
              seleccionado={seleccionados.has(c.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
type FiltroContacto = 'todos' | 'reciente' | 'pendiente' | 'nunca' | 'en_riesgo'

// ── Sección "Por contactar hoy" ────────────────────────────────────────────
function PorContactarSection({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const criticos = clientes
    .filter(c => c.frecuencia?.alert_level === 'critico')
    .sort((a, b) => (b.frecuencia?.dias_sin_compra ?? 0) - (a.frecuencia?.dias_sin_compra ?? 0))
  const vencidos = clientes
    .filter(c => c.frecuencia?.alert_level === 'vencido')
    .sort((a, b) => (b.frecuencia?.dias_sin_compra ?? 0) - (a.frecuencia?.dias_sin_compra ?? 0))

  const total = criticos.length + vencidos.length
  if (total === 0) return null

  const allItems = [...criticos, ...vencidos]
  const LIMIT = 6
  const shown = showAll ? allItems : allItems.slice(0, LIMIT)

  const fila = (c: Cliente) => {
    const nivel = c.frecuencia?.alert_level as 'critico' | 'vencido'
    const color = nivel === 'critico' ? '#EF4444' : '#F87171'
    const seg = c.frecuencia?.segmento
    const score = c.frecuencia?.score
    const segStyle = seg ? (SEG_STYLE[seg] ?? SEG_STYLE.E) : null
    const waUrl = c.telefono
      ? `https://wa.me/${c.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${c.nombre_fantasia ?? ''}, te saluda El Regreso Beer Co. 🍺`)}`
      : null

    return (
      <div
        key={c.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        {/* Seg badge */}
        {segStyle && seg && (
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: segStyle.bg, border: `1px solid ${segStyle.border}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: segStyle.text, lineHeight: 1 }}>{seg}</span>
            {score != null && <span style={{ fontSize: 7, fontWeight: 700, color: segStyle.text, opacity: 0.7 }}>{score}</span>}
          </div>
        )}

        {/* Info */}
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => router.push(`/ventas/clientes/${c.id}`)}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.nombre_fantasia}
          </p>
          <p style={{ fontSize: 10, color: '#555', marginTop: 1 }}>
            {c.vendedor?.split(' ')[0]}
            {(c.localidad_entrega || c.localidad) && ` · ${c.localidad_entrega || c.localidad}`}
          </p>
        </div>

        {/* Days */}
        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 4 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1 }}>{c.frecuencia?.dias_sin_compra}d</p>
          <p style={{ fontSize: 9, color: '#555' }}>{c.frecuencia?.ciclo_promedio_dias}d ciclo</p>
        </div>

        {/* WhatsApp */}
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)',
              color: '#25D366', textDecoration: 'none',
            }}
          >
            <MessageCircle size={14} />
          </a>
        ) : (
          <div style={{ width: 32, flexShrink: 0 }} />
        )}
      </div>
    )
  }

  return (
    <div style={{
      borderRadius: 16, marginBottom: 16,
      background: 'rgba(239,68,68,0.03)',
      border: '1px solid rgba(239,68,68,0.18)',
      overflow: 'hidden',
    }}>
      {/* Header clickable */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', padding: '13px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#EF4444' }}>
              {total} clientes a contactar
            </p>
            <p style={{ fontSize: 11, color: '#666' }}>
              {criticos.length} urgentes · {vencidos.length} vencidos
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {criticos.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
              🔴 {criticos.length}
            </span>
          )}
          {collapsed
            ? <ChevronDown size={15} style={{ color: '#555' }} />
            : <ChevronUp size={15} style={{ color: '#555' }} />
          }
        </div>
      </button>

      {!collapsed && (
        <div style={{ padding: '0 16px 12px' }}>
          {shown.map(c => fila(c))}
          {allItems.length > LIMIT && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                width: '100%', marginTop: 8, padding: '8px 0',
                background: 'none', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, color: '#666', fontSize: 12, cursor: 'pointer',
              }}
            >
              {showAll ? '▲ Ver menos' : `▼ Ver ${allItems.length - LIMIT} más`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClientesClient({ clientes, periodo, totalesPorVendedor }: Props) {
  const isDesktop = useIsDesktop()
  const { user, isAdmin } = useUser()
  const [busqueda, setBusqueda] = useState('')
  const [vendedorFiltro, setVendedorFiltro] = useState<string>('all')
  const [filtroContacto, setFiltroContacto] = useState<FiltroContacto>('todos')
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [showCampana, setShowCampana] = useState(false)

  const vendedorEfectivo = isAdmin ? vendedorFiltro : (user?.nombre ?? '')

  const clientesFiltrados = useMemo(() => {
    return clientes.filter(c => {
      if (vendedorEfectivo !== 'all' && c.vendedor !== vendedorEfectivo) return false
      if (filtroContacto !== 'todos') {
        const dias = diasDesde(c.ultimoContacto?.fecha)
        if (filtroContacto === 'reciente'  && !(dias !== null && dias <= 7)) return false
        if (filtroContacto === 'pendiente' && !(dias === null || dias > 7))  return false
        if (filtroContacto === 'nunca'     && dias !== null)                  return false
        if (filtroContacto === 'en_riesgo' && !['critico', 'vencido'].includes(c.frecuencia?.alert_level ?? '')) return false
      }
      if (busqueda) {
        const b = busqueda.toLowerCase()
        return (
          c.nombre_fantasia?.toLowerCase().includes(b) ||
          c.localidad_entrega?.toLowerCase().includes(b) ||
          c.ruta_despacho?.toLowerCase().includes(b) ||
          c.categoria?.toLowerCase().includes(b) ||
          c.vendedor?.toLowerCase().includes(b)
        )
      }
      return true
    })
  }, [clientes, vendedorEfectivo, filtroContacto, busqueda])

  // Agrupar por ruta
  const porRuta = useMemo(() => {
    const map = new Map<string, Cliente[]>()
    for (const c of clientesFiltrados) {
      const ruta = c.ruta_despacho ? `Ruta ${c.ruta_despacho}` : 'Sin ruta asignada'
      if (!map.has(ruta)) map.set(ruta, [])
      map.get(ruta)!.push(c)
    }
    // Sort: numbered routes first, then "Sin ruta"
    return [...map.entries()].sort((a, b) => {
      if (a[0] === 'Sin ruta asignada') return 1
      if (b[0] === 'Sin ruta asignada') return -1
      const na = parseInt(a[0].replace(/\D/g, '')) || 999
      const nb = parseInt(b[0].replace(/\D/g, '')) || 999
      return na - nb
    })
  }, [clientesFiltrados])

  // Conteos sobre TODOS los clientes del vendedor (sin filtro de contacto, para los badges)
  const clientesDelVendedor = useMemo(() =>
    clientes.filter(c => vendedorEfectivo === 'all' || c.vendedor === vendedorEfectivo),
    [clientes, vendedorEfectivo]
  )
  const cntReciente  = clientesDelVendedor.filter(c => { const d = diasDesde(c.ultimoContacto?.fecha); return d !== null && d <= 7 }).length
  const cntPendiente = clientesDelVendedor.filter(c => { const d = diasDesde(c.ultimoContacto?.fecha); return d === null || d > 7 }).length
  const cntNunca     = clientesDelVendedor.filter(c => !c.ultimoContacto).length
  const cntEnRiesgo  = clientesDelVendedor.filter(c => ['critico', 'vencido'].includes(c.frecuencia?.alert_level ?? '')).length

  const sinContacto     = clientesFiltrados.filter(c => !c.ultimoContacto).length
  const contactoReciente = clientesFiltrados.filter(c => { const d = diasDesde(c.ultimoContacto?.fecha); return d !== null && d <= 7 }).length

  function toggleSelect(id: number) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clientesSeleccionados = clientes.filter(c => seleccionados.has(c.id))

  return (
    <div style={{ padding: '20px 16px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: isDesktop ? 26 : 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>Clientes</h1>
          <p style={{ fontSize: 13, color: '#666', marginTop: 3 }}>Cartera por ruta de despacho</p>
        </div>

        {/* Campaña button */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {modoSeleccion && seleccionados.size > 0 && (
            <button
              onClick={() => setShowCampana(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                border: '1px solid rgba(37,211,102,0.3)',
                background: 'rgba(37,211,102,0.1)', color: '#25D366', cursor: 'pointer',
              }}
            >
              <Send size={15} /> Enviar ({seleccionados.size})
            </button>
          )}
          <button
            onClick={() => { setModoSeleccion(m => !m); setSeleccionados(new Set()) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              border: '1px solid #2A2A2A',
              background: modoSeleccion ? '#2A2A2A' : 'transparent',
              color: modoSeleccion ? '#fff' : '#666', cursor: 'pointer',
            }}
          >
            <Zap size={15} /> {modoSeleccion ? 'Cancelar' : 'Campaña WA'}
          </button>
        </div>
      </div>

      {/* Totales del período por vendedor */}
      {periodo && Object.keys(totalesPorVendedor).length > 0 && (
        <div style={{
          borderRadius: 14, padding: '12px 16px', marginBottom: 14,
          background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.18)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.07em', marginBottom: 10 }}>
            LITROS PERÍODO — {periodo.nombre}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(totalesPorVendedor)
              .filter(([vend]) => vendedorEfectivo === 'all' || vend === vendedorEfectivo)
              .map(([vend, data]) => {
                const color = vend === 'Javier Badilla' ? '#F59E0B' : vend === 'Carlos Urrejola' ? '#60A5FA' : '#A78BFA'
                return (
                  <div key={vend} style={{
                    flex: 1, minWidth: 140,
                    background: `${color}10`, border: `1px solid ${color}30`,
                    borderRadius: 10, padding: '10px 14px',
                  }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{vend.split(' ')[0].toUpperCase()}</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                      {Math.round(data.litros * 10) / 10}
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#888', marginLeft: 4 }}>L</span>
                    </p>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Stats (solo admin) */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>TOTAL</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{clientesFiltrados.length}</p>
          </div>
          <div style={{ background: '#141414', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: '#34D399', marginBottom: 4 }}>CONTACTADOS (7d)</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#34D399' }}>{contactoReciente}</p>
          </div>
          <div style={{ background: '#141414', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: '#F87171', marginBottom: 4 }}>SIN CONTACTO</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#F87171' }}>{sinContacto}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8,
          background: '#141414', border: '1px solid #222', borderRadius: 10, padding: '8px 12px',
        }}>
          <Search size={14} style={{ color: '#444', flexShrink: 0 }} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, ciudad, ruta..."
            style={{ background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 13, width: '100%' }}
          />
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { value: 'all', label: 'Todos' },
              { value: 'Javier Badilla', label: 'Javier' },
              { value: 'Carlos Urrejola', label: 'Carlos' },
            ].map(op => (
              <button
                key={op.value}
                onClick={() => setVendedorFiltro(op.value)}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                  background: vendedorFiltro === op.value ? '#D4AF37' : '#1A1A1A',
                  color: vendedorFiltro === op.value ? '#000' : '#777',
                }}
              >
                {op.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filtro de estado de contacto */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {([
          { value: 'todos',     label: 'Todos',            count: clientesDelVendedor.length, bg: '#1A1A1A',                       color: '#777',    activeBg: '#2A2A2A',                  activeColor: '#fff'    },
          { value: 'reciente',  label: '✓ Contactados',    count: cntReciente,                bg: 'rgba(52,211,153,0.08)',          color: '#34D399', activeBg: 'rgba(52,211,153,0.2)',      activeColor: '#34D399' },
          { value: 'pendiente', label: '⚠ Pendientes',     count: cntPendiente,               bg: 'rgba(245,158,11,0.08)',          color: '#F59E0B', activeBg: 'rgba(245,158,11,0.2)',      activeColor: '#F59E0B' },
          { value: 'nunca',     label: '✕ Sin contacto',   count: cntNunca,                   bg: 'rgba(248,113,113,0.08)',         color: '#F87171', activeBg: 'rgba(248,113,113,0.2)',     activeColor: '#F87171' },
          { value: 'en_riesgo', label: '🔴 Riesgo compra', count: cntEnRiesgo,                bg: 'rgba(239,68,68,0.08)',           color: '#EF4444', activeBg: 'rgba(239,68,68,0.2)',       activeColor: '#EF4444' },
        ] as const).map(op => {
          const active = filtroContacto === op.value
          return (
            <button
              key={op.value}
              onClick={() => setFiltroContacto(op.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1px solid ${active ? op.activeColor + '60' : 'transparent'}`,
                cursor: 'pointer', transition: 'all 0.15s',
                background: active ? op.activeBg : op.bg,
                color: active ? op.activeColor : op.color,
              }}
            >
              {op.label}
              <span style={{
                fontSize: 11, fontWeight: 800,
                background: active ? op.activeColor + '30' : '#ffffff10',
                padding: '1px 6px', borderRadius: 10,
                color: active ? op.activeColor : '#666',
              }}>
                {op.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Result count */}
      <p style={{ fontSize: 12, color: '#444', marginBottom: 14 }}>
        {clientesFiltrados.length} clientes · {porRuta.length} rutas
        {modoSeleccion && seleccionados.size > 0 && (
          <span style={{ color: '#25D366', marginLeft: 8 }}>· {seleccionados.size} seleccionados</span>
        )}
      </p>

      {/* Por contactar — visible en "todos" (sin búsqueda) o siempre en "en_riesgo" */}
      {filtroContacto === 'en_riesgo' && (
        <PorContactarSection clientes={clientesFiltrados} />
      )}
      {filtroContacto === 'todos' && !busqueda && (
        <PorContactarSection clientes={clientesDelVendedor} />
      )}

      {/* Routes */}
      {filtroContacto !== 'en_riesgo' && porRuta.map(([ruta, clts]) => (
        <RutaSection
          key={ruta}
          ruta={ruta}
          clientes={clts}
          isAdmin={isAdmin}
          modoSeleccion={modoSeleccion}
          seleccionados={seleccionados}
          onToggleSelect={toggleSelect}
        />
      ))}

      {clientesFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
          <Users size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>No hay clientes con ese filtro</p>
        </div>
      )}

      {/* Campaign modal */}
      {showCampana && (
        <CampanaWhatsApp
          seleccionados={clientesSeleccionados}
          onClose={() => setShowCampana(false)}
        />
      )}
    </div>
  )
}
