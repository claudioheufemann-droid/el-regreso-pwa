'use client'

/**
 * Sistema visual de Control Comercial.
 *
 * Todos los colores salen de los tokens --cc-* de globals.css: un literal
 * inline de la familia blanco/crema lo intercepta la auditoría de contraste
 * de modo claro y cambia solo, así que acá no se usa ninguno.
 */

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'

// ── Formateadores ───────────────────────────────────────────────────────────

export function formatCLP(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}

export function formatLitros(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} L`
}

export function formatNumero(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CL')
}

export function formatPct(n: number | null | undefined, decimales = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${n > 0 ? '+' : ''}${n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`
}

export function formatPctPlano(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`
}

/** Abreviatura para ejes y etiquetas de gráfico: 11.705.220 → "11,7M". */
export function formatCompacto(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}MM`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString('es-CL', { maximumFractionDigits: 0 })}K`
  return n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

export function formatCLPCompacto(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `$${formatCompacto(n)}`
}

export type Tono = 'neutral' | 'ok' | 'alerta' | 'critico' | 'info' | 'marca'

export const TONO: Record<Tono, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--cc-ink-2)', bg: 'var(--cc-neutral-soft)' },
  ok: { fg: 'var(--cc-green)', bg: 'var(--cc-green-soft)' },
  alerta: { fg: 'var(--cc-amber)', bg: 'var(--cc-amber-soft)' },
  critico: { fg: 'var(--cc-red)', bg: 'var(--cc-red-soft)' },
  info: { fg: 'var(--cc-blue)', bg: 'var(--cc-blue-soft)' },
  marca: { fg: 'var(--cc-gold)', bg: 'var(--cc-gold-soft)' },
}

/** Verde si sube, rojo si baja — salvo KPIs donde subir es malo (deuda, barriles). */
export function tonoVariacion(v: number | null | undefined, subirEsBueno = true): Tono {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return 'neutral'
  const bueno = subirEsBueno ? v > 0 : v < 0
  return bueno ? 'ok' : 'critico'
}

// ── Contenedores ────────────────────────────────────────────────────────────

/** Ancho de página + respiro para el NavPill flotante (64px + safe area). */
export function CCPage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1180,
        margin: '0 auto',
        padding: '0 16px',
        paddingBottom: 'max(96px, calc(80px + env(safe-area-inset-bottom, 0px)))',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {children}
    </div>
  )
}

export const cardStyle: CSSProperties = {
  background: 'var(--cc-card)',
  border: '1px solid var(--cc-line)',
  borderRadius: 18,
  boxShadow: 'var(--cc-shadow)',
}

export function Card({ children, style, padding = 16 }: { children: ReactNode; style?: CSSProperties; padding?: number | string }) {
  return <div style={{ ...cardStyle, padding, minWidth: 0, ...style }}>{children}</div>
}

/** Encabezado de card: ícono opcional + título, con acción/controles a la derecha. */
export function CardHeader({ icon: Icon, titulo, accion, sub }: {
  icon?: LucideIcon; titulo: string; accion?: ReactNode; sub?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {Icon && <Icon size={16} color="var(--cc-gold)" strokeWidth={2.2} style={{ flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cc-ink)', letterSpacing: '-0.2px', lineHeight: 1.2 }}>{titulo}</h2>
          {sub && <p style={{ fontSize: 11, color: 'var(--cc-ink-3)', marginTop: 2 }}>{sub}</p>}
        </div>
      </div>
      {accion && <div style={{ flexShrink: 0 }}>{accion}</div>}
    </div>
  )
}

// ── Controles ───────────────────────────────────────────────────────────────

export interface SegmentedOption<T> { value: T; label: string }

/**
 * Píldoras de segmento. `variant="pill"` = cápsulas separadas con la activa
 * dorada (tabs de Equipo); `variant="inset"` = grupo con fondo y la activa
 * encima (Total/Cerveza/Kombucha, $/Litros).
 */
export function SegmentedControl<T extends string | number>({ value, options, onChange, variant = 'inset', size = 'md', ancho }: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (v: T) => void
  variant?: 'pill' | 'inset' | 'underline'
  size?: 'sm' | 'md'
  ancho?: 'auto' | 'full'
}) {
  const alto = size === 'sm' ? 30 : 36
  const fuente = size === 'sm' ? 12 : 13

  if (variant === 'underline') {
    return (
      <div
        style={{
          display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`,
          background: 'var(--cc-card)', border: '1px solid var(--cc-line)', borderRadius: 14,
          overflow: 'hidden', boxShadow: 'var(--cc-shadow)', minWidth: 0,
        }}
      >
        {options.map(o => {
          const activo = o.value === value
          return (
            <button
              key={String(o.value)}
              onClick={() => onChange(o.value)}
              className="cc-tap"
              style={{
                minHeight: 46, border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 13.5, fontWeight: activo ? 800 : 600, whiteSpace: 'nowrap',
                color: activo ? 'var(--cc-ink)' : 'var(--cc-ink-3)',
                borderBottom: `2.5px solid ${activo ? 'var(--cc-gold)' : 'transparent'}`,
                transition: 'color 0.18s',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (variant === 'pill') {
    return (
      <div className="cc-scroll-x" style={{ display: 'flex', gap: 8, padding: '2px 0', margin: '0 -16px', paddingLeft: 16, paddingRight: 16 }}>
        {options.map(o => {
          const activo = o.value === value
          return (
            <button
              key={String(o.value)}
              onClick={() => onChange(o.value)}
              className="cc-tap"
              style={{
                flexShrink: 0, minHeight: 40, padding: '0 18px', borderRadius: 999, cursor: 'pointer',
                fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap',
                background: activo ? 'var(--cc-gold)' : 'var(--cc-card)',
                color: activo ? 'var(--cc-on-gold)' : 'var(--cc-ink-2)',
                border: `1px solid ${activo ? 'var(--cc-gold)' : 'var(--cc-line)'}`,
                boxShadow: activo ? '0 2px 10px rgba(200,149,28,0.28)' : 'none',
                transition: 'background 0.18s, color 0.18s',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      style={{
        display: ancho === 'full' ? 'grid' : 'inline-flex',
        gridTemplateColumns: ancho === 'full' ? `repeat(${options.length}, 1fr)` : undefined,
        gap: 2, padding: 3, borderRadius: 12,
        background: 'var(--cc-card-2)', border: '1px solid var(--cc-line-soft)',
        width: ancho === 'full' ? '100%' : undefined, minWidth: 0,
      }}
    >
      {options.map(o => {
        const activo = o.value === value
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className="cc-tap"
            style={{
              minHeight: alto, padding: '0 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: fuente, fontWeight: 700, whiteSpace: 'nowrap',
              background: activo ? 'var(--cc-gold)' : 'transparent',
              color: activo ? 'var(--cc-on-gold)' : 'var(--cc-ink-3)',
              boxShadow: activo ? '0 1px 4px rgba(200,149,28,0.3)' : 'none',
              transition: 'background 0.18s, color 0.18s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Chip-filtro con ícono y chevron — la fila de filtros de Resumen/Barriles. */
export function FilterChip({ icon: Icon, label, children, onClick }: {
  icon?: LucideIcon; label?: string; children?: ReactNode; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 12px',
        borderRadius: 13, background: 'var(--cc-card)', border: '1px solid var(--cc-line)',
        fontSize: 13, fontWeight: 700, color: 'var(--cc-ink)', minWidth: 0, position: 'relative',
        boxShadow: 'var(--cc-shadow)',
      }}
    >
      {Icon && <Icon size={15} color="var(--cc-ink-3)" strokeWidth={2} style={{ flexShrink: 0 }} />}
      {label && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
      {children}
    </div>
  )
}

/** <select> nativo estilizado como chip: en móvil abre la rueda del sistema. */
export function SelectChip<T extends string | number>({ icon, value, options, onChange, flex }: {
  icon?: LucideIcon
  value: T
  options: SegmentedOption<T>[]
  onChange: (v: T) => void
  flex?: string
}) {
  const actual = options.find(o => o.value === value)
  return (
    <div style={{ position: 'relative', flex: flex ?? '1 1 auto', minWidth: 0 }}>
      <FilterChip icon={icon} label={actual?.label ?? '—'}>
        <ChevronRight size={15} color="var(--cc-ink-3)" style={{ marginLeft: 'auto', flexShrink: 0, transform: 'rotate(90deg)' }} />
      </FilterChip>
      <select
        value={String(value)}
        onChange={e => {
          const bruto = e.target.value
          const encontrado = options.find(o => String(o.value) === bruto)
          if (encontrado) onChange(encontrado.value)
        }}
        aria-label={actual?.label}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none' }}
      >
        {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </div>
  )
}

export function Badge({ children, tono = 'neutral', icon: Icon }: { children: ReactNode; tono?: Tono; icon?: LucideIcon }) {
  const t = TONO[tono]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
        background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', maxWidth: '100%',
      }}
    >
      {Icon && <Icon size={12} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </span>
  )
}

export function IconoCircular({ icon: Icon, tono = 'marca', size = 36 }: { icon: LucideIcon; tono?: Tono; size?: number }) {
  const t = TONO[tono]
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', background: t.bg, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.47)} color={t.fg} strokeWidth={2} />
    </span>
  )
}

export function ProgressBar({ pct, tono = 'marca', alto = 10, mostrarValor }: {
  pct: number | null; tono?: Tono; alto?: number; mostrarValor?: boolean
}) {
  const valor = pct === null || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(100, pct))
  const color = tono === 'marca' ? 'var(--cc-gold)' : TONO[tono].fg
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ flex: 1, height: alto, borderRadius: alto, background: 'var(--cc-neutral-soft)', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ height: '100%', width: `${valor}%`, borderRadius: alto, background: color, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
      {mostrarValor && (
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--cc-ink)', flexShrink: 0 }}>
          {pct === null ? '—' : `${Math.round(valor)}%`}
        </span>
      )}
    </div>
  )
}

/** Delta con flecha: "+59,9% YoY". */
export function Delta({ pct, sufijo = 'YoY', subirEsBueno = true, size = 12.5 }: {
  pct: number | null | undefined; sufijo?: string; subirEsBueno?: boolean; size?: number
}) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return <span style={{ fontSize: size, fontWeight: 600, color: 'var(--cc-ink-3)' }}>Sin comparación</span>
  }
  const t = TONO[tonoVariacion(pct, subirEsBueno)]
  return (
    <span style={{ fontSize: size, fontWeight: 800, color: t.fg, whiteSpace: 'nowrap' }}>
      {formatPct(pct)}{sufijo ? ` ${sufijo}` : ''}
    </span>
  )
}

// ── Estados ─────────────────────────────────────────────────────────────────

export function LoadingSkeleton({ alto = 120, radio = 18 }: { alto?: number; radio?: number }) {
  return (
    <div
      className="cc-skeleton"
      style={{ height: alto, borderRadius: radio, background: 'var(--cc-card-2)', border: '1px solid var(--cc-line-soft)' }}
    />
  )
}

export function PageSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LoadingSkeleton alto={44} radio={13} />
      <LoadingSkeleton alto={132} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <LoadingSkeleton alto={96} />
        <LoadingSkeleton alto={96} />
        <LoadingSkeleton alto={96} />
        <LoadingSkeleton alto={96} />
      </div>
      <LoadingSkeleton alto={260} />
    </div>
  )
}

export function EmptyState({ icon: Icon, titulo, detalle, accion }: {
  icon?: LucideIcon; titulo: string; detalle?: string; accion?: ReactNode
}) {
  return (
    <div style={{ padding: '28px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {Icon && <IconoCircular icon={Icon} tono="neutral" size={44} />}
      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cc-ink)' }}>{titulo}</p>
      {detalle && <p style={{ fontSize: 12.5, color: 'var(--cc-ink-3)', lineHeight: 1.5, maxWidth: 340 }}>{detalle}</p>}
      {accion}
    </div>
  )
}

export function ErrorState({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <Card padding={20}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--cc-ink)' }}>No se pudo cargar la información</p>
        <p style={{ fontSize: 12.5, color: 'var(--cc-ink-3)', lineHeight: 1.5 }}>{mensaje}</p>
        {onReintentar && (
          <button onClick={onReintentar} style={botonPrimario()}>Reintentar</button>
        )}
      </div>
    </Card>
  )
}

/** Nota al pie de página — la letra chica de metodología de los mockups. */
export function NotaPie({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--cc-ink-3)', lineHeight: 1.55, padding: '0 4px' }}>{children}</p>
  )
}

// ── Botones ─────────────────────────────────────────────────────────────────

export function botonPrimario(extra?: CSSProperties): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 46, padding: '0 18px', borderRadius: 14, border: '1px solid var(--cc-gold)',
    background: 'var(--cc-gold)', color: 'var(--cc-on-gold)', fontSize: 14, fontWeight: 800,
    cursor: 'pointer', boxShadow: '0 2px 12px rgba(200,149,28,0.3)', whiteSpace: 'nowrap',
    ...extra,
  }
}

export function botonSecundario(extra?: CSSProperties): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 46, padding: '0 16px', borderRadius: 14, border: '1px solid var(--cc-gold-line)',
    background: 'var(--cc-card)', color: 'var(--cc-gold-deep)', fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
    ...extra,
  }
}

export function botonIcono(extra?: CSSProperties): CSSProperties {
  return {
    width: 40, height: 40, borderRadius: '50%', flexShrink: 0, padding: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--cc-card)', border: '1px solid var(--cc-line)', cursor: 'pointer',
    color: 'var(--cc-ink-2)',
    ...extra,
  }
}

// ── Listas de insights ──────────────────────────────────────────────────────

export interface InsightItem {
  texto: string
  detalle?: string
  tono: Tono
  icon: LucideIcon
  href?: string
}

export function InsightList({ items }: { items: InsightItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => {
        const contenido = (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 14,
              background: 'var(--cc-card-2)', minWidth: 0,
            }}
          >
            <IconoCircular icon={it.icon} tono={it.tono} size={34} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cc-ink)', lineHeight: 1.45 }}>{it.texto}</p>
              {it.detalle && <p style={{ fontSize: 12, color: 'var(--cc-ink-3)', lineHeight: 1.45, marginTop: 1 }}>{it.detalle}</p>}
            </div>
            {it.href && <ChevronRight size={17} color="var(--cc-ink-3)" style={{ flexShrink: 0 }} />}
          </div>
        )
        return it.href
          ? <Link key={i} href={it.href} className="cc-tap" style={{ textDecoration: 'none' }}>{contenido}</Link>
          : <div key={i}>{contenido}</div>
      })}
    </div>
  )
}

// ── Fila métrica compacta (legendas de donut / barras segmentadas) ──────────

export function FilaLeyenda({ color, label, valor, secundario }: {
  color: string; label: string; valor: string; secundario?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: 'var(--cc-ink-2)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--cc-ink)', flexShrink: 0 }}>{valor}</span>
      {secundario && <span style={{ fontSize: 11.5, color: 'var(--cc-ink-3)', flexShrink: 0, minWidth: 34, textAlign: 'right' }}>{secundario}</span>}
    </div>
  )
}
