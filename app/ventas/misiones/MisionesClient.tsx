'use client'

import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react'
const MisionesAdminDashboard = lazy(() => import('./MisionesAdminDashboard'))
const CalendarioMensual = lazy(() => import('./CalendarioMensual'))
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import {
  CheckCircle2, Phone, PhoneOff, MessageCircle, RefreshCw, Calendar, Navigation,
  ChevronDown, ChevronRight, Target, Minus, Plus, ArrowLeft, Sparkles, UserX,
  AlertTriangle, CalendarCheck, CalendarDays, Circle, Clock, Zap,
  TrendingDown, MapPin, ShoppingCart, XCircle, Star, Flame, Shield,
  AlertOctagon, Timer, Beer, Leaf, Info,
} from 'lucide-react'
import type { MisionEnriquecida, ProximaPreview, HistorialSemana, EstadoMision, TipoMision } from './page'
import { buscarTorpedo } from '@/lib/catalogo-torpedo'
import type { AlertTipo } from '@/components/ui/WAModal'
import { VENDEDOR_DISPLAY } from '@/lib/types'
const dspV = (v: string) => VENDEDOR_DISPLAY[v] ?? v
import AppHeader from '@/components/ui/AppHeader'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import { SEG_COLOR } from '@/lib/theme'

// ── Paleta — SEG_COLOR importado de lib/theme (fuente única) ─────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const TIPO_CFG: Record<TipoMision, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; desc: string }> = {
  esta_semana:    { label: 'Esta semana',    color: 'var(--gold)',  bg: 'rgba(212,175,55,0.08)',  border: 'rgba(212,175,55,0.3)',   icon: <CalendarCheck size={13} />, desc: 'Compra estimada esta semana' },
  proxima_semana: { label: 'Próxima semana', color: 'var(--blue)',  bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.3)',   icon: <CalendarDays size={13} />,  desc: 'Compra estimada próxima semana' },
  vencido:        { label: 'Llama ahora',    color: 'var(--red)',   bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)',  icon: <AlertTriangle size={13} />, desc: 'Ya se pasó su ciclo de compra' },
}

const ESTADO_CFG: Record<EstadoMision, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente:              { label: 'Sin contactar',  color: 'var(--muted)',     icon: <Circle size={9} /> },
  contactado_pedido:      { label: 'Hizo pedido',    color: 'var(--green-dim)', icon: <CheckCircle2 size={9} /> },
  contactado_sin_pedido:  { label: 'Contactado',     color: 'var(--gold)',      icon: <Phone size={9} /> },
  sin_respuesta:          { label: 'Sin respuesta',  color: 'var(--muted)',     icon: <PhoneOff size={9} /> },
  pospuesto:              { label: 'Pospuesto',       color: 'var(--gold)',      icon: <Clock size={9} /> },
  auto_completado:        { label: 'Compró (auto)',   color: 'var(--green-dim)', icon: <Zap size={9} /> },
}

const DIAS_POSPONER = [1, 3, 5, 7, 10, 15, 20, 30]

// ── Sistema de alertas de 5 niveles ──────────────────────────────────────────
interface AlertaCfg {
  emoji: string; label: string; labelCorto: string
  color: string; bg: string; border: string
  puntos: number
  icon: React.ReactNode
}

const ALERTA_CFG: Record<AlertTipo, AlertaCfg> = {
  rojo:       { emoji: '🔴', label: 'Quiebre inminente',     labelCorto: 'Urgente',    color: '#F87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.35)', puntos: 50,  icon: <Flame size={10} /> },
  amarillo:   { emoji: '🟡', label: 'Ventana óptima',         labelCorto: 'Esta sem.',  color: '#FBBF24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.35)',  puntos: 25,  icon: <Clock size={10} /> },
  verde:      { emoji: '🟢', label: 'Oportunidad cross-sell', labelCorto: 'Cross-sell', color: '#4ADE80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.35)',  puntos: 100, icon: <Star size={10} /> },
  morado:     { emoji: '🟣', label: 'Cliente en fuga',        labelCorto: 'En fuga',    color: '#C084FC', bg: 'rgba(192,132,252,0.1)',  border: 'rgba(192,132,252,0.35)', puntos: 75,  icon: <AlertOctagon size={10} /> },
  gris:       { emoji: '⚪', label: 'Cobranza pendiente',     labelCorto: 'Cobranza',   color: '#94A3B8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.35)', puntos: 0,   icon: <Shield size={10} /> },
  rm_urgente: { emoji: '⏰', label: 'Corte RM — ¡hoy 4PM!',  labelCorto: 'Corte 4PM',  color: '#FB923C', bg: 'rgba(251,146,60,0.1)',   border: 'rgba(251,146,60,0.35)',  puntos: 60,  icon: <Timer size={10} /> },
}

function computeAlertTipo(m: MisionEnriquecida): AlertTipo {
  if (m.tiene_deuda) return 'gris'
  const esRM = !!(m.localidad?.toLowerCase().includes('metropolitana') || m.localidad?.toLowerCase().includes('santiago'))
  // RM client in urgent window (before 4PM): flag as rm_urgente
  if (esRM && m.tipo === 'vencido') {
    const now = new Date()
    const cutoff = new Date(); cutoff.setHours(16, 0, 0, 0)
    if (now < cutoff) return 'rm_urgente'
  }
  if (m.dias_sin_compra > 40 && m.tipo_cliente !== 'nuevo' && m.tipo_cliente !== 'activo') return 'morado'
  if (m.tipo === 'vencido') return 'rojo'
  if (m.cross_sell && m.tipo === 'proxima_semana') return 'verde'
  return 'amarillo'
}

// ── Segmentación de clientes ─────────────────────────────────────────────────
type TipoCliente = 'activo' | 'inactivo' | 'temporal' | 'nuevo'

const TIPO_CLIENTE_CFG: Record<TipoCliente, {
  label: string; color: string; bg: string; border: string
  icon: React.ReactNode; estrategia: string
}> = {
  activo:   { label: 'Activo',   color: 'var(--green-dim)', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.2)',  icon: <CheckCircle2 size={13} />, estrategia: 'Recompra habitual — contactar para siguiente pedido.' },
  inactivo: { label: 'Inactivo', color: 'var(--red)',       bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', icon: <XCircle size={13} />,      estrategia: 'Cliente en riesgo de abandono — ofrecer propuesta de recuperación.' },
  temporal: { label: 'Temporal', color: 'var(--gold)',      bg: 'rgba(212,175,55,0.08)',  border: 'rgba(212,175,55,0.2)',  icon: <Clock size={13} />,        estrategia: 'Comprador esporádico — evaluar necesidad y construir relación.' },
  nuevo:    { label: 'Nuevo',    color: 'var(--blue)',      bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)',  icon: <Sparkles size={13} />,     estrategia: 'Primer seguimiento — entender preferencias y fidelizar.' },
}

function TipoClienteBadge({ tipo, size = 'sm' }: { tipo: TipoCliente | null | undefined; size?: 'sm' | 'xs' }) {
  if (!tipo) return null
  const cfg = TIPO_CLIENTE_CFG[tipo]
  const pad = size === 'xs' ? '1px 5px' : '2px 8px'
  const fs  = size === 'xs' ? 9 : 10
  return (
    <span style={{
      padding: pad, borderRadius: 20, fontSize: fs, fontWeight: 800,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// Una misión cuenta como completada si el vendedor cerró pedido o el cliente compró solo
const esCompletada = (e: EstadoMision) => e === 'contactado_pedido' || e === 'auto_completado'

type ActualizarOpts = { dias?: number; litros?: number }
type OnActualizar = (id: string, estado: EstadoMision, opts?: ActualizarOpts) => Promise<void>

// ── Helpers ───────────────────────────────────────────────────────────────────
function diasDesde(f: string | null | undefined): number | null {
  if (!f) return null
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000)
}
function fDias(d: number | null): string {
  if (d === null) return '—'
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  return `hace ${d}d`
}
function fFecha(s: string | null): string {
  if (!s) return '—'
  const [y, m, d] = s.split('T')[0].split('-')
  return `${parseInt(d)} ${MESES[parseInt(m)-1]} ${y}`
}
function fPeso(n: number): string {
  if (!n) return '$0'
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  return `$${Math.round(n).toLocaleString('es-CL')}`
}
function rangoSemana(lunes: string) {
  const d = new Date(lunes + 'T12:00:00')
  const fin = new Date(d); fin.setDate(fin.getDate() + 6)
  return `${d.getDate()} ${MESES[d.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`
}
function diasLabel(m: MisionEnriquecida): string | null {
  if (m.dias_para_compra === null) return null
  if (m.dias_para_compra < 0)  return `Venció hace ${Math.abs(m.dias_para_compra)}d`
  if (m.dias_para_compra === 0) return 'Compra hoy'
  return `Llamar en ${m.dias_para_compra}d`
}

// ── Donut progreso ────────────────────────────────────────────────────────────
function ProgressDonut({ done, total, size = 90 }: { done: number; total: number; size?: number }) {
  const pct   = total > 0 ? done / total : 0
  const r     = (size - 14) / 2; const cx = size / 2
  const circ  = 2 * Math.PI * r
  const dash  = circ * pct
  const color = pct >= 0.8 ? 'var(--green-dim)' : 'var(--gold)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}/>
      <text x={cx} y={cx - 3} textAnchor="middle" fontSize={size * 0.22} fontWeight="900" fill="var(--cream)">{done}</text>
      <text x={cx} y={cx + size * 0.17} textAnchor="middle" fontSize={size * 0.12} fill="var(--muted)">/ {total}</text>
    </svg>
  )
}

// ── Countdown RM (Región Metropolitana) ──────────────────────────────────────
function CountdownRM({ localidad }: { localidad: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null)

  const isRM = !!(localidad?.toLowerCase().includes('metropolitana') || localidad?.toLowerCase().includes('santiago'))

  useEffect(() => {
    if (!isRM) return
    const tick = () => {
      const now = new Date()
      const cutoff = new Date(); cutoff.setHours(16, 0, 0, 0)
      if (now >= cutoff) { setTimeLeft(null); return }
      const diff = cutoff.getTime() - now.getTime()
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setTimeLeft(`${h}h ${m}m`)
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [isRM])

  if (!isRM || !timeLeft) return null
  const isUrgent = parseInt(timeLeft) < 3

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 7px', borderRadius: 20, fontSize: 9, fontWeight: 800,
      background: isUrgent ? 'rgba(251,146,60,0.18)' : 'rgba(251,146,60,0.08)',
      color: '#FB923C', border: '1px solid rgba(251,146,60,0.35)',
      animation: isUrgent ? 'pulse 1.5s ease-in-out infinite' : 'none',
    }}>
      <Timer size={8} /> RM {timeLeft}
    </span>
  )
}

// ── Torpedo de producto (ficha sensorial) ─────────────────────────────────────
function TorpedoPanel({ nombreProducto, compact = false }: { nombreProducto: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const prod = buscarTorpedo(nombreProducto)
  if (!prod) return null

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {prod.notas.slice(0, 3).map(n => (
          <span key={n} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 20, background: `${prod.acento}18`, color: prod.acento, border: `1px solid ${prod.acento}30`, fontWeight: 700 }}>{n}</span>
        ))}
        {prod.abv && <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{prod.abv}% ABV</span>}
        {prod.ibu && <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{prod.ibu} IBU</span>}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: `1px solid ${prod.acento}25` }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '8px 12px', background: `${prod.acento}10`,
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
        }}
      >
        {prod.marca === 'cerveza' ? <Beer size={13} color={prod.acento} /> : <Leaf size={13} color={prod.acento} />}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: prod.acento }}>{prod.nombre}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>{prod.estilo}</span>
        </div>
        {prod.premiado && <span style={{ fontSize: 9, color: '#FBBF24' }}>★ Premiado</span>}
        <Info size={11} color="var(--muted)" />
        {open ? <ChevronDown size={11} color="var(--muted)" /> : <ChevronRight size={11} color="var(--muted)" />}
      </button>
      {open && (
        <div style={{ padding: '10px 12px', background: `${prod.acento}06` }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>{prod.descripcion}</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {prod.notas.map(n => (
              <span key={n} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: `${prod.acento}18`, color: prod.acento, border: `1px solid ${prod.acento}30`, fontWeight: 700 }}>{n}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: prod.maridaje ? 8 : 0 }}>
            {prod.abv && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>ABV</p>
                <p style={{ fontSize: 14, fontWeight: 900, color: prod.acento }}>{prod.abv}%</p>
              </div>
            )}
            {prod.ibu && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>IBU</p>
                <p style={{ fontSize: 14, fontWeight: 900, color: prod.acento }}>{prod.ibu}</p>
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {prod.marca === 'cerveza' ? <Beer size={12} color="var(--muted)" /> : <Leaf size={12} color="var(--muted)" />}
              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{prod.marca === 'cerveza' ? 'El Regreso' : 'La Ida'}</span>
            </div>
          </div>
          {prod.maridaje && (
            <p style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: prod.acento, fontWeight: 700 }}>Maridaje:</span> {prod.maridaje}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Barra de gamificación semanal ─────────────────────────────────────────────
function GamificacionBar({ misiones }: { misiones: MisionEnriquecida[] }) {
  const pts = misiones.reduce((sum, m) => {
    if (!esCompletada(m.estado)) return sum
    const tipo = computeAlertTipo(m)
    return sum + (ALERTA_CFG[tipo]?.puntos ?? 0)
  }, 0)

  const completadas = misiones.filter(m => esCompletada(m.estado)).length
  if (completadas === 0) return null

  const level = pts >= 500 ? '🏆 Élite' : pts >= 250 ? '🥇 Pro' : pts >= 100 ? '🥈 En racha' : '🌱 Arrancando'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
      background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
      marginBottom: 10,
    }}>
      <Star size={13} color="#FBBF24" fill="#FBBF24" />
      <span style={{ fontSize: 11, fontWeight: 800, color: '#FBBF24' }}>{pts} pts</span>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>esta semana</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#FBBF24', marginLeft: 4 }}>{level}</span>
    </div>
  )
}

