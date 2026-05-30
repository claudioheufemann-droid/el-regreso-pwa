'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import {
  CheckCircle2, Phone, PhoneOff, MessageCircle, RefreshCw, Calendar,
  Clock, ChevronDown, ChevronRight, AlertTriangle, Zap, Target, X,
  TrendingUp, Star,
} from 'lucide-react'
import type { MisionEnriquecida, ProximaPreview, HistorialSemana, EstadoMision, TipoMision } from './page'
import WAModal, { type WATarget } from '@/components/ui/WAModal'

// ── Paleta ────────────────────────────────────────────────────────────────────
const SEG_COLOR: Record<string, string> = {
  A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171',
}
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

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
  return `${d.getDate()} ${MESES[d.getMonth()]} — ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`
}

// ── Config por tipo de misión ──────────────────────────────────────────────────
const TIPO_CFG: Record<TipoMision, { label: string; color: string; bg: string; border: string; icon: string; desc: string }> = {
  esta_semana:    { label: 'Esta semana',    color: '#D4AF37', bg: 'rgba(212,175,55,0.08)',  border: 'rgba(212,175,55,0.3)',  icon: '📅', desc: 'Compra estimada esta semana' },
  proxima_semana: { label: 'Próxima semana', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.3)', icon: '📆', desc: 'Compra estimada la próxima semana' },
  vencido:        { label: '🚨 Llama ahora', color: '#F87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', icon: '🚨', desc: 'Ya se pasó su ciclo de compra' },
}

// ── Config por estado ──────────────────────────────────────────────────────────
const ESTADO_CFG: Record<EstadoMision, { label: string; color: string; icon: string }> = {
  pendiente:              { label: 'Sin contactar',  color: '#6B7280', icon: '○' },
  contactado_pedido:      { label: 'Hizo pedido ✓', color: '#34D399', icon: '✓' },
  contactado_sin_pedido:  { label: 'Contactado',    color: '#F59E0B', icon: '📞' },
  sin_respuesta:          { label: 'Sin respuesta',  color: '#94A3B8', icon: '🔇' },
}

// ── Donut progreso ────────────────────────────────────────────────────────────
function ProgressDonut({ done, total, size = 100 }: { done: number; total: number; size?: number }) {
  const pct = total > 0 ? done / total : 0
  const r = (size - 14) / 2; const cx = size / 2
  const circ = 2 * Math.PI * r
  const dash = circ * pct
  const color = pct >= 0.8 ? '#34D399' : pct >= 0.5 ? '#F59E0B' : '#D4AF37'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}/>
      <text x={cx} y={cx - 4} textAnchor="middle" fontSize={size * 0.22} fontWeight="900" fill="var(--cream)">{done}</text>
      <text x={cx} y={cx + size * 0.17} textAnchor="middle" fontSize={size * 0.12} fill="var(--muted)">/ {total}</text>
    </svg>
  )
}

