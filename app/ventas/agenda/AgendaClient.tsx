'use client'

import { useState, useMemo } from 'react'
import {
  Phone, Mail, MessageCircle, Car, Ban, CheckCircle2, Clock, AlertTriangle,
  Share2, ChevronLeft, ChevronRight, CalendarClock,
} from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useIsDesktop'
import AppHeader from '@/components/ui/AppHeader'
import { createClient } from '@/lib/supabase/client'

const T = '#D4AF37'
const T_DIM = 'rgba(212,175,55,0.10)'
const T_BORDER = 'rgba(212,175,55,0.22)'
const RED = '#B5543E'

type TipoAccion = 'llamar' | 'email' | 'whatsapp' | 'visita' | 'ninguna'

interface Seguimiento {
  id: string; visita_id: string | null; vendedor_id: string; cliente_nombre: string
  tipo_accion: TipoAccion; fecha_hora_compromiso: string | null; nota: string | null
  estado: 'pendiente' | 'realizado'; realizado_at: string | null; created_at: string
}
interface Cliente { nombre_fantasia: string; telefono: string | null; email: string | null }

interface Props {
  user: AppUser
  seguimientos: Seguimiento[]
  clientes: Cliente[]
}

const TIPO_CFG: Record<TipoAccion, { label: string; icon: typeof Phone; color: string }> = {
  llamar:   { label: 'Llamar',   icon: Phone,         color: '#60A5FA' },
  email:    { label: 'Correo',   icon: Mail,          color: '#A78BFA' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#25D366' },
  visita:   { label: 'Visita',   icon: Car,           color: T },
  ninguna:  { label: 'Sin seguimiento', icon: Ban,    color: 'rgba(255,255,255,0.3)' },
}

// ─── Helpers de fecha (siempre en hora local para evitar desfases de zona) ───
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function dateKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
function startOfWeekMon(d: Date) {
  const x = startOfDay(d)
  const dow = (x.getDay() + 6) % 7 // 0 = lunes
  return addDays(x, -dow)
}
function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
function capitalizar(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
function etiquetaDia(d: Date) {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  return capitalizar(d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))
}
function waLink(telefono: string, mensaje: string) {
  const num = telefono.replace(/[\s\-\(\)]/g, '').replace(/^\+?56/, '56').replace(/^(?!56)/, '56')
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

function SeguimientoRow({ s, cliente, mostrarFecha, onMarcarRealizado }: {
  s: Seguimiento; cliente: Cliente | undefined; mostrarFecha?: boolean
  onMarcarRealizado: (id: string) => void
}) {
  const cfg = TIPO_CFG[s.tipo_accion]
  const Icon = cfg.icon
  const atrasado = s.estado === 'pendiente' && !!s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso) < new Date()
  const [marcando, setMarcando] = useState(false)

  async function marcar() {
    setMarcando(true)
    await onMarcarRealizado(s.id)
    setMarcando(false)
  }

  return (
    <div style={{
      background: atrasado ? 'rgba(181,84,62,0.05)' : 'var(--surface)',
      border: `1px solid ${atrasado ? 'rgba(181,84,62,0.3)' : 'var(--border)'}`,
      borderRadius: 16, padding: '14px 16px',
      opacity: s.estado === 'realizado' ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={cfg.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF' }}>{s.cliente_nombre}</span>
            {atrasado && (
              <span style={{ fontSize: 8, fontWeight: 800, color: RED, background: 'rgba(181,84,62,0.12)', border: `1px solid rgba(181,84,62,0.3)`, padding: '2px 6px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 3 }}>
                <AlertTriangle size={9} /> Atrasado
              </span>
            )}
            {s.estado === 'realizado' && (
              <span style={{ fontSize: 8, fontWeight: 800, color: '#4ADE80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', padding: '2px 6px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Realizado</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: s.nota ? 4 : 0, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
            {s.fecha_hora_compromiso && (
              <>
                <span>·</span>
                <Clock size={10} />
                <span>{mostrarFecha ? `${fmtFecha(s.fecha_hora_compromiso)} · ${fmtHora(s.fecha_hora_compromiso)}` : fmtHora(s.fecha_hora_compromiso)}</span>
              </>
            )}
          </div>
          {s.nota && <p style={{ fontSize: 12, color: '#F4EEDF', lineHeight: 1.4 }}>{s.nota}</p>}
        </div>
      </div>

      {s.estado === 'pendiente' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {s.tipo_accion === 'llamar' && cliente?.telefono && (
            <a href={`tel:${cliente.telefono}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: '#60A5FA', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              <Phone size={12} /> Llamar ahora
            </a>
          )}
          {s.tipo_accion === 'whatsapp' && cliente?.telefono && (
            <a href={waLink(cliente.telefono, `Hola ${s.cliente_nombre}, te escribo de El Regreso Beer — ${s.nota ?? ''}`)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', color: '#25D366', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              <MessageCircle size={12} /> Abrir WhatsApp
            </a>
          )}
          {s.tipo_accion === 'email' && cliente?.email && (
            <a href={`mailto:${cliente.email}?subject=${encodeURIComponent('El Regreso Beer')}&body=${encodeURIComponent(s.nota ?? '')}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', color: '#A78BFA', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              <Mail size={12} /> Enviar correo
            </a>
          )}
          <button onClick={marcar} disabled={marcando} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10, background: T_DIM, border: `1px solid ${T_BORDER}`, color: T, fontSize: 12, fontWeight: 700, cursor: marcando ? 'default' : 'pointer', opacity: marcando ? 0.6 : 1 }}>
            <CheckCircle2 size={12} /> {marcando ? 'Guardando…' : 'Marcar realizado'}
          </button>
        </div>
      )}
    </div>
  )
}

interface ReporteDatos {
  montoTotal: number; unidades: number; visitasConVenta: number; visitasSinVenta: number
  seguimientosManana: { cliente: string; tipo: TipoAccion; hora: string; nota: string | null }[]
}

function generarTextoReporte(nombreVendedor: string, d: ReporteDatos): string {
  const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
  let m = `🍺 *REPORTE DIARIO DE GESTIÓN - EL REGRESO*\n`
  m += `Vendedor: ${nombreVendedor}\n\n`
  m += `🛒 *VENTAS REALIZADAS:* ${fmtCLP(d.montoTotal)} / ${d.unidades} Unid.\n`
  m += `📍 *VISITAS REALIZADAS:* ${d.visitasConVenta + d.visitasSinVenta}\n`
  m += `- Con Venta: ${d.visitasConVenta}\n`
  m += `- Solo Visita/Prospecto: ${d.visitasSinVenta}\n\n`
  m += `📅 *SEGUIMIENTOS AGENDADOS PARA MAÑANA:*\n`
  if (d.seguimientosManana.length === 0) {
    m += `- Sin seguimientos agendados\n`
  } else {
    for (const s of d.seguimientosManana) {
      m += `- ${s.hora} ${TIPO_CFG[s.tipo].label} · ${s.cliente}${s.nota ? ` (${s.nota})` : ''}\n`
    }
  }
  return m
}

function ReporteWhatsAppModal({ texto, onClose }: { texto: string; onClose: () => void }) {
  const [phone, setPhone] = useState('')
  function enviar() {
    const t = phone.trim()
    if (!t) return
    const num = t.replace(/[\s\-\(\)]/g, '').replace(/^\+?56/, '56').replace(/^(?!56)/, '56')
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(texto)}`, '_blank')
    onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1C1C1C', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', width: '100%', maxWidth: 480 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>Reporte diario</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Elige a quién enviárselo por WhatsApp</p>
        <pre style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', background: '#131313', borderRadius: 10, padding: 12, whiteSpace: 'pre-wrap', marginBottom: 14, maxHeight: 180, overflowY: 'auto', fontFamily: 'inherit' }}>{texto}</pre>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+56 9 12345678" type="tel" autoFocus
          style={{ width: '100%', padding: '13px 14px', borderRadius: 12, background: '#131313', border: '1px solid rgba(255,255,255,0.1)', color: '#F4EEDF', fontSize: 15, outline: 'none', marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={enviar} disabled={!phone.trim()} style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', background: phone.trim() ? '#25D366' : 'rgba(37,211,102,0.12)', color: phone.trim() ? '#fff' : 'rgba(37,211,102,0.35)', fontSize: 14, fontWeight: 800, cursor: phone.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <MessageCircle size={16} /> Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AgendaClient({ user, seguimientos: seguimientosIniciales, clientes }: Props) {
  const isDesktop = useIsDesktop()
  const [seguimientos, setSeguimientos] = useState(seguimientosIniciales)
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [reporteTexto, setReporteTexto] = useState<string | null>(null)
  const [cargandoReporte, setCargandoReporte] = useState(false)
  const [verAtrasados, setVerAtrasados] = useState(true)

  const clienteMap = useMemo(() => Object.fromEntries(clientes.map(c => [c.nombre_fantasia, c])), [clientes])

  async function marcarRealizado(id: string) {
    const supabase = createClient()
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('seguimientos').update({ estado: 'realizado', realizado_at: nowIso }).eq('id', id)
    if (error) { alert('No se pudo actualizar: ' + error.message); return }
    setSeguimientos(prev => prev.map(s => s.id === id ? { ...s, estado: 'realizado' as const, realizado_at: nowIso } : s))
  }

  const hoy0 = startOfDay(new Date())
  const selKey = dateKey(selectedDate)

  const { pendientesPorDia, atrasados, sinFecha, delDia } = useMemo(() => {
    // Compromisos pendientes por día (para los puntos de la tira de semana)
    const ppd: Record<string, { total: number; pasado: boolean }> = {}
    const atr: Seguimiento[] = []
    const sf: Seguimiento[] = []

    for (const s of seguimientos) {
      if (!s.fecha_hora_compromiso) {
        if (s.estado === 'pendiente') sf.push(s) // nunca perder un compromiso sin fecha
        continue
      }
      if (s.estado !== 'pendiente') continue
      const d = new Date(s.fecha_hora_compromiso)
      const k = dateKey(d)
      const pasadoDia = startOfDay(d).getTime() < hoy0.getTime()
      if (!ppd[k]) ppd[k] = { total: 0, pasado: pasadoDia }
      ppd[k].total++
      if (pasadoDia) atr.push(s) // "atrasado" = de un día anterior a hoy
    }

    // Compromisos del día seleccionado (pendientes y realizados juntos)
    const del = seguimientos
      .filter(s => s.fecha_hora_compromiso && dateKey(new Date(s.fecha_hora_compromiso)) === selKey)
      .sort((a, b) => {
        const ra = a.estado === 'realizado' ? 1 : 0
        const rb = b.estado === 'realizado' ? 1 : 0
        if (ra !== rb) return ra - rb // pendientes primero, realizados al final
        return (a.fecha_hora_compromiso ?? '').localeCompare(b.fecha_hora_compromiso ?? '')
      })

    atr.sort((a, b) => (a.fecha_hora_compromiso ?? '').localeCompare(b.fecha_hora_compromiso ?? ''))
    return { pendientesPorDia: ppd, atrasados: atr, sinFecha: sf, delDia: del }
  }, [seguimientos, selKey, hoy0])

  const weekStart = startOfWeekMon(selectedDate)
  const dias = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const esHoySel = selKey === dateKey(hoy0)

  async function generarReporte() {
    setCargandoReporte(true)
    try {
      const supabase = createClient()
      const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
      const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999)

      const { data: visitasHoy } = await supabase
        .from('visitas_terreno')
        .select('id, tiene_venta, total_pedido')
        .eq('vendedor_id', user.id)
        .neq('estado', 'cancelada')
        .gte('iniciada_at', inicioHoy.toISOString())
        .lte('iniciada_at', finHoy.toISOString())

      const visitaIds = (visitasHoy ?? []).map(v => v.id)
      const { data: itemsHoy } = visitaIds.length
        ? await supabase.from('visitas_terreno_items').select('visita_id, cantidad').in('visita_id', visitaIds)
        : { data: [] }

      const montoTotal = (visitasHoy ?? []).reduce((s, v) => s + (v.total_pedido ?? 0), 0)
      const unidades = (itemsHoy ?? []).reduce((s, i) => s + i.cantidad, 0)
      const visitasConVenta = (visitasHoy ?? []).filter(v => v.tiene_venta === true).length
      const visitasSinVenta = (visitasHoy ?? []).length - visitasConVenta

      const manana = new Date(); manana.setDate(manana.getDate() + 1)
      const seguimientosManana = seguimientos
        .filter(s => s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso).toDateString() === manana.toDateString())
        .sort((a, b) => (a.fecha_hora_compromiso ?? '').localeCompare(b.fecha_hora_compromiso ?? ''))
        .map(s => ({ cliente: s.cliente_nombre, tipo: s.tipo_accion, hora: fmtHora(s.fecha_hora_compromiso!), nota: s.nota }))

      setReporteTexto(generarTextoReporte(user.nombre, { montoTotal, unidades, visitasConVenta, visitasSinVenta, seguimientosManana }))
    } finally {
      setCargandoReporte(false)
    }
  }

  const chevBtn: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 100 }}>
      <div style={{ padding: isDesktop ? '20px 28px 0' : '16px 20px 0' }}>
        <AppHeader
          eyebrow="Ventas" title="Mi Agenda"
          extraAction={
            <button onClick={generarReporte} disabled={cargandoReporte} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)',
              color: '#25D366', fontSize: 12, fontWeight: 700, cursor: cargandoReporte ? 'default' : 'pointer',
              opacity: cargandoReporte ? 0.6 : 1,
            }}>
              <Share2 size={14} /> {cargandoReporte ? 'Generando…' : 'Reporte del día'}
            </button>
          }
        />
      </div>

      <div style={{ padding: isDesktop ? '20px 28px' : '16px 20px', maxWidth: 720, margin: '0 auto' }}>

        {/* ── Navegador de semana ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button aria-label="Semana anterior" onClick={() => setSelectedDate(addDays(selectedDate, -7))} style={chevBtn}>
            <ChevronLeft size={18} color={T} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>
              {capitalizar(selectedDate.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }))}
            </span>
            {!esHoySel && (
              <button onClick={() => setSelectedDate(startOfDay(new Date()))} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: T_DIM, border: `1px solid ${T_BORDER}`, color: T,
              }}>Hoy</button>
            )}
          </div>
          <button aria-label="Semana siguiente" onClick={() => setSelectedDate(addDays(selectedDate, 7))} style={chevBtn}>
            <ChevronRight size={18} color={T} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 22 }}>
          {dias.map(d => {
            const k = dateKey(d)
            const sel = k === selKey
            const esHoy = k === dateKey(hoy0)
            const info = pendientesPorDia[k]
            return (
              <button key={k} onClick={() => setSelectedDate(startOfDay(d))} style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '8px 0', borderRadius: 14, cursor: 'pointer',
                background: sel ? T_DIM : 'transparent',
                border: `1px solid ${sel ? T_BORDER : 'transparent'}`,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: esHoy ? T : 'rgba(255,255,255,0.35)' }}>
                  {d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '').slice(0, 3)}
                </span>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800,
                  background: sel ? T : 'transparent',
                  color: sel ? '#0A0A0A' : (esHoy ? T : '#F4EEDF'),
                  border: (!sel && esHoy) ? `1.5px solid ${T}` : '1.5px solid transparent',
                }}>{d.getDate()}</span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: info ? (info.pasado ? RED : T) : 'transparent' }} />
              </button>
            )
          })}
        </div>

        {/* ── Alerta de atrasados (siempre visible, no se pierden) ── */}
        {atrasados.length > 0 && (
          <div style={{ marginBottom: 22, border: '1px solid rgba(181,84,62,0.3)', borderRadius: 16, overflow: 'hidden' }}>
            <button onClick={() => setVerAtrasados(v => !v)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', background: 'rgba(181,84,62,0.08)', border: 'none', cursor: 'pointer',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: RED, fontSize: 13, fontWeight: 800 }}>
                <AlertTriangle size={15} /> {atrasados.length} atrasado{atrasados.length !== 1 ? 's' : ''}
              </span>
              <ChevronRight size={16} color={RED} style={{ transform: verAtrasados ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {verAtrasados && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                {atrasados.map(s => <SeguimientoRow key={s.id} s={s} cliente={clienteMap[s.cliente_nombre]} mostrarFecha onMarcarRealizado={marcarRealizado} />)}
              </div>
            )}
          </div>
        )}

        {/* ── Día seleccionado ── */}
        <div style={{ marginBottom: 22 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: T, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
            {etiquetaDia(selectedDate)}
          </p>
          {delDia.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <CalendarClock size={28} color="rgba(255,255,255,0.12)" style={{ margin: '0 auto 10px', display: 'block' }} />
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Sin compromisos este día</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {delDia.map(s => <SeguimientoRow key={s.id} s={s} cliente={clienteMap[s.cliente_nombre]} onMarcarRealizado={marcarRealizado} />)}
            </div>
          )}
        </div>

        {/* ── Sin fecha programada ── */}
        {sinFecha.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
              Sin fecha ({sinFecha.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sinFecha.map(s => <SeguimientoRow key={s.id} s={s} cliente={clienteMap[s.cliente_nombre]} onMarcarRealizado={marcarRealizado} />)}
            </div>
          </div>
        )}
      </div>

      {reporteTexto && (
        <ReporteWhatsAppModal texto={reporteTexto} onClose={() => setReporteTexto(null)} />
      )}
    </div>
  )
}
