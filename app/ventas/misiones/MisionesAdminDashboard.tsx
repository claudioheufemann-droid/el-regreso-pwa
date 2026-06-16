'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, MessageCircle, Phone, TrendingUp, TrendingDown, Users, Target, Droplets, DollarSign, AlertTriangle, Calendar, MapPin, BarChart3, ChevronDown, Sparkles, CheckCircle2, XCircle, Clock, ShoppingBag } from 'lucide-react'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import { useIsDesktop } from '@/lib/useIsDesktop'

// ── Fila compacta para mobile (reemplaza tablas anchas con scroll-x) ─────────
function MobileRow({ avatarChar, avatarColor, title, subtitle, metric, metricColor, progress, progressColor, actions }: {
  avatarChar: string; avatarColor: string; title: string; subtitle?: string
  metric?: string; metricColor?: string
  progress?: { pct: number; label: string }; progressColor?: string
  actions?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${avatarColor}18`, border: `1px solid ${avatarColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: avatarColor, flexShrink: 0 }}>
        {avatarChar}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {subtitle && <p style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</p>}
        {progress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${progress.pct}%`, height: '100%', background: progressColor ?? 'var(--gold)', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, color: progressColor ?? 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>{progress.label}</span>
          </div>
        )}
      </div>
      {metric && (
        <span style={{ fontSize: 12, fontWeight: 700, color: metricColor ?? 'var(--cream)', flexShrink: 0, textAlign: 'right' }}>{metric}</span>
      )}
      {actions && <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>{actions}</div>}
    </div>
  )
}

function ActionBtn({ color, bg, border, onClick, children }: { color: string; bg: string; border: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${border}`, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AdminStats {
  semana: string; semanaFin: string; semanas: string[]
  total: number; completadas: number; porContactar: number; vencidas: number
  dTotal: number; dCompletadas: number; dPorContactar: number; dVencidas: number
  volumen: number; venta: number; ticket: number
  dVolumen: number; dVenta: number; dTicket: number
  clientesEnRiesgo: number; agendados: number
  porVendedor: { vendedor: string; asignadas: number; completadas: number; pct: number; volumen: number; dVolumen: number; color: string }[]
  sparklines: { total: number[]; completadas: number[]; porContactar: number[]; vencidas: number[] }
  mejoresDias: { dia: string; count: number; tasa: number }[]
  zonasRiesgo: number
  topRiesgo: { nombre: string; vendedor: string; diasSinCompra: number; ultimaCompra: string | null; segmento: string; telefono: string | null }[]
  segmentacion: { activo: number; inactivo: number; temporal: number; nuevo: number }
  volumenBaja: { nombre_fantasia: string; vendedor_actual: string; segmento: string; litros_reciente: number; litros_baseline: number; caida_pct: number; pedidos_totales: number; dias_sin_compra: number; telefono: string | null }[]
  volumenBajaTotal: number
  crossSell: { nombre_fantasia: string; vendedor_actual: string; categoria_negocio: string; categoria_sugerida: string; peers_pct: number; telefono: string | null }[]
  crossSellTotal: number
  cohortes: { cohorte: string; clientes: number; repitieron: number; repeat_pct: number; activos: number; activos_pct: number; pedidos_prom: number; litros_prom: number }[]
  repeatRateGlobal: number
}

const MES_NOMBRE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function cohorteLabel(c: string): string {
  const [y, m] = c.split('-').map(Number)
  return `${MES_NOMBRE[m - 1]} ${String(y).slice(2)}`
}

const SEG_TYPES = [
  { key: 'activo',   label: 'Activos',    color: 'var(--green-dim)', icon: <CheckCircle2 size={14} />, desc: 'Compradores regulares' },
  { key: 'inactivo', label: 'Inactivos',  color: 'var(--red-dim)', icon: <XCircle size={14} />,      desc: 'En riesgo de abandono' },
  { key: 'temporal', label: 'Temporales', color: 'var(--gold)', icon: <Clock size={14} />,         desc: 'Compradores esporádicos' },
  { key: 'nuevo',    label: 'Nuevos',     color: 'var(--blue)', icon: <Sparkles size={14} />,      desc: 'Incorporación reciente' },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date): string {
  const x = new Date(d); const day = x.getDay()
  x.setDate(x.getDate() - day + (day === 0 ? -6 : 1))
  return x.toISOString().split('T')[0]
}

function getLastNMondays(n: number): string[] {
  const mondays: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d); x.setDate(x.getDate() - i * 7)
    mondays.push(getMondayOfWeek(x))
  }
  return [...new Set(mondays)]
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('T')[0].split('-')
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${parseInt(d)} ${meses[parseInt(m)-1]}`
}

function rangoSemana(lunes: string): string {
  const d = new Date(lunes + 'T12:00:00')
  const fin = new Date(d); fin.setDate(fin.getDate() + 6)
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${d.getDate()} ${meses[d.getMonth()]} – ${fin.getDate()} ${meses[fin.getMonth()]} ${fin.getFullYear()}`
}