// ── Botones de acción del vendedor ────────────────────────────────────────────
function BotonesAccion({
  mision, onActualizar, loading,
}: {
  mision: MisionEnriquecida
  onActualizar: (id: string, estado: EstadoMision, nota?: string) => Promise<void>
  loading: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const acciones: { estado: EstadoMision; label: string; color: string; icon: React.ReactNode }[] = [
    { estado: 'contactado_pedido',     label: 'Hizo pedido',    color: '#34D399', icon: <CheckCircle2 size={14}/> },
    { estado: 'contactado_sin_pedido', label: 'Contactado',     color: '#F59E0B', icon: <Phone size={14}/> },
    { estado: 'sin_respuesta',         label: 'Sin respuesta',  color: '#94A3B8', icon: <PhoneOff size={14}/> },
  ]

  const isPedido = mision.estado === 'contactado_pedido'

  if (isPedido) {
    return (
      <button
        onClick={() => onActualizar(mision.id, 'pendiente')}
        disabled={loading}
        style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)',
          color: '#34D399', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <CheckCircle2 size={12}/> Hizo pedido — Deshacer
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {acciones.map(a => (
          <button
            key={a.estado}
            onClick={() => onActualizar(mision.id, a.estado)}
            disabled={loading}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: mision.estado === a.estado ? `${a.color}20` : 'var(--surface2)',
              border: `1px solid ${mision.estado === a.estado ? `${a.color}50` : 'var(--border)'}`,
              color: mision.estado === a.estado ? a.color : 'var(--muted)',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!loading && mision.estado !== a.estado) (e.currentTarget as HTMLElement).style.borderColor = `${a.color}50` }}
            onMouseLeave={e => { if (mision.estado !== a.estado) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Tarjeta de misión ─────────────────────────────────────────────────────────
function MisionCard({
  mision, onActualizar, onWA, loadingId,
}: {
  mision: MisionEnriquecida
  onActualizar: (id: string, estado: EstadoMision, nota?: string) => Promise<void>
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
}) {
  const [open, setOpen] = useState(false)
  const segColor = SEG_COLOR[mision.segmento] ?? '#6B7280'
  const tipoCfg  = TIPO_CFG[mision.tipo]
  const estadoCfg = ESTADO_CFG[mision.estado]
  const loading = loadingId === mision.id
  const isPedido = mision.estado === 'contactado_pedido'

  const diasLabel = mision.dias_para_compra !== null
    ? mision.dias_para_compra < 0
      ? `Venció hace ${Math.abs(mision.dias_para_compra)}d`
      : mision.dias_para_compra === 0
      ? 'Compra hoy'
      : `En ${mision.dias_para_compra}d`
    : null

  return (
    <div style={{
      background: isPedido ? 'rgba(52,211,153,0.04)' : 'var(--surface)',
      border: `1px solid ${isPedido ? 'rgba(52,211,153,0.2)' : 'var(--border)'}`,
      borderRadius: 16,
      opacity: isPedido ? 0.7 : 1,
      transition: 'all 0.2s',
    }}>
      {/* Header — siempre visible */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        {/* Score + segmento */}
        <div style={{
          width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
          background: `${segColor}18`, border: `2px solid ${segColor}40`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: segColor, lineHeight: 1 }}>{mision.segmento}</span>
          <span style={{ fontSize: 8, color: segColor, opacity: 0.7, fontWeight: 700 }}>{mision.score}</span>
        </div>

        {/* Info principal */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{
              fontSize: 14, fontWeight: 800, color: isPedido ? '#34D399' : 'var(--cream)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textDecoration: isPedido ? 'line-through' : 'none',
            }}>
              {mision.nombre_fantasia}
            </span>
            {isPedido && <CheckCircle2 size={14} color="#34D399" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Estado */}
            <span style={{ fontSize: 10, fontWeight: 700, color: estadoCfg.color }}>
              {estadoCfg.icon} {estadoCfg.label}
            </span>
            {/* Días para compra */}
            {diasLabel && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 20,
                background: tipoCfg.bg, color: tipoCfg.color, border: `1px solid ${tipoCfg.border}`,
              }}>
                {diasLabel}
              </span>
            )}
            {/* Ciclo */}
            {mision.ciclo_promedio_dias && (
              <span style={{ fontSize: 10, color: '#555' }}>
                Ciclo {mision.ciclo_promedio_dias}d
              </span>
            )}
          </div>
        </div>

        {/* Botones rápidos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!isPedido && (
            <button
              onClick={e => { e.stopPropagation(); onWA(mision) }}
              style={{
                width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(37,211,102,0.3)',
                background: 'rgba(37,211,102,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
              title="WhatsApp"
            >
              <MessageCircle size={15} color="#25D166" />
            </button>
          )}
          {open ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
        </div>
      </div>

      {/* Detalle expandido */}
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {/* Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, marginBottom: 14 }}>
            {[
              { label: 'Días sin comprar', value: `${mision.dias_sin_compra}d`, color: mision.tipo === 'vencido' ? '#F87171' : 'var(--cream)' },
              { label: 'Último pedido', value: fFecha(mision.ultima_venta_fecha), color: 'var(--cream)' },
              { label: 'Venta histórica', value: fPeso(mision.ultima_venta_monto), color: '#D4AF37' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 13, fontWeight: 800, color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Compra estimada y localidad */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {mision.siguiente_compra_estimada && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={12} color="var(--muted)" />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Próxima compra estimada: <strong style={{ color: tipoCfg.color }}>{fFecha(mision.siguiente_compra_estimada)}</strong>
                </span>
              </div>
            )}
            {mision.localidad && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                📍 {mision.localidad}
              </span>
            )}
          </div>

          {/* Nota si existe */}
          {mision.nota && (
            <div style={{
              padding: '8px 12px', borderRadius: 10, marginBottom: 12,
              background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)',
            }}>
              <p style={{ fontSize: 11, color: '#A08830', fontStyle: 'italic' }}>💬 {mision.nota}</p>
            </div>
          )}

          {/* Acciones */}
          <BotonesAccion mision={mision} onActualizar={onActualizar} loading={loading} />
        </div>
      )}
    </div>
  )
}

