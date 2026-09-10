'use client'

/** Tarjetas de KPI de Control Comercial: hero, KPI con sparkline y card de performance. */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Sparkline } from './charts'
import {
  Badge, Card, Delta, IconoCircular, ProgressBar, TONO, cardStyle,
  formatPctPlano, type Tono,
} from './ui'

// ── Hero: dos métricas mayores + barra de cumplimiento ──────────────────────

export interface HeroLado {
  icon: LucideIcon
  tono: Tono
  label: string
  valor: string
  /** Variación en % — se muestra bajo el valor con color. */
  deltaPct?: number | null
  deltaSubirEsBueno?: boolean
  /** Línea de contexto gris bajo el delta. */
  pie?: string
}

export function HeroMetricCard({ izquierda, derecha, progresoPct, progresoNota }: {
  izquierda: HeroLado
  derecha?: HeroLado
  progresoPct?: number | null
  progresoNota?: string
}) {
  return (
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
        <LadoHero {...izquierda} />
        {derecha && <div style={{ width: 1, background: 'var(--cc-line)', flexShrink: 0, margin: '14px 0' }} />}
        {derecha && <LadoHero {...derecha} />}
      </div>

      {progresoPct !== undefined && (
        <div style={{ borderTop: '1px solid var(--cc-line)', padding: '12px 16px' }}>
          <ProgressBar pct={progresoPct} mostrarValor />
          {progresoNota && <p style={{ fontSize: 11, color: 'var(--cc-ink-3)', marginTop: 6 }}>{progresoNota}</p>}
        </div>
      )}
    </div>
  )
}

function LadoHero({ icon, tono, label, valor, deltaPct, deltaSubirEsBueno = true, pie }: HeroLado) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <IconoCircular icon={icon} tono={tono} size={34} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink-2)', lineHeight: 1.25, minWidth: 0 }}>{label}</span>
      </div>
      <span
        style={{
          fontSize: 24, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-1.1px', lineHeight: 1.05,
          overflowWrap: 'anywhere',
        }}
      >
        {valor}
      </span>
      {deltaPct !== undefined && <Delta pct={deltaPct} subirEsBueno={deltaSubirEsBueno} size={12.5} />}
      {pie && <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', lineHeight: 1.35 }}>{pie}</span>}
    </div>
  )
}

// ── KPI con sparkline ───────────────────────────────────────────────────────

export interface KpiCardProps {
  icon: LucideIcon
  tono?: Tono
  label: string
  valor: string
  deltaPct?: number | null
  deltaSufijo?: string
  subirEsBueno?: boolean
  /** Serie real para el sparkline. Si trae menos de 2 puntos, no se dibuja nada. */
  serie?: number[]
  /** Texto cuando el KPI existe pero no hay histórico contra qué compararlo. */
  nota?: string
  href?: string
}

export function KpiSparklineCard({
  icon, tono = 'marca', label, valor, deltaPct, deltaSufijo = 'YoY', subirEsBueno = true, serie, nota, href,
}: KpiCardProps) {
  const colorLinea = deltaPct === null || deltaPct === undefined
    ? 'var(--cc-gold)'
    : (subirEsBueno ? deltaPct >= 0 : deltaPct <= 0) ? 'var(--cc-green)' : 'var(--cc-red)'

  const cuerpo = (
    <Card padding={13} style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <IconoCircular icon={icon} tono={tono} size={32} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cc-ink-2)', lineHeight: 1.25, minWidth: 0 }}>{label}</span>
      </div>

      <span
        style={{
          fontSize: 20, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.7px', lineHeight: 1.1,
          overflowWrap: 'anywhere',
        }}
      >
        {valor}
      </span>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 'auto', minWidth: 0 }}>
        {deltaPct !== undefined ? (
          <Delta pct={deltaPct} sufijo={deltaSufijo} subirEsBueno={subirEsBueno} size={11.5} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--cc-ink-3)', lineHeight: 1.35 }}>{nota}</span>
        )}
        {serie && <Sparkline valores={serie} color={colorLinea} ancho={54} alto={22} />}
      </div>
    </Card>
  )

  return href
    ? <Link href={href} className="cc-tap" style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{cuerpo}</Link>
    : cuerpo
}

/** KPI compacto sin sparkline — la fila superior de Clientes (5 en una línea). */
export function KpiCompacto({ icon, tono = 'marca', label, valor, deltaPct, deltaSufijo = '%', subirEsBueno = true, notaDelta }: {
  icon: LucideIcon; tono?: Tono; label: string; valor: string
  deltaPct?: number | null; deltaSufijo?: string; subirEsBueno?: boolean; notaDelta?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center', minWidth: 0, padding: '2px 2px' }}>
      <IconoCircular icon={icon} tono={tono} size={38} />
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--cc-ink-3)', lineHeight: 1.25, wordBreak: 'keep-all', overflowWrap: 'normal', hyphens: 'none' }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--cc-ink)', letterSpacing: '-0.5px', lineHeight: 1 }}>{valor}</span>
      {deltaPct !== undefined && deltaPct !== null ? (
        <span style={{ fontSize: 9.5, fontWeight: 700, color: TONO[(subirEsBueno ? deltaPct >= 0 : deltaPct <= 0) ? 'ok' : 'critico'].fg, whiteSpace: 'nowrap' }}>
          {deltaPct > 0 ? '+' : ''}{deltaPct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}{deltaSufijo}
        </span>
      ) : notaDelta ? (
        <span style={{ fontSize: 9.5, color: 'var(--cc-ink-3)', fontWeight: 600 }}>{notaDelta}</span>
      ) : null}
    </div>
  )
}