function fPeso(n: number): string {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n).toLocaleString('es-CL')}`
  return `$${n}`
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ data, color, width = 100, height = 36 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data.length || data.every(v => v === 0)) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Donut Chart SVG ───────────────────────────────────────────────────────────

function DonutChart({ completadas, vencidas, total }: { completadas: number; vencidas: number; total: number }) {
  const r = 70; const cx = 90; const cy = 90
  const circ = 2 * Math.PI * r
  const pComp = total > 0 ? completadas / total : 0
  const pVenc = total > 0 ? vencidas / total : 0
  const pPend = 1 - pComp - pVenc
  const gap = 2

  let offset = 0
  const segments = [
    { pct: pPend, color: 'var(--gold)', label: 'Por completar' },
    { pct: pComp, color: 'var(--green-dim)', label: 'Completadas' },
    { pct: pVenc, color: 'var(--red-dim)', label: 'Vencidas' },
  ]

  return (
    <svg width={180} height={180} viewBox="0 0 180 180">
      {segments.map((seg, i) => {
        const dashLen = Math.max(0, (seg.pct * circ) - gap)
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="22"
            strokeDasharray={`${dashLen} ${circ - dashLen}`}
            strokeDashoffset={-offset * circ + circ / 4}
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
          />
        )
        offset += seg.pct
        return el
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="26" fontWeight="900" fill="var(--cream)" style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="var(--muted)">Total</text>
    </svg>
  )
}

// ── Gauge semicircular ────────────────────────────────────────────────────────

function Gauge({ pct }: { pct: number }) {
  const r = 65; const cx = 90; const cy = 90
  const angle = 180
  const arcLen = Math.PI * r
  const fill = (pct / 100) * arcLen
  const color = pct >= 80 ? 'var(--green-dim)' : pct >= 50 ? 'var(--gold)' : 'var(--gold)'

  function polarToCart(deg: number) {
    const rad = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }
  const start = polarToCart(180); const end = polarToCart(0)

  return (
    <svg width={180} height={110} viewBox="0 0 180 110">
      {/* Track */}
      <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" strokeLinecap="round" />
      {/* Fill */}
      <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`} fill="none"
        stroke={color} strokeWidth="16" strokeLinecap="round"
        strokeDasharray={`${fill} ${arcLen}`} />
      {/* Tick 0% */}
      <text x="12" y="102" fontSize="9" fill="var(--muted)">0%</text>
      {/* Tick 100% */}
      <text x="155" y="102" fontSize="9" fill="var(--muted)" textAnchor="end">100%</text>
      {/* Indicator dot */}
      {(() => {
        const deg = 180 - (pct / 100) * 180
        const rad = (deg * Math.PI) / 180
        const ix = cx + r * Math.cos(rad); const iy = cy + r * Math.sin(rad)
        return <circle cx={ix} cy={iy} r={7} fill={color} />
      })()}
      {/* Center text */}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="28" fontWeight="900" fill={color} style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">Completado</text>
    </svg>
  )
}

