'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Menu, Bell, ChevronDown, ChevronRight, Droplet, Users, ShoppingBag,
  DollarSign, AlertTriangle, TrendingUp, TrendingDown, Calendar,
} from 'lucide-react'
import SettingsPanel from '@/components/ui/SettingsPanel'
import { RANGOS, type RangoKey, type HoyData, type PuntoSerie, type VendedorRango, type DatosRango } from './hoyTypes'

/**
 * Vista principal de Ventas — tema CLARO, propio de esta pantalla.
 *
 * El resto de la app es oscura (variables --bg/--cream de globals.css). Acá los
 * colores van hardcodeados a propósito y NO se usan esas variables: si se
 * usaran, al cambiar el tema global esta pantalla quedaría con texto claro
 * sobre fondo claro. El contenedor pinta su propio fondo para cubrir el <main>.
 */

const C = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  hero: '#0F172A',
  heroSoft: '#1E293B',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  green: '#059669',
  greenSoft: '#ECFDF5',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
}

// ── Formato ──────────────────────────────────────────────────────────────────
const fL = (n: number) => `${n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
const fNum = (n: number) => n.toLocaleString('es-CL')
function fPeso(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n).toLocaleString('es-CL')}`
}
function fFechaCorta(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d} ${meses[m - 1]} ${y}`
}
/** % de variación; null cuando no hay base con que comparar (evita "+∞%"). */
function variacion(actual: number, previo: number): number | null {
  if (previo <= 0) return null
  return ((actual - previo) / previo) * 100
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ puntos, color }: { puntos: number[]; color: string }) {
  const w = 120, h = 34
  if (puntos.length < 2) return <div style={{ height: h }} />
  const max = Math.max(...puntos), min = Math.min(...puntos)
  const span = max - min || 1
  const paso = w / (puntos.length - 1)
  const pts = puntos.map((v, i) => [i * paso, h - ((v - min) / span) * (h - 6) - 3] as const)
  const linea = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${linea} L${w},${h} L0,${h} Z`
  const gid = `sp-${color.replace('#', '')}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={linea} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Delta({ pct, size = 12 }: { pct: number | null; size?: number }) {
  if (pct === null) return <span style={{ fontSize: size, color: C.faint }}>—</span>
  const pos = pct >= 0
  const Icon = pos ? TrendingUp : TrendingDown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: size, fontWeight: 600, color: pos ? C.green : C.red }}>
      <Icon size={size + 1} /> {pos ? '+' : ''}{Math.round(pct)}%
    </span>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, tint, tintSoft, label, valor, pct, serie }: {
  icon: typeof Droplet; tint: string; tintSoft: string
  label: string; valor: string; pct: number | null; serie: number[]
}) {
  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 14, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: tintSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Icon size={17} color={tint} />
      </div>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {valor}
      </p>
      <div style={{ marginTop: 4, marginBottom: 6 }}><Delta pct={pct} /></div>
      <Sparkline puntos={serie} color={tint} />
    </div>
  )
}

// ── Barra de mix ─────────────────────────────────────────────────────────────
function FilaMix({ nombre, litros, total, pct, color, colorSoft, emoji }: {
  nombre: string; litros: number; total: number; pct: number | null
  color: string; colorSoft: string; emoji: string
}) {
  const share = total > 0 ? (litros / total) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: colorSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 5 }}>{nombre}</p>
        <div style={{ height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
          <div style={{ width: `${share}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 92 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fL(litros)}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, background: C.bg, borderRadius: 6, padding: '1px 5px' }}>
            {Math.round(share)}%
          </span>
          <Delta pct={pct} size={11} />
        </div>
      </div>
    </div>
  )
}

