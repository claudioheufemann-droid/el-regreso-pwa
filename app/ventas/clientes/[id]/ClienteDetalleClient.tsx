'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MessageCircle, Mail, MapPin, Phone, Tag, Truck,
  ShoppingBag, Droplets, DollarSign, Clock, User, FileText,
  CreditCard, Calendar, CheckCircle2, XCircle, Sunset, Star,
  AlertTriangle, TrendingUp, Package, Activity,
  Zap, ChevronRight, Navigation, Info, BarChart2,
  Bell, Users, Trash2, Plus,
} from 'lucide-react'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import AppHeader from '@/components/ui/AppHeader'
import { useIsDesktop } from '@/lib/useIsDesktop'
import RegistrarContactoModal, { type TipoContacto } from '@/components/ui/RegistrarContactoModal'
import FollowUpModal, { type FollowUp } from '@/components/ui/FollowUpModal'
import { VENDEDOR_DISPLAY } from '@/lib/types'

const dspV = (v: string | null | undefined) => VENDEDOR_DISPLAY[v ?? ''] ?? v ?? '—'

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
  resultado?: string | null
  notas: string | null
}

const RESULTADO_LABEL: Record<string, { label: string; color: string }> = {
  pedido:      { label: 'Hizo pedido', color: '#5A8A4A' },
  sin_pedido:  { label: 'Sin pedido',  color: '#D4AF37' },
  no_estaba:   { label: 'No estaba',   color: '#94A3B8' },
  reclamo:     { label: 'Reclamo',     color: '#B5543E' },
  seguimiento: { label: 'Seguimiento', color: '#D4AF37' },
}
const TIPO_LABEL: Record<string, string> = {
  visita: 'Visita', llamada: 'Llamada', whatsapp: 'WhatsApp', nota: 'Nota',
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

interface PersonaContacto {
  id: string
  nombre: string
  cargo: string | null
  telefono: string | null
  email: string | null
  es_decisor: boolean
  notas: string | null
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
  B: { color: '#5A8A4A', bg: 'rgba(52,211,153,0.12)',   label: 'B' },
  C: { color: '#D4AF37', bg: 'rgba(96,165,250,0.12)',   label: 'C' },
  D: { color: '#D4AF37', bg: 'rgba(245,158,11,0.12)',   label: 'D' },
  E: { color: '#B5543E', bg: 'rgba(248,113,113,0.12)',  label: 'E' },
}

const ALERT_CFG: Record<string, { color: string; label: string; icon: string }> = {
  ok:            { color: '#5A8A4A', label: 'Al día',        icon: '✓' },
  proximo:       { color: '#D4AF37', label: 'Próximo',       icon: '⏰' },
  vencido:       { color: '#B5543E', label: 'Vencido',       icon: '⚠' },
  critico:       { color: '#B5543E', label: 'Crítico',       icon: '🔴' },
  sin_historial: { color: '#666',    label: 'Sin historial', icon: '—'  },
}

const ESTADO_CFG = {
  activo:     { label: 'Activo',     color: '#5A8A4A', bg: 'rgba(52,211,153,0.1)',  dot: '#5A8A4A' },
  inactivo:   { label: 'Inactivo',   color: '#888',    bg: 'rgba(255,255,255,0.06)', dot: '#555'   },
  estacional: { label: 'Estacional', color: '#D4AF37', bg: 'rgba(96,165,250,0.1)',  dot: '#D4AF37' },
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
// Stock de seguridad = cuando quedan 7 días para el próximo pedido estimado.
// El marcador se posiciona dinámicamente según el ciclo del cliente:
//   Ej: ciclo 30d → marker al día 23 (30-7=23) = 23.3% restante del lado derecho
//   Ej: ciclo 14d → marker al día  7 (14-7= 7) = 50% restante
//   Ej: ciclo 60d → marker al día 53 (60-7=53) = 11.7% restante
function InventoryBar({ frecuencia }: { frecuencia: FrequencyStat }) {
  const ciclo = frecuencia.ciclo_promedio_dias ?? 0
  const diasSin = frecuencia.dias_sin_compra ?? 0
  const diasRestantes = frecuencia.dias_para_siguiente ?? 0
  const siguiente = frecuencia.siguiente_compra_estimada
  const ultimaCompra = frecuencia.ultima_compra

  // % del ciclo consumido (0 = recién pedido, 100 = completamente vencido)
  const consumidoPct = ciclo > 0 ? Math.min(100, Math.round((diasSin / ciclo) * 100)) : 0
  // % inventario restante (valor que se muestra prominentemente)
  const invPct = Math.max(0, 100 - consumidoPct)

  // ── Stock de seguridad dinámico ──────────────────────────────────────────
  // El marcador está donde quedan exactamente 7 días para el próximo pedido.
  // En términos del inventario restante: safetyInvPct = 7/ciclo * 100
  const SAFETY_DIAS = 7
  const safetyInvPct = ciclo > SAFETY_DIAS
    ? Math.round((SAFETY_DIAS / ciclo) * 100)   // p.ej. 30d → 23%, 60d → 12%
    : 50                                          // fallback si el ciclo es ≤7 días

  // El cliente está en zona de stock de seguridad si le quedan ≤ 7 días
  const enZonaSeguridad = diasRestantes <= SAFETY_DIAS || invPct <= safetyInvPct

  const alertCfg = ALERT_CFG[frecuencia.alert_level] ?? ALERT_CFG.sin_historial
  const isWarning = enZonaSeguridad || ['proximo', 'vencido', 'critico'].includes(frecuencia.alert_level)

  // Color de la barra — cambia según si está sobre o bajo el umbral de seguridad
  const barColor = invPct > safetyInvPct + 10 ? '#5A8A4A'  // verde: bien arriba del umbral
    : invPct > safetyInvPct           ? '#84CC16'            // lima: acercándose
    : invPct > safetyInvPct / 2       ? '#D4AF37'            // naranja: en zona de seguridad
    : invPct > 5                       ? '#F97316'            // rojo-naranja: casi vencido
    : '#B5543E'                                              // rojo: vencido/crítico

  // El marcador visual del safety stock se pone al safetyInvPct% del lado izquierdo
  // (la barra va de LLENA izquierda → VACÍA derecha, el fill muestra invPct desde izq.)
  const safetyMarkerLeft = safetyInvPct  // % desde la izquierda = % restante en el umbral

  // Gradiente del track de fondo (visual)
  const trackGradient = `linear-gradient(to right, #5A8A4A 0%, #84CC16 ${100 - safetyInvPct - 10}%, #EAB308 ${100 - safetyInvPct}%, #F97316 ${100 - safetyInvPct / 2}%, #B5543E 100%)`

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
          {ciclo > 0 && (
            <p style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
              Basado en su frecuencia de compra (cada {ciclo} días)
            </p>
          )}
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
          {diasRestantes > 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>
              <span style={{ fontWeight: 800, color: barColor }}>{diasRestantes} días</span> restantes
            </p>
          ) : diasSin > 0 && (
            <p style={{ fontSize: 13, color: '#888' }}>
              <span style={{ fontWeight: 800, color: '#B5543E' }}>{diasSin}d</span> sin comprar
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        {/* Track with gradient background */}
        <div style={{
          height: 14, borderRadius: 12, overflow: 'visible',
          background: 'rgba(255,255,255,0.05)',
          position: 'relative',
        }}>
          {/* Subtle gradient hint on track */}
          <div style={{
            position: 'absolute', inset: 0, background: trackGradient, opacity: 0.15,
            borderRadius: 12, overflow: 'hidden',
          }} />

          {/* Inventory fill — lleno a la izquierda, vacía hacia la derecha */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: `${invPct}%`,
            height: '100%',
            background: `linear-gradient(to right, ${barColor}ee, ${barColor})`,
            borderRadius: 12,
            boxShadow: `0 0 16px ${barColor}50`,
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }} />

          {/* Safety stock marker — dinámico según el ciclo */}
          {ciclo > 0 && (
            <div style={{
              position: 'absolute',
              left: `${safetyMarkerLeft}%`,
              top: -4, bottom: -4,
              width: 2,
              background: enZonaSeguridad ? '#B5543E' : '#D4AF37',
              boxShadow: enZonaSeguridad ? '0 0 8px #B5543E' : '0 0 8px #D4AF37',
              zIndex: 2,
              borderRadius: 2,
            }} />
          )}
        </div>

        {/* Labels below bar — posicionados dinámicamente */}
        <div style={{ position: 'relative', marginTop: 10, height: 36 }}>
          {/* Label izquierda: pedido recibido */}
          <div style={{ position: 'absolute', left: 0, top: 0 }}>
            <p style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>Pedido recibido</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>
              {ultimaCompra ? fFecha(ultimaCompra) : '—'}
            </p>
          </div>

          {/* Label del marcador de safety stock — posicionado con el marcador */}
          {ciclo > 0 && (
            <div style={{
              position: 'absolute',
              left: `${safetyMarkerLeft}%`,
              top: 0,
              transform: 'translateX(-50%)',
              textAlign: 'center',
              minWidth: 80,
            }}>
              <p style={{ fontSize: 10, color: enZonaSeguridad ? '#B5543E' : '#D4AF37', marginBottom: 2, fontWeight: 700 }}>
                Stock seguridad
              </p>
              <p style={{ fontSize: 11, fontWeight: 800, color: enZonaSeguridad ? '#B5543E' : '#D4AF37' }}>
                {SAFETY_DIAS}d antes
              </p>
            </div>
          )}

          {/* Label derecha: próximo pedido */}
          <div style={{ position: 'absolute', right: 0, top: 0 }}>
            <p style={{ fontSize: 10, color: '#555', marginBottom: 2, textAlign: 'right' }}>Próximo pedido</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: alertCfg.color, textAlign: 'right' }}>
              {siguiente ? fFecha(siguiente) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Info row */}
      <div className="kpi-grid-4" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 20,
        paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Ciclo promedio</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
            {ciclo ? `${ciclo} días` : '—'}
          </p>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Días sin comprar</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: barColor }}>{diasSin}d</p>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Días restantes</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: diasRestantes <= SAFETY_DIAS ? '#B5543E' : '#5A8A4A' }}>
            {diasRestantes > 0 ? `${diasRestantes}d` : 'Vencido'}
          </p>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Próximo estimado</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: alertCfg.color }}>
            {siguiente ? fFecha(siguiente, true) : '—'}
          </p>
        </div>
      </div>

      {/* Warning box — aparece cuando entra en zona de seguridad (≤7 días) */}
      {isWarning && (
        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 12,
          background: `${alertCfg.color}10`, border: `1px solid ${alertCfg.color}25`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} color={alertCfg.color} />
          <div>
            <p style={{ fontSize: 13, color: alertCfg.color, fontWeight: 700, marginBottom: 2 }}>
              {diasRestantes <= SAFETY_DIAS && diasRestantes > 0
                ? `⚠ Stock de seguridad — quedan ${diasRestantes} días para el próximo pedido.`
                : frecuencia.alert_level === 'vencido'
                ? '⚠ El ciclo de compra ha vencido. Contactar con urgencia.'
                : frecuencia.alert_level === 'critico'
                ? '🔴 Cliente en estado crítico. Requiere contacto inmediato.'
                : '⚠ Se recomienda contactar al cliente para reposición esta semana.'}
            </p>
            <p style={{ fontSize: 11, color: '#666' }}>
              {ciclo > 0
                ? `Stock de seguridad activo cuando restan ${SAFETY_DIAS} días de ${ciclo} del ciclo habitual.`
                : 'Contactar para verificar necesidad de reposición.'}
            </p>
          </div>
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
      <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#ddd', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {sub && <p style={{ fontSize: 12, color: '#555', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
        <p style={{ fontSize: 11, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {date}{vendedor ? ` · ${dspV(vendedor)}` : ''}
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
        flexShrink: 0, transition: 'all 0.15s',
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
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'contacts' | 'personas' | 'notes' | 'activity'>('overview')
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const [registrarTipo, setRegistrarTipo] = useState<TipoContacto | null>(null)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [personas, setPersonas] = useState<PersonaContacto[]>([])
  const [loadingFollowUps, setLoadingFollowUps] = useState(false)
  const [loadingPersonas, setLoadingPersonas] = useState(false)
  const [showAddPersona, setShowAddPersona] = useState(false)
  const [nuevaPersona, setNuevaPersona] = useState({ nombre: '', cargo: '', telefono: '', email: '', es_decisor: false })

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

  // Top productos — Mix de Compra Exacto: % real sobre el total (suma 100%),
  // no relativo al líder. Permite saber exactamente qué compra el cliente.
  const topProductos = useMemo(() => {
    const map = new Map<string, { litros: number; count: number }>()
    let totalLitros = 0
    for (const v of ventas) {
      if (!v.producto) continue
      totalLitros += v.litros
      const ex = map.get(v.producto)
      if (ex) { ex.litros += v.litros; ex.count++ }
      else map.set(v.producto, { litros: v.litros, count: 1 })
    }
    return [...map.entries()]
      .map(([prod, stats]) => ({ prod, ...stats, pctMix: totalLitros > 0 ? Math.round((stats.litros / totalLitros) * 100) : 0 }))
      .sort((a, b) => b.litros - a.litros)
      .slice(0, 8)
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
      const tipoLbl = TIPO_LABEL[c.tipo] ?? c.tipo
      const resLbl = c.resultado ? RESULTADO_LABEL[c.resultado]?.label : undefined
      items.push({
        date: c.fecha_hora.split('T')[0],
        type: 'contact',
        label: resLbl ? `${tipoLbl} · ${resLbl}` : tipoLbl,
        sub: c.notas ?? undefined,
        vendedor: c.vendedor,
      })
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

  // Cargar follow-ups al abrir tab "Actividad" o al cambiar
  const cargarFollowUps = useCallback(async () => {
    if (loadingFollowUps) return
    setLoadingFollowUps(true)
    try {
      const res = await fetch(`/api/followups?cliente=${encodeURIComponent(cliente.nombre_fantasia ?? '')}`)
      if (res.ok) setFollowUps(await res.json())
    } finally { setLoadingFollowUps(false) }
  }, [cliente.nombre_fantasia])

  const cargarPersonas = useCallback(async () => {
    if (loadingPersonas) return
    setLoadingPersonas(true)
    try {
      const res = await fetch(`/api/personas-contacto?cliente=${encodeURIComponent(cliente.nombre_fantasia ?? '')}`)
      if (res.ok) setPersonas(await res.json())
    } finally { setLoadingPersonas(false) }
  }, [cliente.nombre_fantasia])

  // Cargar al montar
  useEffect(() => { cargarFollowUps(); cargarPersonas() }, [cargarFollowUps, cargarPersonas])

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

  async function guardarPersona() {
    if (!nuevaPersona.nombre.trim()) return
    try {
      const res = await fetch('/api/personas-contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_nombre_fantasia: cliente.nombre_fantasia, ...nuevaPersona }),
      })
      if (res.ok) {
        const p = await res.json()
        setPersonas(prev => [p, ...prev])
        setNuevaPersona({ nombre: '', cargo: '', telefono: '', email: '', es_decisor: false })
        setShowAddPersona(false)
      }
    } catch (e) { console.error(e) }
  }

  async function toggleFollowUp(id: string, estado: 'pendiente' | 'completado') {
    await fetch('/api/followups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estado }) })
    setFollowUps(prev => prev.map(f => f.id === id ? { ...f, estado } : f))
  }

  async function eliminarFollowUp(id: string) {
    await fetch(`/api/followups?id=${id}`, { method: 'DELETE' })
    setFollowUps(prev => prev.filter(f => f.id !== id))
  }

  async function eliminarPersona(id: string) {
    await fetch(`/api/personas-contacto?id=${id}`, { method: 'DELETE' })
    setPersonas(prev => prev.filter(p => p.id !== id))
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
      {registrarTipo && (
        <RegistrarContactoModal
          target={{ nombre: cliente.nombre_fantasia ?? 'Cliente', tipoInicial: registrarTipo }}
          onClose={() => setRegistrarTipo(null)}
          onRegistrado={() => router.refresh()}
        />
      )}
      {showFollowUp && (
        <FollowUpModal
          clienteNombre={cliente.nombre_fantasia ?? 'Cliente'}
          onClose={() => setShowFollowUp(false)}
          onCreado={fu => setFollowUps(prev => [...prev, fu].sort((a, b) => a.fecha_recordatorio.localeCompare(b.fecha_recordatorio)))}
        />
      )}

      <div style={{ minHeight: '100vh', background: '#090909', color: '#fff' }}>
        <div style={{ maxWidth: 1700, margin: '0 auto', padding: '16px 16px 80px' }}>
          <AppHeader
            title="Detalle Cliente"
            extraAction={
              <button onClick={() => router.back()}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 9 }}>
                <ArrowLeft size={14} /> Volver
              </button>
            }
          />

          {/* ══════════════════════════════════════════════════════════════════
              CUSTOMER HEADER
          ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: isDesktop ? 16 : 10, marginBottom: isDesktop ? 20 : 14, flexWrap: 'wrap',
          }}>
            {/* Avatar + info */}
            <div style={{ display: 'flex', gap: isDesktop ? 16 : 11, alignItems: 'flex-start' }}>
              {/* Segmento avatar */}
              <div style={{
                width: isDesktop ? 64 : 48, height: isDesktop ? 64 : 48, borderRadius: isDesktop ? 18 : 14, flexShrink: 0,
                background: segCfg.bg, border: `2px solid ${segCfg.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 1,
              }}>
                <span style={{ fontSize: isDesktop ? 22 : 17, fontWeight: 900, color: segCfg.color, lineHeight: 1 }}>
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
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(96,165,250,0.08)', color: '#D4AF37', border: '1px solid rgba(96,165,250,0.2)' }}>
                      ⊕ {dspV(cliente.vendedor)}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => router.push(`/terreno/nueva-visita?cliente=${encodeURIComponent(cliente.nombre_fantasia ?? '')}`)}
                style={{
                  minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px',
                  background: 'linear-gradient(135deg, #E5C45A, #B8962E)', border: 'none', borderRadius: 12,
                  color: '#080808', fontWeight: 900, fontSize: 13, cursor: 'pointer',
                  boxShadow: '0 3px 14px rgba(212,175,55,0.25)',
                }}
              >
                <ShoppingBag size={15} /> Tomar pedido
              </button>
              <button onClick={() => setShowFollowUp(true)} style={{
                minHeight: 44, display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px',
                background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 12,
                color: '#D4AF37', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}>
                <Bell size={14} /> Recordatorio
              </button>
              <button onClick={handleWA} style={{
                minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
                background: '#25D36615', border: '1px solid #25D36630', borderRadius: 12,
                color: '#25D366', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>
                <MessageCircle size={16} /> WhatsApp
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              5 KPI CARDS
          ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))',
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
              icon={<Clock size={14} color="#D4AF37" />}
              label="FRECUENCIA"
              value={frecuencia?.ciclo_promedio_dias ? `Cada ${frecuencia.ciclo_promedio_dias} días` : '—'}
              sub="Ciclo promedio"
              color="#D4AF37"
            />
            <KPICard
              icon={<ShoppingBag size={14} color="#5A8A4A" />}
              label="ÚLTIMO PEDIDO"
              value={ultimaCompra ? fFecha(ultimaCompra, true) : '—'}
              sub={ultimoPedido ? `${fPeso(ultimoPedido.venta)} · ${ultimoPedido.litros.toFixed(0)} L` : undefined}
              color="#5A8A4A"
            />
            <KPICard
              icon={<TrendingUp size={14} color={GOLD} />}
              label="VENTA MENSUAL PROM."
              value={revMensual > 0 ? fPeso(revMensual) : '—'}
              sub="Promedio últimos 3 meses"
              color={GOLD}
            />
            <KPICard
              icon={<CreditCard size={14} color={deuda > 0 ? '#B5543E' : '#5A8A4A'} />}
              label="DEUDA ACTUAL"
              value={deuda > 0 ? fPesoFull(deuda) : '$0'}
              sub={deuda > 0 ? (deudaVencida > 0 ? `$${Math.round(deudaVencida).toLocaleString('es-CL')} vencida` : 'Al día') : 'Al día'}
              color={deuda > 0 ? '#B5543E' : '#5A8A4A'}
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
              { key: 'orders',    label: 'Pedidos',          badge: pedidosUnicos.length },
              { key: 'products',  label: 'Productos'        },
              { key: 'contacts',  label: 'Interacciones',   badge: contactos.length },
              { key: 'personas',  label: 'Personas',        badge: personas.length || undefined },
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
            <div className="grid-stack-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

              {/* Col 1 — Customer Info */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isDesktop ? 18 : 14, padding: isDesktop ? 20 : 13 }}>
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
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isDesktop ? 18 : 14, padding: isDesktop ? 20 : 13, marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: '0.08em', marginBottom: 16 }}>RESUMEN COMERCIAL</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {[
                      { label: 'Litros totales',   value: frecuencia?.litros_totales ? `${frecuencia.litros_totales.toFixed(0)} L` : `${ventas.reduce((s,v)=>s+v.litros,0).toFixed(0)} L`, color: '#D4AF37' },
                      { label: 'Total pedidos',     value: String(frecuencia?.total_pedidos ?? pedidosUnicos.length), color: '#fff' },
                      { label: 'Revenue total',     value: frecuencia?.revenue_total ? fPeso(frecuencia.revenue_total) : fPeso(ventas.reduce((s,v)=>s+v.total_sin_impuesto,0)), color: GOLD },
                      { label: 'Ticket promedio',   value: pedidosUnicos.length ? fPeso(pedidosUnicos.reduce((s,p)=>s+p.venta,0)/pedidosUnicos.length) : '—', color: '#fff' },
                      { label: 'Frecuencia',        value: frecuencia?.ciclo_promedio_dias ? `${frecuencia.ciclo_promedio_dias}d` : '—', color: '#D4AF37' },
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
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isDesktop ? 18 : 14, padding: isDesktop ? 20 : 13 }}>
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
                  <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: isDesktop ? 18 : 14, padding: isDesktop ? 20 : 13, marginTop: 16 }}>
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
                          <p style={{ fontSize: 14, fontWeight: 700, color: (d2 as { red?: boolean }).red ? '#B5543E' : '#888' }}>{d2.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Col 3 — Recent Activity */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isDesktop ? 18 : 14, padding: isDesktop ? 20 : 13 }}>
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
                        ? <ShoppingBag size={14} color="#5A8A4A" />
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
                        <ShoppingBag size={16} color="#5A8A4A" />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{fFecha(p.fecha, true)}</p>
                        <p style={{ fontSize: 11, color: '#555' }}>{p.productos.slice(0,2).join(', ')}{p.productos.length > 2 ? '...' : ''}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: '#555' }}>Litros</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: '#D4AF37' }}>{p.litros.toFixed(1)} L</p>
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
              <p style={{ fontSize: 11, color: '#666', marginBottom: 12 }}>
                Mix de compra exacto — qué porcentaje de sus litros totales corresponde a cada producto
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {topProductos.map(({ prod, litros, count, pctMix }, i) => (
                  <div key={i} style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: i === 0 ? GOLD : '#444', width: 22 }}>#{i+1}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{prod}</p>
                          <p style={{ fontSize: 11, color: '#555' }}>{count} pedidos · {litros.toFixed(1)} L</p>
                        </div>
                      </div>
                      <p style={{ fontSize: 20, fontWeight: 900, color: i === 0 ? GOLD : '#D4AF37', letterSpacing: '-0.5px' }}>{pctMix}%</p>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pctMix}%`, background: i === 0 ? GOLD : '#D4AF37', borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
                {topProductos.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#444', padding: '40px 0', fontSize: 14 }}>Sin productos registrados</p>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: CONTACTS — bitácora real de interacciones
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'contacts' && (
            <div>
              {/* Barra superior */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <p style={{ fontSize: 13, color: '#666' }}>
                  {contactos.length} {contactos.length === 1 ? 'interacción' : 'interacciones'} · {contactos30d.length} este mes
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setRegistrarTipo('visita')} style={{
                    minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(52,211,153,0.3)',
                    background: 'rgba(52,211,153,0.08)', color: '#5A8A4A', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <MapPin size={14}/> Registrar
                  </button>
                  <button onClick={handleWA} style={{
                    minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(37,211,102,0.3)',
                    background: 'rgba(37,211,102,0.08)', color: '#25D366', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <MessageCircle size={14}/> WhatsApp
                  </button>
                </div>
              </div>

              {/* Botones de acción rápida por tipo */}
              <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
                {([
                  { tipo: 'visita' as TipoContacto,   label: 'Visita',   icon: <MapPin size={14}/>,        color: '#5A8A4A' },
                  { tipo: 'llamada' as TipoContacto,  label: 'Llamada',  icon: <Phone size={14}/>,         color: '#D4AF37' },
                  { tipo: 'whatsapp' as TipoContacto, label: 'WhatsApp', icon: <MessageCircle size={14}/>, color: '#25D366' },
                  { tipo: 'nota' as TipoContacto,     label: 'Nota',     icon: <FileText size={14}/>,      color: '#D4AF37' },
                ] as const).map(({ tipo, label, icon, color }) => (
                  <button key={tipo} onClick={() => setRegistrarTipo(tipo)} style={{
                    minHeight: 60, padding: '10px 6px', borderRadius: 14, border: `1px solid ${color}25`,
                    background: `${color}08`, color, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}>
                    {icon}
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Timeline de interacciones */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contactos.map((c, i) => {
                  const resCfg = c.resultado ? RESULTADO_LABEL[c.resultado] : null
                  const tipoIcon = c.tipo === 'visita' ? <MapPin size={15} /> : c.tipo === 'llamada' ? <Phone size={15} /> : c.tipo === 'nota' ? <FileText size={15} /> : <MessageCircle size={15} />
                  const tipoColor = c.tipo === 'visita' ? '#5A8A4A' : c.tipo === 'llamada' ? '#D4AF37' : c.tipo === 'nota' ? '#D4AF37' : '#25D366'
                  return (
                    <div key={i} style={{
                      padding: '14px 18px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', gap: 14,
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                        background: `${tipoColor}10`, border: `1px solid ${tipoColor}25`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: tipoColor,
                      }}>
                        {tipoIcon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>
                              {TIPO_LABEL[c.tipo] ?? c.tipo}
                            </span>
                            {resCfg && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: `${resCfg.color}15`, color: resCfg.color, border: `1px solid ${resCfg.color}30`,
                              }}>
                                {resCfg.label}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: '#444', flexShrink: 0 }}>
                            {fFecha(c.fecha_hora.split('T')[0], true)} {c.fecha_hora.split('T')[1]?.slice(0, 5)}
                          </span>
                        </div>
                        {c.notas && (
                          <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5, marginBottom: 4 }}>{c.notas}</p>
                        )}
                        <p style={{ fontSize: 11, color: '#444' }}>por {dspV(c.vendedor)}</p>
                      </div>
                    </div>
                  )
                })}
                {contactos.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <p style={{ fontSize: 28, marginBottom: 10 }}>📋</p>
                    <p style={{ fontSize: 14, color: '#ccc', fontWeight: 700, marginBottom: 6 }}>Sin interacciones registradas</p>
                    <p style={{ fontSize: 12, color: '#555' }}>Registra visitas, llamadas, WhatsApps y notas para construir el historial del cliente.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: PERSONAS — personas de contacto del cliente (#14)
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'personas' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: '#666' }}>{personas.length} persona{personas.length !== 1 ? 's' : ''} de contacto</p>
                <button onClick={() => setShowAddPersona(v => !v)} style={{
                  minHeight: 44, padding: '0 16px', borderRadius: 12,
                  border: '1px solid rgba(212,175,55,0.3)', background: 'rgba(212,175,55,0.08)',
                  color: '#D4AF37', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Plus size={14}/> Nueva persona
                </button>
              </div>

              {/* Formulario agregar persona */}
              {showAddPersona && (
                <div style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.2)', marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#D4AF37', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }}>Nueva persona</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {[
                      { key: 'nombre' as const, placeholder: 'Nombre *', full: true },
                      { key: 'cargo' as const,  placeholder: 'Cargo (dueño, comprador…)' },
                      { key: 'telefono' as const, placeholder: 'Teléfono' },
                      { key: 'email' as const,    placeholder: 'Email' },
                    ].map(({ key, placeholder, full }) => (
                      <input key={key} placeholder={placeholder}
                        value={(nuevaPersona[key] as string) || ''}
                        onChange={e => setNuevaPersona(p => ({ ...p, [key]: e.target.value }))}
                        style={{
                          gridColumn: full ? 'span 2' : undefined,
                          minHeight: 44, padding: '0 12px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--cream)', fontSize: 13, outline: 'none',
                        }}/>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={nuevaPersona.es_decisor}
                      onChange={e => setNuevaPersona(p => ({ ...p, es_decisor: e.target.checked }))}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                    <span style={{ fontSize: 13, color: 'var(--cream)' }}>Es quien toma la decisión de compra</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowAddPersona(false)} style={{
                      flex: 1, minHeight: 40, borderRadius: 10, border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button onClick={guardarPersona} disabled={!nuevaPersona.nombre.trim()} style={{
                      flex: 2, minHeight: 40, borderRadius: 10, border: 'none',
                      background: nuevaPersona.nombre.trim() ? '#D4AF37' : 'rgba(212,175,55,0.3)',
                      color: '#0A0A0A', fontSize: 12, fontWeight: 800, cursor: nuevaPersona.nombre.trim() ? 'pointer' : 'not-allowed' }}>
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de personas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {personas.map(p => (
                  <div key={p.id} style={{ padding: '14px 18px', borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: p.es_decisor ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.05)', border: `1.5px solid ${p.es_decisor ? '#D4AF37' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={16} color={p.es_decisor ? '#D4AF37' : '#555'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>{p.nombre}</span>
                        {p.es_decisor && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }}>
                            ★ Decisor
                          </span>
                        )}
                      </div>
                      {p.cargo && <p style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{p.cargo}</p>}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {p.telefono && (
                          <a href={`tel:${p.telefono}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#D4AF37', textDecoration: 'none' }}>
                            <Phone size={12}/> {p.telefono}
                          </a>
                        )}
                        {p.email && (
                          <a href={`mailto:${p.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#D4AF37', textDecoration: 'none' }}>
                            <Mail size={12}/> {p.email}
                          </a>
                        )}
                      </div>
                      {p.notas && <p style={{ fontSize: 11, color: '#555', marginTop: 6, fontStyle: 'italic' }}>{p.notas}</p>}
                    </div>
                    <button onClick={() => eliminarPersona(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 4, minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
                {personas.length === 0 && !showAddPersona && (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <p style={{ fontSize: 28, marginBottom: 10 }}>👤</p>
                    <p style={{ fontSize: 14, color: 'var(--cream)', fontWeight: 700, marginBottom: 6 }}>Sin personas de contacto</p>
                    <p style={{ fontSize: 12, color: '#555' }}>Agrega al dueño, encargado de compras o quien decide. Así sabrás siempre a quién llamar.</p>
                  </div>
                )}
              </div>

              {/* Follow-ups de este cliente */}
              {followUps.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>Recordatorios</p>
                  {followUps.map(fu => {
                    const vencido = fu.fecha_recordatorio < new Date().toISOString().split('T')[0] && fu.estado === 'pendiente'
                    return (
                      <div key={fu.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: 'var(--surface2)', border: `1px solid ${vencido ? 'rgba(248,113,113,0.3)' : 'var(--border)'}`, marginBottom: 6 }}>
                        <Bell size={14} color={fu.estado === 'completado' ? '#5A8A4A' : vencido ? '#B5543E' : '#D4AF37'}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: fu.estado === 'completado' ? '#555' : 'var(--cream)', textDecoration: fu.estado === 'completado' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fu.nota}</p>
                          <p style={{ fontSize: 10, color: vencido ? '#B5543E' : '#555' }}>{fu.fecha_recordatorio}</p>
                        </div>
                        <button onClick={() => toggleFollowUp(fu.id, fu.estado === 'completado' ? 'pendiente' : 'completado')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: fu.estado === 'completado' ? '#5A8A4A' : '#555', minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle2 size={15}/>
                        </button>
                        <button onClick={() => eliminarFollowUp(fu.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: NOTES — timeline fechado de notas (#15)
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'notes' && (
            <div>
              {/* Botón agregar nota */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button onClick={() => setRegistrarTipo('nota')} style={{
                  minHeight: 44, padding: '0 18px', borderRadius: 12,
                  border: `1px solid ${GOLD}40`, background: `${GOLD}0A`,
                  color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <FileText size={14}/> Nueva nota
                </button>
              </div>

              {/* Notas del CRM (contactos tipo="nota") como timeline */}
              {contactos.filter(c => c.tipo === 'nota').length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                    Notas del equipo
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {contactos.filter(c => c.tipo === 'nota').map((c, i) => (
                      <div key={i} style={{
                        padding: '14px 18px', borderRadius: 14,
                        background: `${GOLD}06`, border: `1px solid ${GOLD}18`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>📝 {dspV(c.vendedor)}</span>
                          <span style={{ fontSize: 11, color: '#444' }}>
                            {fFecha(c.fecha_hora.split('T')[0], true)} {c.fecha_hora.split('T')[1]?.slice(0, 5)}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>{c.notas}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nota estática del ERP (campo clientes.notas) */}
              {cliente.notas && (
                <div style={{ padding: '18px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <FileText size={15} color="#555" />
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.5px' }}>NOTA DEL ERP</p>
                  </div>
                  <p style={{ fontSize: 13, color: '#888', lineHeight: 1.7 }}>{cliente.notas}</p>
                </div>
              )}

              {notaEstado && (
                <div style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>Nota de estado</p>
                  <p style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>{notaEstado}</p>
                </div>
              )}

              {contactos.filter(c => c.tipo === 'nota').length === 0 && !cliente.notas && !notaEstado && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <p style={{ fontSize: 28, marginBottom: 10 }}>📝</p>
                  <p style={{ fontSize: 14, color: '#ccc', fontWeight: 700, marginBottom: 6 }}>Sin notas aún</p>
                  <p style={{ fontSize: 12, color: '#555' }}>Registra lo que conversaste, acuerdos, alertas del cliente.</p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: ACTIVITY (unified timeline)
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'activity' && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: isDesktop ? 18 : 14, padding: isDesktop ? 24 : 14 }}>
              <div>
                {timeline.map((item, i) => (
                  <ActivityItem
                    key={i}
                    icon={item.type === 'order'
                      ? <ShoppingBag size={14} color="#5A8A4A" />
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