// ── KPI Card principal ─────────────────────────────────────────────────────────

function KpiCard({ icon, color, label, value, pct, delta, deltaLabel, sparkData }: {
  icon: React.ReactNode; color: string; label: string
  value: string | number; pct?: string; delta: number; deltaLabel?: string; sparkData: number[]
}) {
  const up = delta >= 0
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-1)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1, marginBottom: 3, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}>{value}</p>
          {pct && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{pct}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
            {up ? <TrendingUp size={11} color="var(--green-dim)" /> : <TrendingDown size={11} color="var(--red-dim)" />}
            <span style={{ fontSize: 11, color: up ? 'var(--green-dim)' : 'var(--red-dim)', fontWeight: 600 }}>
              {up ? '+' : ''}{delta} {deltaLabel ?? 'vs semana anterior'}
            </span>
          </div>
        </div>
        <div style={{ color, opacity: 0.7 }}>{icon}</div>
      </div>
      <div style={{ position: 'absolute', bottom: 10, right: 16, opacity: 0.8 }}>
        <Sparkline data={sparkData} color={color} width={100} height={34} />
      </div>
    </div>
  )
}

// ── KPI Card secundario ────────────────────────────────────────────────────────

function MiniKpi({ icon, color, label, value, sub, link, onLink }: {
  icon: React.ReactNode; color: string; label: string; value: string
  sub?: string; link?: string; onLink?: () => void
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: 'var(--shadow-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ color, opacity: 0.8 }}>{icon}</div>
        <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{label}</p>
      </div>
      <p style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: link ? 8 : 0 }}>{sub}</p>}
      {link && (
        <button onClick={onLink} style={{ background: 'none', border: 'none', color, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {link} →
        </button>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props { isAdmin: boolean }

export default function MisionesAdminDashboard({ isAdmin }: Props) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const [semana, setSemana] = useState(() => getMondayOfWeek(new Date()))
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)

  const semanas = getLastNMondays(8)

  const load = useCallback(async (s: string, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true)
    try {
      const res = await fetch(`/api/misiones-admin?semana=${s}`)
      if (res.ok) setStats(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load(semana) }, [semana, load])

  if (!isAdmin) return null

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: 'var(--muted)' }}>
      <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} />
      Cargando dashboard…
    </div>
  )

  if (!stats) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      <AlertTriangle size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
      <p>No se pudieron cargar los datos.</p>
    </div>
  )

  const pct = stats.total > 0 ? Math.round((stats.completadas / stats.total) * 100) : 0
  const faltan = stats.total - stats.completadas
  const mejorDia = stats.mejoresDias[0]

  return (
    <div style={{ padding: '0 0 60px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px', marginBottom: 3 }}>
            Misiones de la semana
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>{rangoSemana(semana)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Week selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 12px' }}>
            <Calendar size={13} style={{ color: 'var(--gold)' }} />
            <select
              value={semana}
              onChange={e => setSemana(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--cream)', fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none' }}
            >
              {semanas.map(s => (
                <option key={s} value={s} style={{ background: 'var(--surface)' }}>
                  {s === getMondayOfWeek(new Date()) ? 'Esta semana' : rangoSemana(s)}
                </option>
              ))}
            </select>
            <ChevronDown size={12} style={{ color: 'var(--muted)' }} />
          </div>
          {/* Refresh */}
          <button
            onClick={() => load(semana, true)}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
              color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar datos
          </button>
        </div>
      </div>

      {/* ── Row 1: 4 KPI Cards principales ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }} className="kpi-grid-4">
        <KpiCard icon={<Users size={22}/>} color="var(--gold)" label="Misiones Totales"
          value={stats.total} delta={stats.dTotal} sparkData={stats.sparklines.total} />
        <KpiCard icon={<Target size={22}/>} color="var(--green-dim)" label="Completadas"
          value={stats.completadas}
          pct={`${pct}% del total`}
          delta={stats.dCompletadas} sparkData={stats.sparklines.completadas} />
        <KpiCard icon={<Phone size={22}/>} color="var(--gold)" label="Por Contactar"
          value={stats.porContactar}
          pct={`${stats.total > 0 ? Math.round(stats.porContactar/stats.total*100) : 0}% del total`}
          delta={-stats.dPorContactar} sparkData={stats.sparklines.porContactar} />
        <KpiCard icon={<AlertTriangle size={22}/>} color="var(--gold)" label="Vencidas"
          value={stats.vencidas}
          pct={`${stats.total > 0 ? Math.round(stats.vencidas/stats.total*100) : 0}% del total`}
          delta={-stats.dVencidas} sparkData={stats.sparklines.vencidas} />
      </div>

      {/* ── Row 2: 5 KPIs secundarios ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }} className="kpi-grid-4">
        <MiniKpi icon={<Droplets size={16}/>} color="var(--gold)" label="Volumen Rescatado"
          value={`${stats.volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L`}
          sub={`${stats.dVolumen >= 0 ? '+' : ''}${stats.dVolumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L vs semana anterior`} />
        <MiniKpi icon={<DollarSign size={16}/>} color="var(--green-dim)" label="Venta Estimada"
          value={fPeso(stats.venta)}
          sub={`${stats.dVenta >= 0 ? '+' : ''}${stats.dVenta}% vs semana anterior`} />
        <MiniKpi icon={<BarChart3 size={16}/>} color="var(--gold)" label="Ticket Promedio"
          value={fPeso(stats.ticket)}
          sub={`${stats.dTicket >= 0 ? '+' : ''}${stats.dTicket}% vs semana anterior`} />
        <MiniKpi icon={<AlertTriangle size={16}/>} color="var(--red-dim)" label="Clientes en Riesgo"
          value={`${stats.clientesEnRiesgo}`}
          sub="Sin compras > 30 días"
          link="Ver lista" onLink={() => router.push('/ventas/clientes')} />
        <MiniKpi icon={<Calendar size={16}/>} color="var(--gold)" label="Agendados"
          value={`${stats.agendados}`}
          sub="Contactos esta semana"
          link="Ver calendario" onLink={() => router.push('/ventas')} />
      </div>

      {/* ── Segmentación de cartera ── */}
      {stats.segmentacion && (() => {
        const seg = stats.segmentacion
        const totalSeg = seg.activo + seg.inactivo + seg.temporal + seg.nuevo || 1
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Segmentación de cartera</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }} className="kpi-grid-4">
              {SEG_TYPES.map(s => {
                const count = seg[s.key]
                const pct = Math.round((count / totalSeg) * 100)
                return (
                  <div key={s.key} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${s.color}25`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', color: s.color }}>{s.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{count}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: s.color, borderRadius: 2 }} />
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--muted)' }}>{s.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Row 3: Tabla vendedores + Donut + Gauge ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 220px', gap: 14, marginBottom: 14 }} className="grid-stack-mobile">

        {/* Rendimiento por vendedor */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>Rendimiento por vendedor</p>
            <button onClick={() => router.push('/ventas/admin/crm-metrics')} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Ver detalle →
            </button>
          </div>

          {isDesktop ? (
            <div style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 460 }}>
            {/* Encabezado tabla */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 1fr 100px', gap: 8, padding: '0 4px 8px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
              {['VENDEDOR', 'ASIG.', 'COMPL.', '% CUMPL.', 'VOLUMEN'].map(h => (
                <span key={h} style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{h}</span>
              ))}
            </div>

            {/* Filas */}
            {stats.porVendedor.map(v => (
              <div key={v.vendedor} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 1fr 100px', gap: 8, padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${v.color}20`, border: `1.5px solid ${v.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: v.color }}>
                    {v.vendedor.charAt(0)}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{v.vendedor}</span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{v.asignadas}</span>
                <span style={{ fontSize: 13, color: 'var(--green-dim)', fontWeight: 700 }}>{v.completadas}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${v.pct}%`, height: '100%', background: v.color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: v.color, fontWeight: 700, width: 32, textAlign: 'right' }}>{v.pct}%</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{v.volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L</span>
                  {v.dVolumen !== 0 && (
                    <p style={{ fontSize: 10, color: v.dVolumen > 0 ? 'var(--green-dim)' : 'var(--red-dim)', fontWeight: 600 }}>
                      {v.dVolumen > 0 ? '+' : ''}{v.dVolumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Total */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 1fr 100px', gap: 8, padding: '10px 4px 2px', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Total</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{stats.total}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-dim)' }}>{stats.completadas}</span>
              <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700 }}>{pct}%</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', textAlign: 'right' }}>
                {stats.volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L
              </span>
            </div>
            </div>
            </div>
          ) : (
            /* ── Mobile: cards apiladas, cero scroll horizontal ── */
            <div>
              {stats.porVendedor.map(v => (
                <MobileRow
                  key={v.vendedor}
                  avatarChar={v.vendedor.charAt(0)}
                  avatarColor={v.color}
                  title={v.vendedor}
                  subtitle={`${v.asignadas} asig. · ${v.completadas} compl.`}
                  metric={`${v.volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L`}
                  metricColor="var(--cream)"
                  progress={{ pct: v.pct, label: `${v.pct}%` }}
                  progressColor={v.color}
                />
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 2px' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--cream)' }}>Total: {stats.completadas}/{stats.total} ({pct}%)</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{stats.volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L</span>
              </div>
            </div>
          )}
        </div>

        {/* Distribución donut */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Distribución</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <DonutChart completadas={stats.completadas} vencidas={stats.vencidas} total={stats.total} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { color: 'var(--gold)', label: 'Por completar', val: stats.porContactar, pct: stats.total > 0 ? Math.round(stats.porContactar/stats.total*100) : 0 },
              { color: 'var(--green-dim)', label: 'Completadas',   val: stats.completadas,  pct },
              { color: 'var(--red-dim)', label: 'Vencidas',      val: stats.vencidas,     pct: stats.total > 0 ? Math.round(stats.vencidas/stats.total*100) : 0 },
            ].map(seg => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>{seg.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)' }}>{seg.val} ({seg.pct}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Gauge progreso semanal */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 12 }}>Progreso de la semana</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <Gauge pct={pct} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Meta semanal: <strong style={{ color: 'var(--cream)' }}>{stats.total} misiones</strong></p>
            {faltan > 0
              ? <p style={{ fontSize: 11, color: 'var(--red-dim)', fontWeight: 700 }}>Faltan {faltan} misiones para completar la meta</p>
              : <p style={{ fontSize: 11, color: 'var(--green-dim)', fontWeight: 800 }}>¡Meta semanal completada!</p>
            }
          </div>
        </div>
      </div>

      {/* ── Row 4: Top riesgo + Oportunidades ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }} className="grid-stack-mobile">

        {/* Top 5 clientes en riesgo */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Top 5 clientes en riesgo</p>

          {stats.topRiesgo.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Sin clientes en riesgo en este período
            </div>
          ) : isDesktop ? (
            <div style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 520 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 110px 80px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              {['CLIENTE', 'VENDEDOR', 'DÍAS S/C', 'ÚLT. PEDIDO', 'ACCIÓN'].map(h => (
                <span key={h} style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
              ))}
            </div>
            {stats.topRiesgo.map((c, i) => (
              <div key={c.nombre} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 110px 80px', gap: 8, padding: '10px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--red-dim)', flexShrink: 0 }}>
                    {c.nombre.charAt(0)}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.vendedor}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.diasSinCompra > 60 ? 'var(--red-dim)' : 'var(--gold)' }}>{c.diasSinCompra} días</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.ultimaCompra ? formatFechaCorta(c.ultimaCompra) + ' 2026' : '—'}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {c.telefono && (
                    <button onClick={() => setWaTarget({ nombre: c.nombre, telefono: c.telefono!, contexto: 'mision' })} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <MessageCircle size={13} color="#25D166" />
                    </button>
                  )}
                  {c.telefono && (
                    <button onClick={() => window.open(`tel:${c.telefono}`)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Phone size={13} color="var(--gold)" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            </div>
            </div>
          ) : (
            /* ── Mobile: cards apiladas ── */
            <div>
              {stats.topRiesgo.map(c => (
                <MobileRow
                  key={c.nombre}
                  avatarChar={c.nombre.charAt(0)}
                  avatarColor="var(--red-dim)"
                  title={c.nombre}
                  subtitle={`${c.vendedor} · ${c.ultimaCompra ? formatFechaCorta(c.ultimaCompra) : 'sin compras'}`}
                  metric={`${c.diasSinCompra}d`}
                  metricColor={c.diasSinCompra > 60 ? 'var(--red-dim)' : 'var(--gold)'}
                  actions={c.telefono && (
                    <>
                      <ActionBtn color="#25D166" bg="rgba(37,211,102,0.08)" border="rgba(37,211,102,0.3)" onClick={() => setWaTarget({ nombre: c.nombre, telefono: c.telefono!, contexto: 'mision' })}>
                        <MessageCircle size={13} color="#25D166" />
                      </ActionBtn>
                      <ActionBtn color="var(--gold)" bg="rgba(96,165,250,0.08)" border="rgba(96,165,250,0.3)" onClick={() => window.open(`tel:${c.telefono}`)}>
                        <Phone size={13} color="var(--gold)" />
                      </ActionBtn>
                    </>
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Oportunidades de mejora */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Oportunidades de mejora</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* En riesgo */}
            <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(248,113,113,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={16} color="var(--red-dim)" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--red-dim)', marginBottom: 2 }}>{stats.clientesEnRiesgo} clientes en riesgo de fuga</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Contacta esta semana para recuperar ventas.</p>
                <button onClick={() => router.push('/ventas/clientes')} style={{ background: 'none', border: 'none', color: 'var(--red-dim)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Ver lista →</button>
              </div>
            </div>

            {/* Zonas */}
            <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={16} color="var(--gold)" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>
                  {stats.zonasRiesgo > 0 ? `${stats.zonasRiesgo} zonas con bajo volumen` : 'Zonas con bajo volumen'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Oportunidades de crecimiento detectadas en el mapa.</p>
                <button onClick={() => router.push('/ventas/mapa')} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Ver mapa →</button>
              </div>
            </div>

            {/* Mejores días */}
            <div style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(96,165,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BarChart3 size={16} color="var(--gold)" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>Mejores días para contactar</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                  {mejorDia && mejorDia.count > 0
                    ? `${mejorDia.dia} y ${stats.mejoresDias[1]?.dia ?? '—'} tienen mayor tasa de respuesta.`
                    : 'Aún sin datos suficientes de completado.'}
                </p>
                {/* Mini barchart días */}
                {stats.mejoresDias.some(d => d.count > 0) && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 22, marginBottom: 2 }}>
                    {stats.mejoresDias.slice(0, 7).map(d => (
                      <div key={d.dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ width: '100%', height: `${Math.max(2, (d.tasa / Math.max(...stats.mejoresDias.map(x => x.tasa), 1)) * 18)}px`, background: d.dia === mejorDia?.dia ? 'var(--gold)' : 'rgba(96,165,250,0.3)', borderRadius: 2, transition: 'height 0.3s' }} />
                        <span style={{ fontSize: 7, color: 'var(--muted)' }}>{d.dia}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Volumen a la baja (señal temprana de fuga) ── */}
      {stats.volumenBaja && stats.volumenBaja.length > 0 && (
        <div style={{ marginTop: 14, background: 'var(--surface)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingDown size={18} style={{ color: 'var(--red-dim)' }} />
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>Clientes con volumen a la baja</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--red-dim)', background: 'rgba(248,113,113,0.12)', padding: '3px 10px', borderRadius: 20 }}>
              {stats.volumenBajaTotal} detectados
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
            Siguen comprando pero pidieron menos en sus últimos pedidos — señal temprana de fuga. Contáctalos antes de que se venzan.
          </p>

          <div style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 540 }}>
          {/* Header tabla */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 130px 90px 80px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            {['CLIENTE', 'VENDEDOR', 'VOLUMEN/PEDIDO', 'CAÍDA', 'ACCIÓN'].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
            ))}
          </div>

          {stats.volumenBaja.map((c, i) => (
            <div key={c.nombre_fantasia} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 130px 90px 80px', gap: 8, padding: '10px 0', borderBottom: i < stats.volumenBaja.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
              {/* Nombre */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--red-dim)', flexShrink: 0 }}>
                  {c.nombre_fantasia.charAt(0)}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre_fantasia}</span>
              </div>
              {/* Vendedor */}
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.vendedor_actual ?? '—'}</span>
              {/* Volumen reciente vs baseline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <span style={{ color: 'var(--red-dim)', fontWeight: 700 }}>{c.litros_reciente}L</span>
                <span style={{ color: '#555' }}>←</span>
                <span style={{ color: 'var(--muted)' }}>{c.litros_baseline}L</span>
              </div>
              {/* Caída % */}
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--red-dim)' }}>−{c.caida_pct}%</span>
              {/* Acciones */}
              <div style={{ display: 'flex', gap: 6 }}>
                {c.telefono && (
                  <button onClick={() => setWaTarget({ nombre: c.nombre_fantasia, telefono: c.telefono!, contexto: 'mision' })}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <MessageCircle size={13} color="#25D166" />
                  </button>
                )}
                {c.telefono && (
                  <button onClick={() => window.open(`tel:${c.telefono}`)}
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Phone size={13} color="var(--gold)" />
                  </button>
                )}
              </div>
            </div>
          ))}
          </div>
          </div>
        </div>
      )}

      {/* ── Oportunidades de cross-sell ── */}
      {stats.crossSell && stats.crossSell.length > 0 && (
        <div style={{ marginTop: 14, background: 'var(--surface)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} style={{ color: 'var(--gold)' }} />
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>Oportunidades de cross-sell</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', background: 'rgba(167,139,250,0.12)', padding: '3px 10px', borderRadius: 20 }}>
              {stats.crossSellTotal} oportunidades
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
            Categorías que compran negocios similares pero este cliente aún no — venta nueva concreta.
          </p>

          {isDesktop ? (
            <div style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 520 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr 120px 80px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              {['CLIENTE', 'VENDEDOR', 'OFRECER', 'PARES QUE COMPRAN', 'ACCIÓN'].map(h => (
                <span key={h} style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
              ))}
            </div>
            {stats.crossSell.map((c, i) => (
              <div key={`${c.nombre_fantasia}-${c.categoria_sugerida}`} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr 120px 80px', gap: 8, padding: '10px 0', borderBottom: i < stats.crossSell.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>
                    {c.nombre_fantasia.charAt(0)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre_fantasia}</p>
                    <p style={{ fontSize: 10, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.categoria_negocio}</p>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.vendedor_actual ?? '—'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{c.categoria_sugerida}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${c.peers_pct}%`, height: '100%', background: 'var(--gold)', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, width: 32, textAlign: 'right' }}>{c.peers_pct}%</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {c.telefono && (
                    <button onClick={() => setWaTarget({ nombre: c.nombre_fantasia, telefono: c.telefono!, contexto: 'mision' })} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <MessageCircle size={13} color="#25D166" />
                    </button>
                  )}
                  {c.telefono && (
                    <button onClick={() => window.open(`tel:${c.telefono}`)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Phone size={13} color="var(--gold)" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            </div>
            </div>
          ) : (
            /* ── Mobile: cards apiladas, sin tabla ── */
            <div>
              {stats.crossSell.map(c => (
                <MobileRow
                  key={`${c.nombre_fantasia}-${c.categoria_sugerida}`}
                  avatarChar={c.nombre_fantasia.charAt(0)}
                  avatarColor="var(--gold)"
                  title={c.nombre_fantasia}
                  subtitle={`${c.categoria_negocio} · Ofrecer: ${c.categoria_sugerida}`}
                  progress={{ pct: c.peers_pct, label: `${c.peers_pct}% pares` }}
                  progressColor="var(--gold)"
                  actions={c.telefono && (
                    <>
                      <ActionBtn color="#25D166" bg="rgba(37,211,102,0.08)" border="rgba(37,211,102,0.3)" onClick={() => setWaTarget({ nombre: c.nombre_fantasia, telefono: c.telefono!, contexto: 'mision' })}>
                        <MessageCircle size={13} color="#25D166" />
                      </ActionBtn>
                      <ActionBtn color="var(--gold)" bg="rgba(96,165,250,0.08)" border="rgba(96,165,250,0.3)" onClick={() => window.open(`tel:${c.telefono}`)}>
                        <Phone size={13} color="var(--gold)" />
                      </ActionBtn>
                    </>
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Retención por cohorte ── */}
      {stats.cohortes && stats.cohortes.length > 0 && (
        <div style={{ marginTop: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} style={{ color: 'var(--green-dim)' }} />
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>Retención por cohorte</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--green-dim)', background: 'rgba(52,211,153,0.12)', padding: '3px 10px', borderRadius: 20 }}>
              {stats.repeatRateGlobal}% repite compra
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
            Clientes agrupados por mes de su primera compra. ¿Cuántos volvieron y siguen comprando?
          </p>

          {isDesktop ? (
            <div style={{ overflowX: 'auto', margin: '0 -20px', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 480 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 80px 1fr 1fr 90px', gap: 10, padding: '0 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              {['COHORTE', 'CLIENTES', 'REPITIERON', 'SIGUEN ACTIVOS', 'PED. PROM'].map(h => (
                <span key={h} style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
              ))}
            </div>
            {stats.cohortes.map((c, i) => (
              <div key={c.cohorte} style={{ display: 'grid', gridTemplateColumns: '90px 80px 1fr 1fr 90px', gap: 10, padding: '9px 0', borderBottom: i < stats.cohortes.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{cohorteLabel(c.cohorte)}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{c.clientes}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${c.repeat_pct}%`, height: '100%', background: 'var(--gold)', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, width: 56, textAlign: 'right' }}>{c.repitieron} · {c.repeat_pct}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${c.activos_pct}%`, height: '100%', background: 'var(--green-dim)', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--green-dim)', fontWeight: 700, width: 56, textAlign: 'right' }}>{c.activos} · {c.activos_pct}%</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{c.pedidos_prom}</span>
              </div>
            ))}
            </div>
            </div>
          ) : (
            /* ── Mobile: cards apiladas ── */
            <div>
              {stats.cohortes.map(c => (
                <MobileRow
                  key={c.cohorte}
                  avatarChar={cohorteLabel(c.cohorte).slice(0, 1)}
                  avatarColor="var(--gold)"
                  title={cohorteLabel(c.cohorte)}
                  subtitle={`${c.clientes} clientes · ${c.pedidos_prom} ped. prom`}
                  progress={{ pct: c.repeat_pct, label: `${c.repitieron} repiten` }}
                  progressColor="var(--gold)"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
