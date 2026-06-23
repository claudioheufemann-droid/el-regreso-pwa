'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Target, Calendar, CheckCircle, Clock, ChevronDown } from 'lucide-react'
import { Periodo } from '@/lib/types'
import { useIsDesktop } from '@/lib/useIsDesktop'
import {
  getDiasHabiles,
  getDiasHabilesTranscurridos,
  getMetaEsperadaAFecha,
  calcularCumplimiento,
  getEstadoSemaforo,
  getMensajePredictivo,
  SEMAFORO_COLORS,
  SEMAFORO_BG,
  SEMAFORO_LABELS,
  CANAL_COLORS,
  type EstadoSemaforo,
  type AnalyticsCanal,
  type AnalyticsVendedor,
} from '@/lib/metas-engine'
import AppHeader from '@/components/ui/AppHeader'

type Vista = 'diario' | 'semanal' | 'mensual'

interface ClienteDetalle {
  nombre: string
  canal: string | null
  litros: number
  monto: number
  pedidos: number
  ultimoPedido: string
  productos: {
    producto: string
    categoria: string
    envase: string | null
    litros: number
    monto: number
    unidades: number | null
  }[]
}

interface VentaRow {
  vendedor_actual: string
  litros: number
  total_sin_impuesto?: number | null
  categoria_negocio: string | null
  nombre_fantasia?: string | null
  categoria_producto?: string | null
  producto?: string | null
  envase?: string | null
  fecha_pedido: string
}

interface ClienteProducto { nombre: string; litros: number; canal: string | null }
interface ProductoItem { nombre: string; litros: number; clientes: ClienteProducto[] }
interface ProductoCategoria { categoria: string; total: number; productos: ProductoItem[] }

interface MetaRow {
  id: number
  periodo_id: number | null
  vendedor: string
  tipo: string
  semana_numero: number | null
  fecha_inicio: string
  fecha_fin: string
  categoria_negocio: string
  meta_litros: number
}

interface CanalDiario {
  canal: string
  realHoy: number
  metaDiaria: number
  semaforo: EstadoSemaforo
  color: string
}

interface BarDia {
  dia: string
  label: string
  litros: number
  isToday: boolean
  isFuture: boolean
}

interface PacingDia {
  dia: string
  label: string
  realAcum: number
  metaIdeal: number
  isFuture: boolean
}

interface AnalyticsExtended extends AnalyticsVendedor {
  realizadoHoy: number
  metaDiaria: number
  semaforoDiario: EstadoSemaforo
  porCanalHoy: CanalDiario[]
  barDataSemana: BarDia[]
  pacingDataMes: PacingDia[]
}

interface PeriodoSemana {
  semana_numero: number | null
  fecha_inicio: string
  fecha_fin: string
}

interface PeriodoMes {
  fecha_inicio: string
  fecha_fin: string
}

interface Props {
  metasSemanales: MetaRow[]
  metasMensuales: MetaRow[]
  ventasMes: VentaRow[]
  ventasSemana: VentaRow[]
  fechaRef: string
  mesInicio: string
  mesFin: string
  semanaInicio: string
  semanaFin: string
  periodo: Periodo | null
  vendedores: string[]
  vendedorGrupos?: Record<string, string[]>
  periodosSemanas: PeriodoSemana[]
  periodosMeses: PeriodoMes[]
  vendedorAvatars?: Record<string, string | null>
}

function fmt(n: number) { return n.toFixed(1) }
/** Número compacto para chips en móvil: sin decimales cero, con separador de miles */
function fmtL(n: number) {
  const rounded = Math.round(n * 10) / 10
  const str = rounded % 1 === 0
    ? new Intl.NumberFormat('es-CL').format(Math.round(rounded))
    : new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rounded)
  return str
}

function fmtFecha(d: string) {
  const [, m, day] = d.split('-')
  const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${parseInt(day)} ${M[parseInt(m)-1]}`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ─── SVG Charts ──────────────────────────────────────────────────────────────

function GaugeChart({ pct, semaforo, meta, realizado }: {
  pct: number; semaforo: EstadoSemaforo; meta: number; realizado: number
}) {
  const color = SEMAFORO_COLORS[semaforo]
  const W = 240, r = 82, cx = 120, cy = 102
  const clampedPct = Math.min(pct, 100)
  const theta = Math.PI * (clampedPct / 100)
  const ex = cx - r * Math.cos(theta)
  const ey = cy - r * Math.sin(theta)
  const largeArc = clampedPct > 50 ? 1 : 0

  return (
    <svg width={W} height={112} viewBox={`0 0 ${W} 112`} style={{ display: 'block', margin: '0 auto' }}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" strokeLinecap="round"
      />
      {/* Progress arc */}
      {clampedPct > 0 && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 0 ${ex.toFixed(2)} ${ey.toFixed(2)}`}
          fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        />
      )}
      {/* % — centrado en el espacio interior del arco */}
      <text x={cx} y={cy - 26} textAnchor="middle" fill={color}
        fontSize="36" fontWeight="900" fontFamily="inherit"
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(0)}%
      </text>
      {/* Litros — debajo del % */}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="rgba(255,255,255,0.4)"
        fontSize="11" fontFamily="inherit">
        {fmt(realizado)} / {fmt(meta)} L
      </text>
      {/* Extremos del arco */}
      <text x={cx - r + 2} y={cy + 14} textAnchor="middle"
        fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="inherit">0</text>
      <text x={cx + r - 2} y={cy + 14} textAnchor="middle"
        fill="rgba(255,255,255,0.2)" fontSize="9" fontFamily="inherit">100</text>
    </svg>
  )
}

