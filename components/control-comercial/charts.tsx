'use client'

/**
 * Gráficos de Control Comercial. Todos son SVG propios (sin librería) para
 * poder controlar densidad y proporciones a 375px, que es donde se usan.
 *
 * Regla del módulo: si no hay serie real, el componente no dibuja nada —
 * nunca una línea plana o inventada que parezca un dato.
 */

import { useState, type ReactNode } from 'react'
import { formatCompacto } from './ui'

// ── Sparkline ───────────────────────────────────────────────────────────────

export interface SparkProps {
  valores: number[]
  color?: string
  ancho?: number
  alto?: number
  relleno?: boolean
}

/** Mini tendencia dentro de un KPI. Devuelve null si no hay al menos 2 puntos reales. */
export function Sparkline({ valores, color = 'var(--cc-green)', ancho = 64, alto = 26, relleno = true }: SparkProps) {
  const puntos = valores.filter(v => Number.isFinite(v))
  if (puntos.length < 2) return null

  const max = Math.max(...puntos)
  const min = Math.min(...puntos)
  const rango = max - min || 1
  const paso = ancho / (puntos.length - 1)
  const y = (v: number) => alto - 2 - ((v - min) / rango) * (alto - 4)

  const d = puntos.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * paso).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${d} L${ancho},${alto} L0,${alto} Z`
  const gid = `spark-${color.replace(/[^a-z]/gi, '')}-${puntos.length}`

  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} style={{ display: 'block', flexShrink: 0 }} aria-hidden>
      {relleno && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Barras comparativas por período (2026 vs 2025) ──────────────────────────

export interface BarrasProps {
  labels: string[]
  actual: number[]
  comparado: number[]
  etiquetaActual: string
  etiquetaComparada: string
  formatear: (n: number) => string
  /** Índice a destacar con la burbuja (por defecto, el último período con valor). */
  destacado?: number | null
  alto?: number
}

export function BarrasComparativas({
  labels, actual, comparado, etiquetaActual, etiquetaComparada, formatear, destacado, alto = 210,
}: BarrasProps) {
  const [activo, setActivo] = useState<number | null>(null)

  const ultimoConValor = actual.reduce((acc, v, i) => (v > 0 ? i : acc), -1)
  const foco = activo ?? destacado ?? (ultimoConValor >= 0 ? ultimoConValor : null)

  const W = 340
  const H = alto
  const EJE_L = 34
  const EJE_B = 20
  const TOP = 26
  const plotW = W - EJE_L - 4
  const plotH = H - TOP - EJE_B

  const maxDato = Math.max(1, ...actual, ...comparado)
  const paso = Math.pow(10, Math.floor(Math.log10(maxDato)))
  const max = Math.ceil(maxDato / (paso / 2)) * (paso / 2)

  const n = Math.max(1, labels.length)
  const grupo = plotW / n
  const barW = Math.max(3, Math.min(11, grupo * 0.34))
  const y = (v: number) => TOP + plotH - (v / max) * plotH

  const niveles = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
        <Leyenda color="var(--cc-gold)" texto={etiquetaActual} />
        <Leyenda color="var(--cc-neutral)" texto={etiquetaComparada} />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img">
        {niveles.map(f => {
          const yy = y(max * f)
          return (
            <g key={f}>
              <line
                x1={EJE_L} x2={W - 2} y1={yy} y2={yy}
                stroke="var(--cc-line-soft)" strokeWidth={1}
                strokeDasharray={f === 0 ? undefined : '3 4'}
              />
              <text x={EJE_L - 6} y={yy + 3} textAnchor="end" fontSize={8} fill="var(--cc-ink-3)" fontWeight={600}>
                {f === 0 ? '0' : formatCompacto(max * f)}
              </text>
            </g>
          )
        })}

        {labels.map((lab, i) => {
          const cx = EJE_L + grupo * i + grupo / 2
          const va = actual[i] ?? 0
          const vc = comparado[i] ?? 0
          const esFoco = foco === i
          const hc = Math.max(0, TOP + plotH - y(vc))
          const ha = Math.max(0, TOP + plotH - y(va))
          return (
            <g key={lab + i}>
              {vc > 0 && <rect x={cx - barW - 1.5} y={y(vc)} width={barW} height={hc} rx={2} fill="var(--cc-neutral)" opacity={esFoco ? 0.95 : 0.7} />}
              {va > 0 && <rect x={cx + 1.5} y={y(va)} width={barW} height={ha} rx={2} fill="var(--cc-gold)" opacity={esFoco || foco === null ? 1 : 0.55} />}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={8.5} fill={esFoco ? 'var(--cc-ink)' : 'var(--cc-ink-3)'} fontWeight={esFoco ? 800 : 600}>
                {lab}
              </text>
              <rect
                x={EJE_L + grupo * i} y={TOP} width={grupo} height={plotH} fill="transparent"
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setActivo(i)}
                onPointerDown={() => setActivo(i)}
                onPointerLeave={() => setActivo(null)}
              />
            </g>
          )
        })}

        {foco !== null && (actual[foco] ?? 0) > 0 && (() => {
          const cx = EJE_L + grupo * foco + grupo / 2 + 1.5 + barW / 2
          const texto = formatCompacto(actual[foco])
          const w = Math.max(30, texto.length * 6 + 12)
          const yTop = Math.max(2, y(actual[foco]) - 24)
          const x = Math.min(W - w - 2, Math.max(EJE_L, cx - w / 2))
          return (
            <g pointerEvents="none">
              <rect x={x} y={yTop} width={w} height={17} rx={5} fill="var(--cc-gold)" />
              <text x={x + w / 2} y={yTop + 12} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="var(--cc-on-gold)">{texto}</text>
              <path d={`M${cx - 4},${yTop + 17} L${cx + 4},${yTop + 17} L${cx},${yTop + 22} Z`} fill="var(--cc-gold)" />
            </g>
          )
        })()}
      </svg>

      {foco !== null && (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--cc-ink-2)', fontWeight: 700 }}>{labels[foco]}</span>
          <span style={{ fontSize: 11.5, color: 'var(--cc-gold-deep)', fontWeight: 800 }}>{etiquetaActual}: {formatear(actual[foco] ?? 0)}</span>
          <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', fontWeight: 700 }}>{etiquetaComparada}: {formatear(comparado[foco] ?? 0)}</span>
        </div>
      )}
    </div>
  )
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--cc-ink-3)', fontWeight: 700 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2.5, background: color }} />
      {texto}
    </span>
  )
}

// ── Serie de línea (tasa de recuperación 12 meses) ──────────────────────────

export function LineaSerie({ labels, valores, formatear, color = 'var(--cc-gold)', alto = 96 }: {
  labels: string[]; valores: number[]; formatear: (n: number) => string; color?: string; alto?: number
}) {
  const puntos = valores.filter(v => Number.isFinite(v))
  if (puntos.length < 2) return null

  const W = 320
  const H = alto
  const TOP = 16
  const BOT = 16
  const max = Math.max(...puntos) || 1
  const min = Math.min(0, ...puntos)
  const rango = max - min || 1
  const paso = W / (valores.length - 1)
  const y = (v: number) => TOP + (H - TOP - BOT) - ((v - min) / rango) * (H - TOP - BOT)
  const d = valores.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * paso).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const ultimo = valores.length - 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img">
      <defs>
        <linearGradient id="cc-linea-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H - BOT} L0,${H - BOT} Z`} fill="url(#cc-linea-fill)" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ultimo * paso} cy={y(valores[ultimo])} r={3.2} fill={color} />
      <g>
        <rect x={Math.max(0, ultimo * paso - 22)} y={Math.max(0, y(valores[ultimo]) - 20)} width={44} height={15} rx={4.5} fill={color} />
        <text
          x={Math.max(0, ultimo * paso - 22) + 22} y={Math.max(0, y(valores[ultimo]) - 20) + 11}
          textAnchor="middle" fontSize={9} fontWeight={800} fill="var(--cc-on-gold)"
        >
          {formatear(valores[ultimo])}
        </text>
      </g>
      {labels.map((l, i) => (
        i % Math.ceil(labels.length / 12) === 0 ? (
          <text key={l + i} x={i * paso} y={H - 2} textAnchor="middle" fontSize={8} fill="var(--cc-ink-3)" fontWeight={600}>{l}</text>
        ) : null
      ))}
    </svg>
  )
}

