'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  type Acumulado, type FilaMeta, type Nivel,
  clp, litros, entero, pctTxt, pct, rangoFechas, semanaTope,
  nivelPorPct, nivelDeSemana, NIVEL_COLOR, NIVEL_BARRA, NIVEL_FONDO, NIVEL_LABEL,
} from './tipos'

/**
 * Piezas visuales de Metas (tema claro). Una sola fuente para la vista del
 * vendedor y la del equipo, así ambas hablan el mismo idioma visual.
 * Colores: tokens --cc-* y --m-* (globals.css, .metas-claro). Todo % de avance
 * se pinta por nivel: <50 rojo, 50–80 naranjo, ≥80 verde (ver tipos.ts).
 */

export const ORO = 'var(--cc-gold)'

// ── Átomos ───────────────────────────────────────────────────────────────────

/** La barra se corta en 100%; el % real (ej. 147%) se muestra aparte. */
export function Barra({ valor, color = ORO, alto = 8 }: { valor: number; color?: string; alto?: number }) {
  const w = Math.max(0, Math.min(100, valor))
  return (
    <div className="w-full overflow-hidden rounded-full bg-[var(--cc-neutral-soft)]" style={{ height: alto }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

/** Barra + color según el nivel del %. */
export function BarraNivel({ valor, alto = 8 }: { valor: number; alto?: number }) {
  return <Barra valor={valor} alto={alto} color={NIVEL_BARRA[nivelPorPct(valor)]} />
}

export function PctNivel({ valor, className = '' }: { valor: number; className?: string }) {
  return (
    <span className={`font-bold tabular-nums ${className}`} style={{ color: NIVEL_COLOR[nivelPorPct(valor)] }}>
      {pctTxt(valor)}
    </span>
  )
}

export function ChipNivel({ nivel }: { nivel: Nivel | null }) {
  if (!nivel) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold"
      style={{ background: NIVEL_FONDO[nivel], color: NIVEL_COLOR[nivel] }}
    >
      <span className="size-2 rounded-full" style={{ background: NIVEL_BARRA[nivel] }} />
      {NIVEL_LABEL[nivel]}
    </span>
  )
}

export function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--cc-ink)]">{children}</h2>
      {extra}
    </div>
  )
}

// ── Semana (encabezado + indicadores + ritmo) ────────────────────────────────

export function EncabezadoSemana({ prefijo, fila, nivel }: { prefijo?: string; fila: FilaMeta; nivel: Nivel | null }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="min-w-0 text-[var(--cc-ink)]">
        <span className="text-[22px] font-bold tracking-[-0.02em]">{prefijo ?? ''}Semana {fila.semana}</span>
        <span className="text-[16px] font-medium text-[var(--cc-ink-2)]"> · {rangoFechas(fila.fechaInicio, fila.fechaFin)}</span>
        {fila.estado === 'en_curso' && (
          <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-[13px] font-medium text-[var(--cc-ink-2)]">
            <span className="size-2 rounded-full bg-[var(--cc-gold)]" /> En curso
          </span>
        )}
      </p>
      <ChipNivel nivel={nivel} />
    </div>
  )
}

export interface Indicador {
  etiqueta: string
  valor: React.ReactNode
  meta: string | null
  porcentaje: number
}

