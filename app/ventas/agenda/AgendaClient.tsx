'use client'

import { useState, useMemo } from 'react'
import { Phone, Mail, MessageCircle, Car, Ban, CheckCircle2, Clock, AlertTriangle, Share2 } from 'lucide-react'
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
interface Vendedor { id: string; nombre: string }
interface Cliente { nombre_fantasia: string; telefono: string | null; email: string | null }

interface Props {
  user: AppUser
  seguimientos: Seguimiento[]
  vendedores: Vendedor[]
  clientes: Cliente[]
}

const TIPO_CFG: Record<TipoAccion, { label: string; icon: typeof Phone; color: string }> = {
  llamar:   { label: 'Llamar',   icon: Phone,         color: '#60A5FA' },
  email:    { label: 'Correo',   icon: Mail,          color: '#A78BFA' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#25D366' },
  visita:   { label: 'Visita',   icon: Car,           color: T },
  ninguna:  { label: 'Sin seguimiento', icon: Ban,    color: 'rgba(255,255,255,0.3)' },
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
function waLink(telefono: string, mensaje: string) {
  const num = telefono.replace(/[\s\-\(\)]/g, '').replace(/^\+?56/, '56').replace(/^(?!56)/, '56')
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

function SeguimientoRow({ s, cliente, vendedorNombre, onMarcarRealizado }: {
  s: Seguimiento; cliente: Cliente | undefined; vendedorNombre?: string
  onMarcarRealizado: (id: string) => void
}) {
  const cfg = TIPO_CFG[s.tipo_accion]
  const Icon = cfg.icon
  const atrasado = s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso) < new Date()
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
                <span>{fmtFecha(s.fecha_hora_compromiso)} {fmtHora(s.fecha_hora_compromiso)}</span>
              </>
            )}
            {vendedorNombre && <><span>·</span><span>{vendedorNombre.split(' ')[0]}</span></>}
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

export default function AgendaClient({ user, seguimientos: seguimientosIniciales, vendedores, clientes }: Props) {
  const isDesktop = useIsDesktop()
  const [seguimientos, setSeguimientos] = useState(seguimientosIniciales)
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [reporteTexto, setReporteTexto] = useState<string | null>(null)
  const [cargandoReporte, setCargandoReporte] = useState(false)

  // Vendedor sobre el que se genera el reporte: uno mismo, o el filtrado por el admin
  const vendedorReporteId = user.isAdmin ? (filtroVendedor !== 'todos' ? filtroVendedor : user.id) : user.id
  const vendedorReporteNombre = user.isAdmin
    ? (vendedores.find(v => v.id === vendedorReporteId)?.nombre ?? user.nombre)
    : user.nombre

  async function generarReporte() {
    setCargandoReporte(true)
    try {
      const supabase = createClient()
      const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
      const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999)

      const { data: visitasHoy } = await supabase
        .from('visitas_terreno')
        .select('id, tiene_venta, total_pedido')
        .eq('vendedor_id', vendedorReporteId)
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
        .filter(s => s.vendedor_id === vendedorReporteId && s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso).toDateString() === manana.toDateString())
        .sort((a, b) => (a.fecha_hora_compromiso ?? '').localeCompare(b.fecha_hora_compromiso ?? ''))
        .map(s => ({ cliente: s.cliente_nombre, tipo: s.tipo_accion, hora: fmtHora(s.fecha_hora_compromiso!), nota: s.nota }))

      setReporteTexto(generarTextoReporte(vendedorReporteNombre, { montoTotal, unidades, visitasConVenta, visitasSinVenta, seguimientosManana }))
    } finally {
      setCargandoReporte(false)
    }
  }

  const clienteMap = useMemo(() => Object.fromEntries(clientes.map(c => [c.nombre_fantasia, c])), [clientes])
  const vendedorMap = useMemo(() => Object.fromEntries(vendedores.map(v => [v.id, v.nombre])), [vendedores])

  async function marcarRealizado(id: string) {
    const supabase = createClient()
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('seguimientos').update({ estado: 'realizado', realizado_at: nowIso }).eq('id', id)
    if (error) { alert('No se pudo actualizar: ' + error.message); return }
    setSeguimientos(prev => prev.map(s => s.id === id ? { ...s, estado: 'realizado', realizado_at: nowIso } : s))
  }

  const filtrados = useMemo(() => {
    if (filtroVendedor === 'todos') return seguimientos
    return seguimientos.filter(s => s.vendedor_id === filtroVendedor)
  }, [seguimientos, filtroVendedor])

  const now = Date.now()
  const hoyStr = new Date().toDateString()

  const atrasados = filtrados.filter(s => s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso).getTime() < now)
  const hoy = filtrados.filter(s => s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso).getTime() >= now && new Date(s.fecha_hora_compromiso).toDateString() === hoyStr)
  const proximos = filtrados.filter(s => s.estado === 'pendiente' && s.fecha_hora_compromiso && new Date(s.fecha_hora_compromiso).toDateString() !== hoyStr && new Date(s.fecha_hora_compromiso).getTime() >= now)
  const realizados = filtrados.filter(s => s.estado === 'realizado').slice(0, 20)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 100 }}>
      <div style={{ padding: isDesktop ? '20px 28px 0' : '16px 20px 0' }}>
        <AppHeader
          eyebrow="Ventas" title="Agenda y Compromisos"
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

        {user.isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {[{ id: 'todos', nombre: 'Todos' }, ...vendedores].map(v => (
              <button key={v.id} onClick={() => setFiltroVendedor(v.id)} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${filtroVendedor === v.id ? T_BORDER : 'rgba(255,255,255,0.09)'}`,
                background: filtroVendedor === v.id ? T_DIM : 'transparent',
                color: filtroVendedor === v.id ? T : 'rgba(255,255,255,0.4)',
              }}>{v.nombre.split(' ')[0]}</button>
            ))}
          </div>
        )}

        {atrasados.length === 0 && hoy.length === 0 && proximos.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 56 }}>
            <CheckCircle2 size={40} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 16px', display: 'block' }} />
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>Sin compromisos pendientes</p>
          </div>
        )}

        {atrasados.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Atrasados ({atrasados.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {atrasados.map(s => <SeguimientoRow key={s.id} s={s} cliente={clienteMap[s.cliente_nombre]} vendedorNombre={user.isAdmin ? vendedorMap[s.vendedor_id] : undefined} onMarcarRealizado={marcarRealizado} />)}
            </div>
          </div>
        )}

        {hoy.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: T, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Hoy ({hoy.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hoy.map(s => <SeguimientoRow key={s.id} s={s} cliente={clienteMap[s.cliente_nombre]} vendedorNombre={user.isAdmin ? vendedorMap[s.vendedor_id] : undefined} onMarcarRealizado={marcarRealizado} />)}
            </div>
          </div>
        )}

        {proximos.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Próximos ({proximos.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {proximos.map(s => <SeguimientoRow key={s.id} s={s} cliente={clienteMap[s.cliente_nombre]} vendedorNombre={user.isAdmin ? vendedorMap[s.vendedor_id] : undefined} onMarcarRealizado={marcarRealizado} />)}
            </div>
          </div>
        )}

        {realizados.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Realizados recientemente</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {realizados.map(s => <SeguimientoRow key={s.id} s={s} cliente={clienteMap[s.cliente_nombre]} vendedorNombre={user.isAdmin ? vendedorMap[s.vendedor_id] : undefined} onMarcarRealizado={marcarRealizado} />)}
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