// ── Ranking ──────────────────────────────────────────────────────────────────
const COLOR_VEND = ['#0F172A', C.green, C.purple, '#EA580C', C.blue, '#0891B2']
function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function FilaVendedor({ v, pos, total, onClick }: { v: VendedorRango; pos: number; total: number; onClick: () => void }) {
  const share = total > 0 ? (v.litros / total) * 100 : 0
  const color = COLOR_VEND[pos % COLOR_VEND.length]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', borderTop: pos === 0 ? 'none' : `1px solid ${C.line}`,
        padding: '11px 0', cursor: 'pointer',
      }}
    >
      <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: pos === 0 ? C.text : C.faint, flexShrink: 0 }}>
        {pos + 1}
      </span>
      <span style={{
        width: 32, height: 32, borderRadius: '50%', background: color, color: '#fff', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
      }}>
        {iniciales(v.vendedor)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.vendedor}
        </p>
        <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: 'hidden', marginTop: 5 }}>
          <div style={{ width: `${share}%`, height: '100%', background: color, borderRadius: 3 }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 76 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fL(v.litros)}</p>
        <p style={{ fontSize: 11, color: C.faint }}>{share.toFixed(1)}% del total</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 52 }}>
        <Delta pct={variacion(v.litros, v.litrosPrev)} size={11} />
        <p style={{ fontSize: 10, color: C.faint }}>vs ant.</p>
      </div>
      <ChevronRight size={15} color={C.faint} style={{ flexShrink: 0 }} />
    </button>
  )
}

