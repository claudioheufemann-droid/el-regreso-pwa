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

type Vista = 'diario' | 'semanal' | 'mensual'

interface VentaRow {
  vendedor_actual: string
  litros: number
  categoria_negocio: string | null
  fecha_pedido: string
  categoria_producto?: string | null
  producto?: string | null
}

interface ProductoItem { nombre: string; litros: number }
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
  periodosSemanas: PeriodoSemana[]
  periodosMeses: PeriodoMes[]
  vendedorAvatars?: Record<string, string | null>
}

function fmt(n: number) { return n.toFixed(1) }

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
        fontSize="36" fontWeight="900" fontFamily="inherit">
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
    <svg width={W} height={H + 32} viewBox={`0 0 ${W} ${H + 32}`} style={{ display: 'block', margin: '0 auto' }}>
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

function CanalRow({ c, vista, canalDiario }: { c: AnalyticsCanal; vista: Vista; canalDiario?: CanalDiario }) {
  const color = CANAL_COLORS[c.canal] ?? '#6B7280'

  if (vista === 'diario') {
    if (!canalDiario || canalDiario.metaDiaria <= 0) return null
    const pct = calcularCumplimiento(canalDiario.realHoy, canalDiario.metaDiaria)
    return (
      <div style={{
        padding: '11px 14px', borderRadius: 12, background: 'var(--surface2)',
        borderLeft: `3px solid ${SEMAFORO_COLORS[canalDiario.semaforo]}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{c.canal}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(canalDiario.realHoy)} / {fmt(canalDiario.metaDiaria)} L</span>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100,
              background: SEMAFORO_BG[canalDiario.semaforo], color: SEMAFORO_COLORS[canalDiario.semaforo],
              border: `1px solid ${SEMAFORO_COLORS[canalDiario.semaforo]}40`,
            }}>{pct.toFixed(0)}%</span>
          </div>
        </div>
        <BarraDual meta={canalDiario.metaDiaria} realizado={canalDiario.realHoy} esperado={canalDiario.metaDiaria} semaforo={canalDiario.semaforo} />
      </div>
    )
  }

  const meta     = vista === 'mensual' ? c.metaMensual     : c.metaSemanal
  const real     = vista === 'mensual' ? c.realizadoMes    : c.realizadoSemana
  const esperado = vista === 'mensual' ? c.metaEsperadaMes : c.metaEsperadaSemana
  const pct      = vista === 'mensual' ? c.pctMes          : c.pctSemana
  const semaforo = vista === 'mensual' ? c.semaforoMes     : c.semaforoSemana
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

function VendedorCard({ analytics, vista, avatarUrl }: { analytics: AnalyticsExtended; vista: Vista; avatarUrl?: string | null }) {
  const isDiario  = vista === 'diario'
  const esMensual = vista === 'mensual'

  const meta      = isDiario  ? analytics.metaDiaria
                  : esMensual ? analytics.metaMensual           : analytics.metaSemanal
  const real      = isDiario  ? analytics.realizadoHoy
                  : esMensual ? analytics.realizadoMes          : analytics.realizadoSemana
  const esperado  = isDiario  ? analytics.metaDiaria
                  : esMensual ? analytics.metaEsperadaMes       : analytics.metaEsperadaSemana
  const pct       = isDiario  ? calcularCumplimiento(analytics.realizadoHoy, analytics.metaDiaria)
                  : esMensual ? analytics.pctCumplimientoMes    : analytics.pctCumplimientoSemana
  const semaforo  = isDiario  ? analytics.semaforoDiario
                  : esMensual ? analytics.semaforoMes           : analytics.semaforoSemana
  const faltante  = esMensual ? analytics.faltanteMes           : analytics.faltanteSemana
  const diasRest  = esMensual ? analytics.diasRestantesMes      : analytics.diasRestantesSemana
  const diasTrans = esMensual ? analytics.diasTranscurridosMes  : analytics.diasTranscurridosSemana
  const diasTotal = esMensual ? analytics.diasHabilesMes        : analytics.diasHabilesSemana
  const promNec   = esMensual ? analytics.promedioNecesarioDiarioMes : analytics.promedioNecesarioDiarioSemana
  const metaCumplida = real >= meta && meta > 0

  return (
    <div className="card-hover animate-fade-in" style={{
      background: 'var(--surface)',
      border: `1px solid ${metaCumplida ? 'rgba(74,122,58,0.4)' : 'var(--border)'}`,
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 4, background: SEMAFORO_COLORS[semaforo] }} />

      {/* Header */}
      <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 30, fontWeight: 900, color: SEMAFORO_COLORS[semaforo], letterSpacing: '-1px', lineHeight: 1 }}>
            {pct.toFixed(0)}%
          </p>
          <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>cumplimiento</p>
        </div>
      </div>

      {/* Chart — reactive según vista */}
      <div style={{ padding: '0 20px 4px' }}>
        {isDiario && (
          <GaugeChart pct={pct} semaforo={semaforo} meta={meta} realizado={real} />
        )}
        {vista === 'semanal' && analytics.barDataSemana.length > 0 && (
          <WeekBarChart
            data={analytics.barDataSemana}
            metaDiaria={analytics.metaDiaria}
            semaforo={semaforo}
          />
        )}
        {esMensual && analytics.pacingDataMes.length >= 2 && (
          <PacingLineChart
            data={analytics.pacingDataMes}
            meta={analytics.metaMensual}
            semaforo={semaforo}
          />
        )}
      </div>

      {/* Leyenda del chart */}
      {(vista === 'semanal' || esMensual) && (
        <div style={{ padding: '0 20px 10px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {vista === 'semanal' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: SEMAFORO_COLORS.verde }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>≥95% meta</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: SEMAFORO_COLORS.amarillo }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>75–95%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: SEMAFORO_COLORS.rojo }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>&lt;75%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 6, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Fondo = meta diaria</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 16, height: 6, borderRadius: 3, background: SEMAFORO_COLORS[semaforo], opacity: 0.5 }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Realizado acumulado</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 16, height: 1.5, borderTop: '1.5px dashed rgba(255,255,255,0.28)' }} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Pacing ideal</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ padding: '0 20px 14px' }}>
        <BarraDual meta={meta} realizado={real} esperado={esperado} semaforo={semaforo} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            Real: <strong style={{ color: 'var(--cream)' }}>{fmt(real)} L</strong>
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            Meta: <strong style={{ color: 'var(--cream)' }}>{fmt(meta)} L</strong>
          </span>
          {!isDiario && (
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              Esperado: <strong style={{ color: 'var(--cream)' }}>{fmt(esperado)} L</strong>
            </span>
          )}
        </div>
      </div>

      {/* KPI chips */}
      <div style={{ padding: '0 20px 14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Meta', value: `${fmt(meta)} L` },
          { label: 'Realizado', value: `${fmt(real)} L` },
          { label: metaCumplida ? '✓ Logrado' : 'Faltante', value: metaCumplida ? `+${fmt(real - meta)} L` : `${fmt(Math.max(0, meta - real))} L` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--surface2)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 4 }}>
              {label}
            </p>
            <p style={{ fontSize: 14, fontWeight: 800, color: metaCumplida && label.startsWith('✓') ? '#4A7A3A' : 'var(--cream)', letterSpacing: '-0.3px' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Días hábiles bar */}
      {!isDiario && (
        <div style={{ padding: '0 20px 14px' }}>
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
      )}

      {/* Proyección */}
      {!isDiario && !metaCumplida && diasRest > 0 && (
        <div style={{
          margin: '0 20px 14px', padding: '10px 14px', borderRadius: 12,
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
          margin: '0 20px 14px', padding: '10px 14px', borderRadius: 12,
          background: 'rgba(74,122,58,0.1)', border: '1px solid rgba(74,122,58,0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={15} color="#4A7A3A" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4A7A3A' }}>¡Meta cumplida!</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Excedente: +{fmt(real - meta)} L</span>
        </div>
      )}

      {/* Canales */}
      <div style={{ padding: '0 20px 20px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          Por canal · {vista}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isDiario
            ? analytics.porCanalHoy.map(cd => (
                <CanalRow
                  key={cd.canal}
                  c={analytics.porCanal.find(c => c.canal === cd.canal) ?? { canal: cd.canal } as AnalyticsCanal}
                  vista={vista}
                  canalDiario={cd}
                />
              ))
            : analytics.porCanal.map(c => (
                <CanalRow key={c.canal} c={c} vista={vista} />
              ))
          }
        </div>
      </div>
    </div>
  )
}

// ─── Dropdown de período ──────────────────────────────────────────────────────

interface DropOption { value: string; label: string; group?: string }

function PeriodDropdown({ options, value, onChange, placeholder }: {
  options: DropOption[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const groups: { name: string; items: DropOption[] }[] = []
  options.forEach(opt => {
    const g = opt.group ?? ''
    let grp = groups.find(x => x.name === g)
    if (!grp) { grp = { name: g, items: [] }; groups.push(grp) }
    grp.items.push(opt)
  })

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--cream)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'border-color 0.15s',
          borderColor: open ? 'var(--gold)' : 'var(--border)',
        }}
      >
        <span>{selected?.label ?? placeholder ?? '—'}</span>
        <ChevronDown size={14} color="var(--muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, minWidth: 200, maxHeight: 300, overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {groups.map(grp => (
            <div key={grp.name}>
              {grp.name && (
                <p style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {grp.name}
                </p>
              )}
              {grp.items.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 14px', fontSize: 13, fontWeight: opt.value === value ? 700 : 400,
                    color: opt.value === value ? 'var(--gold)' : 'var(--cream)',
                    background: opt.value === value ? 'var(--gold-dim)' : 'transparent',
                    border: 'none', cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = opt.value === value ? 'var(--gold-dim)' : 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = opt.value === value ? 'var(--gold-dim)' : 'transparent')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Productos ───────────────────────────────────────────────────────────────

const CAT_PRODUCTO: Record<string, { emoji: string; color: string }> = {
  'Cerveza':        { emoji: '🍺', color: '#D4AF37' },
  'Kombucha':       { emoji: '🫧', color: '#4ADE80' },
  'Sin categoría':  { emoji: '📦', color: '#6B7280' },
}

function computeProductos(ventas: VentaRow[]): ProductoCategoria[] {
  const map = new Map<string, Map<string, number>>()
  for (const v of ventas) {
    if (!v.litros) continue
    const cat  = v.categoria_producto?.trim() || 'Sin categoría'
    const prod = v.producto?.trim()           || 'Sin nombre'
    if (!map.has(cat)) map.set(cat, new Map())
    const pm = map.get(cat)!
    pm.set(prod, (pm.get(prod) ?? 0) + v.litros)
  }
  return [...map.entries()]
    .map(([categoria, pm]) => ({
      categoria,
      total: [...pm.values()].reduce((s, l) => s + l, 0),
      productos: [...pm.entries()]
        .map(([nombre, litros]) => ({ nombre, litros }))
        .sort((a, b) => b.litros - a.litros),
    }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
}

function ProductoBar({ nombre, litros, total, color }: {
  nombre: string; litros: number; total: number; color: string
}) {
  const pct = total > 0 ? Math.min(100, (litros / total) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{
          fontSize: 12, color: 'var(--cream)', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10,
        }}>{nombre}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>{litros.toFixed(1)} L</span>
          <span style={{
            fontSize: 10, color, fontWeight: 700,
            background: `${color}18`, border: `1px solid ${color}30`,
            padding: '1px 6px', borderRadius: 8,
          }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div style={{ height: 5, borderRadius: 5, background: 'rgba(255,255,255,0.06)' }}>
        <div className="animate-progress" style={{
          height: '100%', borderRadius: 5,
          width: `${pct}%`, background: color, opacity: 0.75,
        }} />
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
          <ProductoBar key={p.nombre} nombre={p.nombre} litros={p.litros} total={cat.total} color={cfg.color} />
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

function ProductosSection({ productos, vista, label }: {
  productos: ProductoCategoria[]; vista: Vista; label: string
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MetasClient({
  metasSemanales, metasMensuales, ventasMes, ventasSemana,
  fechaRef, mesInicio, mesFin, semanaInicio, semanaFin,
  periodo, vendedores, periodosSemanas, periodosMeses, vendedorAvatars,
}: Props) {
  const isDesktop = useIsDesktop()
  const [vista, setVista] = useState<Vista>('semanal')
  const [navDate, setNavDate] = useState<string>(fechaRef)
  const [navAnalytics, setNavAnalytics] = useState<AnalyticsExtended[] | null>(null)
  const [navMeta, setNavMeta] = useState<{ semanaLabel: string; mesNombre: string; fecha: string } | null>(null)
  const [navProductos, setNavProductos] = useState<{ mes: ProductoCategoria[]; semana: ProductoCategoria[]; dia: ProductoCategoria[] } | null>(null)
  const [loading, setLoading] = useState(false)

  // Re-fetch when switching vista while on a non-default date
  useEffect(() => {
    if (navDate !== fechaRef && navAnalytics !== null) {
      fetchForDate(navDate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista])

  const fetchForDate = useCallback(async (fecha: string) => {
    if (fecha === fechaRef) {
      setNavAnalytics(null)
      setNavMeta(null)
      setNavProductos(null)
      setNavDate(fechaRef)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/metas/analytics?fecha=${fecha}`)
      const data = await res.json()
      if (data.sinMetas || !data.analytics?.length) {
        setNavAnalytics([])
        setNavMeta({ semanaLabel: '', mesNombre: '', fecha })
        setNavProductos({ mes: [], semana: [], dia: [] })
      } else {
        const fechaD = new Date(fecha + 'T12:00:00')
        const mesN = `${MESES_NOMBRE[fechaD.getMonth()]} ${fechaD.getFullYear()}`

        const extendidos: AnalyticsExtended[] = data.analytics.map((a: AnalyticsVendedor) => {
          const dhSemTotal = a.diasHabilesSemana
          const metaDiaria = dhSemTotal > 0
            ? a.metaSemanal / dhSemTotal
            : a.diasHabilesMes > 0 ? a.metaMensual / a.diasHabilesMes : 0

          const realizadoHoy = a.realizadoHoy ?? 0
          const apiCanalesHoy: { canal: string; realHoy: number }[] = a.porCanalHoy ?? []
          const ventasCrudas: { fecha: string; litros: number }[] = a.ventasDiariasRaw ?? []

          const porCanalHoy: CanalDiario[] = a.porCanal
            .filter(c => c.metaSemanal > 0)
            .map(c => {
              const mD = dhSemTotal > 0 ? c.metaSemanal / dhSemTotal : 0
              const rH = apiCanalesHoy.find(p => p.canal === c.canal)?.realHoy ?? 0
              return { canal: c.canal, realHoy: rH, metaDiaria: mD, semaforo: getEstadoSemaforo(rH, mD), color: CANAL_COLORS[c.canal] ?? '#6B7280' }
            })
            .sort((x, y) => y.metaDiaria - x.metaDiaria)

          // Build chart data from API's ventasDiariasRaw
          // We need dhSem and dhMes ranges — use semanaLabel + mesActivo from API response
          // Fallback: use the date +/- context to find period boundaries
          const semIni = a.semanaLabel?.match(/(\d{4}-\d{2}-\d{2})/)
            ? a.semanaLabel.match(/(\d{4}-\d{2}-\d{2})/)![1]
            : fecha
          // Build dhSem from the period info we have
          // Since we don't have exact dhSem from API, derive from API analytics fields
          const dhSemCount = a.diasHabilesSemana
          const dhMesCount = a.diasHabilesMes

          // Approximate: build from meta proportional data
          // We use ventasCrudas grouped by week/month for bar + pacing
          const barDataSemana: BarDia[] = (() => {
            // Find unique working days in ventasCrudas that fall in [semanaInicio, semanaFin]
            // Since we don't have exact week boundaries, use dias from ventas
            // Build 5-slot array based on day-of-week
            const ventasPorDia = new Map<string, number>()
            ventasCrudas.forEach(v => {
              const existing = ventasPorDia.get(v.fecha) ?? 0
              ventasPorDia.set(v.fecha, existing + v.litros)
            })
            // Get week of fechaRef: Mon-Fri
            const fD = new Date(fecha + 'T12:00:00')
            const dow = fD.getDay() // 0=Sun,1=Mon,...
            const mondayOffset = dow === 0 ? -6 : 1 - dow
            const monday = new Date(fD)
            monday.setDate(fD.getDate() + mondayOffset)
            return Array.from({ length: 5 }, (_, i) => {
              const day = new Date(monday)
              day.setDate(monday.getDate() + i)
              const dia = day.toISOString().split('T')[0]
              return {
                dia, label: DIA_LABELS[i],
                litros: ventasPorDia.get(dia) ?? 0,
                isToday: dia === fecha,
                isFuture: dia > fecha,
              }
            })
          })()

          const pacingDataMes: PacingDia[] = (() => {
            if (dhMesCount === 0) return []
            // Group all ventasCrudas acumulativamente
            const ventasPorDia = new Map<string, number>()
            ventasCrudas.forEach(v => {
              const existing = ventasPorDia.get(v.fecha) ?? 0
              ventasPorDia.set(v.fecha, existing + v.litros)
            })
            // Get all unique days sorted
            const allDias = [...ventasPorDia.keys()].sort()
            if (allDias.length === 0) return []
            // Build pacing from mesInicio to mesFin using dhMesCount
            // We approximate using the sorted venta days
            let acum = 0
            const totalMeta = a.metaMensual
            return allDias.map((dia, idx) => {
              acum += ventasPorDia.get(dia) ?? 0
              return {
                dia,
                label: fmtFecha(dia),
                realAcum: acum,
                metaIdeal: dhMesCount > 0 ? totalMeta * (idx + 1) / dhMesCount : 0,
                isFuture: dia > fecha,
              }
            })
          })()

          return {
            ...a,
            realizadoHoy,
            metaDiaria,
            semaforoDiario: getEstadoSemaforo(realizadoHoy, metaDiaria),
            porCanalHoy,
            barDataSemana,
            pacingDataMes,
          }
        })

        setNavAnalytics(extendidos)
        setNavMeta({ semanaLabel: data.analytics[0]?.semanaLabel ?? '', mesNombre: mesN, fecha })
        setNavProductos({
          mes:    data.productosMes    ?? [],
          semana: data.productosSemana ?? [],
          dia:    data.productosDia    ?? [],
        })
      }
    } finally {
      setLoading(false)
    }
    setNavDate(fecha)
  }, [fechaRef])

  function navigate(dir: 1 | -1) {
    const next = navStep(navDate, vista, dir)
    fetchForDate(next)
    setNavDate(next)
  }

  // ── Compute base analytics from props ────────────────────────────────────────
  const analytics = useMemo<AnalyticsExtended[]>(() => {
    const fechaD = new Date(fechaRef + 'T12:00:00')
    const dhMes = getDiasHabiles(new Date(mesInicio), new Date(mesFin + 'T23:59:59'))
    const dhSem = getDiasHabiles(new Date(semanaInicio), new Date(semanaFin + 'T23:59:59'))

    return vendedores.map(vendedor => {
      const mSem = metasSemanales.filter(m => m.vendedor === vendedor)
      const mMes = metasMensuales.filter(m => m.vendedor === vendedor)
      const vMes = ventasMes.filter(v => v.vendedor_actual === vendedor)
      const vSem = ventasSemana.filter(v => v.vendedor_actual === vendedor)
      const vHoy = vMes.filter(v => v.fecha_pedido === fechaRef)

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
  const baseProductos = useMemo(() => ({
    mes:    computeProductos(ventasMes),
    semana: computeProductos(ventasSemana),
    dia:    computeProductos(ventasSemana.filter(v => v.fecha_pedido === fechaRef)),
  }), [ventasMes, ventasSemana, fechaRef])

  // ── Derived display values ────────────────────────────────────────────────────
  const activeAnalytics = navAnalytics ?? analytics
  const productosActivos = navProductos ?? baseProductos
  const productosVista = vista === 'diario' ? productosActivos.dia
    : vista === 'mensual' ? productosActivos.mes
    : productosActivos.semana
  const sinMetas = activeAnalytics.every(a => a.metaMensual === 0 && a.metaSemanal === 0)

  const totalReal = activeAnalytics.reduce((s, a) =>
    s + (vista === 'mensual' ? a.realizadoMes : vista === 'diario' ? a.realizadoHoy : a.realizadoSemana), 0)
  const totalMeta = activeAnalytics.reduce((s, a) =>
    s + (vista === 'mensual' ? a.metaMensual : vista === 'diario' ? a.metaDiaria : a.metaSemanal), 0)
  const totalEsp = activeAnalytics.reduce((s, a) =>
    s + (vista === 'mensual' ? a.metaEsperadaMes : vista === 'diario' ? a.metaDiaria : a.metaEsperadaSemana), 0)
  const pctEquipo = calcularCumplimiento(totalReal, totalMeta)
  const semEquipo = getEstadoSemaforo(totalReal, totalEsp)

  const mesNombreBase = mesInicio
    ? `${MESES_NOMBRE[parseInt(mesInicio.split('-')[1]) - 1]} ${mesInicio.split('-')[0]}`
    : ''
  const semanaLabelBase = analytics[0]?.semanaLabel ?? ''
  const semanaLabel = navMeta?.semanaLabel ?? semanaLabelBase
  const mesNombre   = navMeta?.mesNombre   ?? mesNombreBase
  const diaLabel    = fmtFecha(navDate)

  const equipoLabel = vista === 'diario' ? `Día · ${diaLabel}`
    : vista === 'semanal' ? `Equipo · ${semanaLabel}`
    : `Equipo · ${mesNombre}`

  const tabs: { key: Vista; label: string }[] = [
    { key: 'diario',  label: 'Día' },
    { key: 'semanal', label: 'Semana' },
    { key: 'mensual', label: 'Mes' },
  ]

  const opcionesSemanas: DropOption[] = periodosSemanas.map(s => {
    const mesIdx = parseInt(s.fecha_inicio.split('-')[1]) - 1
    const year   = s.fecha_inicio.split('-')[0]
    const group  = `${MESES_FULL[mesIdx]} ${year}`
    const label  = `S${s.semana_numero} · ${fmtFecha(s.fecha_inicio)} – ${fmtFecha(s.fecha_fin)}`
    return { value: s.fecha_inicio, label, group }
  })

  const opcionesMeses: DropOption[] = periodosMeses.map(m => {
    const mesIdx = parseInt(m.fecha_inicio.split('-')[1]) - 1
    const year   = m.fecha_inicio.split('-')[0]
    return { value: m.fecha_inicio, label: `${MESES_FULL[mesIdx]} ${year}` }
  })

  const activeSemanaValue = periodosSemanas.find(s =>
    navDate >= s.fecha_inicio && navDate <= s.fecha_fin
  )?.fecha_inicio ?? semanaInicio

  const activeMesValue = periodosMeses.find(m =>
    navDate >= m.fecha_inicio && navDate <= m.fecha_fin
  )?.fecha_inicio ?? mesInicio

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 pt-8 pb-16 lg:px-12 lg:pt-10" style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: isDesktop ? 28 : 16 }}>
        <h1 style={{ fontSize: isDesktop ? 32 : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Metas Comerciales
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Calendar size={13} color="var(--muted)" />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Trimestre Mayo–Julio 2026 · Escenario optimista · Días hábiles L-V
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
            Sin metas cargadas para la fecha actual
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Ejecuta el script de importación desde la raíz del proyecto:
          </p>
          <code style={{
            display: 'inline-block', padding: '8px 16px', borderRadius: 8,
            background: 'var(--surface2)', color: 'var(--gold)', fontSize: 13, fontFamily: 'monospace',
          }}>
            node scripts/import-metas-trimestre.mjs
          </code>
        </div>
      ) : (
        <>
          {/* KPI equipo */}
          <div style={{
            background: 'linear-gradient(135deg, #110D00 0%, #1C1500 100%)',
            border: `1px solid ${SEMAFORO_COLORS[semEquipo]}40`,
            borderRadius: 20, padding: isDesktop ? '20px 28px' : '16px 18px', marginBottom: isDesktop ? 24 : 14,
            display: 'flex', alignItems: isDesktop ? 'center' : 'flex-start', gap: isDesktop ? 40 : 16, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 6 }}>
                {equipoLabel}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 40, fontWeight: 900, color: SEMAFORO_COLORS[semEquipo], letterSpacing: '-1.5px', lineHeight: 1 }}>
                  {pctEquipo.toFixed(0)}%
                </span>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>cumplimiento</span>
              </div>
            </div>
            {isDesktop && <div style={{ width: 1, height: 48, background: 'var(--border)', flexShrink: 0 }} />}
            {[
              { label: 'Realizado', value: `${fmt(totalReal)} L` },
              { label: 'Meta', value: `${fmt(totalMeta)} L` },
              ...(vista !== 'diario' ? [{ label: 'Esperado', value: `${fmt(totalEsp)} L` }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.5px' }}>{value}</p>
              </div>
            ))}
            <div style={{ marginLeft: 'auto' }}>
              <SemaforoDot estado={semEquipo} />
            </div>
          </div>

          {/* Tabs + selectores de período */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Tabs */}
              <div style={{ display: 'flex', borderRadius: 12, padding: 4, background: 'var(--surface)', gap: 2 }}>
                {tabs.map(tab => (
                  <button key={tab.key}
                    onClick={() => setVista(tab.key)}
                    style={{
                      padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                      border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      background: vista === tab.key ? 'var(--gold)' : 'transparent',
                      color: vista === tab.key ? '#080808' : 'var(--muted)',
                      transition: 'all 0.15s',
                    }}
                  >{tab.label}</button>
                ))}
              </div>

              {/* Selector de período */}
              {vista === 'diario' && (
                <input
                  type="date"
                  value={navDate}
                  onChange={e => {
                    const v = e.target.value
                    if (v) { setNavDate(v); fetchForDate(v) }
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: 10,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--cream)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', colorScheme: 'dark', outline: 'none',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              )}

              {vista === 'semanal' && opcionesSemanas.length > 0 && (
                <PeriodDropdown
                  options={opcionesSemanas}
                  value={activeSemanaValue}
                  onChange={v => { setNavDate(v); fetchForDate(v) }}
                />
              )}

              {vista === 'mensual' && opcionesMeses.length > 0 && (
                <PeriodDropdown
                  options={opcionesMeses}
                  value={activeMesValue}
                  onChange={v => { setNavDate(v); fetchForDate(v) }}
                />
              )}

              {navDate !== fechaRef && (
                <button
                  onClick={() => { fetchForDate(fechaRef); setNavDate(fechaRef) }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--gold)', background: 'transparent',
                    color: 'var(--gold)', cursor: 'pointer',
                  }}
                >
                  Hoy
                </button>
              )}
              {loading && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Cargando…</span>}
            </div>

            {/* Leyenda semáforos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {(['verde', 'amarillo', 'rojo'] as EstadoSemaforo[]).map(e => (
                <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEMAFORO_COLORS[e] }} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {SEMAFORO_LABELS[e]} ({e === 'verde' ? '≥95%' : e === 'amarillo' ? '75–95%' : '<75%'} vs esperado)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Grid de vendedores */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(auto-fit, minmax(400px, 1fr))' : '1fr', gap: isDesktop ? 24 : 14 }}>
            {activeAnalytics.map(a => (
              <VendedorCard key={a.vendedor} analytics={a} vista={vista} avatarUrl={vendedorAvatars?.[a.vendedor]} />
            ))}
          </div>

          {/* Sección de productos */}
          <ProductosSection
            productos={productosVista}
            vista={vista}
            label={equipoLabel}
          />
        </>
      )}
    </div>
  )
}