// ── Sección de misiones por tipo ──────────────────────────────────────────────
function SeccionMisiones({
  tipo, misiones, onActualizar, onWA, loadingId, defaultOpen = true,
}: {
  tipo: TipoMision
  misiones: MisionEnriquecida[]
  onActualizar: (id: string, estado: EstadoMision, nota?: string) => Promise<void>
  onWA: (m: MisionEnriquecida) => void
  loadingId: string | null
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!misiones.length) return null

  const cfg = TIPO_CFG[tipo]
  const pendientes = misiones.filter(m => m.estado === 'pendiente' || m.estado === 'sin_respuesta' || m.estado === 'contactado_sin_pedido')
  const completadas = misiones.filter(m => m.estado === 'contactado_pedido')

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Header de sección */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginBottom: open ? 12 : 0,
          padding: '10px 14px', borderRadius: 12, border: `1px solid ${cfg.border}`,
          background: cfg.bg, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 16 }}>{tipo === 'vencido' ? '🚨' : tipo === 'esta_semana' ? '📅' : '📆'}</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{cfg.desc}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800,
            background: `${cfg.color}20`, color: cfg.color,
          }}>
            {pendientes.length} pendientes
          </span>
          {completadas.length > 0 && (
            <span style={{
              padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: 'rgba(52,211,153,0.12)', color: '#34D399',
            }}>
              {completadas.length} ✓
            </span>
          )}
          {open ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
        </div>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {misiones.map(m => (
            <MisionCard key={m.id} mision={m} onActualizar={onActualizar} onWA={onWA} loadingId={loadingId} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Header resumen ────────────────────────────────────────────────────────────
function HeaderResumen({
  misiones, semana, vendedorActual, isAdmin,
}: {
  misiones: MisionEnriquecida[]
  semana: string
  vendedorActual: string | null
  isAdmin: boolean
}) {
  const total     = misiones.length
  const pedidos   = misiones.filter(m => m.estado === 'contactado_pedido').length
  const contactados = misiones.filter(m => m.estado === 'contactado_sin_pedido').length
  const vencidos  = misiones.filter(m => m.tipo === 'vencido' && m.estado === 'pendiente').length
  const esSemana  = misiones.filter(m => m.tipo === 'esta_semana').length
  const proxSem   = misiones.filter(m => m.tipo === 'proxima_semana').length

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0D0A00 0%, #1C1500 100%)',
      border: '1px solid rgba(212,175,55,0.2)',
      borderRadius: 20, padding: '20px 22px', marginBottom: 20,
    }}>
      {/* Título */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-0.5px', marginBottom: 3 }}>
            Misiones de la semana
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            {rangoSemana(semana)} {!isAdmin && vendedorActual ? `· ${vendedorActual.split(' ')[0]}` : ''}
          </p>
        </div>
        <ProgressDonut done={pedidos} total={total} size={80} />
      </div>

      {/* KPIs en fila */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: '🚨 Vencidos', value: vencidos, color: '#F87171', urgent: vencidos > 0 },
          { label: '📅 Esta semana', value: esSemana, color: '#D4AF37', urgent: false },
          { label: '📆 Próxima sem.', value: proxSem, color: '#60A5FA', urgent: false },
          { label: '✓ Con pedido', value: pedidos, color: '#34D399', urgent: false },
        ].map(({ label, value, color, urgent }) => (
          <div key={label} style={{
            background: urgent && value > 0 ? 'rgba(248,113,113,0.08)' : 'var(--surface2)',
            border: `1px solid ${urgent && value > 0 ? 'rgba(248,113,113,0.25)' : 'var(--border)'}`,
            borderRadius: 12, padding: '10px 12px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginBottom: 4, letterSpacing: '0.5px' }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: '-0.5px' }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────────
function HistorialView({ historial }: { historial: HistorialSemana[] }) {
  const [openSemana, setOpenSemana] = useState<string | null>(historial[0]?.semana ?? null)

  if (!historial.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
        <p style={{ fontSize: 14 }}>No hay historial de semanas anteriores</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {historial.map(sem => {
        const isOpen = openSemana === sem.semana
        const pct = sem.total > 0 ? Math.round((sem.completadas / sem.total) * 100) : 0
        return (
          <div key={sem.semana} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <button
              onClick={() => setOpenSemana(isOpen ? null : sem.semana)}
              style={{
                width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <Calendar size={16} color="var(--muted)" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', marginBottom: 2 }}>
                  {rangoSemana(sem.semana)}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {sem.completadas} de {sem.total} con pedido — {pct}%
                </p>
              </div>
              {/* Mini barra */}
              <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#34D399' : '#D4AF37', borderRadius: 4 }} />
              </div>
              {isOpen ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px 14px' }}>
                {sem.misiones.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: SEG_COLOR[m.segmento] ?? '#6B7280', width: 16 }}>{m.segmento}</span>
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

// ── Preview próxima semana ────────────────────────────────────────────────────
function ProximaView({ proxima }: { proxima: ProximaPreview[] }) {
  // Solo clientes cuya compra estimada cae en 7-14 días
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
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Los clientes aparecerán aquí cuando su compra estimada caiga en los próximos 7-14 días.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '10px 14px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: '#60A5FA', fontWeight: 700 }}>
          📆 {enVentana.length} clientes con compra estimada la próxima semana — adelántate y contáctalos hoy
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {enVentana.map(p => {
          const segColor = SEG_COLOR[p.segmento] ?? '#6B7280'
          const hoyStr = hoy.toISOString().split('T')[0]
          const sig = p.siguiente_compra_estimada
          const diasRestantes = sig ? Math.round((new Date(sig + 'T12:00:00').getTime() - hoy.getTime()) / 86400000) : null

          return (
            <div key={`${p.vendedor_actual}|${p.nombre_fantasia}`} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: `${segColor}18`, border: `2px solid ${segColor}40`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: segColor }}>{p.segmento}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', marginBottom: 3 }}>{p.nombre_fantasia}</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.vendedor_actual.split(' ')[0]}</span>
                  {diasRestantes !== null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#60A5FA' }}>
                      En {diasRestantes} días
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    Ciclo {p.ciclo_promedio_dias}d
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Score</p>
                <p style={{ fontSize: 14, fontWeight: 900, color: segColor }}>{p.score.toFixed(0)}</p>
              </div>
            </div>
          )
        })}
      </div>
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

type Tab = 'semana' | 'proxima' | 'historial'

export default function MisionesClient({
  misiones: initialMisiones, proxima, historial,
  semana, semanaNext, consejos, isAdmin, vendedorActual, vendedorNombre,
}: Props) {
  const isDesktop = useIsDesktop()
  const router    = useRouter()

  const [misiones, setMisiones]       = useState<MisionEnriquecida[]>(initialMisiones)
  const [tab, setTab]                 = useState<Tab>('semana')
  const [loadingId, setLoadingId]     = useState<string | null>(null)
  const [generando, setGenerando]     = useState(false)
  const [waTarget, setWaTarget]       = useState<WATarget | null>(null)
  const [filtroVendedor, setFiltroVendedor] = useState<string | null>(null)

  // Filtrar por vendedor (admin ve todos)
  const misionesFiltradas = useMemo(() => {
    if (!filtroVendedor) return misiones
    return misiones.filter(m => m.vendedor === filtroVendedor)
  }, [misiones, filtroVendedor])

  // Agrupar por tipo
  const porTipo = useMemo(() => {
    const grupos: Record<TipoMision, MisionEnriquecida[]> = {
      vencido: [], esta_semana: [], proxima_semana: [],
    }
    for (const m of misionesFiltradas) {
      grupos[m.tipo]?.push(m)
    }
    // Ordenar cada grupo: pendientes primero, luego por score desc
    const orden: EstadoMision[] = ['pendiente', 'sin_respuesta', 'contactado_sin_pedido', 'contactado_pedido']
    for (const key of Object.keys(grupos) as TipoMision[]) {
      grupos[key].sort((a, b) => {
        const oa = orden.indexOf(a.estado); const ob = orden.indexOf(b.estado)
        if (oa !== ob) return oa - ob
        return (b.score ?? 0) - (a.score ?? 0)
      })
    }
    return grupos
  }, [misionesFiltradas])

  // Actualizar estado de una misión
  const onActualizar = useCallback(async (id: string, estado: EstadoMision, nota?: string) => {
    setLoadingId(id)
    try {
      const res = await fetch('/api/misiones?action=actualizar_estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mision_id: id, estado, nota }),
      })
      if (!res.ok) throw new Error('Error al actualizar')

      setMisiones(prev => prev.map(m =>
        m.id === id
          ? { ...m, estado, completado_at: estado === 'contactado_pedido' ? new Date().toISOString() : m.completado_at }
          : m
      ))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingId(null)
    }
  }, [])

  // Generar misiones (admin)
  const onGenerar = useCallback(async () => {
    setGenerando(true)
    try {
      const res = await fetch('/api/misiones?action=generar', { method: 'POST' })
      if (!res.ok) throw new Error('Error al generar')
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setGenerando(false)
    }
  }, [router])

  // Abrir WA
  const onWA = useCallback((m: MisionEnriquecida) => {
    setWaTarget({
      nombre: m.nombre_fantasia,
      telefono: m.telefono ?? undefined,
      cicloPromedioDias: m.ciclo_promedio_dias ?? undefined,
      siguienteCompra: m.siguiente_compra_estimada ?? undefined,
      contexto: 'mision',
    })
  }, [])

  // Vendedores únicos para filtro admin
  const vendedores = useMemo(() => [...new Set(misiones.map(m => m.vendedor))], [misiones])

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'semana',   label: 'Esta semana',    count: misionesFiltradas.filter(m => m.tipo !== 'proxima_semana').length },
    { key: 'proxima',  label: 'Próxima semana', count: proxima.filter(p => {
        if (!p.siguiente_compra_estimada) return false
        const hoy = new Date(); const d7 = new Date(hoy); d7.setDate(d7.getDate()+7); const d14 = new Date(hoy); d14.setDate(d14.getDate()+14)
        const d = new Date(p.siguiente_compra_estimada + 'T12:00:00')
        return d >= d7 && d <= d14
      }).length },
    { key: 'historial', label: 'Historial' },
  ]

  return (
    <div style={{ padding: isDesktop ? '20px 24px 60px' : '12px 12px 80px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <HeaderResumen misiones={misionesFiltradas} semana={semana} vendedorActual={vendedorActual} isAdmin={isAdmin} />

      {/* Controles: filtro vendedor (admin) + botón generar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {isAdmin && vendedores.length > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setFiltroVendedor(null)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: !filtroVendedor ? 'rgba(212,175,55,0.15)' : 'var(--surface2)',
                border: `1px solid ${!filtroVendedor ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`,
                color: !filtroVendedor ? '#D4AF37' : 'var(--muted)', cursor: 'pointer',
              }}
            >Todos</button>
            {vendedores.map(v => (
              <button key={v}
                onClick={() => setFiltroVendedor(v === filtroVendedor ? null : v)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: filtroVendedor === v ? 'rgba(96,165,250,0.15)' : 'var(--surface2)',
                  border: `1px solid ${filtroVendedor === v ? 'rgba(96,165,250,0.4)' : 'var(--border)'}`,
                  color: filtroVendedor === v ? '#60A5FA' : 'var(--muted)', cursor: 'pointer',
                }}
              >{v.split(' ')[0]}</button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button
            onClick={onGenerar}
            disabled={generando}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 10,
              background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
              color: '#D4AF37', fontSize: 12, fontWeight: 700, cursor: generando ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={14} style={{ animation: generando ? 'spin 1s linear infinite' : 'none' }} />
            {generando ? 'Actualizando…' : 'Actualizar misiones'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 4,
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none',
              background: tab === t.key ? 'rgba(212,175,55,0.12)' : 'transparent',
              color: tab === t.key ? '#D4AF37' : 'var(--muted)',
              fontSize: 12, fontWeight: tab === t.key ? 800 : 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{
                padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 800,
                background: tab === t.key ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)',
                color: tab === t.key ? '#D4AF37' : 'var(--muted)',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido por tab */}
      {tab === 'semana' && (
        <div>
          {/* Vencidos primero */}
          <SeccionMisiones
            tipo="vencido"
            misiones={porTipo.vencido}
            onActualizar={onActualizar}
            onWA={onWA}
            loadingId={loadingId}
            defaultOpen={true}
          />
          {/* Esta semana */}
          <SeccionMisiones
            tipo="esta_semana"
            misiones={porTipo.esta_semana}
            onActualizar={onActualizar}
            onWA={onWA}
            loadingId={loadingId}
            defaultOpen={true}
          />

          {misionesFiltradas.filter(m => m.tipo !== 'proxima_semana').length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ fontSize: 32, marginBottom: 10 }}>🎉</p>
              <p style={{ fontSize: 14, color: 'var(--cream)', fontWeight: 700, marginBottom: 6 }}>
                Sin misiones activas
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                Todos los clientes están al día o aún no se acercan a su próxima compra.
                {isAdmin && ' Genera las misiones con el botón Actualizar.'}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'proxima' && <ProximaView proxima={proxima} />}

      {tab === 'historial' && <HistorialView historial={historial} />}

      {/* WhatsApp Modal */}
      {waTarget && (
        <WAModal
          target={waTarget}
          onClose={() => setWaTarget(null)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
