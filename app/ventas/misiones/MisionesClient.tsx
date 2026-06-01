'use client'

import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react'
const MisionesAdminDashboard = lazy(() => import('./MisionesAdminDashboard'))
const CalendarioMensual = lazy(() => import('./CalendarioMensual'))
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import {
  CheckCircle2, Phone, PhoneOff, MessageCircle, RefreshCw, Calendar,
  ChevronDown, ChevronRight, Target, Minus, Plus, ArrowLeft, Sparkles, UserX,
} from 'lucide-react'
import type { MisionEnriquecida, ProximaPreview, HistorialSemana, EstadoMision, TipoMision } from './page'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import { SEG_COLOR } from '@/lib/theme'

// ── Paleta — SEG_COLOR importado de lib/theme (fuente única) ─────────────────
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const TIPO_CFG: Record<TipoMision, { label: string; color: string; bg: string; border: string; icon: string; desc: string }> = {
  esta_semana:    { label: 'Esta semana',    color: '#D4AF37', bg: 'rgba(212,175,55,0.08)',  border: 'rgba(212,175,55,0.3)',  icon: '📅', desc: 'Compra estimada esta semana' },
  proxima_semana: { label: 'Próxima semana', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.3)', icon: '📆', desc: 'Compra estimada próxima semana' },
  vencido:        { label: 'Llama ahora',    color: '#F87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', icon: '🚨', desc: 'Ya se pasó su ciclo de compra' },
}

const ESTADO_CFG: Record<EstadoMision, { label: string; color: string; icon: string }> = {
  pendiente:              { label: 'Sin contactar',  color: '#6B7280', icon: '○' },
  contactado_pedido:      { label: 'Hizo pedido ✓', color: '#34D399', icon: '✓' },
  contactado_sin_pedido:  { label: 'Contactado',    color: '#F59E0B', icon: '📞' },
  sin_respuesta:          { label: 'Sin respuesta',  color: '#94A3B8', icon: '🔇' },
  pospuesto:              { label: 'Pospuesto',      color: '#A78BFA', icon: '⏰' },
  auto_completado:        { label: 'Compró ✓ (auto)', color: '#34D399', icon: '⚡' },
}

const DIAS_POSPONER = [3, 5, 7, 14]

// ── Segmentación de clientes ─────────────────────────────────────────────────
type TipoCliente = 'activo' | 'inactivo' | 'temporal' | 'nuevo'