// ── Card de performance por territorio/responsable (Equipo) ─────────────────

export interface MetricaPerf { label: string; valor: string; tono?: Tono }
export interface MiniMetricaPerf { icon: LucideIcon; label: string; valor: string; tono?: Tono }

export function PerformanceCard({
  posicion, titulo, responsable, badge, badgeTono, badgeIcon, metricas, serie, serieColor, miniMetricas,
  href, expandible, expandido, onToggle, contenidoExpandido,
}: {
  posicion: number
  titulo: string
  responsable?: string | null
  badge?: string
  badgeTono?: Tono
  badgeIcon?: LucideIcon
  metricas: MetricaPerf[]
  serie?: number[]
  serieColor?: string
  miniMetricas: MiniMetricaPerf[]
  href?: string
  /** Alternativa a href: el pie de la card se vuelve un botón que expande contenidoExpandido. */
  expandible?: boolean
  expandido?: boolean
  onToggle?: () => void
  contenidoExpandido?: ReactNode
}) {
  const cuerpo = (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: '13px 13px 11px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
          <span
            style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'var(--cc-gold-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: 'var(--cc-gold-deep)',
            }}
          >
            {posicion}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--cc-ink)', letterSpacing: '-0.3px', lineHeight: 1.2, overflowWrap: 'anywhere' }}>
              {titulo}
              {responsable && <span style={{ fontWeight: 600, color: 'var(--cc-ink-2)' }}> · {responsable}</span>}
            </p>
            {badge && <div style={{ marginTop: 5 }}><Badge tono={badgeTono ?? 'marca'} icon={badgeIcon}>{badge}</Badge></div>}
          </div>
          {serie && <Sparkline valores={serie} color={serieColor ?? 'var(--cc-green)'} ancho={58} alto={26} />}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metricas.length}, 1fr)`, gap: 1, minWidth: 0 }}>
          {metricas.map((m, i) => (
            <div
              key={m.label}
              style={{
                minWidth: 0, textAlign: 'center', padding: '0 4px',
                borderLeft: i > 0 ? '1px solid var(--cc-line-soft)' : undefined,
              }}
            >
              <p style={{ fontSize: 10, color: 'var(--cc-ink-3)', fontWeight: 600, lineHeight: 1.25, marginBottom: 3 }}>{m.label}</p>
              <p
                style={{
                  fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.1,
                  color: m.tono ? TONO[m.tono].fg : 'var(--cc-ink)', overflowWrap: 'anywhere',
                }}
              >
                {m.valor}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        onClick={expandible ? onToggle : undefined}
        className={expandible ? 'cc-tap' : undefined}
        style={{
          borderTop: '1px solid var(--cc-line-soft)', background: 'var(--cc-card-2)',
          padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
          cursor: expandible ? 'pointer' : undefined,
        }}
      >
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${miniMetricas.length}, 1fr)`, gap: 8, minWidth: 0 }}>
          {miniMetricas.map(m => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <m.icon size={14} strokeWidth={2} color={m.tono ? TONO[m.tono].fg : 'var(--cc-ink-3)'} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 9.5, color: 'var(--cc-ink-3)', fontWeight: 600, lineHeight: 1.2 }}>{m.label}</p>
                <p style={{ fontSize: 11.5, fontWeight: 800, color: m.tono ? TONO[m.tono].fg : 'var(--cc-ink)', lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                  {m.valor}
                </p>
              </div>
            </div>
          ))}
        </div>
        {(href || expandible) && (
          <ChevronRight
            size={17} color="var(--cc-ink-3)"
            style={{ flexShrink: 0, transform: expandido ? 'rotate(90deg)' : undefined, transition: 'transform 0.2s' }}
          />
        )}
      </div>

      {expandible && expandido && contenidoExpandido && (
        <div style={{ padding: '13px', borderTop: '1px solid var(--cc-line-soft)' }}>{contenidoExpandido}</div>
      )}
    </Card>
  )

  return href
    ? <Link href={href} className="cc-tap" style={{ textDecoration: 'none', display: 'block' }}>{cuerpo}</Link>
    : cuerpo
}

// ── Fila de meta por responsable (pantalla Metas) ───────────────────────────

export interface CeldaMeta { label: string; pct: number | null; valor: string }

export function FilaMetaResponsable({ nombre, iniciales, estado, estadoTono, celdas, accion }: {
  nombre: string
  iniciales: string
  estado: string
  estadoTono: Tono
  celdas: CeldaMeta[]
  accion?: ReactNode
}) {
  return (
    <Card padding={12} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span
          style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'var(--cc-gold-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: 'var(--cc-gold-deep)',
          }}
        >
          {iniciales}
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--cc-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nombre}
        </span>
        <Badge tono={estadoTono}>{estado}</Badge>
        {accion && <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{accion}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${celdas.length}, 1fr)`, gap: 4, minWidth: 0 }}>
        {celdas.map(c => {
          const tono: Tono = c.pct === null ? 'neutral' : c.pct >= 100 ? 'ok' : c.pct >= 80 ? 'alerta' : 'critico'
          return (
            <div key={c.label} style={{ minWidth: 0, textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--cc-ink-3)', fontWeight: 600, lineHeight: 1.2, marginBottom: 3, overflowWrap: 'anywhere' }}>{c.label}</p>
              <p style={{ fontSize: 13.5, fontWeight: 800, color: TONO[tono].fg, lineHeight: 1.1 }}>
                {c.pct === null ? '—' : formatPctPlano(c.pct)}
              </p>
              <p style={{ fontSize: 9, color: 'var(--cc-ink-3)', lineHeight: 1.2, marginTop: 2, overflowWrap: 'anywhere' }}>{c.valor}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