// ── Donut ───────────────────────────────────────────────────────────────────

export interface SegmentoDonut { label: string; valor: number; color: string }

export function Donut({ segmentos, centroTitulo, centroValor, size = 132, grosor = 24 }: {
  segmentos: SegmentoDonut[]; centroTitulo?: string; centroValor: string; size?: number; grosor?: number
}) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0)
  const r = (size - grosor) / 2
  const c = 2 * Math.PI * r
  let acumulado = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cc-neutral-soft)" strokeWidth={grosor} />
        {total > 0 && segmentos.map(s => {
          const frac = s.valor / total
          const dash = `${(frac * c).toFixed(2)} ${(c - frac * c).toFixed(2)}`
          const offset = -acumulado * c
          acumulado += frac
          return frac > 0 ? (
            <circle
              key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={grosor} strokeDasharray={dash} strokeDashoffset={offset}
            />
          ) : null
        })}
      </svg>
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 1, padding: grosor + 2, textAlign: 'center',
        }}
      >
        <span style={{ fontSize: size > 140 ? 19 : 16, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.4px', lineHeight: 1.1 }}>
          {centroValor}
        </span>
        {centroTitulo && <span style={{ fontSize: 9.5, color: 'var(--cc-ink-3)', fontWeight: 700, lineHeight: 1.15 }}>{centroTitulo}</span>}
      </div>
    </div>
  )
}

// ── Barra segmentada (aging, estado de flota, estado de cartera) ────────────

export interface Segmento { label: string; valor: number; color: string }

export function BarraSegmentada({ segmentos, alto = 12 }: { segmentos: Segmento[]; alto?: number }) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0)
  if (total <= 0) return <div style={{ height: alto, borderRadius: alto, background: 'var(--cc-neutral-soft)' }} />
  return (
    <div style={{ display: 'flex', gap: 2, height: alto, borderRadius: alto, overflow: 'hidden', minWidth: 0 }}>
      {segmentos.map(s => s.valor > 0 ? (
        <div
          key={s.label}
          title={`${s.label}: ${s.valor}`}
          style={{ width: `${(s.valor / total) * 100}%`, background: s.color, minWidth: 3, borderRadius: 2 }}
        />
      ) : null)}
    </div>
  )
}

// ── Gauge circular (tasa de recuperación, plan anual) ───────────────────────

export function Gauge({ pct, size = 92, grosor = 9, color = 'var(--cc-gold)', children }: {
  pct: number | null; size?: number; grosor?: number; color?: string; children?: ReactNode
}) {
  const valor = pct === null || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(100, pct))
  const r = (size - grosor) / 2
  const c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cc-neutral-soft)" strokeWidth={grosor} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={grosor}
          strokeLinecap="round" strokeDasharray={`${((valor / 100) * c).toFixed(2)} ${c.toFixed(2)}`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}