/** Tres indicadores alineados: columnas separadas por línea en tablet/escritorio, filas en móvil. */
export function Indicadores({ items }: { items: Indicador[] }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-[var(--cc-line)] md:grid-cols-3 md:divide-x md:divide-y-0">
      {items.map(it => (
        <div key={it.etiqueta} className="min-w-0 py-3 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0">
          {/* Móvil: fila compacta de dos líneas */}
          <div className="md:hidden">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px] font-medium text-[var(--cc-ink-2)]">{it.etiqueta}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[20px] font-bold tracking-[-0.02em] tabular-nums text-[var(--cc-ink)]">{it.valor}</span>
                <PctNivel valor={it.porcentaje} className="w-[46px] text-right text-[14px]" />
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex-1"><BarraNivel valor={it.porcentaje} alto={7} /></span>
              {it.meta && <span className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--cc-ink-2)]">{it.meta}</span>}
            </div>
          </div>

          {/* Tablet y escritorio: columna */}
          <div className="hidden md:block">
            <p className="mb-1 text-[14px] font-medium text-[var(--cc-ink-2)]">{it.etiqueta}</p>
            <div className="flex items-baseline gap-3">
              <span className="truncate text-[28px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-[var(--cc-ink)] lg:text-[30px]">
                {it.valor}
              </span>
              <PctNivel valor={it.porcentaje} className="shrink-0 text-[17px]" />
            </div>
            <p className="mb-2.5 h-[20px] truncate text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">{it.meta ?? ''}</p>
            <div className="pr-6"><BarraNivel valor={it.porcentaje} alto={9} /></div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Indicadores estándar de una semana (o de una suma de semanas). */
export function indicadoresDe(a: Acumulado): Indicador[] {
  return [
    { etiqueta: 'Ventas netas', valor: clp(a.realNeto), meta: `de ${clp(a.metaNeto)}`, porcentaje: pct(a.realNeto, a.metaNeto) },
    { etiqueta: 'Litros', valor: `${litros(a.realLitros)} L`, meta: `de ${litros(a.metaLitros)} L`, porcentaje: pct(a.realLitros, a.metaLitros) },
    {
      etiqueta: 'Clientes nuevos',
      valor: <>{entero(a.realClientes)} <span className="font-semibold text-[var(--cc-ink-3)]">/ {entero(a.metaClientes)}</span></>,
      meta: null,
      porcentaje: pct(a.realClientes, a.metaClientes),
    },
  ]
}

export function LineaRitmo({ falta, dias }: { falta: number; dias: number }) {
  const fuerte = 'font-bold text-[var(--cc-ink)]'
  let texto: React.ReactNode
  if (falta <= 0) texto = <>Meta de ventas cumplida · todo lo que se venda ahora suma al acumulado</>
  else if (dias > 0) {
    texto = (
      <>
        Faltan <strong className={fuerte}>{clp(falta)}</strong>
        {' · '}<strong className={fuerte}>{clp(falta / dias)}</strong> por día hábil
        {' · '}Quedan {dias} {dias === 1 ? 'día' : 'días'}
      </>
    )
  } else texto = <>Faltan <strong className={fuerte}>{clp(falta)}</strong> · no quedan días hábiles esta semana</>
  return <p className="mt-4 text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">{texto}</p>
}

// ── Tabla de semanas ─────────────────────────────────────────────────────────

const COLS_SEMANA =
  'grid-cols-[40px_minmax(0,1fr)_auto_20px] md:grid-cols-[52px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.55fr)_60px_22px] lg:grid-cols-[64px_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)_88px_28px]'

/** Semanas que se ven sin expandir la lista: hasta 2 después de la actual. */
const SEMANAS_ADELANTE = 2

const CABECERA = 'text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--cc-ink-3)]'

export function TablaSemanas({
  semanas, abierta, onToggle,
}: {
  semanas: FilaMeta[]; abierta: number | null; onToggle: (semana: number) => void
}) {
  const [todas, setTodas] = useState(false)
  const limite = Math.max(semanaTope(semanas), 1) + SEMANAS_ADELANTE
  const ocultas = semanas.filter(f => f.semana > limite)
  const visibles = todas ? semanas : semanas.filter(f => f.semana <= limite)

  return (
    <div>
      <div className={`hidden ${COLS_SEMANA} gap-x-3 lg:gap-x-4 border-b border-[var(--cc-line)] px-3 pb-2 ${CABECERA} md:grid`}>
        <span>Semana</span><span>Período</span><span>Ventas / Meta</span><span /><span>Avance</span><span />
      </div>
      {visibles.map(f => (
        <FilaSemana key={f.id} fila={f} abierta={abierta === f.semana} onToggle={() => onToggle(f.semana)} />
      ))}
      {ocultas.length > 0 && (
        <button
          type="button"
          onClick={() => setTodas(!todas)}
          className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 px-3 text-[14px] font-bold text-[var(--m-oro-texto)]"
        >
          {todas
            ? 'Ver menos semanas'
            : `Ver ${ocultas.length === 1 ? 'la semana siguiente' : `las ${ocultas.length} semanas siguientes`} (S${ocultas[0].semana}${ocultas.length > 1 ? `–S${ocultas[ocultas.length - 1].semana}` : ''})`}
          <ChevronDown size={16} className={todas ? 'rotate-180' : ''} />
        </button>
      )}
    </div>
  )
}

function FilaSemana({ fila, abierta, onToggle }: { fila: FilaMeta; abierta: boolean; onToggle: () => void }) {
  const futura = fila.estado === 'futura'
  const enCurso = fila.estado === 'en_curso'
  const nivel = nivelDeSemana(fila)
  const id = `detalle-semana-${fila.id}`

  return (
    <div className={abierta ? 'my-1 overflow-hidden rounded-[10px] border border-[var(--cc-line)]' : 'border-b border-[var(--cc-line-soft)]'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        aria-controls={id}
        className={`grid w-full ${COLS_SEMANA} min-h-[52px] items-center gap-x-3 lg:gap-x-4 px-3 text-left md:min-h-[44px]`}
        style={{ background: enCurso ? 'rgba(200,149,28,0.10)' : undefined }}
      >
        <span className="text-[15px] font-bold tabular-nums" style={{ color: enCurso ? 'var(--m-oro-texto)' : 'var(--cc-ink)' }}>
          S{fila.semana}
        </span>
        <span className="flex min-w-0 flex-col md:contents">
          <span className="truncate text-[13px] font-medium text-[var(--cc-ink-2)] md:text-[14px]">
            {rangoFechas(fila.fechaInicio, fila.fechaFin)}{enCurso ? ' · En curso' : ''}
          </span>
          <span className="truncate text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">
            {futura ? (
              <>Meta <span className="font-semibold text-[var(--cc-ink)]">{clp(fila.metaNeto)}</span></>
            ) : (
              <><strong className="font-bold text-[var(--cc-ink)]">{clp(fila.realNeto)}</strong> / {clp(fila.metaNeto)}</>
            )}
          </span>
        </span>
        <span className="hidden md:block">{!futura && <BarraNivel valor={fila.pctNeto} alto={7} />}</span>
        <span className="text-right text-[14px] md:text-left">
          {futura || !nivel ? <span className="font-semibold text-[var(--cc-ink-3)]">—</span> : <PctNivel valor={fila.pctNeto} />}
        </span>
        <ChevronDown
          size={17}
          className={`justify-self-end text-[var(--cc-ink-2)] transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`}
        />
      </button>
      {abierta && <DetalleProductos id={id} fila={fila} />}
    </div>
  )
}

const COLS_PRODUCTO =
  'grid-cols-[minmax(0,1fr)_60px_44px] md:grid-cols-[minmax(0,1.4fr)_80px_80px_minmax(0,1fr)_72px]'

function DetalleProductos({ id, fila }: { id: string; fila: FilaMeta }) {
  const futura = fila.estado === 'futura'
  const productos = [
    { nombre: 'Cajas de kombucha', real: fila.realCajasKombucha, meta: fila.metaCajasKombucha },
    { nombre: 'Cajas de cerveza en lata', real: fila.realCajasCerveza, meta: fila.metaCajasCerveza },
    { nombre: 'Barriles', real: fila.realBarriles, meta: fila.metaBarriles },
  ]
  return (
    <div id={id} className="border-t border-[var(--cc-line)] px-3 pb-2 pt-1 md:px-10">
      <div className={`grid ${COLS_PRODUCTO} gap-x-4 border-b border-[var(--cc-line)] py-2 ${CABECERA}`}>
        <span>Producto</span>
        <span className="text-right">Vendido</span>
        <span className="text-right">Meta</span>
        <span className="hidden md:block md:pl-6">Cumplimiento</span>
        <span className="hidden md:block" />
      </div>
      {productos.map(p => {
        const cumpl = pct(p.real, p.meta)
        const logrado = !futura && p.meta > 0 && cumpl >= 100
        const color = NIVEL_COLOR[nivelPorPct(cumpl)]
        const textoPct = (
          <>
            {logrado && (
              <span className="flex size-4 items-center justify-center rounded-full text-white" style={{ background: color }}>
                <Check size={10} strokeWidth={3.5} />
              </span>
            )}
            {futura ? <span className="text-[var(--cc-ink-3)]">—</span> : pctTxt(cumpl)}
          </>
        )
        return (
          <div
            key={p.nombre}
            className={`grid ${COLS_PRODUCTO} items-center gap-x-4 gap-y-1.5 border-b border-[var(--cc-line-soft)] py-2.5 text-[14px] last:border-b-0`}
          >
            <span className="truncate font-medium text-[var(--cc-ink)]">{p.nombre}</span>
            <span className="text-right font-semibold tabular-nums text-[var(--cc-ink)]">{futura ? '—' : p.real === 0 ? '0' : litros(p.real)}</span>
            <span className="text-right font-medium tabular-nums text-[var(--cc-ink-2)]">{entero(p.meta)}</span>
            {/* Cumplimiento: debajo en móvil (fila completa), columna propia en escritorio */}
            <span className="col-span-3 flex items-center gap-3 md:col-span-1 md:pl-6">
              <span className="flex-1">{futura ? <Barra valor={0} alto={7} /> : <BarraNivel valor={cumpl} alto={7} />}</span>
              <span className="flex w-[72px] items-center justify-end gap-1.5 font-bold tabular-nums md:hidden" style={{ color }}>
                {textoPct}
              </span>
            </span>
            <span className="hidden items-center justify-end gap-1.5 font-bold tabular-nums md:flex" style={{ color }}>
              {textoPct}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Acumulado y pie ──────────────────────────────────────────────────────────

export function FranjaAcumulado({ a, etiqueta = 'Acumulado a la fecha' }: { a: Acumulado; etiqueta?: string }) {
  const p = pct(a.realNeto, a.metaNeto)
  return (
    <section className="grid grid-cols-2 gap-y-3 border-t border-[var(--cc-line)] pt-5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:divide-x lg:divide-[var(--cc-line)]">
      <div className="col-span-2 min-w-0 lg:col-span-1 lg:pr-6">
        <p className="mb-1 text-[14px] font-bold text-[var(--cc-ink)]">{etiqueta}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="tabular-nums text-[var(--cc-ink-2)]">
            <span className="text-[24px] font-bold tracking-[-0.02em] text-[var(--cc-ink)]">{clp(a.realNeto)}</span>
            <span className="text-[16px] font-medium"> / {clp(a.metaNeto)}</span>
          </p>
          <div className="flex min-w-[160px] flex-1 items-center gap-4">
            <span className="flex-1"><BarraNivel valor={p} /></span>
            <PctNivel valor={p} className="text-[16px]" />
          </div>
        </div>
      </div>
      <div className="min-w-0 lg:px-6">
        <p className="mb-1 text-[14px] font-medium text-[var(--cc-ink-2)]">Litros</p>
        <p className="truncate text-[17px] font-bold tabular-nums text-[var(--cc-ink)]">
          {litros(a.realLitros)} <span className="font-medium text-[var(--cc-ink-2)]">/ {litros(a.metaLitros)} L</span>
        </p>
        <PctNivel valor={pct(a.realLitros, a.metaLitros)} className="text-[13px]" />
      </div>
      <div className="min-w-0 lg:pl-6">
        <p className="mb-1 text-[14px] font-medium text-[var(--cc-ink-2)]">Clientes nuevos</p>
        <p className="text-[17px] font-bold tabular-nums text-[var(--cc-ink)]">
          {entero(a.realClientes)} <span className="font-medium text-[var(--cc-ink-2)]">/ {entero(a.metaClientes)}</span>
        </p>
        <PctNivel valor={pct(a.realClientes, a.metaClientes)} className="text-[13px]" />
      </div>
    </section>
  )
}

/** Avance contra la meta de TODA la temporada: siempre bajo al inicio, por eso va en dorado neutro (no alerta). */
export function PieTemporada({ metaNeto, metaLitros, realNeto }: { metaNeto: number; metaLitros: number; realNeto: number }) {
  const p = pct(realNeto, metaNeto)
  return (
    <footer className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--cc-line)] pt-3 text-[13px] font-medium tabular-nums text-[var(--cc-ink-2)]">
      <p>
        Meta temporada: <strong className="font-bold text-[var(--cc-ink)]">{clp(metaNeto)}</strong> · {litros(metaLitros)} L
      </p>
      <div className="flex items-center gap-3">
        <span className="w-[140px] md:w-[200px]"><Barra valor={p} alto={6} /></span>
        <span>{pctTxt(p)} completado</span>
      </div>
    </footer>
  )
}
