'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  type Acumulado, type FilaMeta, type Semaforo,
  clp, litros, entero, pctTxt, pct, rangoFechas, colorPorPct, semanaTope,
  SEMAFORO_COLOR, SEMAFORO_FONDO, SEMAFORO_LABEL,
} from './tipos'

/**
 * Piezas visuales de Metas (tema claro). Una sola fuente para la vista del
 * vendedor y la del equipo, así ambas hablan el mismo idioma visual.
 * Colores: tokens --cc-* (globals.css, .cc-root[data-theme="light"]).
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

export function ChipEstado({ semaforo }: { semaforo: Semaforo | null }) {
  if (!semaforo) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: SEMAFORO_FONDO[semaforo], color: SEMAFORO_COLOR[semaforo] }}
    >
      <span className="size-1.5 rounded-full" style={{ background: SEMAFORO_COLOR[semaforo] }} />
      {SEMAFORO_LABEL[semaforo]}
    </span>
  )
}

export function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-[var(--cc-ink)]">{children}</h2>
      {extra}
    </div>
  )
}

// ── Semana (encabezado + indicadores + ritmo) ────────────────────────────────

export function EncabezadoSemana({ prefijo, fila }: { prefijo?: string; fila: FilaMeta }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="min-w-0 text-[var(--cc-ink)]">
        <span className="text-[20px] font-bold tracking-[-0.02em]">{prefijo ?? ''}Semana {fila.semana}</span>
        <span className="text-[15px] text-[var(--cc-ink-2)]"> · {rangoFechas(fila.fechaInicio, fila.fechaFin)}</span>
        {fila.estado === 'en_curso' && (
          <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-[12px] text-[var(--cc-ink-2)]">
            <span className="size-2 rounded-full bg-[var(--cc-gold)]" /> En curso
          </span>
        )}
      </p>
      <ChipEstado semaforo={fila.semaforo} />
    </div>
  )
}

export interface Indicador {
  etiqueta: string
  valor: React.ReactNode
  meta: string | null
  porcentaje: number
  color: string
}

/** Tres indicadores alineados: columnas separadas por línea en tablet/escritorio, filas en móvil. */
export function Indicadores({ items }: { items: Indicador[] }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-[var(--cc-line)] md:grid-cols-3 md:divide-x md:divide-y-0">
      {items.map(it => (
        <div key={it.etiqueta} className="min-w-0 py-2.5 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0">
          {/* Móvil: fila compacta de dos líneas */}
          <div className="md:hidden">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-[var(--cc-ink-2)]">{it.etiqueta}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[19px] font-bold tracking-[-0.02em] tabular-nums text-[var(--cc-ink)]">{it.valor}</span>
                <span className="w-[42px] text-right text-[13px] font-semibold tabular-nums" style={{ color: it.color }}>{pctTxt(it.porcentaje)}</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="flex-1"><Barra valor={it.porcentaje} alto={6} /></span>
              {it.meta && <span className="shrink-0 text-[12px] tabular-nums text-[var(--cc-ink-2)]">{it.meta}</span>}
            </div>
          </div>

          {/* Tablet y escritorio: columna */}
          <div className="hidden md:block">
            <p className="mb-1 text-[13px] text-[var(--cc-ink-2)]">{it.etiqueta}</p>
            <div className="flex items-baseline gap-3">
              <span className="truncate text-[26px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-[var(--cc-ink)] lg:text-[28px]">
                {it.valor}
              </span>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums" style={{ color: it.color }}>{pctTxt(it.porcentaje)}</span>
            </div>
            <p className="mb-2 h-[18px] truncate text-[13px] tabular-nums text-[var(--cc-ink-2)]">{it.meta ?? ''}</p>
            <div className="pr-6"><Barra valor={it.porcentaje} /></div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Indicadores estándar de una semana (o de una suma de semanas). */
export function indicadoresDe(a: Acumulado, colorNeto: string): Indicador[] {
  const pClientes = pct(a.realClientes, a.metaClientes)
  return [
    { etiqueta: 'Ventas netas', valor: clp(a.realNeto), meta: `de ${clp(a.metaNeto)}`, porcentaje: pct(a.realNeto, a.metaNeto), color: colorNeto },
    { etiqueta: 'Litros', valor: `${litros(a.realLitros)} L`, meta: `de ${litros(a.metaLitros)} L`, porcentaje: pct(a.realLitros, a.metaLitros), color: 'var(--cc-blue)' },
    {
      etiqueta: 'Clientes nuevos',
      valor: <>{entero(a.realClientes)} <span className="font-semibold text-[var(--cc-ink-3)]">/ {entero(a.metaClientes)}</span></>,
      meta: null,
      porcentaje: pClientes,
      color: colorPorPct(pClientes),
    },
  ]
}

export function LineaRitmo({ falta, dias }: { falta: number; dias: number }) {
  let texto: React.ReactNode
  if (falta <= 0) texto = <>Meta de ventas cumplida · todo lo que se venda ahora suma al acumulado</>
  else if (dias > 0) {
    texto = (
      <>
        Faltan <strong className="font-semibold text-[var(--cc-ink)]">{clp(falta)}</strong>
        {' · '}<strong className="font-semibold text-[var(--cc-ink)]">{clp(falta / dias)}</strong> por día hábil
        {' · '}Quedan {dias} {dias === 1 ? 'día' : 'días'}
      </>
    )
  } else texto = <>Faltan <strong className="font-semibold text-[var(--cc-ink)]">{clp(falta)}</strong> · no quedan días hábiles esta semana</>
  return <p className="mt-4 text-[13px] tabular-nums text-[var(--cc-ink-2)]">{texto}</p>
}

// ── Tabla de semanas ─────────────────────────────────────────────────────────

const COLS_SEMANA =
  'grid-cols-[40px_minmax(0,1fr)_auto_20px] md:grid-cols-[64px_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)_88px_28px]'

/** Semanas que se ven sin expandir la lista: hasta 2 después de la actual. */
const SEMANAS_ADELANTE = 2

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
      <div className={`hidden ${COLS_SEMANA} gap-x-4 border-b border-[var(--cc-line)] px-3 pb-2 text-[11px] text-[var(--cc-ink-3)] md:grid`}>
        <span>Semana</span><span>Período</span><span>Ventas / Meta</span><span /><span>Avance</span><span />
      </div>
      {visibles.map(f => (
        <FilaSemana key={f.id} fila={f} abierta={abierta === f.semana} onToggle={() => onToggle(f.semana)} />
      ))}
      {ocultas.length > 0 && (
        <button
          type="button"
          onClick={() => setTodas(!todas)}
          className="mt-1 inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[13px] font-semibold text-[var(--cc-gold-deep)]"
        >
          {todas
            ? 'Ver menos semanas'
            : `Ver ${ocultas.length === 1 ? 'la semana siguiente' : `las ${ocultas.length} semanas siguientes`} (S${ocultas[0].semana}${ocultas.length > 1 ? `–S${ocultas[ocultas.length - 1].semana}` : ''})`}
          <ChevronDown size={15} className={todas ? 'rotate-180' : ''} />
        </button>
      )}
    </div>
  )
}

function FilaSemana({ fila, abierta, onToggle }: { fila: FilaMeta; abierta: boolean; onToggle: () => void }) {
  const futura = fila.estado === 'futura'
  const enCurso = fila.estado === 'en_curso'
  const id = `detalle-semana-${fila.id}`

  return (
    <div className={abierta ? 'my-1 overflow-hidden rounded-[10px] border border-[var(--cc-line)]' : 'border-b border-[var(--cc-line-soft)]'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        aria-controls={id}
        className={`grid w-full ${COLS_SEMANA} min-h-[48px] items-center gap-x-4 px-3 text-left md:min-h-[38px]`}
        style={{ background: enCurso ? 'rgba(200,149,28,0.07)' : undefined }}
      >
        <span className="text-[14px] font-bold tabular-nums" style={{ color: enCurso ? 'var(--cc-gold-deep)' : 'var(--cc-ink)' }}>
          S{fila.semana}
        </span>
        <span className="flex min-w-0 flex-col md:contents">
          <span className="truncate text-[12px] text-[var(--cc-ink-2)] md:text-[13px]">
            {rangoFechas(fila.fechaInicio, fila.fechaFin)}{enCurso ? ' · En curso' : ''}
          </span>
          <span className="truncate text-[13px] tabular-nums text-[var(--cc-ink-2)]">
            {futura ? (
              <>Meta <span className="text-[var(--cc-ink)]">{clp(fila.metaNeto)}</span></>
            ) : (
              <><strong className="font-semibold text-[var(--cc-ink)]">{clp(fila.realNeto)}</strong> / {clp(fila.metaNeto)}</>
            )}
          </span>
        </span>
        <span className="hidden md:block">{!futura && <Barra valor={fila.pctNeto} alto={6} />}</span>
        <span
          className="text-right text-[13px] font-semibold tabular-nums md:text-left"
          style={{ color: futura || !fila.semaforo ? 'var(--cc-ink-3)' : SEMAFORO_COLOR[fila.semaforo] }}
        >
          {futura ? '—' : pctTxt(fila.pctNeto)}
        </span>
        <ChevronDown
          size={16}
          className={`justify-self-end text-[var(--cc-ink-2)] transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`}
        />
      </button>
      {abierta && <DetalleProductos id={id} fila={fila} />}
    </div>
  )
}

const COLS_PRODUCTO =
  'grid-cols-[minmax(0,1fr)_56px_44px] md:grid-cols-[minmax(0,1.4fr)_80px_80px_minmax(0,1fr)_64px]'

function DetalleProductos({ id, fila }: { id: string; fila: FilaMeta }) {
  const futura = fila.estado === 'futura'
  const productos = [
    { nombre: 'Cajas de kombucha', real: fila.realCajasKombucha, meta: fila.metaCajasKombucha },
    { nombre: 'Cajas de cerveza en lata', real: fila.realCajasCerveza, meta: fila.metaCajasCerveza },
    { nombre: 'Barriles', real: fila.realBarriles, meta: fila.metaBarriles },
  ]
  return (
    <div id={id} className="border-t border-[var(--cc-line)] px-3 pb-2 pt-1 md:px-10">
      <div className={`grid ${COLS_PRODUCTO} gap-x-4 border-b border-[var(--cc-line)] py-2 text-[11px] text-[var(--cc-ink-3)]`}>
        <span>Producto</span>
        <span className="text-right">Vendido</span>
        <span className="text-right">Meta</span>
        <span className="hidden md:block md:pl-6">Cumplimiento</span>
        <span className="hidden md:block" />
      </div>
      {productos.map(p => {
        const cumpl = pct(p.real, p.meta)
        const logrado = !futura && p.meta > 0 && cumpl >= 100
        const color = logrado ? 'var(--cc-green)' : !futura && p.real <= 0 ? 'var(--cc-red)' : 'var(--cc-gold-deep)'
        return (
          <div
            key={p.nombre}
            className={`grid ${COLS_PRODUCTO} items-center gap-x-4 gap-y-1.5 border-b border-[var(--cc-line-soft)] py-2 text-[13px] last:border-b-0`}
          >
            <span className="truncate text-[var(--cc-ink)]">{p.nombre}</span>
            <span className="text-right tabular-nums text-[var(--cc-ink)]">{futura ? '—' : p.real === 0 ? '0' : litros(p.real)}</span>
            <span className="text-right tabular-nums text-[var(--cc-ink)]">{entero(p.meta)}</span>
            {/* Cumplimiento: debajo en móvil (fila completa), columna propia en escritorio */}
            <span className="col-span-3 flex items-center gap-3 md:col-span-1 md:pl-6">
              <span className="flex-1"><Barra valor={futura ? 0 : cumpl} alto={6} color={logrado ? 'var(--cc-green)' : ORO} /></span>
              <span className="flex w-[64px] items-center justify-end gap-1.5 font-semibold tabular-nums md:hidden" style={{ color }}>
                {logrado && <Check size={13} strokeWidth={3} />}{futura ? '—' : pctTxt(cumpl)}
              </span>
            </span>
            <span className="hidden items-center justify-end gap-1.5 font-semibold tabular-nums md:flex" style={{ color }}>
              {logrado && (
                <span className="flex size-4 items-center justify-center rounded-full bg-[var(--cc-green)] text-white">
                  <Check size={10} strokeWidth={3.5} />
                </span>
              )}
              {futura ? '—' : pctTxt(cumpl)}
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
    <section className="grid grid-cols-2 gap-y-3 border-t border-[var(--cc-line)] pt-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:divide-x md:divide-[var(--cc-line)]">
      <div className="col-span-2 min-w-0 md:col-span-1 md:pr-6">
        <p className="mb-1 text-[12px] font-semibold text-[var(--cc-ink)]">{etiqueta}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="tabular-nums text-[var(--cc-ink-2)]">
            <span className="text-[22px] font-bold tracking-[-0.02em] text-[var(--cc-ink)]">{clp(a.realNeto)}</span>
            <span className="text-[15px]"> / {clp(a.metaNeto)}</span>
          </p>
          <div className="flex min-w-[160px] flex-1 items-center gap-4">
            <span className="flex-1"><Barra valor={p} /></span>
            <span className="text-[14px] font-semibold tabular-nums text-[var(--cc-gold-deep)]">{pctTxt(p)}</span>
          </div>
        </div>
      </div>
      <div className="min-w-0 md:px-6">
        <p className="mb-1 text-[12px] text-[var(--cc-ink-2)]">Litros</p>
        <p className="truncate text-[15px] font-semibold tabular-nums text-[var(--cc-ink)]">
          {litros(a.realLitros)} <span className="font-normal text-[var(--cc-ink-2)]">/ {litros(a.metaLitros)} L</span>
        </p>
      </div>
      <div className="min-w-0 md:pl-6">
        <p className="mb-1 text-[12px] text-[var(--cc-ink-2)]">Clientes nuevos</p>
        <p className="text-[15px] font-semibold tabular-nums text-[var(--cc-ink)]">
          {entero(a.realClientes)} <span className="font-normal text-[var(--cc-ink-2)]">/ {entero(a.metaClientes)}</span>
        </p>
      </div>
    </section>
  )
}

export function PieTemporada({ metaNeto, metaLitros, realNeto }: { metaNeto: number; metaLitros: number; realNeto: number }) {
  const p = pct(realNeto, metaNeto)
  return (
    <footer className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--cc-line)] pt-3 text-[12px] tabular-nums text-[var(--cc-ink-2)]">
      <p>
        Meta temporada: <strong className="font-semibold text-[var(--cc-ink)]">{clp(metaNeto)}</strong> · {litros(metaLitros)} L
      </p>
      <div className="flex items-center gap-3">
        <span className="w-[140px] md:w-[200px]"><Barra valor={p} alto={5} /></span>
        <span>{pctTxt(p)} completado</span>
      </div>
    </footer>
  )
}
