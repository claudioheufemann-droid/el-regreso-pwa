'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MessageCircle, Mail, MapPin, Phone, Tag, Truck,
  ShoppingBag, Droplets, DollarSign, Clock, User, FileText,
  CreditCard, Calendar, CheckCircle2, XCircle, Sunset, Star,
  AlertTriangle, TrendingUp, Package, Activity, MoreHorizontal,
  Zap, ChevronRight, Navigation, Info, BarChart2,
} from 'lucide-react'
import WAModal, { type WATarget } from '@/components/ui/WAModal'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Cliente {
  id: number
  nombre_fantasia: string | null
  razon_social: string | null
  rut: string | null
  telefono: string | null
  email: string | null
  contacto: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  localidad_entrega: string | null
  direccion_entrega: string | null
  ruta_despacho: string | null
  categoria: string | null
  vendedor: string | null
  tipo: string | null
  giro: string | null
  condicion_venta: string | null
  lista_precios: string | null
  dias_pago: number | null
  limite_cta_cte: number | null
  saldo_cta_cte_inicial: number | null
  notas: string | null
  codigo_cliente: string | null
  dias_horas_entrega: string | null
}

interface Venta {
  fecha_pedido: string
  producto: string | null
  envase: string | null
  litros: number
  total_sin_impuesto: number
  pedido: string | null
  categoria_producto: string | null
  tipo_venta: string | null
}

interface Contacto {
  fecha_hora: string
  tipo: string
  vendedor: string
  notas: string | null
}

interface Deudor {
  deuda_vencida: number | null
  saldo_total: number | null
  barriles_adeudados: number | null
  ultimo_pago: string | null
  deuda_menor_14_dias: number | null
  deuda_entre_15_29_dias: number | null
  deuda_entre_30_44_dias: number | null
  deuda_entre_45_59_dias: number | null
  deuda_entre_60_89_dias: number | null
  deuda_mas_90_dias: number | null
}

interface FrequencyStat {
  ultima_compra: string | null
  dias_sin_compra: number | null
  ciclo_promedio_dias: number | null
  total_pedidos: number
  alert_level: string
  dias_para_siguiente: number | null
  siguiente_compra_estimada: string | null
  score?: number
  segmento?: string
  confianza_score?: string
  litros_totales?: number
  revenue_total?: number
  pedidos_por_mes?: number
}

interface Props {
  cliente: Cliente
  ventas: Venta[]
  contactos: Contacto[]
  deudor: Deudor | null
  frecuencia: FrequencyStat | null
  estadoCliente?: 'activo' | 'inactivo' | 'estacional'
  notaEstado?: string | null
  isAdmin?: boolean
}

// ── Constantes de diseño ──────────────────────────────────────────────────────
const GOLD = '#D4AF37'
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const SEG_CFG: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: '#D4AF37', bg: 'rgba(212,175,55,0.12)',   label: 'A' },
  B: { color: '#34D399', bg: 'rgba(52,211,153,0.12)',   label: 'B' },
  C: { color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',   label: 'C' },
  D: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',   label: 'D' },
  E: { color: '#F87171', bg: 'rgba(248,113,113,0.12)',  label: 'E' },
}

const ALERT_CFG: Record<string, { color: string; label: string; icon: string }> = {
  ok:            { color: '#34D399', label: 'Al día',        icon: '✓' },
  proximo:       { color: '#F59E0B', label: 'Próximo',       icon: '⏰' },
  vencido:       { color: '#F87171', label: 'Vencido',       icon: '⚠' },
  critico:       { color: '#EF4444', label: 'Crítico',       icon: '🔴' },
  sin_historial: { color: '#666',    label: 'Sin historial', icon: '—'  },
}

