'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { HelpCircle } from 'lucide-react'
import type { EstadoCobertura } from '@/lib/produccion/cobertura'
import { ESTADO_LABEL } from '@/lib/produccion/cobertura'

/* Piezas visuales compartidas por las pestañas de Producción (rediseño
   4-oct-2026). Todo color sale de los tokens --p-* de globals.css, así que
   funcionan igual en modo oscuro y claro. */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** "21 sep" a partir de yyyy-mm-dd, sin pasar por la zona horaria. */
export function fFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[m - 1]}`
}
/** "lun 6" a partir de yyyy-mm-dd. */
export function fDiaSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getUTCDay()]} ${d.getUTCDate()}`
}

/** Franja de cifras: agrupa varios <Kpi> en una sola superficie con divisores. */
export function Franja({ children, columnas = 4 }: { children: ReactNode; columnas?: 2 | 3 | 4 }) {
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[columnas]
  return <div className={`prod-franja ${cols}`}>{children}</div>
}

/** Tarjeta de sección: título, una línea de contexto y, opcional, una acción. */
export function Seccion({ titulo, detalle, accion, children, className = '' }: {
  /** Se acepta por compatibilidad y no se dibuja: un ícono dorado delante de
   *  cada título es ruido repetido, no información. */
  icono?: LucideIcon
  titulo: string
  detalle?: ReactNode
  accion?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`prod-card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-(--p-text) [text-wrap:balance]">{titulo}</h2>
          {detalle && <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-(--p-text-3)">{detalle}</p>}
        </div>
        {accion && <div className="flex shrink-0 flex-wrap items-center gap-2">{accion}</div>}
      </div>
      {children}
    </section>
  )
}

/** Cifra principal con su etiqueta y una línea de contexto. */
export function Kpi({ etiqueta, valor, unidad, detalle, tono = 'normal', icono: Icono, onClick }: {
  etiqueta: string
  valor: ReactNode
  unidad?: string
  detalle?: ReactNode
  tono?: 'normal' | 'ok' | 'warn' | 'bad' | 'accent'
  icono?: LucideIcon
  onClick?: () => void
}) {
  const color = { normal: 'text-(--p-text)', ok: 'text-(--p-ok)', warn: 'text-(--p-warn)', bad: 'text-(--p-bad)', accent: 'text-(--p-accent)' }[tono]
  const contenido = (
    <>
      <span className="prod-eyebrow flex items-center gap-1.5">{Icono && <Icono size={13} />}{etiqueta}</span>
      <span className={`prod-cifra mt-1.5 flex items-baseline gap-1.5 text-[28px] font-extrabold leading-none ${color}`}>
        {valor}
        {unidad && <span className="text-sm font-bold text-(--p-text-3)">{unidad}</span>}
      </span>
      {detalle && <span className="mt-2 text-[12px] leading-snug text-(--p-text-3)">{detalle}</span>}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="prod-card prod-press prod-hover-card flex flex-col items-start p-4 text-left">{contenido}</button>
  ) : (
    <div className="prod-card flex flex-col p-4">{contenido}</div>
  )
}

const TONO_ESTADO: Record<EstadoCobertura, string> = {
  urgente: 'bg-(--p-bad-soft) text-(--p-bad) border-(--p-bad-line)',
  reponer: 'bg-(--p-warn-soft) text-(--p-warn) border-(--p-warn-line)',
  ok: 'bg-(--p-ok-soft) text-(--p-ok) border-(--p-ok-line)',
  sin_dato: 'bg-(--p-chip) text-(--p-text-3) border-(--p-line)',
}
export const COLOR_ESTADO: Record<EstadoCobertura, string> = {
  urgente: 'var(--p-bad)', reponer: 'var(--p-warn)', ok: 'var(--p-ok)', sin_dato: 'var(--p-text-4)',
}

/** Semáforo de cobertura: forma (punto) + color + palabra. */
export function ChipEstado({ estado, compacto = false }: { estado: EstadoCobertura; compacto?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONO_ESTADO[estado]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR_ESTADO[estado] }} />
      {compacto ? ESTADO_LABEL[estado].split(' ')[0] : ESTADO_LABEL[estado]}
    </span>
  )
}

/** Barra de días de cobertura: llena hasta `dias` sobre una escala de `max`
 *  días hábiles, con la marca del lead time (lo mínimo para llegar a reponer). */
export function BarraCobertura({ dias, leadDias, estado, max = 60 }: { dias: number | null; leadDias: number; estado: EstadoCobertura; max?: number }) {
  const pct = dias == null ? 0 : Math.min(100, (dias / max) * 100)
  const marca = Math.min(100, (leadDias / max) * 100)
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-(--p-chip)" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLOR_ESTADO[estado] }} />
      <div className="absolute top-0 h-full w-px bg-(--p-text-3)" style={{ left: `${marca}%` }} />
    </div>
  )
}

/** Pastillas de opción única (filtros). */
export function Pastillas<T extends string>({ opciones, valor, onCambiar, etiqueta }: {
  opciones: { id: T; label: ReactNode; cuenta?: number }[]
  valor: T
  onCambiar: (v: T) => void
  etiqueta: string
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map(o => {
        const activo = o.id === valor
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambiar(o.id)}
            className={`prod-press flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
              activo ? 'border-(--p-accent-line) bg-(--p-accent-soft) text-(--p-accent)' : 'border-(--p-line) text-(--p-text-3) hover:text-(--p-text)'
            }`}
          >
            {o.label}
            {o.cuenta != null && <span className="tabular-nums opacity-70">{o.cuenta}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** "¿Cómo se calcula?" plegable: la explicación queda a un clic, no encima del dato. */
export function ComoSeCalcula({ children, titulo = '¿Cómo se calcula?' }: { children: ReactNode; titulo?: string }) {
  return (
    <details className="group text-[12.5px] leading-relaxed text-(--p-text-3)">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-(--p-text-3) hover:text-(--p-text)">
        <HelpCircle size={14} />
        {titulo}
      </summary>
      <div className="mt-2 max-w-[80ch] space-y-1.5 border-l-2 border-(--p-line) pl-3">{children}</div>
    </details>
  )
}