function WeekBarChart({ data, metaDiaria, semaforo }: {
  data: BarDia[]; metaDiaria: number; semaforo: EstadoSemaforo
}) {
  const color = SEMAFORO_COLORS[semaforo]
  const W = 240, H = 88
  const n = data.length || 5
  const gap = 10
  const barW = Math.floor((W - (n - 1) * gap) / n)
  const totalW = n * barW + (n - 1) * gap
  const offsetX = (W - totalW) / 2

  return (
    <svg width={W} height={H + 38} viewBox={`0 0 ${W} ${H + 38}`} style={{ display: 'block', margin: '0 auto' }}>
      {/* Meta line (top = 100%) */}
      <line x1={offsetX} y1={1} x2={offsetX + totalW} y2={1}
        stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 4" />

      {data.map((d, i) => {
        const x = offsetX + i * (barW + gap)
        const overPct = metaDiaria > 0 ? (d.litros / metaDiaria) * 100 : 0
        const fillPct  = Math.min(100, overPct)

        const fillColor = d.isFuture || d.litros === 0
          ? null
          : overPct >= 95 ? SEMAFORO_COLORS.verde
          : overPct >= 75 ? SEMAFORO_COLORS.amarillo
          : SEMAFORO_COLORS.rojo

        const fillH = fillColor ? Math.max(4, (fillPct / 100) * H) : 0
        const fillY = H - fillH
        const isToday = d.isToday
        const hasSales = !d.isFuture && d.litros > 0

        return (
          <g key={d.dia}>
            {/* Track */}
            <rect x={x} y={0} width={barW} height={H} rx={5}
              fill={isToday ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)'} />

            {/* Fill */}
            {fillH > 0 && fillColor && (
              <rect x={x} y={fillY} width={barW} height={fillH} rx={5}
                fill={fillColor} opacity={isToday ? 0.95 : 0.55} />
            )}

            {/* Over-meta cap */}
            {overPct > 100 && fillColor && (
              <rect x={x} y={0} width={barW} height={4} rx={2} fill={fillColor} />
            )}

            {/* % — texto simple arriba del fill, solo si hay ventas */}
            {hasSales && (
              <text
                x={x + barW / 2}
                y={Math.max(fillY - 5, 11)}
                textAnchor="middle"
                fill={isToday ? (fillColor ?? color) : 'rgba(255,255,255,0.5)'}
                fontSize="10" fontWeight={isToday ? '800' : '600'} fontFamily="inherit"
              >
                {Math.round(overPct)}%
              </text>
            )}

            {/* Litros — pequeño, debajo de la barra */}
            {hasSales && (
              <text
                x={x + barW / 2} y={H + 13} textAnchor="middle"
                fill="rgba(255,255,255,0.38)"
                fontSize="9" fontFamily="inherit"
              >
                {d.litros % 1 === 0 ? d.litros : d.litros.toFixed(1)}L
              </text>
            )}

            {/* Día — label inferior */}
            <text
              x={x + barW / 2} y={H + 28} textAnchor="middle"
              fill={isToday ? (fillColor ?? color) : 'rgba(255,255,255,0.3)'}
              fontSize="11" fontWeight={isToday ? '800' : '500'} fontFamily="inherit"
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function PacingLineChart({ data, meta, semaforo }: {
  data: PacingDia[]; meta: number; semaforo: EstadoSemaforo
}) {
  const color = SEMAFORO_COLORS[semaforo]
  const W = 240, H = 90
  const n = data.length
  if (n < 2) return null

  const maxVal = Math.max(meta * 1.05, ...data.map(d => Math.max(d.realAcum, d.metaIdeal)), 1)

  function px(i: number) { return (i / (n - 1)) * W }
  function py(v: number) { return H - (v / maxVal) * H }

  const realPoints = data.map((d, i) => ({ ...d, i })).filter(d => !d.isFuture)
  const lastReal = realPoints[realPoints.length - 1]

  // Build area path for filled region under real line
  const areaPath = realPoints.length >= 2
    ? [
        `M ${px(0).toFixed(1)} ${H}`,
        ...realPoints.map(d => `L ${px(d.i).toFixed(1)} ${py(d.realAcum).toFixed(1)}`),
        `L ${px(realPoints[realPoints.length - 1].i).toFixed(1)} ${H}`,
        'Z'
      ].join(' ')
    : null

  const realPath = realPoints.length >= 2
    ? realPoints.map((d, j) => `${j === 0 ? 'M' : 'L'} ${px(d.i).toFixed(1)} ${py(d.realAcum).toFixed(1)}`).join(' ')
    : null

  const idealPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(d.metaIdeal).toFixed(1)}`)
    .join(' ')

  // Current pct for annotation
  const currentPct = meta > 0 && lastReal ? Math.round((lastReal.realAcum / meta) * 100) : 0

  return (
    <svg width={W} height={H + 32} viewBox={`0 0 ${W} ${H + 32}`}
      style={{ display: 'block', width: '100%', maxWidth: W, margin: '0 auto' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`area-grad-${semaforo}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* Area fill under real line */}
      {areaPath && (
        <path d={areaPath} fill={`url(#area-grad-${semaforo})`} />
      )}

      {/* Ideal pacing dashed */}
      <path d={idealPath} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="5 4" />

      {/* Real line */}
      {realPath && (
        <path d={realPath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* Current point dot + pct label */}
      {lastReal && (
        <>
          <circle
            cx={px(lastReal.i)} cy={py(lastReal.realAcum)} r={4.5}
            fill={color} stroke="#0F0F0F" strokeWidth="2"
          />
          {/* Pct bubble near dot */}
          <rect
            x={px(lastReal.i) - 18} y={py(lastReal.realAcum) - 22}
            width={36} height={16} rx={5}
            fill={color} opacity={0.95}
          />
          <text
            x={px(lastReal.i)} y={py(lastReal.realAcum) - 10}
            textAnchor="middle" fill="#080808"
            fontSize="10" fontWeight="900" fontFamily="inherit"
          >
            {currentPct}%
          </text>
        </>
      )}

      {/* Start/End date labels */}
      <text x={2} y={H + 14} fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="inherit">
        {data[0]?.label}
      </text>
      <text x={W - 2} y={H + 14} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="inherit">
        {data[n - 1]?.label}
      </text>

      {/* Meta line label */}
      <text x={W - 2} y={Math.max(py(meta) - 4, 10)} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="inherit">
        meta
      </text>
    </svg>
  )
}

// ─── Semáforo, Barras ─────────────────────────────────────────────────────────

function SemaforoDot({ estado }: { estado: EstadoSemaforo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: SEMAFORO_COLORS[estado],
        boxShadow: `0 0 6px ${SEMAFORO_COLORS[estado]}88`,
      }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: SEMAFORO_COLORS[estado], letterSpacing: '0.5px' }}>
        {SEMAFORO_LABELS[estado].toUpperCase()}
      </span>
    </div>
  )
}

function BarraDual({ meta, realizado, esperado, semaforo }: {
  meta: number; realizado: number; esperado: number; semaforo: EstadoSemaforo
}) {
  const pctReal = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0
  const pctEsp  = meta > 0 ? Math.min(100, (esperado / meta) * 100) : 0
  const color   = SEMAFORO_COLORS[semaforo]

  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 10, background: 'rgba(255,255,255,0.06)' }}>
      {/* Zona esperada (tenue) — muestra cuánto debería estar hecho ahora */}
      {pctEsp > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 10,
          width: `${pctEsp}%`,
          background: `${color}28`,
          transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
        }} />
      )}
      {/* Avance real (sólido) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 10,
        width: `${pctReal}%`,
        background: color,
        minWidth: pctReal > 0 ? 5 : 0,
        transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
      }} />
      {/* Marcador línea esperado + etiqueta */}
      {pctEsp > 0 && pctEsp <= 99 && (
        <div style={{ position: 'absolute', top: -2, left: `${pctEsp}%`, transform: 'translateX(-50%)' }}>
          <div style={{ width: 2, height: 14, background: 'rgba(255,255,255,0.5)', borderRadius: 2 }} />
          <span style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
            whiteSpace: 'nowrap', letterSpacing: '0.3px',
          }}>
            esperado hoy
          </span>
        </div>
      )}
    </div>
  )
}