// ── Sección "Con Stock — Pendientes de llamar" ────────────────────────────────
function ConStockSection({ misiones, onActualizar, onWA, loadingId }: {
  misiones: MisionEnriquecida[]
  onActualizar: OnActualizar
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
}) {
  const [open, setOpen] = useState(false)
  if (!misiones.length) return null

  // Ordenar por snooze_until ASC (el que vence antes, primero)
  const sorted = [...misiones].sort((a, b) =>
    (a.snooze_until ?? '').localeCompare(b.snooze_until ?? '')
  )

  function diasRestantes(snooze: string | null): number {
    if (!snooze) return 0
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const d   = new Date(snooze + 'T12:00:00')
    return Math.round((d.getTime() - hoy.getTime()) / 86400000)
  }

  function badgeDias(snooze: string | null) {
    const d = diasRestantes(snooze)
    if (d <= 0) return { label: 'Llamar hoy',  color: '#F87171', bg: 'rgba(248,113,113,0.12)' }
    if (d === 1) return { label: 'Mañana',      color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' }
    return              { label: `En ${d}d`,    color: '#94A3B8', bg: 'rgba(148,163,184,0.1)'  }
  }

  const vencenHoy     = sorted.filter(m => diasRestantes(m.snooze_until) <= 0).length
  const vencenMañana  = sorted.filter(m => diasRestantes(m.snooze_until) === 1).length

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Header colapsable */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: open ? 8 : 0, padding: '9px 12px', borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(148,163,184,0.05)', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Clock size={13} style={{ color: '#94A3B8', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#94A3B8' }}>Con Stock — Vuelven a llamar</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
            {misiones.length} cliente{misiones.length > 1 ? 's' : ''} pospuesto{misiones.length > 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {vencenHoy > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>
              {vencenHoy} hoy
            </span>
          )}
          {vencenMañana > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>
              {vencenMañana} mañana
            </span>
          )}
        </div>
        {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(m => {
            const badge   = badgeDias(m.snooze_until)
            const loading = loadingId === m.id
            return (
              <div key={m.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${badge.color}`, borderRadius: 12,
                padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#94A3B8',
                  }}>
                    {m.nombre_fantasia.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {m.nombre_fantasia}
                    </p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 20, background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                      {m.nota && (
                        <span style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.nota}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    {m.telefono && (
                      <button
                        onClick={() => window.open(`tel:${m.telefono}`)}
                        style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(212,175,55,0.3)', background: 'rgba(212,175,55,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <Phone size={12} color="#D4AF37" />
                      </button>
                    )}
                    {m.telefono && (
                      <button
                        onClick={() => onWA(m)}
                        style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <MessageCircle size={12} color="#25D166" />
                      </button>
                    )}
                    <button
                      onClick={() => onActualizar(m.id, 'pendiente')}
                      disabled={loading}
                      style={{
                        padding: '0 10px', height: 30, borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                        color: '#F87171', cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {loading ? '…' : 'Llamar ya'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Ícono WhatsApp (SVG oficial) ──────────────────────────────────────────────
function WAIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

// ── Torpedo V2 — versión premium para panel detalle ──────────────────────────
function TorpedoPanelV2({ nombreProducto }: { nombreProducto: string }) {
  const [open, setOpen] = useState(true)
  const prod = buscarTorpedo(nombreProducto)
  if (!prod) return null

  return (
    <div style={{ border: `1px solid ${prod.acento}25`, borderRadius: 12, overflow: 'hidden', background: '#1A1A1D' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '10px 14px', background: `${prod.acento}10`, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: prod.acento }}>{prod.nombre}</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{prod.estilo}</span>
          </div>
        </div>
        {prod.premiado && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#FBBF24', fontWeight: 700 }}>
            <Star size={10} fill="#FBBF24" color="#FBBF24" /> Premiado
          </span>
        )}
        <Info size={13} color="#9CA3AF" />
        {open ? <ChevronDown size={14} color="#9CA3AF" /> : <ChevronRight size={14} color="#9CA3AF" />}
      </button>

      {open && (
        <div style={{ padding: '12px 14px 14px' }}>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10, lineHeight: 1.55 }}>{prod.descripcion}</p>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {prod.notas.map(n => (
              <span key={n} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: 'transparent', color: prod.acento,
                border: `1px solid ${prod.acento}55`, fontWeight: 600,
              }}>{n}</span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            {prod.abv && (
              <div>
                <p style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, marginBottom: 1, textTransform: 'uppercase' as const }}>ABV</p>
                <p style={{ fontSize: 17, fontWeight: 900, color: prod.acento, lineHeight: 1 }}>{prod.abv}%</p>
              </div>
            )}
            {prod.ibu && (
              <div>
                <p style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, marginBottom: 1, textTransform: 'uppercase' as const }}>IBU</p>
                <p style={{ fontSize: 17, fontWeight: 900, color: prod.acento, lineHeight: 1 }}>{prod.ibu}</p>
              </div>
            )}
            {prod.maridaje && (
              <div style={{ flex: 1, minWidth: 120 }}>
                <p style={{ fontSize: 9, marginBottom: 1 }}>
                  <span style={{ color: prod.acento, fontWeight: 700, textTransform: 'uppercase' as const }}>Maridaje: </span>
                </p>
                <p style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>{prod.maridaje}</p>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', alignSelf: 'flex-end' as const }}>
              <Clock size={10} color="#9CA3AF" />
              <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                {prod.marca === 'cerveza' ? 'El Regreso' : 'La Ida'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Botones de acción (3 estados + posponer) ──────────────────────────────────
function BotonesAccion({ mision, onActualizar, loading }: {
  mision: MisionEnriquecida
  onActualizar: OnActualizar
  loading: boolean
}) {
  const [diasPosp, setDiasPosp] = useState(5)
  const isPedido = mision.estado === 'contactado_pedido'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 3 botones de estado — paleta neutra, color solo en activo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[
          {
            key: 'contactado_pedido' as EstadoMision,
            active: isPedido,
            label: 'Hizo pedido',
            sub: isPedido ? 'Confirmado' : 'Registrar',
            icon: <CheckCircle2 size={16} color={isPedido ? '#4ADE80' : 'rgba(255,255,255,0.3)'} />,
            onClick: () => onActualizar(mision.id, isPedido ? 'pendiente' : 'contactado_pedido'),
          },
          {
            key: 'contactado_sin_pedido' as EstadoMision,
            active: mision.estado === 'contactado_sin_pedido',
            label: 'Contactado',
            sub: mision.estado === 'contactado_sin_pedido' ? 'En seguimiento' : 'Sin pedido',
            icon: <Phone size={16} color={mision.estado === 'contactado_sin_pedido' ? '#E5E7EB' : 'rgba(255,255,255,0.3)'} />,
            onClick: () => onActualizar(mision.id, 'contactado_sin_pedido'),
          },
          {
            key: 'sin_respuesta' as EstadoMision,
            active: mision.estado === 'sin_respuesta',
            label: 'Sin respuesta',
            sub: mision.estado === 'sin_respuesta' ? `${mision.intentos_contacto ?? 0}x intentos` : 'No contestó',
            icon: <XCircle size={16} color={mision.estado === 'sin_respuesta' ? '#F87171' : 'rgba(255,255,255,0.3)'} />,
            onClick: () => onActualizar(mision.id, 'sin_respuesta'),
          },
        ].map(btn => (
          <button
            key={btn.key}
            onClick={btn.onClick}
            disabled={loading}
            style={{
              padding: '9px 4px', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
              border: `1px solid ${btn.active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'}`,
              background: btn.active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            {btn.icon}
            <span style={{ fontSize: 10, fontWeight: 800, color: btn.active ? '#E5E7EB' : '#6B7280', lineHeight: 1 }}>
              {btn.label}
            </span>
            <span style={{ fontSize: 8, color: '#6B7280' }}>{btn.sub}</span>
          </button>
        ))}
      </div>

      {/* Aún con stock — 2 filas para evitar overflow */}
      <div style={{
        padding: '9px 12px', borderRadius: 10, background: '#1A1A1D',
        border: `1px solid ${mision.estado === 'pospuesto' ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.18)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <Clock size={13} style={{ color: '#F5B000', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#F5B000', whiteSpace: 'nowrap' as const }}>Aún con stock — contactar en:</span>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <select
            value={diasPosp}
            onChange={e => setDiasPosp(Number(e.target.value))}
            disabled={loading}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.28)', borderRadius: 7,
              color: '#F5B000', fontSize: 12, fontWeight: 700, padding: '5px 8px', cursor: 'pointer', outline: 'none',
            }}
          >
            {DIAS_POSPONER.map(d => (
              <option key={d} value={d} style={{ background: '#0F0F10' }}>{d} {d === 1 ? 'día' : 'días'}</option>
            ))}
          </select>
          <button
            onClick={() => onActualizar(mision.id, 'pospuesto', { dias: diasPosp })}
            disabled={loading}
            style={{
              padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' as const,
              background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)',
              color: '#F5B000', cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Posponer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel de detalle (desktop) ────────────────────────────────────────────────
function DetailPanel({ mision, onActualizar, onWA, loadingId, onClose, onMarcarInactivo }: {
  mision: MisionEnriquecida | null
  onActualizar: OnActualizar
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
  onClose?: () => void
  onMarcarInactivo?: (m: MisionEnriquecida) => void
}) {
  const [litrosInput, setLitrosInput] = useState(50)
  const [diasPosp, setDiasPospD] = useState(5)
  const [saving, setSaving] = useState(false)
  const [ultimoPedidoOpen, setUltimoPedidoOpen] = useState(false)
  const router = useRouter()

  type UltimoPedidoItem = { producto: string; envase: string | null; litros: number; total: number }
  const [ultimoPedido, setUltimoPedido] = useState<{ fecha: string; items: UltimoPedidoItem[]; total: number } | null>(null)
  const [ultimoPedidoLoading, setUltimoPedidoLoading] = useState(false)

  useEffect(() => {
    if (!mision) { setUltimoPedido(null); return }
    setUltimoPedidoLoading(true)
    setUltimoPedido(null)
    fetch(`/api/misiones/ultimo-pedido?nombre_fantasia=${encodeURIComponent(mision.nombre_fantasia)}`)
      .then(r => r.json())
      .then(json => {
        if (json.fecha) setUltimoPedido(json)
      })
      .finally(() => setUltimoPedidoLoading(false))
  }, [mision?.nombre_fantasia])

  async function registrar(estado: EstadoMision, opts?: ActualizarOpts) {
    if (!mision) return
    setSaving(true)
    await onActualizar(mision.id, estado, opts)
    setSaving(false)
  }

  if (!mision) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 40, textAlign: 'center', color: 'var(--muted)',
      }}>
        <Target size={40} style={{ marginBottom: 16, opacity: 0.2 }} />
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Selecciona una misión</p>
        <p style={{ fontSize: 12 }}>Haz clic en un cliente de la lista para ver el detalle y marcar su estado</p>
      </div>
    )
  }

  const segColor  = SEG_COLOR[mision.segmento] ?? '#6B7280'
  const estadoCfg = ESTADO_CFG[mision.estado]
  const alertTipo = computeAlertTipo(mision)
  const alertCfg  = ALERTA_CFG[alertTipo]
  const loading   = loadingId === mision.id || saving
  const isDone    = esCompletada(mision.estado)

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #2A2A2E' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Avatar con segmento + score */}
          <div style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: `${segColor}18`, border: `2px solid ${segColor}50`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: segColor, lineHeight: 1 }}>
              {mision.nombre_fantasia.charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: 8, color: segColor, opacity: 0.8 }}>{mision.score}</span>
          </div>

          {/* Nombre + subtítulo + pills */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' as const }}>
              <h2
                onClick={mision.cliente_id != null ? () => router.push(`/ventas/clientes/${mision.cliente_id}`) : undefined}
                style={{
                  fontSize: 15, fontWeight: 900,
                  color: isDone ? '#4ADE80' : '#E5E7EB',
                  textDecoration: isDone ? 'line-through' : 'none',
                  cursor: mision.cliente_id != null ? 'pointer' : 'default',
                  lineHeight: 1.2,
                }}>
                {mision.nombre_fantasia}
              </h2>
              {(mision.litros_ultima_compra || mision.dias_sin_compra) && (
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, whiteSpace: 'nowrap' as const }}>
                  {[
                    mision.litros_ultima_compra ? `${mision.litros_ultima_compra}L` : null,
                    mision.dias_sin_compra ? `${mision.dias_sin_compra}d` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800,
                background: alertCfg.bg, color: alertCfg.color, border: `1px solid ${alertCfg.border}`,
              }}>
                {alertCfg.icon} {alertCfg.labelCorto}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                background: 'rgba(255,255,255,0.04)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                {estadoCfg.icon} {estadoCfg.label}
              </span>
              {mision.dias_para_compra !== null && mision.dias_para_compra < 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#EF4444' }}>
                  Venció hace {Math.abs(mision.dias_para_compra)}d
                </span>
              )}
              <CountdownRM localidad={mision.localidad} />
              {alertCfg.puntos > 0 && !isDone && (
                <span style={{ fontSize: 9, color: '#FBBF24', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <Star size={8} fill="#FBBF24" color="#FBBF24" /> +{alertCfg.puntos} pts
                </span>
              )}
            </div>
          </div>

          {/* Botones WA + llamar */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {mision.telefono && (
              <button onClick={() => onWA(mision)} title="Enviar WhatsApp" style={{
                width: 40, height: 40, borderRadius: 10,
                border: '1px solid rgba(37,211,102,0.35)', background: 'rgba(37,211,102,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <WAIcon size={18} />
              </button>
            )}
            {mision.telefono && (
              <button onClick={() => window.open(`tel:${mision.telefono}`)} title="Llamar" style={{
                width: 40, height: 40, borderRadius: 10,
                border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                <Phone size={17} color="#D4AF37" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 3 KPI CARDS + PRÓXIMA VISITA ── */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #2A2A2E' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
          {[
            {
              label: 'SIN COMPRAR',
              value: `${mision.dias_sin_compra}d`,
              color: mision.tipo === 'vencido' ? '#EF4444' : '#E5E7EB',
              icon: <Calendar size={12} color="#9CA3AF" />,
            },
            {
              label: 'ÚLTIMO PEDIDO',
              value: fFecha(mision.ultima_venta_fecha),
              color: '#E5E7EB',
              icon: <Calendar size={12} color="#9CA3AF" />,
            },
            {
              label: 'VENTA TOTAL',
              value: fPeso(mision.ultima_venta_monto),
              color: '#E5E7EB',
              icon: <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 700, lineHeight: 1 }}>$</span>,
            },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: '#1A1A1D', border: '1px solid #2A2A2E', borderRadius: 12, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>
                  {kpi.label}
                </span>
                {kpi.icon}
              </div>
              <span style={{
                fontSize: 17, fontWeight: 900, color: kpi.color,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                lineHeight: 1, display: 'block',
              }}>
                {kpi.value}
              </span>
            </div>
          ))}
        </div>

        {/* Quiebre de stock estimado */}
        {mision.siguiente_compra_estimada && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
          }}>
            <AlertTriangle size={13} color="#EF4444" />
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>
              Quiebre stock estimado:{' '}
              <strong style={{ color: '#EF4444' }}>{fFecha(mision.siguiente_compra_estimada)}</strong>
            </span>
            {mision.ciclo_promedio_dias && (
              <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 'auto' }}>cada {mision.ciclo_promedio_dias}d</span>
            )}
          </div>
        )}

        {/* Último contacto */}
        {(() => {
          const dcont = diasDesde(mision.ultimo_contacto_fecha)
          const contColor = dcont !== null && dcont <= 3 ? '#4ADE80' : dcont !== null && dcont <= 7 ? '#FBBF24' : '#EF4444'
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
              padding: '8px 12px', background: '#1A1A1D', border: '1px solid #2A2A2E', borderRadius: 10,
            }}>
              <MessageCircle size={13} color={dcont !== null ? contColor : '#6B7280'} />
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>Último contacto:</span>
              <strong style={{ fontSize: 12, color: dcont !== null ? contColor : '#6B7280' }}>
                {dcont !== null ? fDias(dcont) : 'Sin registros'}
              </strong>
              {mision.ultimo_contacto_fecha && (
                <span style={{ fontSize: 10, color: '#6B7280' }}>({fFecha(mision.ultimo_contacto_fecha)})</span>
              )}
              {mision.ultimo_contacto_tipo && (
                <span style={{ fontSize: 9, padding: '1px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: '#9CA3AF', marginLeft: 'auto' }}>
                  {mision.ultimo_contacto_tipo}
                </span>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── BADGES CONTEXTUALES ── */}
      {(mision.tipo_cliente || mision.cross_sell || mision.volumen_caida_pct != null || mision.localidad || mision.ciclo_promedio_dias) && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #2A2A2E', display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <TipoClienteBadge tipo={mision.tipo_cliente} size="sm" />
          {mision.volumen_caida_pct != null && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <TrendingDown size={10} /> −{mision.volumen_caida_pct}% vol.
            </span>
          )}
          {mision.cross_sell && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(74,222,128,0.06)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.18)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Star size={10} /> Cross-sell: {mision.cross_sell.categoria}
            </span>
          )}
          {mision.ciclo_promedio_dias && (
            <span style={{ fontSize: 10, color: '#9CA3AF', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Clock size={10} /> Cada {mision.ciclo_promedio_dias}d
            </span>
          )}
          {mision.localidad && (
            <span style={{ fontSize: 10, color: '#9CA3AF', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <MapPin size={10} /> {mision.localidad}
            </span>
          )}
        </div>
      )}

      {/* ── ÚLTIMO PEDIDO REAL — colapsable ── */}
      {(() => {
        const fechaLabel = ultimoPedido?.fecha ?? mision.ultima_venta_fecha
        const totalLabel = ultimoPedido?.total ?? (mision.ultima_venta_monto > 0 ? mision.ultima_venta_monto : null)
        return (
          <div style={{ borderBottom: '1px solid #2A2A2E' }}>
            {/* Header — siempre visible, tappable */}
            <button
              onClick={() => setUltimoPedidoOpen(o => !o)}
              style={{
                width: '100%', padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' as const,
              }}
            >
              <ShoppingCart size={13} color="#60A5FA" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#60A5FA', textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>
                Último pedido
              </span>
              {ultimoPedidoLoading && (
                <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 4 }}>cargando…</span>
              )}
              {!ultimoPedidoLoading && fechaLabel && (
                <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 4 }}>{fFecha(fechaLabel)}</span>
              )}
              {!ultimoPedidoLoading && totalLabel !== null && (
                <span style={{ fontSize: 12, fontWeight: 900, color: '#60A5FA', marginLeft: 'auto', flexShrink: 0 }}>
                  {fPeso(totalLabel)}
                </span>
              )}
              <ChevronDown
                size={14}
                color="#6B7280"
                style={{ flexShrink: 0, marginLeft: totalLabel !== null ? 4 : 'auto', transition: 'transform 0.2s', transform: ultimoPedidoOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            {/* Detalle — colapsable */}
            {ultimoPedidoOpen && (
              <div style={{ padding: '0 20px 12px' }}>
                {ultimoPedidoLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[1,2,3].map(i => (
                      <div key={i} style={{ height: 38, background: '#1A1A1D', borderRadius: 10, opacity: 0.4 + i * 0.1 }} />
                    ))}
                  </div>
                )}
                {!ultimoPedidoLoading && ultimoPedido && ultimoPedido.items.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {ultimoPedido.items.map((p, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', background: '#1A1A1D', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#E5E7EB', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {p.producto}
                          </span>
                          {p.envase && <span style={{ fontSize: 10, color: '#9CA3AF' }}>{p.envase}</span>}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#60A5FA', flexShrink: 0 }}>{p.litros}L</span>
                      </div>
                    ))}
                  </div>
                )}
                {!ultimoPedidoLoading && !ultimoPedido && (
                  <p style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', padding: '8px 0' }}>
                    {mision.ultima_venta_monto > 0 ? 'Sin detalle de productos' : 'Sin historial de compras'}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── LO QUE SUELE PEDIR ── */}
      {mision.pedido_sugerido && mision.pedido_sugerido.length > 0 && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #2A2A2E' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <ShoppingCart size={13} color="#34D399" />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#34D399', textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>Lo que suele pedir</span>
            {mision.siguiente_compra_estimada && (
              <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>para el {fFecha(mision.siguiente_compra_estimada)}</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {mision.pedido_sugerido.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: '#1A1A1D', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#E5E7EB', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {p.producto}
                  </span>
                  {p.envase && (
                    <span style={{ fontSize: 10, color: '#9CA3AF' }}>{p.envase}</span>
                  )}
                </div>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#34D399', flexShrink: 0 }}>~{p.litros}L</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(52,211,153,0.1)' }}>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>Total estimado: </span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#34D399', marginLeft: 5 }}>
              ~{Math.round(mision.pedido_sugerido.reduce((s, p) => s + p.litros, 0) * 10) / 10}L
            </span>
          </div>
        </div>
      )}

      {/* ── TORPEDO — FICHA SENSORIAL ── */}
      {mision.pedido_sugerido?.[0]?.producto && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #2A2A2E' }}>
          <TorpedoPanelV2 nombreProducto={mision.pedido_sugerido[0].producto} />
        </div>
      )}

      {/* ── 3 BOTONES DE ESTADO ── */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #2A2A2E' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: isDone ? 8 : 0 }}>
          {[
            {
              key: 'contactado_pedido' as EstadoMision,
              active: isDone,
              label: 'Hizo pedido',
              sub: isDone ? 'Confirmado' : 'Registrar',
              icon: <CheckCircle2 size={19} color={isDone ? '#4ADE80' : 'rgba(255,255,255,0.25)'} />,
              onClick: () => !loading && (isDone ? registrar('pendiente') : registrar('contactado_pedido', { litros: litrosInput })),
            },
            {
              key: 'contactado_sin_pedido' as EstadoMision,
              active: mision.estado === 'contactado_sin_pedido',
              label: 'Contactado',
              sub: mision.estado === 'contactado_sin_pedido' ? 'En seguimiento' : 'Sin pedido',
              icon: <Phone size={19} color={mision.estado === 'contactado_sin_pedido' ? '#E5E7EB' : 'rgba(255,255,255,0.25)'} />,
              onClick: () => !loading && registrar('contactado_sin_pedido'),
            },
            {
              key: 'sin_respuesta' as EstadoMision,
              active: mision.estado === 'sin_respuesta',
              label: 'Sin respuesta',
              sub: mision.estado === 'sin_respuesta' ? `Sin actividad · ${mision.intentos_contacto ?? 0}x` : 'No contestó',
              icon: <XCircle size={19} color={mision.estado === 'sin_respuesta' ? '#F87171' : 'rgba(255,255,255,0.25)'} />,
              onClick: () => !loading && registrar('sin_respuesta'),
            },
          ].map(btn => (
            <button
              key={btn.key}
              onClick={btn.onClick}
              disabled={loading}
              style={{
                padding: '12px 6px', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
                border: `1px solid ${btn.active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'}`,
                background: btn.active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}
            >
              {btn.icon}
              <span style={{ fontSize: 11, fontWeight: 800, color: btn.active ? '#E5E7EB' : '#6B7280', lineHeight: 1 }}>
                {btn.label}
              </span>
              <span style={{ fontSize: 9, color: '#6B7280' }}>{btn.sub}</span>
            </button>
          ))}
        </div>

        {isDone && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: '#1A1A1D', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10,
          }}>
            <span style={{ flex: 1, fontSize: 12, color: '#9CA3AF' }}>Litros registrados</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setLitrosInput(v => Math.max(1, v - 5))} style={counterBtn}><Minus size={12} /></button>
              <input
                type="number" min={1} step={5} value={litrosInput}
                onChange={e => setLitrosInput(Number(e.target.value))}
                style={{
                  width: 52, textAlign: 'center', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #2A2A2E', borderRadius: 8,
                  color: '#22C55E', fontSize: 13, fontWeight: 800, padding: '5px 0', outline: 'none',
                }}
              />
              <button onClick={() => setLitrosInput(v => v + 5)} style={counterBtn}><Plus size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* ── AÚN CON STOCK ── */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #2A2A2E' }}>
        <div style={{
          padding: '10px 14px', background: '#1A1A1D',
          border: `1px solid ${mision.estado === 'pospuesto' ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.2)'}`,
          borderRadius: 12,
        }}>
          {/* Fila título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Clock size={14} color="#F5B000" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: mision.estado === 'pospuesto' ? '#F5B000' : '#E5E7EB', whiteSpace: 'nowrap' as const }}>
              Aún con stock — contactar en:
            </span>
          </div>
          {/* Fila controles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={diasPosp}
              onChange={e => setDiasPospD(Number(e.target.value))}
              disabled={loading}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8,
                color: '#F5B000', fontSize: 13, fontWeight: 700, padding: '7px 10px', cursor: 'pointer', outline: 'none',
              }}
            >
              {DIAS_POSPONER.map(d => (
                <option key={d} value={d} style={{ background: '#0F0F10' }}>{d} {d === 1 ? 'día' : 'días'}</option>
              ))}
            </select>
            <button
              onClick={() => !loading && registrar('pospuesto', { dias: diasPosp })}
              disabled={loading}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' as const,
                background: 'rgba(212,175,55,0.18)', border: '1px solid rgba(212,175,55,0.4)',
                color: '#F5B000', cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '…' : 'Posponer'}
            </button>
          </div>
        </div>
      </div>

      {/* ── NOTA ── */}
      {mision.nota && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid #2A2A2E' }}>
          <div style={{ padding: '8px 12px', background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 10 }}>
            <p style={{ fontSize: 11, color: '#D4AF37', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
              <MessageCircle size={11} /> {mision.nota}
            </p>
          </div>
        </div>
      )}

      {/* ── MARCAR INACTIVO ── */}
      {onMarcarInactivo && (
        <div style={{ padding: '12px 20px 22px', marginTop: 'auto' }}>
          <button
            onClick={() => {
              if (window.confirm(`¿Marcar a "${mision.nombre_fantasia}" como INACTIVO? Dejará de aparecer en misiones.`))
                onMarcarInactivo(mision)
            }}
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12,
              background: 'transparent', border: '1px solid rgba(239,68,68,0.25)',
              color: '#EF4444', fontSize: 13, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <UserX size={15} /> Marcar inactivo
          </button>
        </div>
      )}
    </div>
  )
}

const counterBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface2)', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
}

// ── Compact card para lista desktop ──────────────────────────────────────────
function CompactCard({ mision, selected, onClick, onWA }: {
  mision: MisionEnriquecida
  selected: boolean
  onClick: () => void
  onWA?: (m: MisionEnriquecida) => void
}) {
  const segColor  = SEG_COLOR[mision.segmento] ?? '#6B7280'
  const tipoCfg   = TIPO_CFG[mision.tipo]
  const estadoCfg = ESTADO_CFG[mision.estado]
  const isDone    = esCompletada(mision.estado)
  const dl        = diasLabel(mision)
  const litros    = mision.litros_ultima_compra ?? null
  const diasSin   = mision.dias_sin_compra
  const dcont     = diasDesde(mision.ultimo_contacto_fecha)

  // Línea contextual: "Último pedido: 40L [82d]"
  const contexto = litros != null
    ? `Último pedido: ${litros}L${diasSin ? ` [${diasSin}d]` : ''}`
    : diasSin ? `Sin comprar: ${diasSin}d` : null

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px', cursor: 'pointer',
        background: selected
          ? 'rgba(212,175,55,0.08)'
          : isDone ? 'rgba(52,211,153,0.03)' : 'transparent',
        borderLeft: selected ? '3px solid var(--gold)' : `3px solid ${isDone ? 'rgba(74,222,128,0.18)' : 'transparent'}`,
        transition: 'all 0.15s',
        opacity: isDone ? 0.65 : 1,
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = isDone ? 'rgba(52,211,153,0.03)' : 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Avatar inicial */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: `${segColor}18`, border: `1.5px solid ${segColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 900, color: segColor,
        }}>
          {mision.nombre_fantasia.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13, fontWeight: 700, color: isDone ? 'var(--green-dim)' : 'var(--cream)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 2, textDecoration: isDone ? 'line-through' : 'none',
          }}>
            {mision.nombre_fantasia}
            {contexto && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, marginLeft: 5 }}>({contexto})</span>}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: estadoCfg.color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{estadoCfg.icon} {dl ?? estadoCfg.label}</span>
            {mision.score != null && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: `${segColor}18`, color: segColor }}>
                {mision.score}. {mision.prioridad}
              </span>
            )}
            <TipoClienteBadge tipo={mision.tipo_cliente} size="xs" />
            {mision.volumen_caida_pct != null && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: 'rgba(248,113,113,0.12)', color: 'var(--red-dim)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <TrendingDown size={9} /> −{mision.volumen_caida_pct}%
              </span>
            )}
            {/* Último contacto */}
            <span style={{ fontSize: 9, color: dcont !== null && dcont <= 3 ? '#4ADE80' : dcont !== null && dcont <= 7 ? '#FBBF24' : '#6B7280', display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
              <MessageCircle size={8} /> {dcont !== null ? fDias(dcont) : 'sin contacto'}
            </span>
          </div>
        </div>

        {/* Botones rápidos */}
        {!isDone && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {mision.telefono && (
              <button
                onClick={e => { e.stopPropagation(); window.open(`tel:${mision.telefono}`) }}
                style={quickBtn('#D4AF37')}
              >
                <Phone size={12} />
              </button>
            )}
            {mision.telefono && onWA && (
              <button
                onClick={e => { e.stopPropagation(); onWA(mision) }}
                style={quickBtn('#25D166')}
              >
                <MessageCircle size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function quickBtn(color: string): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: '50%', border: `1px solid ${color}40`,
    background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color, flexShrink: 0,
  }
}

// ── Tarjeta mobile (expandible) ───────────────────────────────────────────────
function MisionCard({ mision, onActualizar, onWA, loadingId, onMarcarInactivo, isDesktop }: {
  mision: MisionEnriquecida
  onActualizar: OnActualizar
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
  onMarcarInactivo?: (m: MisionEnriquecida) => void
  isDesktop: boolean
}) {
  const [open, setOpen] = useState(false)
  const segColor  = SEG_COLOR[mision.segmento] ?? '#6B7280'
  const tipoCfg   = TIPO_CFG[mision.tipo]
  const estadoCfg = ESTADO_CFG[mision.estado]
  const loading   = loadingId === mision.id
  const isPedido  = mision.estado === 'contactado_pedido'
  const dl        = diasLabel(mision)

  return (
    <div style={{
      background: isPedido ? 'rgba(74,222,128,0.03)' : 'var(--surface)',
      border: `1px solid ${isPedido ? 'rgba(74,222,128,0.15)' : 'var(--border)'}`,
      borderLeft: isPedido ? '3px solid var(--green-dim)'
        : mision.tipo === 'vencido'       ? '3px solid var(--red)'
        : mision.tipo === 'esta_semana'   ? '3px solid var(--gold)'
        : mision.tipo === 'proxima_semana'? '3px solid var(--blue)'
        : '1px solid var(--border)',
      borderRadius: 12,
      opacity: isPedido ? 0.72 : 1,
    }}>
      {/* Header clickable — touch target ≥ 44px */}
      <div onClick={() => setOpen(v => !v)} style={{
        padding: isDesktop ? '11px 14px' : '8px 12px',
        minHeight: 44,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {/* Segmento pill */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: `${segColor}15`, border: `1.5px solid ${segColor}35`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: segColor, lineHeight: 1 }}>{mision.segmento}</span>
          <span style={{ fontSize: 7, color: segColor, opacity: 0.6 }}>{mision.score}</span>
        </div>

        {/* Contenido central */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Nombre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{
              fontSize: 12, fontWeight: 700, color: isPedido ? '#4ADE80' : 'var(--cream)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: isPedido ? 'line-through' : 'none',
            }}>{mision.nombre_fantasia}</span>
            {mision.litros_ultima_compra != null && !isPedido && (
              <span style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {mision.litros_ultima_compra}L{mision.dias_sin_compra ? ` · ${mision.dias_sin_compra}d` : ''}
              </span>
            )}
            {isPedido && <CheckCircle2 size={11} color="#4ADE80" />}
          </div>
          {/* Meta: alerta + estado + días + countdown RM */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {(() => {
              const at = computeAlertTipo(mision)
              const acfg = ALERTA_CFG[at]
              return (
                <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: acfg.bg, color: acfg.color, border: `1px solid ${acfg.border}`, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {acfg.icon} {acfg.labelCorto}
                </span>
              )
            })()}
            <span style={{ fontSize: 9, color: estadoCfg.color, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {estadoCfg.icon} {estadoCfg.label}
            </span>
            {dl && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: tipoCfg.bg, color: tipoCfg.color, whiteSpace: 'nowrap' }}>
                {dl}
              </span>
            )}
            <CountdownRM localidad={mision.localidad} />
          </div>
        </div>

        {/* Acciones derecha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {!isPedido && mision.telefono && (
            <button
              onClick={e => { e.stopPropagation(); window.open(`tel:${mision.telefono}`) }}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <Phone size={13} color="rgba(255,255,255,0.55)" />
            </button>
          )}
          {!isPedido && mision.telefono && (
            <button
              onClick={e => { e.stopPropagation(); onWA(mision) }}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                border: '1px solid rgba(37,211,102,0.28)', background: 'rgba(37,211,102,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <WAIcon size={14} />
            </button>
          )}
          {open
            ? <ChevronDown size={13} color="rgba(255,255,255,0.25)" />
            : <ChevronRight size={13} color="rgba(255,255,255,0.25)" />
          }
        </div>
      </div>

      {/* Panel expandido — CSS Grid para transición smooth sin framer-motion */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border-subtle)' }}>
          {/* KPIs inline — 3 columnas */}
          {(() => {
            const dcont = diasDesde(mision.ultimo_contacto_fecha)
            const contColor = dcont !== null && dcont <= 3 ? '#4ADE80' : dcont !== null && dcont <= 7 ? '#FBBF24' : '#EF4444'
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, margin: '10px 0' }}>
                {[
                  { label: 'Sin comprar', value: `${mision.dias_sin_compra}d`, color: mision.tipo === 'vencido' ? '#EF4444' : '#E5E7EB', icon: <Calendar size={10} color="#9CA3AF" /> },
                  { label: 'Último ped.', value: fFecha(mision.ultima_venta_fecha), color: '#E5E7EB', icon: <Calendar size={10} color="#9CA3AF" /> },
                  { label: 'Últ. contacto', value: dcont !== null ? fDias(dcont) : 'Nunca', color: contColor, icon: <MessageCircle size={10} color="#9CA3AF" /> },
                ].map(({ label, value, color, icon }) => (
                  <div key={label} style={{ background: '#1A1A1D', border: '1px solid #2A2A2E', borderRadius: 10, padding: '7px 9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <p style={{ fontSize: 7, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</p>
                      {icon}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                  </div>
                ))}
              </div>
            )
          })()}
          {/* Quiebre de stock estimado */}
          {mision.siguiente_compra_estimada && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
              <AlertTriangle size={10} color="#EF4444" />
              <span style={{ fontSize: 10, color: '#9CA3AF' }}>
                Quiebre stock: <strong style={{ color: '#EF4444' }}>{fFecha(mision.siguiente_compra_estimada)}</strong>
              </span>
              {mision.ciclo_promedio_dias && (
                <span style={{ fontSize: 9, color: '#6B7280', marginLeft: 'auto' }}>ciclo {mision.ciclo_promedio_dias}d</span>
              )}
            </div>
          )}
          {mision.nota && (
            <div style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)', marginBottom: 8 }}>
              <p style={{ fontSize: 10, color: '#D4AF37', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 3 }}><MessageCircle size={10} /> {mision.nota}</p>
            </div>
          )}
          {/* Torpedo: ficha sensorial del producto habitual */}
          {mision.pedido_sugerido?.[0]?.producto && (
            <div style={{ marginBottom: 8 }}>
              <TorpedoPanelV2 nombreProducto={mision.pedido_sugerido[0].producto} />
            </div>
          )}
          <BotonesAccion mision={mision} onActualizar={onActualizar} loading={loading} />
          {onMarcarInactivo && (
            <button
              onClick={() => { if (window.confirm(`¿Marcar "${mision.nombre_fantasia}" como INACTIVO?`)) onMarcarInactivo(mision) }}
              disabled={loading}
              style={{
                marginTop: 7, width: '100%', minHeight: 36,
                background: 'transparent', border: '1px solid rgba(248,113,113,0.2)',
                borderRadius: 9, color: '#F87171', fontSize: 10, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <UserX size={11} /> Marcar inactivo
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

// ── Header resumen ────────────────────────────────────────────────────────────
function HeaderResumen({ misiones, semana, vendedorActual, isAdmin, isDesktop, misionesTodas }: {
  misiones: MisionEnriquecida[]
  misionesTodas: MisionEnriquecida[]
  semana: string
  vendedorActual: string | null
  isAdmin: boolean
  isDesktop: boolean
}) {
  const total    = misiones.length
  const pedidos  = misiones.filter(m => esCompletada(m.estado)).length
  const vencidos = misiones.filter(m => m.tipo === 'vencido' && m.estado === 'pendiente').length
  const esSem    = misiones.filter(m => m.tipo === 'esta_semana').length
  const proxSem  = misiones.filter(m => m.tipo === 'proxima_semana').length
  const volumen  = misiones.filter(m => esCompletada(m.estado)).reduce((s, m) => s + (m.resultado_litros ?? 0), 0)

  const pct     = total > 0 ? Math.round((pedidos / total) * 100) : 0
  const STEPS   = isDesktop ? 8 : 5
  const filled  = Math.round((pct / 100) * STEPS)
  const pColor  = pct >= 80 ? 'var(--green-dim)' : 'var(--gold)'

  // ── Mobile: layout ultra-compacto ──────────────────────────────────────────
  if (!isDesktop) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-1)', borderRadius: 16, padding: '12px 14px', marginBottom: 10,
      }}>
        <GamificacionBar misiones={misionesTodas} />
        {/* Fila: título + donut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>
              {rangoSemana(semana)}
            </p>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--gold)', lineHeight: 1.1, marginBottom: 4 }}>
              Misiones
            </h1>
            {!isAdmin && vendedorActual && (
              <p style={{ fontSize: 11, color: pColor, fontWeight: 700 }}>
                {pedidos}/{total} listas · {pct}%
                {volumen > 0 && <span style={{ color: 'var(--green-dim)', marginLeft: 6 }}>{volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })}L</span>}
              </p>
            )}
            {isAdmin && volumen > 0 && (
              <p style={{ fontSize: 11, color: 'var(--green-dim)', fontWeight: 700 }}>
                {volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L rescatados
              </p>
            )}
          </div>
          <ProgressDonut done={pedidos} total={total} size={62} />
        </div>
        {/* KPI chips 4 columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5 }}>
          {[
            { label: 'Urgente', value: vencidos, color: 'var(--red)',       urgent: vencidos > 0 },
            { label: 'Semana',  value: esSem,    color: 'var(--gold)',      urgent: false },
            { label: 'Próxima', value: proxSem,  color: 'var(--blue)',      urgent: false },
            { label: 'Pedido',  value: pedidos,  color: 'var(--green-dim)', urgent: false },
          ].map(({ label, value, color, urgent }) => (
            <div key={label} style={{
              background: urgent && value > 0 ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${urgent && value > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 9, padding: '6px 2px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingInline: 2 }}>{label}</p>
              <p style={{ fontSize: 20, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1.1 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Desktop: layout original ────────────────────────────────────────────────
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-1)',
      borderRadius: 20, padding: '20px 28px', marginBottom: 20,
    }}>
      <GamificacionBar misiones={misionesTodas} />
      {/* Fila superior: título + global status */}
      <div style={{ display: 'flex', alignItems: isDesktop ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: isDesktop ? 14 : 10, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>
            PROGRESO SEMANAL
          </p>
          <h1 style={{ fontSize: isDesktop ? 26 : 20, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 3 }}>
            Misiones de la semana
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            {rangoSemana(semana)}
          </p>
        </div>
        {/* GLOBAL STATUS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {isDesktop && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>
                GLOBAL STATUS
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div>
                  <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>COMPLETADAS</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--green-dim)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}>{pct}%</p>
                </div>
                <ProgressDonut done={pedidos} total={total} size={80} />
              </div>
            </div>
          )}
          {!isDesktop && <ProgressDonut done={pedidos} total={total} size={68} />}
        </div>
      </div>

      {/* MI PROGRESO con barra tipo chevron */}
      {!isAdmin && vendedorActual && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ fontSize: 12, color: 'var(--cream)', fontWeight: 700 }}>
              MI PROGRESO: <span style={{ color: pColor }}>{vendedorActual.split(' ')[0]} (Vendedor)</span>
            </p>
            <span style={{ fontSize: 12, fontWeight: 800, color: pColor }}>{pedidos} / {total}</span>
          </div>
          {/* Chevron progress bar */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
            {Array.from({ length: STEPS }).map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 22,
                background: i < filled ? pColor : 'rgba(255,255,255,0.06)',
                borderRadius: 3,
                clipPath: i < STEPS - 1
                  ? 'polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%, 6px 50%)'
                  : 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 6px 50%)',
                transition: 'background 0.4s',
              }} />
            ))}
            <div style={{
              marginLeft: 4, background: pColor,
              borderRadius: 6, padding: '0 10px',
              display: 'flex', alignItems: 'center',
              fontSize: 11, fontWeight: 900, color: '#0D0A00', whiteSpace: 'nowrap',
            }}>{pct}%</div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)' }}>
            <span>Misiones Completadas: <strong style={{ color: 'var(--cream)' }}>{pedidos} / {total}</strong></span>
            {volumen > 0 && (
              <span>Volumen Rescatado: <strong style={{ color: 'var(--green-dim)' }}>{volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} Litros</strong></span>
            )}
          </div>
        </div>
      )}
      {/* Admin: solo volumen si hay */}
      {isAdmin && volumen > 0 && (
        <p style={{ fontSize: 12, color: 'var(--green-dim)', fontWeight: 700, marginBottom: 14 }}>
          Volumen rescatado: {volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L
        </p>
      )}

      {/* KPI chips — en móvil 4 columnas compactas (caben en una fila) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: isDesktop ? 8 : 6, minWidth: 0 }}>
        {[
          { label: isDesktop ? 'Llama ahora'  : 'Ahora',  value: vencidos, color: 'var(--red)',       urgent: vencidos > 0 },
          { label: isDesktop ? 'Esta semana'  : 'Sem.',   value: esSem,    color: 'var(--gold)',      urgent: false },
          { label: isDesktop ? 'Próxima sem.' : 'Próx.',  value: proxSem,  color: 'var(--blue)',      urgent: false },
          { label: isDesktop ? 'Con pedido'   : 'Pedido', value: pedidos,  color: 'var(--green-dim)', urgent: false },
        ].map(({ label, value, color, urgent }) => (
          <div key={label} style={{
            background: urgent && value > 0 ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${urgent && value > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: isDesktop ? 12 : 10, padding: isDesktop ? '12px 14px' : '7px 4px', textAlign: 'center', minWidth: 0,
          }}>
            <p style={{ fontSize: isDesktop ? 9 : 8.5, color: 'var(--muted)', fontWeight: 700, marginBottom: isDesktop ? 4 : 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
            <p style={{ fontSize: isDesktop ? 26 : 18, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sección mobile ────────────────────────────────────────────────────────────
function SeccionMisiones({ tipo, misiones, onActualizar, onWA, loadingId, onMarcarInactivo, defaultOpen = true, isDesktop }: {
  tipo: TipoMision
  misiones: MisionEnriquecida[]
  onActualizar: OnActualizar
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
  onMarcarInactivo?: (m: MisionEnriquecida) => void
  defaultOpen?: boolean
  isDesktop: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!misiones.length) return null
  const cfg = TIPO_CFG[tipo]
  const pendientes  = misiones.filter(m => !esCompletada(m.estado)).length
  const completadas = misiones.filter(m => esCompletada(m.estado)).length

  return (
    <div style={{ marginBottom: isDesktop ? 18 : 12 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: open ? (isDesktop ? 10 : 8) : 0, padding: isDesktop ? '9px 14px' : '8px 12px', borderRadius: 12,
        border: `1px solid ${cfg.border}`, background: cfg.bg, cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{cfg.icon}</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{cfg.desc}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {pendientes > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: `${cfg.color}20`, color: cfg.color }}>
              {pendientes}
            </span>
          )}
          {completadas > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(74,222,128,0.1)', color: 'var(--green-dim)' }}>
              {completadas}
            </span>
          )}
          {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
        </div>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 8 : 6 }}>
          {misiones.map(m => (
            <MisionCard key={m.id} mision={m} onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} onMarcarInactivo={onMarcarInactivo} isDesktop={isDesktop} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────────
function HistorialView({ historial }: { historial: HistorialSemana[] }) {
  const [openSemana, setOpenSemana] = useState<string | null>(historial[0]?.semana ?? null)
  if (!historial.length) {
    return <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>Sin historial de semanas anteriores</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {historial.map(sem => {
        const isOpen = openSemana === sem.semana
        const pct = sem.total > 0 ? Math.round((sem.completadas / sem.total) * 100) : 0
        return (
          <div key={sem.semana} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <button onClick={() => setOpenSemana(isOpen ? null : sem.semana)} style={{
              width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12,
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}>
              <Calendar size={15} color="var(--muted)" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', marginBottom: 2 }}>{rangoSemana(sem.semana)}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>{sem.completadas} de {sem.total} con pedido — {pct}%</p>
              </div>
              <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? 'var(--green-dim)' : 'var(--gold)', borderRadius: 4 }} />
              </div>
              {isOpen ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px 12px' }}>
                {sem.misiones.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: SEG_COLOR[m.segmento] ?? '#6B7280', width: 14 }}>{m.segmento}</span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>{m.nombre_fantasia}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: m.estado === 'contactado_pedido' ? 'rgba(52,211,153,0.12)' : 'var(--surface2)',
                      color: ESTADO_CFG[m.estado]?.color ?? '#6B7280',
                    }}>
                      {ESTADO_CFG[m.estado]?.label ?? m.estado}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Próxima semana ────────────────────────────────────────────────────────────
function ProximaView({ proxima, isDesktop }: { proxima: ProximaPreview[]; isDesktop: boolean }) {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const d7  = new Date(hoy); d7.setDate(d7.getDate() + 7)
  const d14 = new Date(hoy); d14.setDate(d14.getDate() + 14)
  const enVentana = proxima.filter(p => {
    if (!p.siguiente_compra_estimada) return false
    const d = new Date(p.siguiente_compra_estimada + 'T12:00:00')
    return d >= d7 && d <= d14
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  if (!enVentana.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <CalendarDays size={40} style={{ color: 'var(--muted)', opacity: 0.3, marginBottom: 10 }} />
        <p style={{ fontSize: 14, color: 'var(--cream)', fontWeight: 700, marginBottom: 6 }}>Sin predicciones para la próxima semana</p>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Los clientes aparecerán aquí cuando su compra estimada caiga en los próximos 7–14 días.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '10px 14px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>
          {enVentana.length} clientes con compra estimada la próxima semana — contáctalos antes de que llegue su ciclo
        </p>
      </div>
      <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: isDesktop ? 'repeat(2, 1fr)' : undefined, flexDirection: isDesktop ? undefined : 'column', gap: 8 }}>
        {enVentana.map(p => {
          const segColor = SEG_COLOR[p.segmento] ?? '#6B7280'
          const diasRestantes = p.siguiente_compra_estimada
            ? Math.round((new Date(p.siguiente_compra_estimada + 'T12:00:00').getTime() - hoy.getTime()) / 86400000)
            : null
          return (
            <div key={`${p.vendedor_actual}|${p.nombre_fantasia}`} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: `${segColor}18`, border: `1.5px solid ${segColor}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: segColor }}>{p.segmento}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre_fantasia}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{dspV(p.vendedor_actual)}</span>
                  {diasRestantes !== null && <span style={{ fontSize: 10, fontWeight: 700, color: '#D4AF37' }}>En {diasRestantes}d</span>}
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Ciclo {p.ciclo_promedio_dias}d</span>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: segColor, flexShrink: 0 }}>{p.score.toFixed(0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Lista desktop con separadores por tipo ────────────────────────────────────
function ListaDesktop({ porTipo, selectedId, onSelect, onWA }: {
  porTipo: Record<TipoMision, MisionEnriquecida[]>
  selectedId: string | null
  onSelect: (m: MisionEnriquecida) => void
  onWA: (m: MisionEnriquecida) => void
}) {
  const ORDEN: TipoMision[] = ['vencido', 'esta_semana', 'proxima_semana']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {ORDEN.map(tipo => {
        const items = porTipo[tipo]
        if (!items.length) return null
        const cfg = TIPO_CFG[tipo]
        const pendientes = items.filter(m => !esCompletada(m.estado)).length
        return (
          <div key={tipo}>
            {/* Label de sección — sticky */}
            <div style={{
              padding: '8px 14px 6px', display: 'flex', alignItems: 'center', gap: 8,
              position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{cfg.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.8px', flex: 1 }}>
                {tipo === 'vencido' ? 'PRIORIDAD ALTA' : cfg.label}
              </span>
              {pendientes > 0 && (
                <span style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                  background: `${cfg.color}18`, color: cfg.color,
                }}>{pendientes}</span>
              )}
            </div>
            {items.map(m => (
              <CompactCard key={m.id} mision={m} selected={selectedId === m.id} onClick={() => onSelect(m)} onWA={onWA} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  misiones: MisionEnriquecida[]
  proxima: ProximaPreview[]
  historial: HistorialSemana[]
  semana: string
  semanaNext: string
  consejos: string[]
  isAdmin: boolean
  vendedorActual: string | null
  vendedorNombre: string | null
}

type Tab = 'resumen' | 'semana' | 'calendario' | 'proxima' | 'historial'

export default function MisionesClient({
  misiones: initialMisiones, proxima, historial,
  semana, semanaNext, consejos, isAdmin, vendedorActual, vendedorNombre,
}: Props) {
  const isDesktop = useIsDesktop()
  const router    = useRouter()

  const [misiones, setMisiones]     = useState<MisionEnriquecida[]>(initialMisiones)
  const [tab, setTab]               = useState<Tab>(isAdmin ? 'resumen' : 'semana')
  const [loadingId, setLoadingId]   = useState<string | null>(null)
  const [generando, setGenerando]   = useState(false)
  const [waTarget, setWaTarget]     = useState<WATarget | null>(null)
  const [filtroVendedor, setFiltroVendedor] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<TipoCliente | null>(null)
  const [selectedMision, setSelectedMision] = useState<MisionEnriquecida | null>(null)

  const hoyStr = new Date().toISOString().split('T')[0]

  // Pospuestos con snooze vigente → sección separada "Con Stock"
  const pospuestosConStock = useMemo(() =>
    misiones.filter(m => m.estado === 'pospuesto' && m.snooze_until && m.snooze_until > hoyStr)
  , [misiones, hoyStr])

  const misionesFiltradas = useMemo(() => {
    // Excluye pospuestos vigentes de la lista principal
    let base = misiones.filter(m => !(m.estado === 'pospuesto' && m.snooze_until && m.snooze_until > hoyStr))
    if (filtroVendedor) base = base.filter(m => dspV(m.vendedor) === filtroVendedor)
    if (filtroTipo) base = base.filter(m => m.tipo_cliente === filtroTipo)
    return base
  }, [misiones, filtroVendedor, filtroTipo, hoyStr])

  // Conteos por tipo para el filtro UI
  const conteosPorTipo = useMemo(() => {
    const base = !filtroVendedor ? misiones : misiones.filter(m => dspV(m.vendedor) === filtroVendedor)
    return {
      activo:   base.filter(m => m.tipo_cliente === 'activo').length,
      inactivo: base.filter(m => m.tipo_cliente === 'inactivo').length,
      temporal: base.filter(m => m.tipo_cliente === 'temporal').length,
      nuevo:    base.filter(m => m.tipo_cliente === 'nuevo').length,
    }
  }, [misiones, filtroVendedor])

  const porTipo = useMemo(() => {
    const grupos: Record<TipoMision, MisionEnriquecida[]> = { vencido: [], esta_semana: [], proxima_semana: [] }
    for (const m of misionesFiltradas) grupos[m.tipo]?.push(m)
    const orden: EstadoMision[] = ['pendiente', 'sin_respuesta', 'contactado_sin_pedido', 'pospuesto', 'contactado_pedido', 'auto_completado']
    const getDiasVencidos = (m: MisionEnriquecida) =>
      m.dias_para_compra !== null && m.dias_para_compra < 0
        ? Math.abs(m.dias_para_compra)
        : Math.max(0, (m.dias_sin_compra ?? 0) - (m.ciclo_promedio_dias ?? 0))
    for (const key of Object.keys(grupos) as TipoMision[]) {
      grupos[key].sort((a, b) => {
        const oa = orden.indexOf(a.estado); const ob = orden.indexOf(b.estado)
        if (oa !== ob) return oa - ob
        // Días vencidos ASC: 1 día primero, luego más días
        return getDiasVencidos(a) - getDiasVencidos(b)
      })
    }
    return grupos
  }, [misionesFiltradas])

  // Misiones dinámicas: al entrar, reconciliar contra ventas de la semana.
  // Si algún cliente ya compró por otro canal, su misión se auto-completa.
  useEffect(() => {
    let cancel = false
    fetch('/api/misiones?action=reconciliar', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancel && d?.changed > 0) router.refresh() })
      .catch(() => {})
    return () => { cancel = true }
  }, [router])

  const onActualizar = useCallback(async (id: string, estado: EstadoMision, opts?: ActualizarOpts) => {
    setLoadingId(id)
    try {
      const res = await fetch('/api/misiones?action=actualizar_estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mision_id: id, estado, dias: opts?.dias, litros: opts?.litros }),
      })
      if (!res.ok) throw new Error('Error')

      if (estado === 'pospuesto') {
        // Snooze: sale de la lista activa hasta que reaparezca
        setMisiones(prev => prev.filter(m => m.id !== id))
        setSelectedMision(prev => (prev?.id === id ? null : prev))
      } else {
        const completado_at = estado === 'contactado_pedido' ? new Date().toISOString() : null
        setMisiones(prev => prev.map(m =>
          m.id === id ? { ...m, estado, completado_at: completado_at ?? m.completado_at } : m
        ))
        setSelectedMision(prev => prev?.id === id ? { ...prev, estado, completado_at: completado_at ?? prev.completado_at } : prev)
      }
    } catch (e) { console.error(e) }
    finally { setLoadingId(null) }
  }, [])

  const onMarcarInactivo = useCallback(async (m: MisionEnriquecida) => {
    setLoadingId(m.id)
    try {
      const res = await fetch('/api/clientes/estado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_fantasia: m.nombre_fantasia, estado: 'inactivo', nota: 'Marcado desde misiones' }),
      })
      if (!res.ok) throw new Error('Error')
      // Sale de la lista al instante
      setMisiones(prev => prev.filter(x => x.id !== m.id))
      setSelectedMision(prev => (prev?.id === m.id ? null : prev))
    } catch (e) { console.error(e) }
    finally { setLoadingId(null) }
  }, [])

  const onGenerar = useCallback(async () => {
    setGenerando(true)
    try {
      const res = await fetch('/api/misiones?action=generar', { method: 'POST' })
      if (!res.ok) throw new Error('Error')
      router.refresh()
    } catch (e) { console.error(e) }
    finally { setGenerando(false) }
  }, [router])

  const onWA = useCallback((m: MisionEnriquecida) => {
    const at = computeAlertTipo(m)
    setWaTarget({
      nombre: m.nombre_fantasia,
      telefono: m.telefono ?? undefined,
      cicloPromedioDias: m.ciclo_promedio_dias ?? undefined,
      siguienteCompra: m.siguiente_compra_estimada ?? undefined,
      contexto: 'mision',
      alertTipo: at,
      productoSugerido: m.pedido_sugerido?.[0]?.producto ?? null,
      litrosEstimados: m.litros_ultima_compra ?? m.volumen_promedio ?? null,
    })
  }, [])

  const vendedores = useMemo(() => [...new Set(misiones.map(m => dspV(m.vendedor)))], [misiones])

  const tabs: { key: Tab; label: string; count?: number }[] = [
    ...(isAdmin ? [{ key: 'resumen' as Tab, label: 'Resumen Admin' }] : []),
    { key: 'semana',    label: 'Esta semana',    count: misionesFiltradas.filter(m => m.tipo !== 'proxima_semana').length },
    { key: 'calendario', label: 'Calendario' },
    { key: 'proxima',   label: 'Próxima semana', count: proxima.filter(p => { if (!p.siguiente_compra_estimada) return false; const hoy = new Date(); const d7 = new Date(hoy); d7.setDate(d7.getDate()+7); const d14 = new Date(hoy); d14.setDate(d14.getDate()+14); const d = new Date(p.siguiente_compra_estimada + 'T12:00:00'); return d >= d7 && d <= d14 }).length },
    { key: 'historial', label: 'Historial' },
  ]

  // Barra de controles compartida
  const Controles = () => (
    <div style={{ marginBottom: 12 }}>
      {/* Filtro tipo cliente — scroll horizontal, sin label en mobile */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        paddingBottom: 2, marginBottom: 7,
      }}>
        {isDesktop && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', flexShrink: 0 }}>Segmento:</span>}
        <button
          onClick={() => setFiltroTipo(null)}
          style={{ flexShrink: 0, padding: '4px 11px', borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${!filtroTipo ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`, background: !filtroTipo ? 'rgba(212,175,55,0.12)' : 'transparent', color: !filtroTipo ? '#D4AF37' : 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Todos ({misiones.filter(m => !filtroVendedor || dspV(m.vendedor) === filtroVendedor).length})
        </button>
        {(Object.entries(conteosPorTipo) as [TipoCliente, number][]).map(([tipo, count]) => {
          if (count === 0) return null
          const cfg = TIPO_CLIENTE_CFG[tipo]
          const active = filtroTipo === tipo
          return (
            <button key={tipo} onClick={() => setFiltroTipo(active ? null : tipo)} style={{
              flexShrink: 0, padding: '4px 11px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: active ? cfg.bg : 'transparent',
              border: `1px solid ${active ? cfg.border : 'var(--border)'}`,
              color: active ? cfg.color : 'var(--muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}>
              {cfg.icon} {cfg.label} ({count})
            </button>
          )
        })}
      </div>
      {/* Admin: vendedor pills + botón actualizar en una fila */}
      {isAdmin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        }}>
          {vendedores.length > 1 && (
            <>
              <button onClick={() => setFiltroVendedor(null)} style={{
                flexShrink: 0, padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: !filtroVendedor ? 'rgba(212,175,55,0.15)' : 'var(--surface2)',
                border: `1px solid ${!filtroVendedor ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`,
                color: !filtroVendedor ? '#D4AF37' : 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>Todos</button>
              {vendedores.map(v => (
                <button key={v} onClick={() => setFiltroVendedor(v === filtroVendedor ? null : v)} style={{
                  flexShrink: 0, padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: filtroVendedor === v ? 'rgba(96,165,250,0.15)' : 'var(--surface2)',
                  border: `1px solid ${filtroVendedor === v ? 'rgba(96,165,250,0.4)' : 'var(--border)'}`,
                  color: filtroVendedor === v ? '#D4AF37' : 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{v}</button>
              ))}
            </>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onGenerar} disabled={generando} style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 10,
            background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
            color: '#D4AF37', fontSize: 11, fontWeight: 700, cursor: generando ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}>
            <RefreshCw size={12} style={{ animation: generando ? 'spin 1s linear infinite' : 'none' }} />
            {generando ? 'Actualizando…' : isDesktop ? 'Actualizar misiones' : 'Actualizar'}
          </button>
        </div>
      )}
    </div>
  )

  const MOBILE_TAB_LABELS: Record<Tab, string> = {
    resumen: 'Admin', semana: 'Semana', calendario: 'Agenda', proxima: 'Próxima', historial: 'Historial',
  }
  const TabBar = () => (
    <div style={{
      display: 'flex', gap: 4, marginBottom: 14,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4,
      overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
    }}>
      {tabs.map(t => {
        const label = isDesktop ? t.label : MOBILE_TAB_LABELS[t.key]
        return (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flexShrink: 0, padding: isDesktop ? '8px 10px' : '7px 12px', borderRadius: 8, border: 'none',
            background: tab === t.key ? 'rgba(212,175,55,0.12)' : 'transparent',
            color: tab === t.key ? '#D4AF37' : 'var(--muted)',
            fontSize: 11, fontWeight: tab === t.key ? 800 : 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            whiteSpace: 'nowrap',
          }}>
            {label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{
                padding: '1px 5px', borderRadius: 20, fontSize: 9, fontWeight: 800,
                background: tab === t.key ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)',
                color: tab === t.key ? '#D4AF37' : 'var(--muted)',
              }}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )

  // ── Desktop: master-detail ─────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ padding: '20px 24px 40px', maxWidth: 1300, margin: '0 auto' }}>
        <HeaderResumen misiones={misionesFiltradas} misionesTodas={misiones} semana={semana} vendedorActual={vendedorActual} isAdmin={isAdmin} isDesktop />

        <Controles />
        <TabBar />

        {tab === 'semana' && (
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
            {/* Lista izquierda */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, overflow: 'hidden',
              maxHeight: 'calc(100vh - 340px)', overflowY: 'auto',
            }}>
              {misionesFiltradas.filter(m => m.tipo !== 'proxima_semana').length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center' }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>🎉</p>
                  <p style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 700, marginBottom: 4 }}>Sin misiones activas</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>{isAdmin ? 'Genera misiones con el botón Actualizar.' : 'Todos los clientes están al día.'}</p>
                </div>
              ) : (
                <ListaDesktop
                  porTipo={{ ...porTipo, proxima_semana: [] }}
                  selectedId={selectedMision?.id ?? null}
                  onSelect={m => setSelectedMision(m)}
                  onWA={onWA}
                />
              )}
            </div>

            {/* Panel derecho */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 16, overflow: 'hidden', minHeight: 500,
              position: 'sticky', top: 20,
            }}>
              <DetailPanel
                mision={selectedMision}
                onActualizar={onActualizar}
                onWA={onWA}
                loadingId={loadingId}
                onClose={() => setSelectedMision(null)}
                onMarcarInactivo={onMarcarInactivo}
              />
            </div>
          </div>
        )}

        {tab === 'semana' && pospuestosConStock.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <ConStockSection misiones={pospuestosConStock} onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} />
          </div>
        )}
        {tab === 'proxima' && <ProximaView proxima={proxima} isDesktop />}
        {tab === 'historial' && <HistorialView historial={historial} />}
        {tab === 'resumen' && isAdmin && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>}>
            <MisionesAdminDashboard isAdmin={isAdmin} />
          </Suspense>
        )}
        {tab === 'calendario' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>}>
            <CalendarioMensual isAdmin={isAdmin} vendedorActual={vendedorActual} isDesktop />
          </Suspense>
        )}

        {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
        <style>{`
          @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}
        `}</style>
      </div>
    )
  }

  // ── Mobile: columna simple ──────────────────────────────────────────────────
  return (
    <div style={{ padding: '12px 12px 90px', width: '100%', maxWidth: 680, margin: '0 auto', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <AppHeader title="Misiones" />
      <HeaderResumen misiones={misionesFiltradas} misionesTodas={misiones} semana={semana} vendedorActual={vendedorActual} isAdmin={isAdmin} isDesktop={false} />

      <Controles />
      <TabBar />

      {tab === 'semana' && (
        <div>
          {/* CTA: armar la ruta del día con las misiones pendientes */}
          {!isAdmin && (() => {
            const pendientesHoy = misionesFiltradas.filter(m => !esCompletada(m.estado) && m.tipo !== 'proxima_semana')
            if (pendientesHoy.length < 2) return null
            return (
              <button
                onClick={() => {
                  const nombres = pendientesHoy.map(m => m.nombre_fantasia)
                  try { localStorage.setItem('ruta-preload', JSON.stringify(nombres)) } catch {}
                  router.push('/terreno/ruta')
                }}
                style={{
                  width: '100%', minHeight: 52, marginBottom: 12,
                  background: 'linear-gradient(135deg, #E5C45A, #B8962E)',
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  color: '#080808', fontSize: 14, fontWeight: 900, letterSpacing: '-0.2px',
                  boxShadow: '0 4px 18px rgba(212,175,55,0.3)',
                }}
              >
                <Navigation size={17} />
                Armar mi ruta del día · {pendientesHoy.length} clientes
              </button>
            )
          })()}
          <SeccionMisiones tipo="vencido"      misiones={porTipo.vencido}      onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} onMarcarInactivo={onMarcarInactivo} isDesktop={isDesktop} />
          <SeccionMisiones tipo="esta_semana"  misiones={porTipo.esta_semana}  onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} onMarcarInactivo={onMarcarInactivo} isDesktop={isDesktop} />
          {misionesFiltradas.filter(m => m.tipo !== 'proxima_semana').length === 0 && pospuestosConStock.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>🎉</p>
              <p style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 700, marginBottom: 4 }}>Sin misiones activas</p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>{isAdmin ? 'Genera misiones con el botón Actualizar.' : 'Todos los clientes al día.'}</p>
            </div>
          )}
          <ConStockSection misiones={pospuestosConStock} onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} />
        </div>
      )}

      {tab === 'proxima'   && <ProximaView   proxima={proxima} isDesktop={false} />}
      {tab === 'historial' && <HistorialView  historial={historial} />}
      {tab === 'resumen' && isAdmin && (
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>}>
          <MisionesAdminDashboard isAdmin={isAdmin} />
        </Suspense>
      )}
      {tab === 'calendario' && (
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>}>
          <CalendarioMensual isAdmin={isAdmin} vendedorActual={vendedorActual} isDesktop={false} />
        </Suspense>
      )}

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}
      `}</style>
    </div>
  )
}