const ESTADO_CFG = {
  activo:     { label: 'Activo',     color: '#34D399', bg: 'rgba(52,211,153,0.1)',  dot: '#34D399' },
  inactivo:   { label: 'Inactivo',   color: '#888',    bg: 'rgba(255,255,255,0.06)', dot: '#555'   },
  estacional: { label: 'Estacional', color: '#60A5FA', bg: 'rgba(96,165,250,0.1)',  dot: '#60A5FA' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fFecha(s: string, full = false) {
  const d = new Date(s + (s.length === 10 ? 'T12:00:00' : ''))
  if (full) return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

function fPeso(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function fPesoFull(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function getInitial(name: string) {
  return name.charAt(0).toUpperCase()
}

// ── Inventory Depletion Bar (HERO) ────────────────────────────────────────────
function InventoryBar({ frecuencia }: { frecuencia: FrequencyStat }) {
  const ciclo = frecuencia.ciclo_promedio_dias ?? 0
  const diasSin = frecuencia.dias_sin_compra ?? 0
  const diasRestantes = frecuencia.dias_para_siguiente ?? 0
  const siguiente = frecuencia.siguiente_compra_estimada
  const ultimaCompra = frecuencia.ultima_compra

  const pct = ciclo > 0 ? Math.min(100, Math.round((diasSin / ciclo) * 100)) : 0
  const invPct = Math.max(0, 100 - pct) // inventario restante

  const alertCfg = ALERT_CFG[frecuencia.alert_level] ?? ALERT_CFG.sin_historial
  const isWarning = ['proximo', 'vencido', 'critico'].includes(frecuencia.alert_level)

  // Color de la barra según inventory remaining
  const barColor = invPct > 50 ? '#34D399'
    : invPct > 25 ? '#F59E0B'
    : invPct > 10 ? '#F97316'
    : '#EF4444'

  // Gradiente del track
  const trackGradient = 'linear-gradient(to right, #34D399 0%, #84CC16 35%, #EAB308 50%, #F97316 75%, #EF4444 100%)'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: isWarning ? `1px solid ${alertCfg.color}30` : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 20,
      padding: '24px 28px',
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em', marginBottom: 4 }}>
            TIEMPO DE PEDIDO
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 40, fontWeight: 900, color: barColor, lineHeight: 1 }}>
              {invPct}%
            </span>
            <span style={{ fontSize: 14, color: '#666' }}>inventario restante</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px',
            borderRadius: 20, background: `${alertCfg.color}15`, border: `1px solid ${alertCfg.color}30`,
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: alertCfg.color }}>
              {alertCfg.icon} {alertCfg.label}
            </span>
          </div>
          {diasRestantes > 0 && (
            <p style={{ fontSize: 13, color: '#888' }}>
              <span style={{ fontWeight: 800, color: barColor }}>{diasRestantes} días</span> restantes
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        {/* Track */}
        <div style={{
          height: 12, borderRadius: 12, overflow: 'hidden',
          background: 'rgba(255,255,255,0.06)',
          position: 'relative',
        }}>
          {/* Gradient background (full track) */}
          <div style={{ position: 'absolute', inset: 0, background: trackGradient, opacity: 0.2 }} />
          {/* Inventory fill — shrinking from right */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: `${invPct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 12,
            boxShadow: `0 0 12px ${barColor}60`,
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }} />
          {/* Safety stock marker at 50% */}
          <div style={{
            position: 'absolute', left: '50%', top: 0, bottom: 0,
            width: 2, background: '#F59E0B',
            boxShadow: '0 0 6px #F59E0B',
          }} />
        </div>

        {/* Labels below bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>Pedido recibido</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>
              {ultimaCompra ? fFecha(ultimaCompra) : '—'}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#F59E0B', marginBottom: 2 }}>Stock de seguridad</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>50%</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>Próximo pedido</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: alertCfg.color }}>
              {siguiente ? fFecha(siguiente) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Info row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16,
        paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Basado en ciclo</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
            {ciclo ? `Cada ${ciclo}d` : '—'}
          </p>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Días sin comprar</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: barColor }}>{diasSin}d</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Próximo estimado</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: alertCfg.color }}>
            {siguiente ? fFecha(siguiente, true) : '—'}
          </p>
        </div>
      </div>

      {/* Warning box */}
      {isWarning && (
        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 12,
          background: `${alertCfg.color}10`, border: `1px solid ${alertCfg.color}25`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} color={alertCfg.color} />
          <p style={{ fontSize: 13, color: alertCfg.color, fontWeight: 600 }}>
            {frecuencia.alert_level === 'proximo'
              ? 'Se recomienda contactar al cliente para reposición esta semana.'
              : frecuencia.alert_level === 'vencido'
              ? 'El ciclo de compra ha vencido. Contactar con urgencia.'
              : '⚠ Cliente en estado crítico. Requiere contacto inmediato.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, color = '#fff', accent = false }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string; accent?: boolean
}) {
  return (
    <div style={{
      background: accent ? `rgba(212,175,55,0.07)` : 'rgba(255,255,255,0.03)',
      border: accent ? '1px solid rgba(212,175,55,0.2)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.06)',
        }}>
          {icon}
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.06em' }}>{label}</p>
      </div>
      <p style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#555' }}>{sub}</p>}
    </div>
  )
}

// ── Activity Item ─────────────────────────────────────────────────────────────
function ActivityItem({ icon, title, sub, date, vendedor, last = false }: {
  icon: React.ReactNode; title: string; sub?: string; date: string; vendedor?: string; last?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: last ? 0 : 16, position: 'relative' }}>
      {!last && (
        <div style={{
          position: 'absolute', left: 15, top: 32, bottom: 0, width: 1,
          background: 'rgba(255,255,255,0.06)',
        }} />
      )}
      <div style={{
        width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, zIndex: 1,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, paddingTop: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#ddd', marginBottom: 2 }}>{title}</p>
        {sub && <p style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>{sub}</p>}
        <p style={{ fontSize: 11, color: '#444' }}>
          {date}{vendedor ? ` · ${vendedor}` : ''}
        </p>
      </div>
    </div>
  )
}

// ── Tab Button ────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, badge }: {
  label: string; active: boolean; onClick: () => void; badge?: number
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
        fontWeight: active ? 700 : 500, fontSize: 13,
        background: active ? 'rgba(212,175,55,0.12)' : 'transparent',
        color: active ? GOLD : '#666',
        borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      {label}
      {badge != null && badge > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 800, background: active ? GOLD : '#333',
          color: active ? '#000' : '#888', borderRadius: 20, padding: '1px 6px', minWidth: 18, textAlign: 'center',
        }}>{badge}</span>
      )}
    </button>
  )
}

// ── Estado Selector ───────────────────────────────────────────────────────────
function EstadoSelector({ nombreFantasia, estadoInicial, notaInicial }: {
  nombreFantasia: string; estadoInicial: 'activo' | 'inactivo' | 'estacional'; notaInicial: string | null
}) {
  const [estado, setEstado] = useState(estadoInicial)
  const [saving, setSaving] = useState(false)

  async function cambiar(nuevo: 'activo' | 'inactivo' | 'estacional') {
    if (nuevo === estado) return
    setSaving(true)
    try {
      await fetch('/api/clientes/estado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_fantasia: nombreFantasia, estado: nuevo, nota: notaInicial }),
      })
      setEstado(nuevo)
    } finally { setSaving(false) }
  }

  const cfg = ESTADO_CFG[estado]
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {(['activo', 'estacional', 'inactivo'] as const).map(e => {
        const c = ESTADO_CFG[e]
        const isActive = estado === e
        return (
          <button key={e} onClick={() => cambiar(e)} disabled={saving}
            style={{
              padding: '4px 12px', borderRadius: 20, border: `1px solid ${isActive ? c.dot + '60' : 'rgba(255,255,255,0.08)'}`,
              background: isActive ? c.bg : 'transparent',
              color: isActive ? c.color : '#555', fontWeight: isActive ? 700 : 500, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? c.dot : '#444', display: 'inline-block' }} />
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ClienteDetalleClient({
  cliente, ventas, contactos, deudor, frecuencia,
  estadoCliente = 'activo', notaEstado = null, isAdmin = false,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'contacts' | 'notes' | 'activity'>('overview')
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const seg = frecuencia?.segmento ?? 'E'
  const segCfg = SEG_CFG[seg] ?? SEG_CFG.E
  const alertCfg = ALERT_CFG[frecuencia?.alert_level ?? 'sin_historial']
  const estadoCfg = ESTADO_CFG[estadoCliente]
  const deuda = deudor?.saldo_total ?? 0
  const deudaVencida = deudor?.deuda_vencida ?? 0

  // Ventas agrupadas por pedido único
  const pedidosUnicos = useMemo(() => {
    const map = new Map<string, { fecha: string; litros: number; venta: number; productos: string[] }>()
    for (const v of ventas) {
      const key = v.pedido ?? v.fecha_pedido
      const ex = map.get(key)
      if (ex) {
        ex.litros += v.litros
        ex.venta += v.total_sin_impuesto
        if (v.producto && !ex.productos.includes(v.producto)) ex.productos.push(v.producto)
      } else {
        map.set(key, { fecha: v.fecha_pedido, litros: v.litros, venta: v.total_sin_impuesto, productos: v.producto ? [v.producto] : [] })
      }
    }
    return [...map.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [ventas])

  // Top productos
  const topProductos = useMemo(() => {
    const map = new Map<string, { litros: number; count: number }>()
    for (const v of ventas) {
      if (!v.producto) continue
      const ex = map.get(v.producto)
      if (ex) { ex.litros += v.litros; ex.count++ }
      else map.set(v.producto, { litros: v.litros, count: 1 })
    }
    return [...map.entries()].sort((a, b) => b[1].litros - a[1].litros).slice(0, 8)
  }, [ventas])

  // Contactos últimos 30 días
  const contactos30d = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    return contactos.filter(c => new Date(c.fecha_hora) >= cutoff)
  }, [contactos])

  // Timeline unificado
  const timeline = useMemo(() => {
    const items: { date: string; type: string; label: string; sub?: string; vendedor?: string }[] = []
    for (const v of ventas.slice(0, 10)) {
      items.push({ date: v.fecha_pedido, type: 'order', label: `Pedido ${fPeso(v.total_sin_impuesto)}`, sub: `${v.litros} L`, vendedor: cliente.vendedor ?? undefined })
    }
    for (const c of contactos.slice(0, 10)) {
      items.push({ date: c.fecha_hora.split('T')[0], type: 'contact', label: `Contacto ${c.tipo}`, sub: c.notas ?? undefined, vendedor: c.vendedor })
    }
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
  }, [ventas, contactos, cliente.vendedor])

  // Última compra info
  const ultimaCompra = frecuencia?.ultima_compra ?? pedidosUnicos[0]?.fecha ?? null
  const ultimoPedido = pedidosUnicos[0]

  // Revenue mensual promedio (últimos 3 meses)
  const revMensual = useMemo(() => {
    const hace3m = new Date(); hace3m.setMonth(hace3m.getMonth() - 3)
    const total = ventas.filter(v => new Date(v.fecha_pedido) >= hace3m).reduce((s, v) => s + v.total_sin_impuesto, 0)
    return total / 3
  }, [ventas])

  const handleWA = () => {
    setWaTarget({
      nombre: cliente.nombre_fantasia ?? 'Cliente',
      telefono: cliente.telefono,
      contexto: 'general',
      cicloPromedioDias: frecuencia?.ciclo_promedio_dias,
      siguienteCompra: frecuencia?.siguiente_compra_estimada,
      subtitulo: cliente.categoria ?? undefined,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}

      <div style={{ minHeight: '100vh', background: '#090909', color: '#fff' }}>
        {/* ── Back button (mobile) ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 0',
        }}>
          <button onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: 0 }}>
            <ArrowLeft size={16} /> Volver a clientes
          </button>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px 80px' }}>

          {/* ══════════════════════════════════════════════════════════════════
              CUSTOMER HEADER
          ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 16, marginBottom: 20, flexWrap: 'wrap',
          }}>
            {/* Avatar + info */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Segmento avatar */}
              <div style={{
                width: 64, height: 64, borderRadius: 18, flexShrink: 0,
                background: segCfg.bg, border: `2px solid ${segCfg.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 1,
              }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: segCfg.color, lineHeight: 1 }}>
                  {getInitial(cliente.nombre_fantasia ?? 'C')}
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, color: segCfg.color, letterSpacing: '0.04em' }}>
                  {frecuencia?.score ?? '—'}pts
                </span>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0 }}>
                    {cliente.nombre_fantasia ?? '—'}
                  </h1>
                  {/* Segmento badge */}
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800,
                    background: segCfg.bg, color: segCfg.color, border: `1px solid ${segCfg.color}40`,
                  }}>
                    {seg} · {frecuencia?.score ?? '—'}pts
                  </span>
                </div>

                <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
                  {cliente.razon_social ?? ''}
                </p>

                {/* Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {/* Estado */}
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: estadoCfg.bg, color: estadoCfg.color, display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: estadoCfg.dot, display: 'inline-block' }} />
                    {estadoCfg.label}
                  </span>

                  {/* Categoria */}
                  {cliente.categoria && (
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {cliente.categoria}
                    </span>
                  )}

                  {/* Vendedor */}
                  {cliente.vendedor && (
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(96,165,250,0.08)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.2)' }}>
                      ⊕ {cliente.vendedor}
                    </span>
                  )}

                  {/* Ruta */}
                  {cliente.ruta_despacho && (
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(212,175,55,0.06)', color: GOLD, border: `1px solid ${GOLD}20` }}>
                      ✦ {cliente.ruta_despacho}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={handleWA} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                background: '#25D36615', border: '1px solid #25D36630', borderRadius: 12,
                color: '#25D366', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>
                <MessageCircle size={16} /> WhatsApp
              </button>
              <button style={{
                width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
              }}>
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              5 KPI CARDS
          ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10, marginBottom: 20,
          }}>
            <KPICard
              icon={<Calendar size={14} color={GOLD} />}
              label="PRÓXIMO PEDIDO"
              value={frecuencia?.dias_para_siguiente != null ? `${frecuencia.dias_para_siguiente} días` : '—'}
              sub={frecuencia?.siguiente_compra_estimada ? fFecha(frecuencia.siguiente_compra_estimada, true) : undefined}
              color={alertCfg.color}
              accent
            />
            <KPICard
              icon={<Clock size={14} color="#60A5FA" />}
              label="FRECUENCIA"
              value={frecuencia?.ciclo_promedio_dias ? `Cada ${frecuencia.ciclo_promedio_dias} días` : '—'}
              sub="Ciclo promedio"
              color="#60A5FA"
            />
            <KPICard
              icon={<ShoppingBag size={14} color="#34D399" />}
              label="ÚLTIMO PEDIDO"
              value={ultimaCompra ? fFecha(ultimaCompra, true) : '—'}
              sub={ultimoPedido ? `${fPeso(ultimoPedido.venta)} · ${ultimoPedido.litros.toFixed(0)} L` : undefined}
              color="#34D399"
            />
            <KPICard
              icon={<TrendingUp size={14} color={GOLD} />}
              label="VENTA MENSUAL PROM."
              value={revMensual > 0 ? fPeso(revMensual) : '—'}
              sub="Promedio últimos 3 meses"
              color={GOLD}
            />
            <KPICard
              icon={<CreditCard size={14} color={deuda > 0 ? '#F87171' : '#34D399'} />}
              label="DEUDA ACTUAL"
              value={deuda > 0 ? fPesoFull(deuda) : '$0'}
              sub={deuda > 0 ? (deudaVencida > 0 ? `$${Math.round(deudaVencida).toLocaleString('es-CL')} vencida` : 'Al día') : 'Al día'}
              color={deuda > 0 ? '#F87171' : '#34D399'}
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              INVENTORY DEPLETION (HERO)
          ══════════════════════════════════════════════════════════════════ */}
          {frecuencia && <InventoryBar frecuencia={frecuencia} />}

          {/* ══════════════════════════════════════════════════════════════════
              TABS
          ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto',
            borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0,
          }}>
            {[
              { key: 'overview',  label: 'Resumen'          },
              { key: 'orders',    label: 'Historial de pedidos', badge: pedidosUnicos.length },
              { key: 'products',  label: 'Productos'        },
              { key: 'contacts',  label: 'Contactos',       badge: contactos.length },
              { key: 'notes',     label: 'Notas'            },
              { key: 'activity',  label: 'Actividad'        },
            ].map(t => (
              <Tab
                key={t.key}
                label={t.label}
                active={activeTab === t.key as typeof activeTab}
                onClick={() => setActiveTab(t.key as typeof activeTab)}
                badge={(t as { badge?: number }).badge}
              />
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TAB: OVERVIEW
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

              {/* Col 1 — Customer Info */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em', marginBottom: 16 }}>INFORMACIÓN GENERAL</p>

                {/* Mini map placeholder */}
                {(cliente.direccion || cliente.localidad) && (
                  <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 16, height: 100, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                    <MapPin size={20} color={GOLD} />
                    <p style={{ fontSize: 11, color: '#555', textAlign: 'center', maxWidth: 160 }}>
                      {cliente.direccion ?? ''}{cliente.localidad ? `, ${cliente.localidad}` : ''}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[
                    { icon: <Tag size={13} />,       label: 'Tipo de negocio', value: cliente.tipo },
                    { icon: <Activity size={13} />,  label: 'Segmento',        value: cliente.giro },
                    { icon: <MapPin size={13} />,    label: 'Dirección',       value: cliente.direccion },
                    { icon: <Navigation size={13} />,label: 'Comuna',          value: cliente.localidad },
                    { icon: <Phone size={13} />,     label: 'Teléfono',        value: cliente.telefono },
                    { icon: <Mail size={13} />,      label: 'Email',           value: cliente.email },
                    { icon: <FileText size={13} />,  label: 'RUT',             value: cliente.rut },
                    { icon: <Truck size={13} />,     label: 'Ruta',            value: cliente.ruta_despacho },
                    { icon: <Clock size={13} />,     label: 'Cond. de pago',   value: cliente.condicion_venta },
                  ].filter(r => r.value).map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: '#444', flexShrink: 0 }}>{r.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 10, color: '#444', marginBottom: 1 }}>{r.label}</p>
                        <p style={{ fontSize: 12, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Col 2 — Commercial Summary */}
              <div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: 20, marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em', marginBottom: 16 }}>RESUMEN COMERCIAL</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {[
                      { label: 'Litros totales',   value: frecuencia?.litros_totales ? `${frecuencia.litros_totales.toFixed(0)} L` : `${ventas.reduce((s,v)=>s+v.litros,0).toFixed(0)} L`, color: '#60A5FA' },
                      { label: 'Total pedidos',     value: String(frecuencia?.total_pedidos ?? pedidosUnicos.length), color: '#fff' },
                      { label: 'Revenue total',     value: frecuencia?.revenue_total ? fPeso(frecuencia.revenue_total) : fPeso(ventas.reduce((s,v)=>s+v.total_sin_impuesto,0)), color: GOLD },
                      { label: 'Ticket promedio',   value: pedidosUnicos.length ? fPeso(pedidosUnicos.reduce((s,p)=>s+p.venta,0)/pedidosUnicos.length) : '—', color: '#fff' },
                      { label: 'Frecuencia',        value: frecuencia?.ciclo_promedio_dias ? `${frecuencia.ciclo_promedio_dias}d` : '—', color: '#60A5FA' },
                      { label: 'Cliente desde',     value: ventas.length ? fFecha(ventas[ventas.length-1].fecha_pedido) : '—', color: '#888' },
                    ].map((m, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 14px' }}>
                        <p style={{ fontSize: 10, color: '#444', marginBottom: 4 }}>{m.label.toUpperCase()}</p>
                        <p style={{ fontSize: 18, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Estado selector (admin) */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em', marginBottom: 12 }}>ESTADO DEL CLIENTE</p>
                  <EstadoSelector
                    nombreFantasia={cliente.nombre_fantasia ?? ''}
                    estadoInicial={estadoCliente}
                    notaInicial={notaEstado}
                  />
                  {notaEstado && (
                    <p style={{ fontSize: 12, color: '#555', marginTop: 10, fontStyle: 'italic' }}>{notaEstado}</p>
                  )}
                </div>

                {/* Admin: profitability */}
                {isAdmin && deuda > 0 && (
                  <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 18, padding: 20, marginTop: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em', marginBottom: 12 }}>DEUDA DETALLADA</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Saldo total',    value: fPesoFull(deudor?.saldo_total ?? 0) },
                        { label: 'Deuda vencida',  value: fPesoFull(deudor?.deuda_vencida ?? 0), red: (deudor?.deuda_vencida ?? 0) > 0 },
                        { label: '< 14 días',      value: fPesoFull(deudor?.deuda_menor_14_dias ?? 0) },
                        { label: '15-29 días',     value: fPesoFull(deudor?.deuda_entre_15_29_dias ?? 0) },
                        { label: '30-44 días',     value: fPesoFull(deudor?.deuda_entre_30_44_dias ?? 0) },
                        { label: '> 90 días',      value: fPesoFull(deudor?.deuda_mas_90_dias ?? 0), red: (deudor?.deuda_mas_90_dias ?? 0) > 0 },
                      ].map((d2, i) => (
                        <div key={i}>
                          <p style={{ fontSize: 10, color: '#444' }}>{d2.label}</p>
                          <p style={{ fontSize: 14, fontWeight: 700, color: (d2 as { red?: boolean }).red ? '#F87171' : '#888' }}>{d2.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Col 3 — Recent Activity */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em' }}>ÚLTIMA ACTIVIDAD</p>
                  <button onClick={() => setActiveTab('activity')} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Ver todo <ChevronRight size={12} />
                  </button>
                </div>

                <div>
                  {timeline.slice(0, 8).map((item, i) => (
                    <ActivityItem
                      key={i}
                      icon={item.type === 'order'
                        ? <ShoppingBag size={14} color="#34D399" />
                        : <MessageCircle size={14} color="#25D366" />}
                      title={item.label}
                      sub={item.sub}
                      date={fFecha(item.date, true)}
                      vendedor={item.vendedor}
                      last={i === Math.min(7, timeline.length - 1)}
                    />
                  ))}
                  {timeline.length === 0 && (
                    <p style={{ fontSize: 13, color: '#444', textAlign: 'center', paddingTop: 20 }}>Sin actividad registrada</p>
                  )}
                </div>

                {/* Contact performance */}
                {contactos.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em', marginBottom: 12 }}>RENDIMIENTO DE CONTACTO</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                        <p style={{ fontSize: 10, color: '#444', marginBottom: 2 }}>Contactos este mes</p>
                        <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{contactos30d.length}</p>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                        <p style={{ fontSize: 10, color: '#444', marginBottom: 2 }}>Último contacto</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
                          {contactos[0] ? fFecha(contactos[0].fecha_hora.split('T')[0]) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: ORDERS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'orders' && (
            <div>
              <div style={{ display: 'grid', gap: 8 }}>
                {pedidosUnicos.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingBag size={16} color="#34D399" />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{fFecha(p.fecha, true)}</p>
                        <p style={{ fontSize: 11, color: '#555' }}>{p.productos.slice(0,2).join(', ')}{p.productos.length > 2 ? '...' : ''}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: '#555' }}>Litros</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: '#60A5FA' }}>{p.litros.toFixed(1)} L</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: '#555' }}>Venta</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{fPeso(p.venta)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {pedidosUnicos.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#444', padding: '40px 0', fontSize: 14 }}>Sin pedidos registrados</p>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: PRODUCTS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'products' && (
            <div>
              <div style={{ display: 'grid', gap: 8 }}>
                {topProductos.map(([prod, stats], i) => {
                  const maxLitros = topProductos[0]?.[1]?.litros ?? 1
                  const pct = Math.round((stats.litros / maxLitros) * 100)
                  return (
                    <div key={i} style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 900, color: i === 0 ? GOLD : '#444', width: 22 }}>#{i+1}</span>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{prod}</p>
                            <p style={{ fontSize: 11, color: '#555' }}>{stats.count} pedidos</p>
                          </div>
                        </div>
                        <p style={{ fontSize: 16, fontWeight: 800, color: '#60A5FA' }}>{stats.litros.toFixed(1)} L</p>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? GOLD : '#60A5FA', borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
                {topProductos.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#444', padding: '40px 0', fontSize: 14 }}>Sin productos registrados</p>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: CONTACTS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'contacts' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: '#555' }}>{contactos.length} contactos registrados · {contactos30d.length} este mes</p>
                <button onClick={handleWA} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: '#25D36615', border: '1px solid #25D36630', color: '#25D366', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <MessageCircle size={13} /> Nuevo contacto
                </button>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {contactos.map((c, i) => (
                  <div key={i} style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#25D36608', border: '1px solid #25D36620', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MessageCircle size={16} color="#25D366" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>
                          {c.tipo === 'whatsapp' ? 'WhatsApp' : c.tipo === 'llamada' ? 'Llamada' : c.tipo}
                        </p>
                        <p style={{ fontSize: 11, color: '#444' }}>{fFecha(c.fecha_hora.split('T')[0], true)} · {c.fecha_hora.split('T')[1]?.slice(0,5) ?? ''}</p>
                      </div>
                      {c.notas && <p style={{ fontSize: 12, color: '#666' }}>{c.notas}</p>}
                      <p style={{ fontSize: 11, color: '#444', marginTop: 4 }}>por {c.vendedor}</p>
                    </div>
                  </div>
                ))}
                {contactos.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#444', padding: '40px 0', fontSize: 14 }}>Sin contactos registrados</p>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: NOTES
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'notes' && (
            <div>
              {cliente.notas ? (
                <div style={{ padding: '20px', borderRadius: 16, background: 'rgba(212,175,55,0.04)', border: `1px solid ${GOLD}20` }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <FileText size={16} color={GOLD} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>Nota del cliente</p>
                  </div>
                  <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.7 }}>{cliente.notas}</p>
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: '#444', padding: '40px 0', fontSize: 14 }}>Sin notas registradas</p>
              )}
              {notaEstado && (
                <div style={{ marginTop: 12, padding: '16px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 6 }}>NOTA DE ESTADO</p>
                  <p style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>{notaEstado}</p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: ACTIVITY (unified timeline)
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'activity' && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 18, padding: 24 }}>
              <div>
                {timeline.map((item, i) => (
                  <ActivityItem
                    key={i}
                    icon={item.type === 'order'
                      ? <ShoppingBag size={14} color="#34D399" />
                      : <MessageCircle size={14} color="#25D366" />}
                    title={item.label}
                    sub={item.sub}
                    date={fFecha(item.date, true)}
                    vendedor={item.vendedor}
                    last={i === timeline.length - 1}
                  />
                ))}
                {timeline.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#444', padding: '40px 0', fontSize: 14 }}>Sin actividad registrada</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