function CanalRow({ c }: { c: AnalyticsCanal }) {
  const color    = CANAL_COLORS[c.canal] ?? '#6B7280'
  const meta     = c.metaMensual
  const real     = c.realizadoMes
  const esperado = c.metaEsperadaMes
  const pct      = c.pctMes
  const semaforo = c.semaforoMes
  if (meta <= 0) return null

  return (
    <div style={{
      padding: '11px 14px', borderRadius: 12, background: 'var(--surface2)',
      borderLeft: `3px solid ${SEMAFORO_COLORS[semaforo]}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{c.canal}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(real)} / {fmt(meta)} L</span>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100,
            background: SEMAFORO_BG[semaforo], color: SEMAFORO_COLORS[semaforo],
            border: `1px solid ${SEMAFORO_COLORS[semaforo]}40`,
          }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <BarraDual meta={meta} realizado={real} esperado={esperado} semaforo={semaforo} />
    </div>
  )
}

// ─── VendedorCard ─────────────────────────────────────────────────────────────

function VendedorCard({ analytics, rangeLabel, avatarUrl }: { analytics: AnalyticsExtended; rangeLabel: string; avatarUrl?: string | null }) {
  const meta      = analytics.metaMensual
  const real      = analytics.realizadoMes
  const sinMeta   = meta === 0
  const esperado  = analytics.metaEsperadaMes
  const pct       = analytics.pctCumplimientoMes
  const semaforo  = analytics.semaforoMes
  const faltante  = analytics.faltanteMes
  const diasRest  = analytics.diasRestantesMes
  const diasTrans = analytics.diasTranscurridosMes
  const diasTotal = analytics.diasHabilesMes
  const promNec   = analytics.promedioNecesarioDiarioMes
  const metaCumplida = real >= meta && meta > 0

  return (
    <div className="card-hover animate-fade-in" style={{
      background: 'var(--surface)',
      border: `1px solid ${metaCumplida ? 'rgba(74,122,58,0.4)' : 'var(--border)'}`,
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 4, background: SEMAFORO_COLORS[semaforo] }} />

      {/* Header */}
      <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {avatarUrl ? (
            <div style={{
              width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
              flexShrink: 0, border: `2px solid ${SEMAFORO_COLORS[semaforo]}`,
              boxShadow: `0 0 12px ${SEMAFORO_COLORS[semaforo]}40`,
              position: 'relative',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={analytics.vendedor}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
            </div>
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: SEMAFORO_COLORS[semaforo],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 900, color: '#080808', flexShrink: 0,
              border: `2px solid ${SEMAFORO_COLORS[semaforo]}`,
            }}>{getInitials(analytics.vendedor)}</div>
          )}
          <div>
            <h2 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 16, letterSpacing: '-0.3px' }}>
              {analytics.vendedor}
            </h2>
            <SemaforoDot estado={semaforo} />
          </div>
        </div>
        {sinMeta ? (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: SEMAFORO_COLORS[semaforo], letterSpacing: '-1px', lineHeight: 1 }}>
              {fmtL(real)}
            </p>
            <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>litros</p>
          </div>
        ) : (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 26, fontWeight: 900, color: SEMAFORO_COLORS[semaforo], letterSpacing: '-1px', lineHeight: 1 }}>
              {pct.toFixed(0)}%
            </p>
            <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>cumplimiento</p>
          </div>
        )}
      </div>

      {/* Pacing chart del período seleccionado */}
      {!sinMeta && analytics.pacingDataMes.length >= 2 && (
        <>
          <div style={{ padding: '0 14px 4px' }}>
            <PacingLineChart
              data={analytics.pacingDataMes}
              meta={analytics.metaMensual}
              semaforo={semaforo}
            />
          </div>
          <div style={{ padding: '0 18px 10px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 16, height: 6, borderRadius: 3, background: SEMAFORO_COLORS[semaforo], opacity: 0.5 }} />
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Realizado acumulado</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 16, height: 1.5, borderTop: '1.5px dashed rgba(255,255,255,0.28)' }} />
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Pacing ideal</span>
            </div>
          </div>
        </>
      )}

      {/* Progress bar + chips — solo para vendedores con meta */}
      {!sinMeta && (
        <>
          <div style={{ padding: '0 18px 14px' }}>
            <BarraDual meta={meta} realizado={real} esperado={esperado} semaforo={semaforo} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 12 }}>
              {[
                { label: 'Real',     value: fmtL(real),     color: SEMAFORO_COLORS[semaforo] },
                { label: 'Meta',     value: fmtL(meta),     color: 'var(--cream)' },
                { label: 'Esperado', value: fmtL(esperado), color: 'var(--muted)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '-0.3px' }}>{value}</span>
                    <span style={{ fontSize: 8, color, opacity: 0.6 }}>L</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '0 18px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'Meta',      num: meta,                         extra: '',   accent: false },
              { label: 'Realizado', num: real,                         extra: '',   accent: false },
              { label: metaCumplida ? '✓ OK' : 'Faltante',
                num: metaCumplida ? real - meta : Math.max(0, meta - real),
                extra: metaCumplida ? '+' : '',
                accent: metaCumplida },
            ].map(({ label, num, extra, accent }) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <p style={{ fontSize: 8, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 5 }}>
                  {label}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, justifyContent: 'center', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: accent ? '#4A7A3A' : 'var(--cream)', letterSpacing: '-0.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {extra}{fmtL(num)}
                  </span>
                  <span style={{ fontSize: 9, color: accent ? '#4A7A3A' : 'var(--muted)', flexShrink: 0 }}>L</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Días hábiles bar */}
      <div style={{ padding: '0 18px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>Días hábiles transcurridos</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)' }}>{diasTrans} / {diasTotal}</span>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            width: diasTotal > 0 ? `${(diasTrans / diasTotal) * 100}%` : '0%',
            background: 'rgba(255,255,255,0.18)',
          }} />
        </div>
      </div>

      {/* Proyección */}
      {!metaCumplida && diasRest > 0 && (
        <div style={{
          margin: '0 18px 14px', padding: '10px 14px', borderRadius: 12,
          background: SEMAFORO_BG[semaforo], border: `1px solid ${SEMAFORO_COLORS[semaforo]}30`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <Clock size={13} color={SEMAFORO_COLORS[semaforo]} />
            <span style={{ fontSize: 10, fontWeight: 700, color: SEMAFORO_COLORS[semaforo], textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Proyección
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--cream)' }}>
            Necesitas promediar{' '}
            <span style={{ fontWeight: 800, color: SEMAFORO_COLORS[semaforo] }}>{fmt(promNec)} L/día</span>
            {' '}en los {diasRest} días hábiles restantes
          </p>
        </div>
      )}

      {/* Meta cumplida */}
      {metaCumplida && (
        <div style={{
          margin: '0 18px 14px', padding: '10px 14px', borderRadius: 12,
          background: 'rgba(74,122,58,0.1)', border: '1px solid rgba(74,122,58,0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={15} color="#4A7A3A" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4A7A3A' }}>¡Meta cumplida!</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Excedente: +{fmt(real - meta)} L</span>
        </div>
      )}

      {/* Canales */}
      <div style={{ padding: '0 18px 20px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          Por canal · {rangeLabel}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {analytics.porCanal.map(c => (
            <CanalRow key={c.canal} c={c} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── DateRangePicker ──────────────────────────────────────────────────────────

const MESES_CAL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_CAL  = ['L','M','X','J','V','S','D']

function fmtRangeBtn(ini: string, fin: string) {
  const [,mi,di] = ini.split('-')
  const [yf,mf,df] = fin.split('-')
  const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${parseInt(di)} ${M[parseInt(mi)-1]} → ${parseInt(df)} ${M[parseInt(mf)-1]} ${yf}`
}

function DateRangePicker({ inicio, fin, presets, onChange }: {
  inicio: string
  fin: string
  presets: { label: string; inicio: string; fin: string }[]
  onChange: (ini: string, fin: string) => void
}) {
  const [open, setOpen]           = useState(false)
  // which field is active: 'inicio' or 'fin'
  const [activeField, setActive]  = useState<'inicio' | 'fin'>('inicio')
  const [draftIni, setDraftIni]   = useState(inicio)
  const [draftFin, setDraftFin]   = useState(fin)
  const [hover, setHover]         = useState<string | null>(null)
  const [viewYear, setViewYear]   = useState(parseInt(inicio.split('-')[0]))
  const [viewMonth, setViewMonth] = useState(parseInt(inicio.split('-')[1]) - 1)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync draft when picker opens
  useEffect(() => {
    if (open) {
      setDraftIni(inicio); setDraftFin(fin)
      setViewYear(parseInt(inicio.split('-')[0]))
      setViewMonth(parseInt(inicio.split('-')[1]) - 1)
      setActive('inicio')
    }
  }, [open, inicio, fin])

  function goMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear
    if (m < 0)  { m += 12; y-- }
    if (m > 11) { m -= 12; y++ }
    setViewMonth(m); setViewYear(y)
  }

  function handleDay(dateStr: string) {
    if (activeField === 'inicio') {
      setDraftIni(dateStr)
      // auto-fix if ini > fin
      if (dateStr > draftFin) setDraftFin(dateStr)
      setActive('fin')
    } else {
      setDraftFin(dateStr)
      // auto-fix if fin < ini
      if (dateStr < draftIni) setDraftIni(dateStr)
      setActive('inicio')
    }
  }

  function handleApply() {
    const [a, b] = draftIni <= draftFin ? [draftIni, draftFin] : [draftFin, draftIni]
    onChange(a, b)
    setOpen(false)
  }

  // Jump calendar to a specific month
  function jumpTo(dateStr: string) {
    const [y, m] = dateStr.split('-')
    setViewYear(parseInt(y)); setViewMonth(parseInt(m) - 1)
  }

  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow     = new Date(viewYear, viewMonth, 1).getDay()
  const startOffset  = firstDow === 0 ? 6 : firstDow - 1

  function dayStr(d: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  // Range boundaries (considering hover preview)
  const previewFin = activeField === 'fin' && hover ? hover : null
  const lo = previewFin && previewFin < draftIni ? previewFin : draftIni
  const hi = previewFin && previewFin > draftIni ? previewFin : draftFin

  function isStart(s: string)  { return s === draftIni }
  function isEnd(s: string)    { return s === draftFin }
  function inRange(s: string)  { return s > lo && s < hi }

  const canApply = draftIni.length === 10 && draftFin.length === 10 && draftIni <= draftFin

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Overlay oscuro en móvil cuando está abierto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 299 }}
        />
      )}
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 16px', borderRadius: 10,
          background: open ? 'rgba(212,175,55,0.1)' : 'var(--surface)',
          border: `1px solid ${open ? 'var(--gold)' : 'var(--border)'}`,
          color: 'var(--cream)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        <Calendar size={14} color={open ? 'var(--gold)' : 'var(--muted)'} />
        <span style={{ color: open ? 'var(--gold)' : 'var(--cream)' }}>{fmtRangeBtn(inicio, fin)}</span>
        <ChevronDown size={13} color="var(--muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '0',
          boxShadow: '0 12px 48px rgba(0,0,0,0.9)',
          width: 'min(340px, 95vw)', overflow: 'hidden',
        }}>

          {/* ── Campos Inicio / Fin ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            {(['inicio', 'fin'] as const).map(field => {
              const val   = field === 'inicio' ? draftIni : draftFin
              const label = field === 'inicio' ? 'Inicio' : 'Fin'
              const active = activeField === field
              return (
                <button
                  key={field}
                  onClick={() => {
                    setActive(field)
                    // jump calendar to the field's month
                    if (val.length === 10) jumpTo(val)
                  }}
                  style={{
                    padding: '12px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: active ? 'rgba(212,175,55,0.08)' : 'transparent',
                    borderBottom: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                    borderRight: field === 'inicio' ? '1px solid var(--border)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: active ? 'var(--gold)' : 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>
                    {label} {active && '←'}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: val ? 'var(--cream)' : 'rgba(255,255,255,0.2)' }}>
                    {val ? fmtFecha(val) : '— —'}
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ padding: '14px 16px' }}>

            {/* Presets */}
            {presets.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {presets.map(p => {
                  const active = p.inicio === inicio && p.fin === fin
                  return (
                    <button
                      key={p.label}
                      onClick={() => {
                        setDraftIni(p.inicio); setDraftFin(p.fin); setActive('inicio')
                        jumpTo(p.inicio)
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                        border: `1px solid ${active ? 'var(--gold)' : 'rgba(255,255,255,0.1)'}`,
                        background: active ? 'rgba(212,175,55,0.12)' : 'transparent',
                        color: active ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer',
                      }}
                    >{p.label}</button>
                  )
                })}
              </div>
            )}

            {/* ── Navegación de mes ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              {/* Prev buttons */}
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  onClick={() => goMonth(-12)}
                  title="Año anterior"
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                >«</button>
                <button
                  onClick={() => goMonth(-1)}
                  title="Mes anterior"
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--cream)', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
                >‹</button>
              </div>

              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.3px' }}>
                {MESES_CAL[viewMonth]} {viewYear}
              </span>

              {/* Next buttons */}
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  onClick={() => goMonth(1)}
                  title="Mes siguiente"
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--cream)', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
                >›</button>
                <button
                  onClick={() => goMonth(12)}
                  title="Año siguiente"
                  style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                >»</button>
              </div>
            </div>

            {/* Day-of-week headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
              {DIAS_CAL.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--muted)', paddingBottom: 6, letterSpacing: '0.5px' }}>{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px 0' }}>
              {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const s       = dayStr(d)
                const isIni   = isStart(s)
                const isFin   = isEnd(s)
                const inRng   = inRange(s)
                const isToday = s === new Date().toISOString().split('T')[0]
                const isSel   = isIni || isFin

                return (
                  <button
                    key={d}
                    onClick={() => handleDay(s)}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      padding: '7px 0', textAlign: 'center', border: 'none', cursor: 'pointer',
                      position: 'relative',
                      borderRadius: isSel ? 8 : inRng ? 0 : 6,
                      background: isSel
                        ? 'var(--gold)'
                        : inRng ? 'rgba(212,175,55,0.18)' : 'transparent',
                      color: isSel ? '#080808' : isToday ? 'var(--gold)' : 'var(--cream)',
                      fontSize: 13, fontWeight: isSel ? 900 : isToday ? 700 : 400,
                      outline: isToday && !isSel ? '1px solid rgba(212,175,55,0.5)' : 'none',
                      transition: 'background 0.1s',
                    }}
                  >
                    {d}
                    {/* indicator dot for inicio/fin */}
                    {isIni && (
                      <div style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', fontSize: 7, color: '#080808', fontWeight: 900, lineHeight: 1 }}>I</div>
                    )}
                    {isFin && !isIni && (
                      <div style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', fontSize: 7, color: '#080808', fontWeight: 900, lineHeight: 1 }}>F</div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Apply */}
            <button
              onClick={handleApply}
              disabled={!canApply}
              style={{
                marginTop: 14, width: '100%', padding: '12px 0',
                borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800,
                background: canApply ? 'var(--gold)' : 'rgba(255,255,255,0.06)',
                color: canApply ? '#080808' : 'var(--muted)',
                cursor: canApply ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {canApply ? `Aplicar: ${fmtFecha(draftIni)} → ${fmtFecha(draftFin)} →` : 'Selecciona inicio y fin'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Productos ───────────────────────────────────────────────────────────────

const CAT_PRODUCTO: Record<string, { emoji: string; color: string }> = {
  'Cerveza':        { emoji: '🍺', color: '#D4AF37' },
  'Kombucha':       { emoji: '🫧', color: '#5A8A4A' },
  'Sin categoría':  { emoji: '📦', color: '#6B7280' },
}

function computeProductos(ventas: VentaRow[]): ProductoCategoria[] {
  type ProdEntry = { total: number; clientes: Map<string, { litros: number; canal: string | null }> }
  const map = new Map<string, Map<string, ProdEntry>>()
  for (const v of ventas) {
    if (!v.litros) continue
    const cat  = v.categoria_producto?.trim() || 'Sin categoría'
    const prod = v.producto?.trim()           || 'Sin nombre'
    const cli  = v.nombre_fantasia?.trim()    || 'Sin nombre'
    const canal = v.categoria_negocio ?? null
    if (!map.has(cat)) map.set(cat, new Map())
    const pm = map.get(cat)!
    if (!pm.has(prod)) pm.set(prod, { total: 0, clientes: new Map() })
    const entry = pm.get(prod)!
    entry.total += v.litros
    if (!entry.clientes.has(cli)) entry.clientes.set(cli, { litros: 0, canal })
    entry.clientes.get(cli)!.litros += v.litros
  }
  return [...map.entries()]
    .map(([categoria, pm]) => ({
      categoria,
      total: [...pm.values()].reduce((s, e) => s + e.total, 0),
      productos: [...pm.entries()]
        .map(([nombre, entry]) => ({
          nombre,
          litros: entry.total,
          clientes: [...entry.clientes.entries()]
            .map(([nombre, d]) => ({ nombre, litros: d.litros, canal: d.canal }))
            .sort((a, b) => b.litros - a.litros),
        }))
        .sort((a, b) => b.litros - a.litros),
    }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
}

function ProductoBar({ nombre, litros, total, color, clientes = [] }: {
  nombre: string; litros: number; total: number; color: string; clientes?: ClienteProducto[]
}) {
  const [open, setOpen] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const pct = total > 0 ? Math.min(100, Math.max(0, (litros / total) * 100)) : 0
  const MAX_CLI = 5
  const visibles = verTodos ? clientes : clientes.slice(0, MAX_CLI)
  const hasClientes = clientes.length > 0

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Fila principal — clickable si hay clientes */}
      <div
        onClick={() => hasClientes && setOpen(v => !v)}
        style={{ cursor: hasClientes ? 'pointer' : 'default', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
            {hasClientes && (
              <ChevronDown size={11} color={color} style={{
                flexShrink: 0, opacity: 0.7,
                transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.18s',
              }} />
            )}
            <span style={{
              fontSize: 12, color: 'var(--cream)', flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{nombre}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{litros.toFixed(1)} L</span>
            <span style={{
              fontSize: 10, color, fontWeight: 700,
              background: `${color}18`, border: `1px solid ${color}30`,
              padding: '1px 6px', borderRadius: 8,
            }}>{pct.toFixed(0)}%</span>
          </div>
        </div>
        <div style={{ height: 5, borderRadius: 5, background: 'rgba(255,255,255,0.06)', marginLeft: hasClientes ? 16 : 0 }}>
          <div className="animate-progress" style={{
            ['--pct' as string]: `${pct}%`,
            height: '100%', borderRadius: 5,
            width: `${pct}%`, background: color, opacity: 0.75,
          } as React.CSSProperties} />
        </div>
      </div>

      {/* Drill-down: lista de locales */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.22s cubic-bezier(0.16,1,0.3,1)',
        marginLeft: 16,
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            marginTop: 8, marginBottom: 4,
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.025)',
            border: `1px solid ${color}20`,
            borderRadius: 10,
          }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {clientes.length} local{clientes.length !== 1 ? 'es' : ''}
              </span>
              <span style={{ fontSize: 9, color: 'var(--muted)' }}>
                {litros.toFixed(1)} L total
              </span>
            </div>
            {/* Filas de locales */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibles.map((c, i) => {
                const cliPct = litros > 0 ? (c.litros / litros) * 100 : 0
                const dotColor = CANAL_DOT[c.canal ?? ''] ?? '#6B7280'
                return (
                  <div key={c.nombre}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      {/* Rank */}
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                        background: i < 3 ? `${color}20` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${i < 3 ? color + '35' : 'rgba(255,255,255,0.07)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 800, color: i < 3 ? color : 'var(--muted)',
                      }}>{i + 1}</div>
                      {/* Canal dot */}
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      {/* Nombre */}
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 11, color: 'var(--cream)', fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{c.nombre}</span>
                      {/* Litros + % */}
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {c.litros.toFixed(1)} L
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color, flexShrink: 0,
                        background: `${color}15`, padding: '1px 5px', borderRadius: 6,
                        fontVariantNumeric: 'tabular-nums',
                      }}>{cliPct.toFixed(0)}%</span>
                    </div>
                    {/* Mini barra */}
                    <div style={{ height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.05)', marginLeft: 23 }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${cliPct}%`, background: color, opacity: 0.5 }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Ver más / menos */}
            {clientes.length > MAX_CLI && (
              <button
                onClick={e => { e.stopPropagation(); setVerTodos(v => !v) }}
                style={{
                  marginTop: 8, width: '100%', padding: '5px 0',
                  background: 'transparent', border: `1px solid ${color}25`,
                  borderRadius: 8, fontSize: 10, fontWeight: 600,
                  color: 'var(--muted)', cursor: 'pointer',
                }}
              >
                {verTodos ? 'Ver menos' : `Ver ${clientes.length - MAX_CLI} más`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CategoriaProductoCard({ cat }: { cat: ProductoCategoria }) {
  const cfg = CAT_PRODUCTO[cat.categoria] ?? { emoji: '📦', color: '#6B7280' }
  const [expanded, setExpanded] = useState(true)
  const MAX_VISIBLE = 5

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: cfg.color }} />
      <div style={{ padding: '16px 20px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>{cfg.emoji}</span>
            <div>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)' }}>{cat.categoria}</span>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                {cat.productos.length} {cat.productos.length === 1 ? 'producto' : 'productos'}
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 24, fontWeight: 900, color: cfg.color, letterSpacing: '-0.5px', lineHeight: 1 }}>
              {cat.total.toFixed(1)}
            </p>
            <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>litros</p>
          </div>
        </div>

        {/* Products list */}
        {cat.productos.slice(0, expanded ? undefined : MAX_VISIBLE).map(p => (
          <ProductoBar key={p.nombre} nombre={p.nombre} litros={p.litros} total={cat.total} color={cfg.color} clientes={p.clientes} />
        ))}

        {cat.productos.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              marginTop: 8, width: '100%', padding: '7px 0',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 10, fontSize: 11, fontWeight: 600,
              color: 'var(--muted)', cursor: 'pointer',
            }}
          >
            {expanded
              ? `Mostrar menos`
              : `Ver ${cat.productos.length - MAX_VISIBLE} más`}
          </button>
        )}
      </div>
    </div>
  )
}

function ProductosSection({ productos, label }: {
  productos: ProductoCategoria[]; label: string
}) {
  if (!productos.length) return null
  const totalLitros = productos.reduce((s, c) => s + c.total, 0)

  return (
    <div style={{ marginTop: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>
            Productos Vendidos
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
            {label} · {totalLitros.toFixed(1)} L totales
          </p>
        </div>
        {/* Mini pie-like summary */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {productos.map(c => {
            const cfg = CAT_PRODUCTO[c.categoria] ?? { emoji: '📦', color: '#6B7280' }
            const pct = totalLitros > 0 ? (c.total / totalLitros) * 100 : 0
            return (
              <div key={c.categoria} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '6px 12px',
              }}>
                <span style={{ fontSize: 14 }}>{cfg.emoji}</span>
                <span style={{ fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>{c.categoria}</span>
                <span style={{ fontSize: 12, color: cfg.color, fontWeight: 800 }}>{pct.toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
        {productos.map(cat => (
          <CategoriaProductoCard key={cat.categoria} cat={cat} />
        ))}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function navStep(fecha: string, vista: Vista, dir: 1 | -1): string {
  const d = new Date(fecha + 'T12:00:00')
  if (vista === 'diario') {
    do { d.setDate(d.getDate() + dir) } while (d.getDay() === 0 || d.getDay() === 6)
  } else if (vista === 'semanal') {
    d.setDate(d.getDate() + dir * 7)
  } else {
    d.setMonth(d.getMonth() + dir)
    d.setDate(1)
  }
  return d.toISOString().split('T')[0]
}

const DIA_LABELS = ['L', 'M', 'X', 'J', 'V']
const MESES_NOMBRE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_FULL   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/** Construye barDataSemana a partir de días hábiles y ventas crudas */
function buildBarData(
  dhSem: Date[],
  ventasDiariasRaw: { fecha: string; litros: number }[],
  fechaRef: string
): BarDia[] {
  return dhSem.map((d, i) => {
    const dia = d.toISOString().split('T')[0]
    const litros = ventasDiariasRaw
      .filter(v => v.fecha === dia)
      .reduce((s, v) => s + v.litros, 0)
    return {
      dia,
      label: DIA_LABELS[i] ?? String(i + 1),
      litros,
      isToday: dia === fechaRef,
      isFuture: dia > fechaRef,
    }
  })
}

/** Construye pacingDataMes a partir de días hábiles del mes y ventas crudas */
function buildPacingData(
  dhMes: Date[],
  metaMensual: number,
  ventasDiariasRaw: { fecha: string; litros: number }[],
  fechaRef: string
): PacingDia[] {
  let acum = 0
  const n = dhMes.length
  return dhMes.map((d, i) => {
    const dia = d.toISOString().split('T')[0]
    const isFuture = dia > fechaRef
    if (!isFuture) {
      acum += ventasDiariasRaw.filter(v => v.fecha === dia).reduce((s, v) => s + v.litros, 0)
    }
    return {
      dia,
      label: fmtFecha(dia),
      realAcum: acum,
      metaIdeal: n > 0 ? metaMensual * (i + 1) / n : 0,
      isFuture,
    }
  })
}

// ─── Locales Vendidos ─────────────────────────────────────────────────────────

const CANAL_DOT: Record<string, string> = {
  'Bar':           '#D4AF37',
  'Supermercado':  '#60A5FA',
  'Minimarket':    '#34D399',
  'Restaurante':   '#F97316',
  'Botillería':    '#A78BFA',
  'Cafetería':     '#FB7185',
  'Almacén':       '#94A3B8',
  'Distribuidor':  '#38BDF8',
}

const fmtPeso = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtPesoCompact = fmtPeso
const fmtPesoFull    = fmtPeso

function LocalesSection({ clientes, rangeLabel }: { clientes: ClienteDetalle[]; rangeLabel: string }) {
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden]       = useState<'monto' | 'litros' | 'nombre' | 'canal'>('monto')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [verTodos, setVerTodos]   = useState(false)

  if (!clientes.length) return null

  const totalLitros = clientes.reduce((s, c) => s + c.litros, 0)
  const totalMonto  = clientes.reduce((s, c) => s + c.monto, 0)
  const hasMonto    = totalMonto > 0

  const filtrados = clientes
    .filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                 (c.canal ?? '').toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      if (orden === 'nombre')  return a.nombre.localeCompare(b.nombre)
      if (orden === 'canal')   return (a.canal ?? '').localeCompare(b.canal ?? '')
      if (orden === 'litros')  return b.litros - a.litros
      return b.monto - a.monto
    })

  const visibles = verTodos ? filtrados : filtrados.slice(0, 10)

  return (
    <div style={{ marginTop: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px', marginBottom: 3 }}>
            Locales Vendidos
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            {rangeLabel} · <strong style={{ color: 'var(--cream)' }}>{clientes.length}</strong> locales
            {' · '}<strong style={{ color: 'var(--gold)' }}>{totalLitros.toFixed(1)} L</strong>
            {hasMonto && <> · <strong style={{ color: '#34D399' }}>{fmtPesoCompact(totalMonto)}</strong></>}
          </p>
        </div>
        {/* Sort */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([['monto','$Monto'],['litros','Litros'],['nombre','A-Z'],['canal','Canal']] as [typeof orden, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setOrden(k)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: orden === k ? 'var(--gold)' : 'var(--surface)',
              color: orden === k ? '#080808' : 'var(--muted)',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Búsqueda */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input
          type="text"
          placeholder="Buscar local o canal…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--cream)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visibles.map((c, idx) => {
          const isOpen = expandido === c.nombre
          const pct = totalLitros > 0 ? (c.litros / totalLitros) * 100 : 0
          const dotColor = CANAL_DOT[c.canal ?? ''] ?? '#6B7280'

          return (
            <div key={c.nombre} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, overflow: 'hidden',
              borderLeft: `3px solid ${dotColor}`,
            }}>
              {/* Row principal */}
              <div
                onClick={() => setExpandido(isOpen ? null : c.nombre)}
                style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                {/* Rank */}
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: idx < 3 ? `${dotColor}20` : 'rgba(128,128,128,0.08)',
                  border: `1px solid ${idx < 3 ? dotColor + '40' : 'rgba(128,128,128,0.12)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: idx < 3 ? dotColor : 'var(--muted)',
                }}>{idx + 1}</div>

                {/* Nombre + canal + fecha */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nombre}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{c.canal ?? 'Sin canal'}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>· {c.pedidos} pedido{c.pedidos !== 1 ? 's' : ''}</span>
                  </div>
                  {c.ultimoPedido && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'rgba(212,175,55,0.45)', flexShrink: 0 }}>
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <span style={{ fontSize: 9, color: 'rgba(212,175,55,0.5)', fontWeight: 600 }}>
                        Última compra: {fmtFecha(c.ultimoPedido)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Monto + Litros */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {hasMonto && c.monto > 0 && (
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#34D399', letterSpacing: '-0.3px' }}>{fmtPesoCompact(c.monto)}</div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{c.litros.toFixed(1)} L</div>
                  <div style={{ fontSize: 9, color: 'rgba(128,128,128,0.5)' }}>{pct.toFixed(1)}% vol.</div>
                </div>

                {/* Expand arrow */}
                <ChevronDown size={14} color="var(--muted)"
                  style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>

              {/* Barra de litros */}
              <div style={{ height: 3, background: 'rgba(128,128,128,0.08)' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: dotColor, opacity: 0.6, transition: 'width 0.4s ease' }} />
              </div>

              {/* Productos expandidos */}
              {isOpen && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
                    Productos vendidos
                  </p>
                  {/* Cabecera tabla */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 60px 90px', gap: 6, padding: '0 0 6px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 6 }}>
                    {['Producto','Unidades','Litros','Monto'].map(h => (
                      <div key={h} style={{ fontSize: 8, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', textAlign: h !== 'Producto' ? 'right' : 'left' }}>{h}</div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {c.productos.map(p => {
                      const catColor = p.categoria === 'Cerveza' ? '#D4AF37' : p.categoria === 'Kombucha' ? '#34D399' : '#6B7280'
                      const key = `${p.producto}||${p.envase ?? ''}`
                      return (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 60px 90px', gap: 6, alignItems: 'center' }}>
                          {/* Nombre + envase */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.producto}
                              </span>
                            </div>
                            {p.envase && (
                              <div style={{ fontSize: 9, color: 'var(--gold)', marginTop: 1, paddingLeft: 10, opacity: 0.7 }}>{p.envase}</div>
                            )}
                          </div>
                          {/* Unidades — calculadas desde litros + ml del envase si no vienen de BD */}
                          <div style={{ textAlign: 'right' }}>
                            {(() => {
                              const mlMatch = p.envase?.match(/\((\d+)\s*ml\)/i)
                              const mlPorUnidad = mlMatch ? parseInt(mlMatch[1]) : null
                              const unidades = p.unidades ?? (mlPorUnidad && p.litros > 0
                                ? Math.round((p.litros * 1000) / mlPorUnidad)
                                : null)
                              const labelUnidad = /lata/i.test(p.envase ?? '') ? 'latas'
                                : /botella/i.test(p.envase ?? '') ? 'botellas'
                                : 'unidades'
                              return unidades != null && unidades > 0
                                ? <>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>
                                      {unidades.toLocaleString('es-CL')}
                                    </span>
                                    <div style={{ fontSize: 8, color: 'var(--muted)' }}>{labelUnidad}</div>
                                  </>
                                : <span style={{ fontSize: 11, color: 'rgba(128,128,128,0.3)' }}>—</span>
                            })()}
                          </div>
                          {/* Litros */}
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{p.litros.toFixed(1)}</span>
                            <div style={{ fontSize: 8, color: 'var(--muted)' }}>L</div>
                          </div>
                          {/* Monto */}
                          <div style={{ textAlign: 'right' }}>
                            {p.monto > 0
                              ? <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399' }}>{fmtPeso(p.monto)}</span>
                              : <span style={{ fontSize: 10, color: 'rgba(128,128,128,0.3)' }}>—</span>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Total litros</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)' }}>{c.litros.toFixed(1)} L</div>
                      </div>
                      {c.monto > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Total venta</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#34D399' }}>{fmtPesoFull(c.monto)}</div>
                        </div>
                      )}
                    </div>
                    {c.ultimoPedido && (
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                        Último pedido: {fmtFecha(c.ultimoPedido)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Ver más / Ver menos */}
      {filtrados.length > 10 && (
        <button
          onClick={() => setVerTodos(v => !v)}
          style={{
            marginTop: 12, width: '100%', padding: '10px 0',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 10, fontSize: 12, fontWeight: 700,
            color: 'var(--muted)', cursor: 'pointer',
          }}
        >
          {verTodos ? 'Ver menos ↑' : `Ver ${filtrados.length - 10} locales más ↓`}
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MetasClient({
  metasSemanales, metasMensuales, ventasMes, ventasSemana,
  fechaRef, mesInicio, mesFin, semanaInicio, semanaFin,
  periodo, vendedores, vendedorGrupos, periodosSemanas, periodosMeses, vendedorAvatars,
}: Props) {
  const isDesktop = useIsDesktop()

  // Persistir rango en localStorage para que sobreviva navegación y recarga
  const STORAGE_KEY = 'metas-range'
  const [rangeInicio, setRangeInicio] = useState<string>(() => {
    if (typeof window === 'undefined') return mesInicio
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (saved?.inicio && saved?.fin) return saved.inicio
    } catch {}
    return mesInicio
  })
  const [rangeFin, setRangeFin] = useState<string>(() => {
    if (typeof window === 'undefined') return mesFin
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (saved?.inicio && saved?.fin) return saved.fin
    } catch {}
    return mesFin
  })
  const [rangeAnalytics, setRangeAnalytics] = useState<AnalyticsExtended[] | null>(null)
  const [rangeProductos, setRangeProductos] = useState<ProductoCategoria[] | null>(null)
  const [rangeClientes, setRangeClientes]   = useState<ClienteDetalle[] | null>(null)
  const [loading, setLoading]         = useState(false)

  // Cargar datos si el rango guardado es diferente al default
  useEffect(() => {
    if (rangeInicio !== mesInicio || rangeFin !== mesFin) {
      fetchForRange(rangeInicio, rangeFin)
    }
  // Solo al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ciclos contables (24 del mes → 23 del mes siguiente) disponibles en la BD
  const ciclosPreset = useMemo(() => {
    const seen = new Set<string>()
    return [...periodosMeses, ...periodosSemanas.reduce<{ fecha_inicio: string; fecha_fin: string }[]>((acc, s) => {
      const key = `${s.fecha_inicio}|${s.fecha_fin}`
      if (!seen.has(key)) { seen.add(key); acc.push(s) }
      return acc
    }, [])].filter(p => {
      const key = `${p.fecha_inicio}|${p.fecha_fin}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map(p => {
      const [,mi,di] = p.fecha_inicio.split('-')
      const [,mf,df] = p.fecha_fin.split('-')
      const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
      return {
        label: `${parseInt(di)} ${M[parseInt(mi)-1]} – ${parseInt(df)} ${M[parseInt(mf)-1]}`,
        inicio: p.fecha_inicio,
        fin: p.fecha_fin,
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchForRange = useCallback(async (ini: string, fin: string) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/metas/analytics?inicio=${ini}&fin=${fin}`)
      const data = await res.json()

      if (data.sinMetas || !data.analytics?.length) {
        setRangeAnalytics([])
        setRangeProductos([])
        return
      }

      const dhRange = getDiasHabiles(new Date(ini), new Date(fin + 'T23:59:59'))
      const extendidos: AnalyticsExtended[] = (data.analytics as AnalyticsVendedor[]).map(a => {
        const ventasCrudas: { fecha: string; litros: number }[] = a.ventasDiariasRaw ?? []
        const pacingDataMes = buildPacingData(dhRange, a.metaMensual, ventasCrudas, fin)
        return {
          ...a,
          realizadoHoy: 0,
          metaDiaria: dhRange.length > 0 ? a.metaMensual / dhRange.length : 0,
          semaforoDiario: a.semaforoMes,
          porCanalHoy: [],
          barDataSemana: [],
          pacingDataMes,
        }
      })
      setRangeAnalytics(extendidos)
      setRangeProductos(data.productosPeriodo ?? [])
      setRangeClientes(data.clientesDetalle ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleRangeChange(ini: string, fin: string) {
    setRangeInicio(ini)
    setRangeFin(fin)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ inicio: ini, fin })) } catch {}
    if (ini === mesInicio && fin === mesFin) {
      setRangeAnalytics(null)
      setRangeProductos(null)
      setRangeClientes(null)
    } else {
      fetchForRange(ini, fin)
    }
  }

  // ── Legacy fetchForDate (kept for backward compat, currently unused) ──────────
  const fetchForDate = useCallback(async (fecha: string) => {
    if (fecha === fechaRef) {
      setRangeAnalytics(null)
      setRangeProductos(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/metas/analytics?fecha=${fecha}`)
      const data = await res.json()
      if (data.sinMetas || !data.analytics?.length) {
        setRangeAnalytics([])
        setRangeProductos([])
      } else {
        const ini = data.rangeInicio ?? mesInicio
        const fin = data.rangeFin    ?? mesFin
        const dhRange = getDiasHabiles(new Date(ini), new Date(fin + 'T23:59:59'))
        const extendidos: AnalyticsExtended[] = (data.analytics as AnalyticsVendedor[]).map(a => {
          const pacingDataMes = buildPacingData(dhRange, a.metaMensual, a.ventasDiariasRaw ?? [], fin)
          return {
            ...a,
            realizadoHoy: 0,
            metaDiaria: dhRange.length > 0 ? a.metaMensual / dhRange.length : 0,
            semaforoDiario: a.semaforoMes,
            porCanalHoy: [],
            barDataSemana: [],
            pacingDataMes,
          }
        })
        setRangeAnalytics(extendidos)
        setRangeProductos(data.productosPeriodo ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [fechaRef, mesInicio, mesFin])

  // ── Compute base analytics from props ────────────────────────────────────────
  const analytics = useMemo<AnalyticsExtended[]>(() => {
    const fechaD = new Date(fechaRef + 'T12:00:00')
    const dhMes = getDiasHabiles(new Date(mesInicio), new Date(mesFin + 'T23:59:59'))
    const dhSem = getDiasHabiles(new Date(semanaInicio), new Date(semanaFin + 'T23:59:59'))

    return vendedores.map(vendedor => {
      // Filtrar ventas al grupo del vendedor (si hay grupos definidos)
      const grupoNames = vendedorGrupos?.[vendedor]
      const vMes = grupoNames ? ventasMes.filter(v => grupoNames.includes(v.vendedor_actual)) : ventasMes
      const vSem = grupoNames ? ventasSemana.filter(v => grupoNames.includes(v.vendedor_actual)) : ventasSemana
      const vHoy = vMes.filter(v => v.fecha_pedido === fechaRef)

      // Metas solo aplican a Vendedor Planta; los demás grupos no tienen meta propia aún
      const esPlanta = vendedor === 'Vendedor Planta'
      const mSem = esPlanta ? metasSemanales : []
      const mMes = esPlanta ? metasMensuales : []

      const metaSemTotal = mSem.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
      const metaMesTotal = mMes.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
      const realMes = vMes.reduce((s, v) => s + (v.litros ?? 0), 0)
      const realSem = vSem.reduce((s, v) => s + (v.litros ?? 0), 0)
      const realizadoHoy = vHoy.reduce((s, v) => s + (v.litros ?? 0), 0)

      const dhMesTotal = dhMes.length
      const dhSemTotal = dhSem.length
      const dhMesTrans = getDiasHabilesTranscurridos(dhMes, fechaD)
      const dhSemTrans = getDiasHabilesTranscurridos(dhSem, fechaD)

      const espMes = getMetaEsperadaAFecha(metaMesTotal, dhMes, fechaD)
      const espSem = getMetaEsperadaAFecha(metaSemTotal, dhSem, fechaD)
      const faltMes = Math.max(0, metaMesTotal - realMes)
      const faltSem = Math.max(0, metaSemTotal - realSem)

      const metaDiaria = dhSemTotal > 0
        ? metaSemTotal / dhSemTotal
        : dhMesTotal > 0 ? metaMesTotal / dhMesTotal : 0

      const semaforoDiario = getEstadoSemaforo(realizadoHoy, metaDiaria)

      const allCanales = [...new Set([
        ...mMes.map(m => m.categoria_negocio),
        ...mSem.map(m => m.categoria_negocio),
      ])]

      const porCanalHoy: CanalDiario[] = allCanales.map(canal => {
        const metaS = mSem.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
        const metaDiariaCanal = dhSemTotal > 0 ? metaS / dhSemTotal : 0
        const rH = vHoy.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
        return {
          canal, realHoy: rH, metaDiaria: metaDiariaCanal,
          semaforo: getEstadoSemaforo(rH, metaDiariaCanal),
          color: CANAL_COLORS[canal] ?? '#6B7280',
        }
      }).filter(c => c.metaDiaria > 0).sort((a, b) => b.metaDiaria - a.metaDiaria)

      const porCanal: AnalyticsCanal[] = allCanales.map(canal => {
        const metaM = mMes.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
        const metaS = mSem.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
        const rM = vMes.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
        const rS = vSem.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
        const eM = getMetaEsperadaAFecha(metaM, dhMes, fechaD)
        const eS = getMetaEsperadaAFecha(metaS, dhSem, fechaD)
        return {
          canal,
          metaMensual: metaM, metaSemanal: metaS,
          realizadoMes: rM, realizadoSemana: rS,
          metaEsperadaMes: eM, metaEsperadaSemana: eS,
          pctMes: calcularCumplimiento(rM, metaM),
          pctSemana: calcularCumplimiento(rS, metaS),
          semaforoMes: getEstadoSemaforo(rM, eM),
          semaforoSemana: getEstadoSemaforo(rS, eS),
        }
      }).sort((a, b) => b.metaMensual - a.metaMensual)

      // Chart data
      const ventasCrudas = vMes.map(v => ({ fecha: v.fecha_pedido, litros: v.litros }))
      const barDataSemana = buildBarData(dhSem, ventasCrudas, fechaRef)
      const pacingDataMes = buildPacingData(dhMes, metaMesTotal, ventasCrudas, fechaRef)

      const semNum = mSem[0]?.semana_numero ?? 0
      const semLabel = semanaInicio ? `S${semNum} · ${fmtFecha(semanaInicio)} – ${fmtFecha(semanaFin)}` : ''

      return {
        vendedor, fecha: fechaRef,
        metaMensual: metaMesTotal, realizadoMes: realMes, metaEsperadaMes: espMes,
        pctCumplimientoMes: calcularCumplimiento(realMes, metaMesTotal),
        semaforoMes: getEstadoSemaforo(realMes, espMes),
        diasHabilesMes: dhMesTotal, diasTranscurridosMes: dhMesTrans, diasRestantesMes: dhMesTotal - dhMesTrans,
        faltanteMes: faltMes,
        promedioNecesarioDiarioMes: (dhMesTotal - dhMesTrans) > 0 ? faltMes / (dhMesTotal - dhMesTrans) : 0,
        mensajeMes: getMensajePredictivo(faltMes, dhMesTotal - dhMesTrans),
        semanaLabel: semLabel,
        metaSemanal: metaSemTotal, realizadoSemana: realSem, metaEsperadaSemana: espSem,
        pctCumplimientoSemana: calcularCumplimiento(realSem, metaSemTotal),
        semaforoSemana: getEstadoSemaforo(realSem, espSem),
        diasHabilesSemana: dhSemTotal, diasTranscurridosSemana: dhSemTrans, diasRestantesSemana: dhSemTotal - dhSemTrans,
        faltanteSemana: faltSem,
        promedioNecesarioDiarioSemana: (dhSemTotal - dhSemTrans) > 0 ? faltSem / (dhSemTotal - dhSemTrans) : 0,
        mensajeSemana: getMensajePredictivo(faltSem, dhSemTotal - dhSemTrans),
        porCanal,
        realizadoHoy,
        metaDiaria,
        semaforoDiario,
        porCanalHoy,
        barDataSemana,
        pacingDataMes,
      }
    })
  }, [metasSemanales, metasMensuales, ventasMes, ventasSemana, fechaRef, mesInicio, mesFin, semanaInicio, semanaFin, vendedores])

  // ── Compute base product breakdown from props ────────────────────────────────
  const baseProductos = useMemo(() => computeProductos(ventasMes), [ventasMes])

  // ── Compute base clientes from props ─────────────────────────────────────────
  const baseClientes = useMemo<ClienteDetalle[]>(() => {
    type PEntry = { categoria: string; envase: string | null; litros: number; monto: number }
    type CEntry = { canal: string | null; litros: number; monto: number; fechas: Set<string>; prods: Map<string, PEntry> }
    const map = new Map<string, CEntry>()

    for (const v of ventasMes) {
      const nombre = (v.nombre_fantasia ?? '').trim() || 'Sin nombre'
      if (!map.has(nombre)) map.set(nombre, { canal: v.categoria_negocio ?? null, litros: 0, monto: 0, fechas: new Set(), prods: new Map() })
      const e = map.get(nombre)!
      const litros = v.litros ?? 0
      const monto  = v.total_sin_impuesto ?? 0
      e.litros += litros
      e.monto  += monto
      if (v.fecha_pedido) e.fechas.add(v.fecha_pedido)
      const prod   = (v.producto ?? '').trim() || 'Sin nombre'
      const cat    = (v.categoria_producto ?? '').trim() || 'Sin categoría'
      const envase = (v.envase ?? '').trim() || null
      const key    = `${prod}||${envase ?? ''}`
      if (!e.prods.has(key)) e.prods.set(key, { categoria: cat, envase, litros: 0, monto: 0 })
      const p = e.prods.get(key)!
      p.litros += litros
      p.monto  += monto
    }

    function litrosPorUnidad(envase: string | null): number | null {
      if (!envase) return null
      const s = envase.toLowerCase()
      const cc = s.match(/(\d+(?:[.,]\d+)?)\s*cc/)
      if (cc) return parseFloat(cc[1].replace(',', '.')) / 1000
      const li = s.match(/(\d+(?:[.,]\d+)?)\s*l\b/)
      if (li) return parseFloat(li[1].replace(',', '.'))
      return null
    }

    return [...map.entries()]
      .map(([nombre, e]) => ({
        nombre, canal: e.canal,
        litros: Math.round(e.litros * 10) / 10,
        monto: Math.round(e.monto),
        pedidos: e.fechas.size,
        ultimoPedido: [...e.fechas].sort().at(-1) ?? '',
        productos: [...e.prods.entries()]
          .map(([key, { categoria, envase, litros, monto }]) => {
            const lpu = litrosPorUnidad(envase)
            return {
              producto: key.split('||')[0],
              categoria, envase,
              litros: Math.round(litros * 10) / 10,
              monto: Math.round(monto),
              unidades: lpu && lpu > 0 ? Math.round(litros / lpu) : null,
            }
          })
          .sort((a, b) => b.monto - a.monto),
      }))
      .filter(c => c.litros > 0)
      .sort((a, b) => b.monto - a.monto)
  }, [ventasMes])

  // ── Derived display values ────────────────────────────────────────────────────
  const activeAnalytics = rangeAnalytics ?? analytics
  const productosVista  = rangeProductos ?? baseProductos
  const activeClientes  = rangeClientes  ?? baseClientes
  const sinMetas = activeAnalytics.every(a => a.metaMensual === 0)

  const totalReal = activeAnalytics.reduce((s, a) => s + a.realizadoMes, 0)
  const totalMeta = activeAnalytics.reduce((s, a) => s + a.metaMensual, 0)
  const totalEsp  = activeAnalytics.reduce((s, a) => s + a.metaEsperadaMes, 0)
  const pctEquipo = calcularCumplimiento(totalReal, totalMeta)
  const semEquipo = getEstadoSemaforo(totalReal, totalEsp)

  const rangeLabel = fmtRangeBtn(rangeInicio, rangeFin)
  const equipoLabel = `Equipo · ${rangeLabel}`

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="px-5 pt-6 pb-28 lg:px-12 lg:pt-10" style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: isDesktop ? 28 : 16 }}>
        <AppHeader title="Metas Comerciales" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -10 }}>
          <Calendar size={13} color="var(--muted)" />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {rangeLabel} · Días hábiles L-V
          </span>
        </div>
      </div>

      {sinMetas ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <Target size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)', marginBottom: 6 }}>
            Sin metas cargadas para el período seleccionado
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Intenta seleccionar un rango de fechas diferente o carga las metas en el panel de administración.
          </p>
        </div>
      ) : (
        <>
          {/* KPI equipo */}
          <div style={{
            background: 'linear-gradient(135deg, #110D00 0%, #1C1500 100%)',
            border: `1px solid ${SEMAFORO_COLORS[semEquipo]}40`,
            borderRadius: 20, padding: isDesktop ? '20px 28px' : '14px 16px',
            marginBottom: isDesktop ? 24 : 14,
          }}>
            {isDesktop ? (
              /* Desktop: fila horizontal */
              <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 6 }}>{equipoLabel}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 40, fontWeight: 900, color: SEMAFORO_COLORS[semEquipo], letterSpacing: '-1.5px', lineHeight: 1 }}>{pctEquipo.toFixed(0)}%</span>
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>cumplimiento</span>
                  </div>
                </div>
                <div style={{ width: 1, height: 48, background: 'var(--border)', flexShrink: 0 }} />
                {[
                  { label: 'Realizado', value: `${fmt(totalReal)} L` },
                  { label: 'Meta',      value: `${fmt(totalMeta)} L` },
                  { label: 'Esperado',  value: `${fmt(totalEsp)} L`  },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.5px' }}>{value}</p>
                  </div>
                ))}
                <div style={{ marginLeft: 'auto' }}><SemaforoDot estado={semEquipo} /></div>
              </div>
            ) : (
              /* Mobile: compacto */
              <>
                <p style={{ fontSize: 8, fontWeight: 700, color: 'rgba(212,175,55,0.5)', letterSpacing: '1.6px', textTransform: 'uppercase', marginBottom: 8 }}>
                  {equipoLabel}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 36, fontWeight: 900, color: SEMAFORO_COLORS[semEquipo], letterSpacing: '-1.5px', lineHeight: 1 }}>{pctEquipo.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>cumplimiento</span>
                  </div>
                  <SemaforoDot estado={semEquipo} />
                </div>
                {/* 3 KPIs en grid compacto */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { label: 'Realizado', value: fmtL(totalReal), color: SEMAFORO_COLORS[semEquipo] },
                    { label: 'Meta',      value: fmtL(totalMeta), color: 'var(--cream)' },
                    { label: 'Esperado',  value: fmtL(totalEsp),  color: 'var(--muted)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '8px 8px' }}>
                      <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 3 }}>{label}</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'nowrap', minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color, letterSpacing: '-0.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                        <span style={{ fontSize: 9, color, opacity: 0.7, flexShrink: 0 }}>L</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Selector de rango de fechas + leyenda */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <DateRangePicker
                inicio={rangeInicio}
                fin={rangeFin}
                presets={ciclosPreset}
                onChange={handleRangeChange}
              />
              {(rangeInicio !== mesInicio || rangeFin !== mesFin) && (
                <button
                  onClick={() => handleRangeChange(mesInicio, mesFin)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--gold)', background: 'transparent',
                    color: 'var(--gold)', cursor: 'pointer',
                  }}
                >
                  Período actual
                </button>
              )}
              {loading && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Cargando…</span>}
            </div>

            {/* Leyenda semáforos — solo desktop */}
            {isDesktop && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {(['verde', 'amarillo', 'rojo'] as EstadoSemaforo[]).map(e => (
                  <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEMAFORO_COLORS[e] }} />
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {SEMAFORO_LABELS[e]} ({e === 'verde' ? '≥95%' : e === 'amarillo' ? '75–95%' : '<75%'} vs esperado)
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Leyenda compacta móvil */}
            {!isDesktop && (
              <div style={{ display: 'flex', gap: 10 }}>
                {(['verde', 'amarillo', 'rojo'] as EstadoSemaforo[]).map(e => (
                  <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: SEMAFORO_COLORS[e] }} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {e === 'verde' ? '≥95%' : e === 'amarillo' ? '75–95%' : '<75%'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grid de vendedores — ocultar regiones sin datos aún */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(auto-fit, minmax(400px, 1fr))' : '1fr', gap: isDesktop ? 24 : 14 }}>
            {activeAnalytics
              .filter(a => a.realizadoMes > 0 || a.metaMensual > 0)
              .map(a => (
                <VendedorCard key={a.vendedor} analytics={a} rangeLabel={rangeLabel} avatarUrl={vendedorAvatars?.[a.vendedor]} />
              ))}
          </div>

          {/* Locales vendidos */}
          <LocalesSection clientes={activeClientes} rangeLabel={rangeLabel} />

          {/* Sección de productos */}
          <ProductosSection
            productos={productosVista}
            label={equipoLabel}
          />
        </>
      )}
    </div>
  )
}