const TIPO_CLIENTE_CFG: Record<TipoCliente, {
  label: string; color: string; bg: string; border: string
  icon: string; estrategia: string
}> = {
  activo:   { label: 'Activo',   color: '#34D399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)',  icon: '🟢', estrategia: 'Recompra habitual — contactar para siguiente pedido.' },
  inactivo: { label: 'Inactivo', color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', icon: '🔴', estrategia: 'Cliente en riesgo de abandono — ofrecer propuesta de recuperación.' },
  temporal: { label: 'Temporal', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  icon: '🟡', estrategia: 'Comprador esporádico — evaluar necesidad y construir relación.' },
  nuevo:    { label: 'Nuevo',    color: '#60A5FA', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)',  icon: '🔵', estrategia: 'Primer seguimiento — entender preferencias y fidelizar.' },
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
  return `En ${m.dias_para_compra}d`
}

// ── Donut progreso ────────────────────────────────────────────────────────────
function ProgressDonut({ done, total, size = 90 }: { done: number; total: number; size?: number }) {
  const pct   = total > 0 ? done / total : 0
  const r     = (size - 14) / 2; const cx = size / 2
  const circ  = 2 * Math.PI * r
  const dash  = circ * pct
  const color = pct >= 0.8 ? '#34D399' : pct >= 0.5 ? '#F59E0B' : '#D4AF37'
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

// ── Botones de acción ─────────────────────────────────────────────────────────
function BotonesAccion({ mision, onActualizar, loading }: {
  mision: MisionEnriquecida
  onActualizar: OnActualizar
  loading: boolean
}) {
  const [diasPosp, setDiasPosp] = useState(5)
  const isPedido = mision.estado === 'contactado_pedido'

  const acciones: { estado: EstadoMision; label: string; color: string; icon: React.ReactNode }[] = [
    { estado: 'contactado_pedido',     label: 'Hizo pedido',   color: '#34D399', icon: <CheckCircle2 size={13}/> },
    { estado: 'contactado_sin_pedido', label: 'Contactado',    color: '#F59E0B', icon: <Phone size={13}/> },
    { estado: 'sin_respuesta',         label: 'Sin respuesta', color: '#94A3B8', icon: <PhoneOff size={13}/> },
  ]

  if (isPedido) {
    return (
      <button onClick={() => onActualizar(mision.id, 'pendiente')} disabled={loading} style={{
        padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
        background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)',
        color: '#34D399', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <CheckCircle2 size={13}/> Hizo pedido — Deshacer
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {acciones.map(a => (
          <button key={a.estado} onClick={() => onActualizar(mision.id, a.estado)} disabled={loading} style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: mision.estado === a.estado ? `${a.color}20` : 'var(--surface2)',
            border: `1px solid ${mision.estado === a.estado ? `${a.color}50` : 'var(--border)'}`,
            color: mision.estado === a.estado ? a.color : 'var(--muted)',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { if (!loading && mision.estado !== a.estado) (e.currentTarget as HTMLElement).style.borderColor = `${a.color}50` }}
            onMouseLeave={e => { if (mision.estado !== a.estado) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {/* Posponer — aún tiene stock */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12,
        background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.25)',
      }}>
        <span style={{ fontSize: 16 }}>⏰</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#A78BFA', flex: 1 }}>Aún con stock</span>
        <select
          value={diasPosp}
          onChange={e => setDiasPosp(Number(e.target.value))}
          disabled={loading}
          style={{
            background: 'var(--surface2)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 8,
            color: '#A78BFA', fontSize: 12, fontWeight: 700, padding: '5px 8px', cursor: 'pointer', outline: 'none',
          }}
        >
          {DIAS_POSPONER.map(d => <option key={d} value={d} style={{ background: 'var(--surface)' }}>{d} días</option>)}
        </select>
        <button
          onClick={() => onActualizar(mision.id, 'pospuesto', { dias: diasPosp })}
          disabled={loading}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800,
            background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.4)',
            color: '#A78BFA', cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          Posponer
        </button>
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
  const tipoCfg   = TIPO_CFG[mision.tipo]
  const estadoCfg = ESTADO_CFG[mision.estado]
  const loading   = loadingId === mision.id || saving
  const isDone    = esCompletada(mision.estado)

  // Sugerencia predictiva basada en urgencia
  const sugerencia = (() => {
    const litros = mision.litros_ultima_compra ?? mision.volumen_promedio
    if (mision.tipo === 'vencido' && litros)   return `Ofrecer Promo Recuperación ${litros}L.`
    if (mision.tipo === 'esta_semana' && litros) return `Recordar pedido habitual de ${litros}L.`
    if (litros)                                  return `Contactar para pedido estimado de ${litros}L.`
    return 'Contactar para evaluar necesidades actuales.'
  })()

  return (
    <div style={{ padding: '20px 22px', height: '100%', overflowY: 'auto' }}>

      {/* ── Header: nombre + criticidad + contacto ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: tipoCfg.color, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
              Detalle de Misión — <span style={{ color: tipoCfg.color }}>{tipoCfg.label}</span>
            </p>
            <h2 style={{
              fontSize: 17, fontWeight: 900, color: isDone ? '#34D399' : 'var(--cream)',
              textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.2,
            }}>
              {mision.nombre_fantasia}
            </h2>
          </div>
          {/* Seg badge */}
          <div style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
            background: `${segColor}18`, border: `2px solid ${segColor}40`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: segColor, lineHeight: 1 }}>{mision.segmento}</span>
            <span style={{ fontSize: 8, color: segColor, opacity: 0.7 }}>{mision.score}</span>
          </div>
        </div>

        {/* Contacto + acciones de contacto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: 'var(--cream)',
          }}>
            {(mision.nombre_fantasia).charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>
              {mision.nombre_fantasia.split(' ').slice(0, 2).join(' ')}
            </p>
            {mision.localidad && <p style={{ fontSize: 10, color: 'var(--muted)' }}>📍 {mision.localidad}</p>}
          </div>
          {mision.telefono && (
            <button onClick={() => window.open(`tel:${mision.telefono}`)} style={quickBtn('#60A5FA')}>
              <Phone size={14} />
            </button>
          )}
          {mision.telefono && (
            <button onClick={() => onWA(mision)} style={quickBtn('#25D166')}>
              <MessageCircle size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 16 }} />

      {/* ── Tipo de cliente + estrategia ── */}
      {mision.tipo_cliente && (() => {
        const tc = TIPO_CLIENTE_CFG[mision.tipo_cliente as TipoCliente]
        return (
          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 12, background: tc.bg, border: `1px solid ${tc.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{tc.icon}</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, color: tc.color, marginBottom: 2 }}>Cliente {tc.label}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>{tc.estrategia}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Contexto Predictivo ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Sparkles size={13} style={{ color: '#D4AF37' }} />
          <p style={{ fontSize: 11, fontWeight: 800, color: '#D4AF37', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
            Contexto Predictivo
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 4 }}>
          {mision.litros_ultima_compra != null && mision.ultima_venta_fecha && (
            <p style={{ fontSize: 12, color: 'var(--cream)' }}>
              Último pedido: <strong>{mision.litros_ultima_compra}L</strong>{' '}
              <span style={{ color: 'var(--muted)' }}>({fFecha(mision.ultima_venta_fecha)})</span>
            </p>
          )}
          {mision.ciclo_promedio_dias && (
            <p style={{ fontSize: 12, color: 'var(--cream)' }}>
              Frecuencia Promedio: <strong>Cada {mision.ciclo_promedio_dias}d</strong>
            </p>
          )}
          {mision.siguiente_compra_estimada && (
            <p style={{ fontSize: 12, color: 'var(--cream)' }}>
              Predicción de Stock:{' '}
              <strong style={{ color: tipoCfg.color }}>
                {mision.litros_ultima_compra != null ? '0L' : '?'} el {fFecha(mision.siguiente_compra_estimada)}
              </strong>
              {(mision.dias_para_compra ?? 0) < 0 && (
                <span style={{ color: '#F87171' }}>{' '}(Venció hace {Math.abs(mision.dias_para_compra ?? 0)}d)</span>
              )}
            </p>
          )}
          {mision.volumen_caida_pct != null && (
            <p style={{ fontSize: 12, color: '#F87171', fontWeight: 700 }}>
              📉 Volumen a la baja: pidió −{mision.volumen_caida_pct}% vs su histórico
            </p>
          )}
          <p style={{ fontSize: 12, color: '#D4AF37', fontWeight: 600 }}>
            💡 {sugerencia}
          </p>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 16 }} />

      {/* ── Registrar Llamada ── */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
          Registrar Llamada
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Fila 1: Venta Cerrada + litros */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
            background: isDone ? 'rgba(52,211,153,0.1)' : 'rgba(52,211,153,0.05)',
            border: `1px solid ${isDone ? 'rgba(52,211,153,0.4)' : 'rgba(52,211,153,0.15)'}`,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
            onClick={() => !loading && !isDone && registrar('contactado_pedido', { litros: litrosInput })}
          >
            <CheckCircle2 size={16} color="#34D399" />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: isDone ? '#34D399' : 'var(--cream)' }}>
              Venta Cerrada
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setLitrosInput(v => Math.max(1, v - 5))} style={counterBtn}>
                <Minus size={12} />
              </button>
              <input
                type="number" min={1} step={5} value={litrosInput}
                onChange={e => setLitrosInput(Number(e.target.value))}
                style={{
                  width: 52, textAlign: 'center', background: 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  color: '#34D399', fontSize: 13, fontWeight: 800, padding: '5px 0',
                  outline: 'none',
                }}
              />
              <button onClick={() => setLitrosInput(v => v + 5)} style={counterBtn}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Fila 2: Posponer + días */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
            background: mision.estado === 'pospuesto' ? 'rgba(167,139,250,0.1)' : 'rgba(167,139,250,0.05)',
            border: `1px solid ${mision.estado === 'pospuesto' ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.15)'}`,
          }}>
            <span style={{ fontSize: 16 }}>⏰</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: mision.estado === 'pospuesto' ? '#A78BFA' : 'var(--cream)' }}>
              Aún con Stock — Posponer
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={diasPosp}
                onChange={e => setDiasPospD(Number(e.target.value))}
                disabled={loading}
                style={{
                  background: 'var(--surface2)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 8,
                  color: '#A78BFA', fontSize: 12, fontWeight: 700, padding: '5px 8px', cursor: 'pointer', outline: 'none',
                }}
              >
                {DIAS_POSPONER.map(d => <option key={d} value={d} style={{ background: 'var(--surface)' }}>{d} días</option>)}
              </select>
              <button
                onClick={() => !loading && registrar('pospuesto', { dias: diasPosp })}
                disabled={loading}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                  background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.4)',
                  color: '#A78BFA', cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>

          {/* Fila 3: No Contestó + intentos */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12,
            background: mision.estado === 'sin_respuesta' ? 'rgba(248,113,113,0.08)' : 'rgba(248,113,113,0.04)',
            border: `1px solid ${mision.estado === 'sin_respuesta' ? 'rgba(248,113,113,0.35)' : 'rgba(248,113,113,0.12)'}`,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
            onClick={() => !loading && registrar('sin_respuesta')}
          >
            <PhoneOff size={16} color="#F87171" />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: mision.estado === 'sin_respuesta' ? '#F87171' : 'var(--cream)' }}>
              No Contestó
            </span>
            <span style={{
              minWidth: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: mision.estado === 'sin_respuesta' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.05)',
              fontSize: 12, fontWeight: 800, color: '#F87171',
            }}>
              {mision.intentos_contacto ?? 0}
            </span>
          </div>

        </div>

        {/* Nota */}
        {mision.nota && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <p style={{ fontSize: 11, color: '#A08830', fontStyle: 'italic' }}>💬 {mision.nota}</p>
          </div>
        )}

        {/* Botones finales */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => !loading && registrar(isDone ? 'pendiente' : 'contactado_sin_pedido')}
            disabled={loading}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 12, fontSize: 13, fontWeight: 800,
              background: '#D4AF37', border: 'none', color: '#1a1200',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Guardando…' : isDone ? '↩ Deshacer' : 'Actualizar Misión'}
          </button>
          {onClose && (
            <button onClick={onClose} style={{
              padding: '11px 18px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
            }}>
              <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Volver
            </button>
          )}
        </div>

        {/* Marcar inactivo */}
        {onMarcarInactivo && (
          <button
            onClick={() => {
              if (window.confirm(`¿Marcar a "${mision.nombre_fantasia}" como INACTIVO? Dejará de aparecer en misiones.`)) {
                onMarcarInactivo(mision)
              }
            }}
            disabled={loading}
            style={{
              marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 10,
              background: 'transparent', border: '1px solid rgba(248,113,113,0.25)',
              color: '#F87171', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <UserX size={13} /> Marcar cliente como inactivo
          </button>
        )}
      </div>
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
        borderLeft: selected ? '3px solid #D4AF37' : `3px solid ${isDone ? '#34D39930' : 'transparent'}`,
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
            fontSize: 13, fontWeight: 700, color: isDone ? '#34D399' : 'var(--cream)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 2, textDecoration: isDone ? 'line-through' : 'none',
          }}>
            {mision.nombre_fantasia}
            {contexto && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, marginLeft: 5 }}>({contexto})</span>}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: estadoCfg.color, fontWeight: 600 }}>○ {dl ?? estadoCfg.label}</span>
            {mision.score != null && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: `${segColor}18`, color: segColor }}>
                {mision.score}. {mision.prioridad}
              </span>
            )}
            <TipoClienteBadge tipo={mision.tipo_cliente} size="xs" />
            {mision.volumen_caida_pct != null && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: 'rgba(248,113,113,0.12)', color: '#F87171', whiteSpace: 'nowrap' }}>
                📉 −{mision.volumen_caida_pct}%
              </span>
            )}
          </div>
        </div>

        {/* Botones rápidos */}
        {!isDone && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {mision.telefono && (
              <button
                onClick={e => { e.stopPropagation(); window.open(`tel:${mision.telefono}`) }}
                style={quickBtn('#60A5FA')}
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
function MisionCard({ mision, onActualizar, onWA, loadingId, onMarcarInactivo }: {
  mision: MisionEnriquecida
  onActualizar: OnActualizar
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
  onMarcarInactivo?: (m: MisionEnriquecida) => void
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
      background: isPedido ? 'rgba(52,211,153,0.04)' : 'var(--surface)',
      border: `1px solid ${isPedido ? 'rgba(52,211,153,0.2)' : 'var(--border)'}`,
      borderRadius: 16, opacity: isPedido ? 0.75 : 1,
    }}>
      {/* Header clickable */}
      <div onClick={() => setOpen(v => !v)} style={{
        padding: '13px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: `${segColor}18`, border: `2px solid ${segColor}40`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: segColor, lineHeight: 1 }}>{mision.segmento}</span>
          <span style={{ fontSize: 8, color: segColor, opacity: 0.7 }}>{mision.score}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 13, fontWeight: 800, color: isPedido ? '#34D399' : 'var(--cream)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textDecoration: isPedido ? 'line-through' : 'none',
            }}>{mision.nombre_fantasia}</span>
            {mision.litros_ultima_compra != null && !isPedido && (
              <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                ({mision.litros_ultima_compra}L{mision.dias_sin_compra ? ` · ${mision.dias_sin_compra}d` : ''})
              </span>
            )}
            {isPedido && <CheckCircle2 size={13} color="#34D399" />}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: estadoCfg.color, fontWeight: 600 }}>{estadoCfg.icon} {estadoCfg.label}</span>
            {dl && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20, background: tipoCfg.bg, color: tipoCfg.color }}>
                {dl}
              </span>
            )}
            <TipoClienteBadge tipo={mision.tipo_cliente} size="xs" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!isPedido && (
            <button onClick={e => { e.stopPropagation(); onWA(mision) }} style={{
              width: 30, height: 30, borderRadius: '50%',
              border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <MessageCircle size={14} color="#25D166" />
            </button>
          )}
          {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
        </div>
      </div>

      {/* Detalle */}
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          <div className="kpi-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0' }}>
            {[
              { label: 'Sin comprar', value: `${mision.dias_sin_compra}d`, color: mision.tipo === 'vencido' ? '#F87171' : 'var(--cream)' },
              { label: 'Último pedido', value: fFecha(mision.ultima_venta_fecha), color: 'var(--cream)' },
              { label: 'Venta', value: fPeso(mision.ultima_venta_monto), color: '#D4AF37' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
                <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{label}</p>
                <p style={{ fontSize: 12, fontWeight: 800, color }}>{value}</p>
              </div>
            ))}
          </div>
          {mision.siguiente_compra_estimada && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              <Calendar size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Próxima compra: <strong style={{ color: tipoCfg.color }}>{fFecha(mision.siguiente_compra_estimada)}</strong>
            </p>
          )}
          {mision.nota && (
            <div style={{ padding: '7px 10px', borderRadius: 10, background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: '#A08830', fontStyle: 'italic' }}>💬 {mision.nota}</p>
            </div>
          )}
          <BotonesAccion mision={mision} onActualizar={onActualizar} loading={loading} />
          {onMarcarInactivo && (
            <button
              onClick={() => {
                if (window.confirm(`¿Marcar a "${mision.nombre_fantasia}" como INACTIVO?`)) onMarcarInactivo(mision)
              }}
              disabled={loading}
              style={{
                marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 10,
                background: 'transparent', border: '1px solid rgba(248,113,113,0.25)',
                color: '#F87171', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <UserX size={12} /> Marcar inactivo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Header resumen ────────────────────────────────────────────────────────────
function HeaderResumen({ misiones, semana, vendedorActual, isAdmin, isDesktop }: {
  misiones: MisionEnriquecida[]
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
  const pColor  = pct >= 80 ? '#34D399' : pct >= 50 ? '#F59E0B' : '#D4AF37'

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0D0A00 0%, #1C1500 100%)',
      border: '1px solid rgba(212,175,55,0.2)',
      borderRadius: 20, padding: isDesktop ? '20px 28px' : '16px 18px', marginBottom: 20,
    }}>
      {/* Fila superior: título + global status */}
      <div style={{ display: 'flex', alignItems: isDesktop ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
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
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#34D399', lineHeight: 1 }}>{pct}%</p>
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
              <span>Volumen Rescatado: <strong style={{ color: '#34D399' }}>{volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} Litros</strong></span>
            )}
          </div>
        </div>
      )}
      {/* Admin: solo volumen si hay */}
      {isAdmin && volumen > 0 && (
        <p style={{ fontSize: 12, color: '#34D399', fontWeight: 700, marginBottom: 14 }}>
          💧 Volumen rescatado: {volumen.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L
        </p>
      )}

      {/* KPI chips */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 8 }}>
        {[
          { label: '🚨 Llama ahora', value: vencidos, color: '#F87171', urgent: vencidos > 0 },
          { label: '📅 Esta semana', value: esSem,    color: '#D4AF37', urgent: false },
          { label: '📆 Próxima sem.', value: proxSem, color: '#60A5FA', urgent: false },
          { label: '✓ Con pedido',   value: pedidos,  color: '#34D399', urgent: false },
        ].map(({ label, value, color, urgent }) => (
          <div key={label} style={{
            background: urgent && value > 0 ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${urgent && value > 0 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 12, padding: isDesktop ? '12px 14px' : '10px 12px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: isDesktop ? 26 : 22, fontWeight: 900, color }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sección mobile ────────────────────────────────────────────────────────────
function SeccionMisiones({ tipo, misiones, onActualizar, onWA, loadingId, onMarcarInactivo, defaultOpen = true }: {
  tipo: TipoMision
  misiones: MisionEnriquecida[]
  onActualizar: OnActualizar
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
  onMarcarInactivo?: (m: MisionEnriquecida) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!misiones.length) return null
  const cfg = TIPO_CFG[tipo]
  const pendientes  = misiones.filter(m => !esCompletada(m.estado)).length
  const completadas = misiones.filter(m => esCompletada(m.estado)).length

  return (
    <div style={{ marginBottom: 18 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: open ? 10 : 0, padding: '9px 14px', borderRadius: 12,
        border: `1px solid ${cfg.border}`, background: cfg.bg, cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 15 }}>{cfg.icon}</span>
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
            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(52,211,153,0.12)', color: '#34D399' }}>
              {completadas} ✓
            </span>
          )}
          {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
        </div>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {misiones.map(m => (
            <MisionCard key={m.id} mision={m} onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} onMarcarInactivo={onMarcarInactivo} />
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
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#34D399' : '#D4AF37', borderRadius: 4 }} />
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
        <p style={{ fontSize: 32, marginBottom: 10 }}>📆</p>
        <p style={{ fontSize: 14, color: 'var(--cream)', fontWeight: 700, marginBottom: 6 }}>Sin predicciones para la próxima semana</p>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Los clientes aparecerán aquí cuando su compra estimada caiga en los próximos 7–14 días.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '10px 14px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: '#60A5FA', fontWeight: 700 }}>
          📆 {enVentana.length} clientes con compra estimada la próxima semana — contáctalos antes de que llegue su ciclo
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
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.vendedor_actual.split(' ')[0]}</span>
                  {diasRestantes !== null && <span style={{ fontSize: 10, fontWeight: 700, color: '#60A5FA' }}>En {diasRestantes}d</span>}
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
              <span style={{ fontSize: 13 }}>{cfg.icon}</span>
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

  const misionesFiltradas = useMemo(() => {
    let base = !filtroVendedor ? misiones : misiones.filter(m => m.vendedor === filtroVendedor)
    if (filtroTipo) base = base.filter(m => m.tipo_cliente === filtroTipo)
    return base
  }, [misiones, filtroVendedor, filtroTipo])

  // Conteos por tipo para el filtro UI
  const conteosPorTipo = useMemo(() => {
    const base = !filtroVendedor ? misiones : misiones.filter(m => m.vendedor === filtroVendedor)
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
    for (const key of Object.keys(grupos) as TipoMision[]) {
      grupos[key].sort((a, b) => {
        const oa = orden.indexOf(a.estado); const ob = orden.indexOf(b.estado)
        if (oa !== ob) return oa - ob
        const pa = a.prioridad_calculada ?? a.score ?? 0
        const pb = b.prioridad_calculada ?? b.score ?? 0
        return pb - pa
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
    setWaTarget({ nombre: m.nombre_fantasia, telefono: m.telefono ?? undefined, cicloPromedioDias: m.ciclo_promedio_dias ?? undefined, siguienteCompra: m.siguiente_compra_estimada ?? undefined, contexto: 'mision' })
  }, [])

  const vendedores = useMemo(() => [...new Set(misiones.map(m => m.vendedor))], [misiones])

  const tabs: { key: Tab; label: string; count?: number }[] = [
    ...(isAdmin ? [{ key: 'resumen' as Tab, label: '📊 Resumen Admin' }] : []),
    { key: 'semana',    label: 'Esta semana',    count: misionesFiltradas.filter(m => m.tipo !== 'proxima_semana').length },
    { key: 'calendario', label: '📅 Calendario' },
    { key: 'proxima',   label: 'Próxima semana', count: proxima.filter(p => { if (!p.siguiente_compra_estimada) return false; const hoy = new Date(); const d7 = new Date(hoy); d7.setDate(d7.getDate()+7); const d14 = new Date(hoy); d14.setDate(d14.getDate()+14); const d = new Date(p.siguiente_compra_estimada + 'T12:00:00'); return d >= d7 && d <= d14 }).length },
    { key: 'historial', label: 'Historial' },
  ]

  // Barra de controles compartida
  const Controles = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      {/* Filtro de tipo de cliente */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Tipo cliente:</span>
        <button
          onClick={() => setFiltroTipo(null)}
          style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1px solid ${!filtroTipo ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`, background: !filtroTipo ? 'rgba(212,175,55,0.12)' : 'transparent', color: !filtroTipo ? '#D4AF37' : 'var(--muted)', cursor: 'pointer' }}
        >
          Todos ({misiones.filter(m => !filtroVendedor || m.vendedor === filtroVendedor).length})
        </button>
        {(Object.entries(conteosPorTipo) as [TipoCliente, number][]).map(([tipo, count]) => {
          if (count === 0) return null
          const cfg = TIPO_CLIENTE_CFG[tipo]
          const active = filtroTipo === tipo
          return (
            <button
              key={tipo}
              onClick={() => setFiltroTipo(active ? null : tipo)}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: active ? cfg.bg : 'transparent',
                border: `1px solid ${active ? cfg.border : 'var(--border)'}`,
                color: active ? cfg.color : 'var(--muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {cfg.icon} {cfg.label} ({count})
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {isAdmin && vendedores.length > 1 && (
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => setFiltroVendedor(null)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: !filtroVendedor ? 'rgba(212,175,55,0.15)' : 'var(--surface2)',
            border: `1px solid ${!filtroVendedor ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`,
            color: !filtroVendedor ? '#D4AF37' : 'var(--muted)', cursor: 'pointer',
          }}>Todos</button>
          {vendedores.map(v => (
            <button key={v} onClick={() => setFiltroVendedor(v === filtroVendedor ? null : v)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: filtroVendedor === v ? 'rgba(96,165,250,0.15)' : 'var(--surface2)',
              border: `1px solid ${filtroVendedor === v ? 'rgba(96,165,250,0.4)' : 'var(--border)'}`,
              color: filtroVendedor === v ? '#60A5FA' : 'var(--muted)', cursor: 'pointer',
            }}>{v.split(' ')[0]}</button>
          ))}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {isAdmin && (
        <button onClick={onGenerar} disabled={generando} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 10,
          background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
          color: '#D4AF37', fontSize: 11, fontWeight: 700, cursor: generando ? 'not-allowed' : 'pointer',
        }}>
          <RefreshCw size={13} style={{ animation: generando ? 'spin 1s linear infinite' : 'none' }} />
          {generando ? 'Actualizando…' : 'Actualizar misiones'}
        </button>
      )}
      </div>
    </div>
  )

  const TabBar = () => (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{
          flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none',
          background: tab === t.key ? 'rgba(212,175,55,0.12)' : 'transparent',
          color: tab === t.key ? '#D4AF37' : 'var(--muted)',
          fontSize: 11, fontWeight: tab === t.key ? 800 : 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}>
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span style={{
              padding: '1px 6px', borderRadius: 20, fontSize: 9, fontWeight: 800,
              background: tab === t.key ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)',
              color: tab === t.key ? '#D4AF37' : 'var(--muted)',
            }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )

  // ── Desktop: master-detail ─────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ padding: '20px 24px 40px', maxWidth: 1300, margin: '0 auto' }}>
        <HeaderResumen misiones={misionesFiltradas} semana={semana} vendedorActual={vendedorActual} isAdmin={isAdmin} isDesktop />

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
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  // ── Mobile: columna simple ──────────────────────────────────────────────────
  return (
    <div style={{ padding: '12px 12px 80px', maxWidth: 680, margin: '0 auto' }}>
      <HeaderResumen misiones={misionesFiltradas} semana={semana} vendedorActual={vendedorActual} isAdmin={isAdmin} isDesktop={false} />

      <Controles />
      <TabBar />

      {tab === 'semana' && (
        <div>
          <SeccionMisiones tipo="vencido"      misiones={porTipo.vencido}      onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} onMarcarInactivo={onMarcarInactivo} />
          <SeccionMisiones tipo="esta_semana"  misiones={porTipo.esta_semana}  onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} onMarcarInactivo={onMarcarInactivo} />
          {misionesFiltradas.filter(m => m.tipo !== 'proxima_semana').length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>🎉</p>
              <p style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 700, marginBottom: 4 }}>Sin misiones activas</p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>{isAdmin ? 'Genera misiones con el botón Actualizar.' : 'Todos los clientes al día.'}</p>
            </div>
          )}
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
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