// ── Vista ────────────────────────────────────────────────────────────────────
export default function VentasHoyClient({ data }: { data: HoyData }) {
  const router = useRouter()
  const [rango, setRango] = useState<RangoKey>('periodo')
  const [periodoIdx, setPeriodoIdx] = useState(0)   // 0 = período activo
  const [showSettings, setShowSettings] = useState(false)
  const [showPeriodos, setShowPeriodos] = useState(false)

  const periodoSel = data.periodos[periodoIdx] ?? null

  // La pestaña "Período" muestra el período 24→23 elegido en el selector; el
  // resto son rangos relativos a hoy.
  const d: DatosRango | null = rango === 'periodo'
    ? (periodoSel?.datos ?? null)
    : data.rangos[rango as Exclude<RangoKey, 'periodo'>]

  if (!d) {
    return (
      <div style={{ background: C.bg, minHeight: '100%', padding: 24 }}>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>
          No hay períodos de venta configurados.
        </p>
      </div>
    )
  }

  const { actual, previo, serie } = d
  const metaLitros = rango === 'periodo' ? (periodoSel?.metaLitros ?? 0) : 0

  const serieDe = (campo: keyof PuntoSerie) =>
    serie.map(p => Number(p[campo] ?? 0))

  const ticket = actual.pedidos > 0 ? actual.revenue / actual.pedidos : 0
  const ticketPrev = previo.pedidos > 0 ? previo.revenue / previo.pedidos : 0
  const totalMix = actual.litrosCerveza + actual.litrosKombucha + actual.litrosOtros
  const clientesNuevos = actual.clientes - previo.clientes

  const serieTicket = useMemo(
    () => serie.map(p => (p.pedidos > 0 ? p.revenue / p.pedidos : 0)),
    [serie],
  )

  const hoyTxt = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  // La meta se define por período de venta (24→23), así que sólo aplica ahí
  const avanceMeta = metaLitros > 0 ? Math.min(100, (actual.litros / metaLitros) * 100) : null

  return (
    <div style={{ background: C.bg, minHeight: '100%', margin: -1, padding: '1px 0 0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/')}
            aria-label="Menú"
            style={{ width: 40, height: 40, borderRadius: 12, background: C.card, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <Menu size={19} color={C.text} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Ventas</h1>
            <p style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hoyTxt}
            </p>
          </div>
          <button
            onClick={() => router.push('/ventas/misiones')}
            aria-label="Alertas"
            style={{ position: 'relative', width: 40, height: 40, borderRadius: 12, background: C.card, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <Bell size={18} color={C.text} />
            {data.alertas.some(a => a.tipo === 'alerta') && (
              <span style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: '50%', background: C.blue, border: `2px solid ${C.card}` }} />
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Cuenta"
            style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${C.line}`, background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}
          >
            {data.usuario?.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={data.usuario.avatarUrl} alt={data.usuario.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (data.usuario?.iniciales || '··')}
          </button>
        </div>

        {/* Rango + pestañas */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* Selector de período de venta (24→23). Sólo tiene sentido en la
              pestaña "Período"; en las demás muestra el rango, sin desplegable. */}
          <div style={{ position: 'relative', flex: '1 1 230px', minWidth: 0 }}>
            <button
              onClick={() => rango === 'periodo' && setShowPeriodos(v => !v)}
              disabled={rango !== 'periodo'}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: C.card, border: `1px solid ${showPeriodos ? C.blue : C.line}`,
                borderRadius: 12, padding: '9px 12px',
                cursor: rango === 'periodo' ? 'pointer' : 'default', textAlign: 'left',
              }}
            >
              <Calendar size={15} color={C.faint} style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0, overflow: 'hidden' }}>
                <span style={{ display: 'block', fontSize: 13, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rango === 'periodo' && periodoSel ? periodoSel.nombre : `${fFechaCorta(d.desde)} – ${fFechaCorta(d.hasta)}`}
                </span>
                {rango === 'periodo' && (
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fFechaCorta(d.desde)} – {fFechaCorta(d.hasta)}
                  </span>
                )}
              </span>
              {rango === 'periodo' && (
                <ChevronDown size={15} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0, transform: showPeriodos ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
              )}
            </button>

            {showPeriodos && (
              <>
                <div onClick={() => setShowPeriodos(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 41,
                  background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
                  boxShadow: '0 8px 28px rgba(15,23,42,.14)', overflow: 'hidden',
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em', padding: '9px 12px 5px' }}>
                    PERÍODO DE VENTA (24 → 23)
                  </p>
                  {data.periodos.map((p, i) => {
                    const on = i === periodoIdx
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setPeriodoIdx(i); setShowPeriodos(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                          background: on ? C.blueSoft : 'transparent', border: 'none',
                          borderTop: `1px solid ${C.line}`, padding: '10px 12px', cursor: 'pointer',
                        }}
                      >
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.blue : C.text }}>
                            {p.nombre}{p.activo ? ' · en curso' : ''}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: C.muted }}>
                            {fFechaCorta(p.inicio)} – {fFechaCorta(p.fin)}
                          </span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: on ? C.blue : C.muted, flexShrink: 0 }}>
                          {fL(p.datos.actual.litros)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 2, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 3, flexWrap: 'wrap' }}>
            {RANGOS.map(r => {
              const on = r.key === rango
              return (
                <button
                  key={r.key}
                  onClick={() => { setRango(r.key); setShowPeriodos(false) }}
                  style={{
                    padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: on ? C.hero : 'transparent', color: on ? '#fff' : C.muted,
                    fontSize: 13, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
                  }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Hero */}
        <div style={{ background: C.hero, borderRadius: 20, padding: 20, color: '#fff' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 190px', minWidth: 0 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94A3B8', fontWeight: 600, marginBottom: 8 }}>
                {rango === 'periodo' && periodoSel ? `VENTAS · ${periodoSel.nombre.toUpperCase()}` : 'VENTAS DEL RANGO'}
              </p>
              <p style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1 }}>
                {actual.litros.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span style={{ fontSize: 20, marginLeft: 4, color: '#CBD5E1' }}>L</span>
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(() => {
                  const p = variacion(actual.litros, previo.litros)
                  if (p === null) return <span style={{ fontSize: 12, color: '#94A3B8' }}>Sin período anterior</span>
                  const pos = p >= 0
                  return (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: pos ? 'rgba(16,185,129,.16)' : 'rgba(239,68,68,.16)', color: pos ? '#34D399' : '#F87171', borderRadius: 8, padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>
                        {pos ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {pos ? '+' : ''}{Math.round(p)}%
                      </span>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>{d.etiquetaComparacion}</span>
                    </>
                  )
                })()}
              </div>
              {avanceMeta !== null && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: '#94A3B8' }}>Meta: {fNum(Math.round(metaLitros))} L</span>
                    <span style={{ fontWeight: 700 }}>{Math.round(avanceMeta)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
                    <div style={{ width: `${avanceMeta}%`, height: '100%', background: C.blue, borderRadius: 3, transition: 'width .4s' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: '1 1 190px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(37,99,235,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={20} color="#60A5FA" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
                    {fNum(actual.clientes)} <span style={{ fontSize: 13, fontWeight: 500, color: '#94A3B8' }}>Clientes</span>
                  </p>
                  {clientesNuevos !== 0 && (
                    <p style={{ fontSize: 12, color: clientesNuevos > 0 ? '#34D399' : '#F87171' }}>
                      {clientesNuevos > 0 ? '+' : ''}{clientesNuevos} vs anterior
                    </p>
                  )}
                </div>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,.08)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(16,185,129,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <DollarSign size={20} color="#34D399" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{fPeso(actual.revenue)}</p>
                  <div style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 5, alignItems: 'center' }}>
                    {(() => {
                      const p = variacion(actual.revenue, previo.revenue)
                      if (p === null) return <span>Sin comparación</span>
                      const pos = p >= 0
                      return <><span style={{ color: pos ? '#34D399' : '#F87171', fontWeight: 600 }}>{pos ? '↑' : '↓'} {Math.abs(Math.round(p))}%</span> vs anterior</>
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <KpiCard icon={Droplet} tint={C.blue} tintSoft={C.blueSoft} label="Litros vendidos"
            valor={fL(actual.litros)} pct={variacion(actual.litros, previo.litros)} serie={serieDe('litros')} />
          <KpiCard icon={Users} tint={C.green} tintSoft={C.greenSoft} label="Clientes"
            valor={fNum(actual.clientes)} pct={variacion(actual.clientes, previo.clientes)} serie={serieDe('clientes')} />
          <KpiCard icon={ShoppingBag} tint={C.purple} tintSoft={C.purpleSoft} label="Pedidos"
            valor={fNum(actual.pedidos)} pct={variacion(actual.pedidos, previo.pedidos)} serie={serieDe('pedidos')} />
          <KpiCard icon={DollarSign} tint={C.amber} tintSoft={C.amberSoft} label="Ticket promedio"
            valor={fPeso(ticket)} pct={variacion(ticket, ticketPrev)} serie={serieTicket} />
        </div>

        {/* Product mix */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>PRODUCT MIX</p>
            <span style={{ fontSize: 12, color: C.muted }}>{fNum(actual.clientes)} clientes</span>
          </div>
          {totalMix === 0 ? (
            <p style={{ fontSize: 13, color: C.faint, textAlign: 'center', padding: '14px 0' }}>Sin ventas en este período</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FilaMix nombre="Cerveza" emoji="🍺" litros={actual.litrosCerveza} total={totalMix}
                pct={variacion(actual.litrosCerveza, previo.litrosCerveza)} color={C.hero} colorSoft="#E2E8F0" />
              <FilaMix nombre="Kombucha" emoji="🧃" litros={actual.litrosKombucha} total={totalMix}
                pct={variacion(actual.litrosKombucha, previo.litrosKombucha)} color={C.green} colorSoft={C.greenSoft} />
              {actual.litrosOtros > 0 && (
                <FilaMix nombre="Otros" emoji="📦" litros={actual.litrosOtros} total={totalMix}
                  pct={variacion(actual.litrosOtros, previo.litrosOtros)} color={C.purple} colorSoft={C.purpleSoft} />
              )}
            </div>
          )}
        </div>

        {/* Ranking */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: '16px 16px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>RANKING DE VENDEDORES</p>
            <span style={{ fontSize: 12, color: C.muted }}>por litros vendidos</span>
          </div>
          {d.vendedores.map((v, i) => (
            <FilaVendedor key={v.vendedor} v={v} pos={i} total={actual.litros}
              onClick={() => router.push('/ventas/ranking')} />
          ))}
        </div>

        {/* Alertas e insights */}
        {data.alertas.length > 0 && (
          <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>ALERTAS E INSIGHTS</p>
              <button onClick={() => router.push('/ventas/misiones')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.blue, fontWeight: 600, padding: 0 }}>
                Ver todas
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
              {data.alertas.slice(0, 4).map((a, i) => {
                const esAlerta = a.tipo === 'alerta'
                return (
                  <button
                    key={i}
                    onClick={() => a.href && router.push(a.href)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left', width: '100%',
                      background: esAlerta ? C.amberSoft : C.greenSoft,
                      border: `1px solid ${esAlerta ? '#FDE68A' : '#A7F3D0'}`,
                      borderRadius: 12, padding: '11px 12px', cursor: a.href ? 'pointer' : 'default',
                    }}
                  >
                    {esAlerta
                      ? <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                      : <TrendingUp size={16} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{a.titulo}</span>
                      <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 2 }}>{a.detalle}</span>
                    </span>
                    {a.href && <ChevronRight size={15} color={C.faint} style={{ flexShrink: 0, marginLeft: 'auto', alignSelf: 'center' }} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {data.ultimaSync && (
          <p style={{ fontSize: 11, color: C.faint, textAlign: 'center' }}>
            Datos actualizados: {new Date(data.ultimaSync).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          userName={data.usuario?.nombre ?? ''}
          userEmail=""
          avatarUrl={data.usuario?.avatarUrl ?? undefined}
        />
      )}
    </div>
  )
}
