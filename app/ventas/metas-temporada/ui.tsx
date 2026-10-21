'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Truck } from 'lucide-react'
import {
  type Acumulado, type FilaMeta, type Nivel, type Escala,
  clp, litros, entero, pctTxt, pct, rangoFechas, fechaCorta, semanaTope, diasHabilesRestantes,
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
        <span className="text-[22px] font-bold tracking-[-0.02em]">{prefijo ?? ''}{fila.nombre}</span>
        <span className="text-[16px] font-medium text-[var(--cc-ink-2)]"> · {rangoFechas(fila.fechaInicio, fila.fechaFin)}</span>
        <span className="ml-3 inline-flex items-center gap-1.5 align-middle text-[13px] font-medium text-[var(--cc-ink-2)]">
          <span
            className="size-2 rounded-full"
            style={{ background: fila.estado === 'en_curso' ? 'var(--cc-gold)' : 'var(--cc-neutral)' }}
          />
          {fila.estado === 'en_curso' ? 'En curso' : fila.estado === 'cerrada' ? 'Cerrada' : 'Por venir'}
        </span>
      </p>
      <ChipNivel nivel={nivel} />
    </div>
  )
}

// ── Selector de semana ───────────────────────────────────────────────────────

export interface SemanaOpcion {
  semana: number
  nombre: string
  fechaInicio: string
  fechaFin: string
}

/** Qué se está mirando: escala (semana / período 24→23) y cuál de ellas. */
export interface Corte {
  escala: Escala
  onEscala: (e: Escala) => void
  /** N° de semana o de período elegido en la escala actual. */
  valor: number
  onValor: (n: number) => void
}

/** Opciones únicas (una por semana o período) a partir de filas de uno o varios vendedores. */
export function opcionesSemana(filas: FilaMeta[]): SemanaOpcion[] {
  const m = new Map<number, SemanaOpcion>()
  for (const f of filas) if (!m.has(f.semana)) m.set(f.semana, { semana: f.semana, nombre: f.nombre, fechaInicio: f.fechaInicio, fechaFin: f.fechaFin })
  return [...m.values()].sort((a, b) => a.semana - b.semana)
}

/**
 * [Semana | Mes 24→23]  ‹ Semana 3 · 19–25 oct › — el interruptor cambia la
 * escala (semanas del plan o períodos comerciales 24→23); las flechas se mueven
 * de a uno y un <select> nativo invisible encima del rótulo permite saltar
 * directo (en el teléfono abre la rueda del sistema). "Ir a hoy" aparece solo
 * si uno se movió.
 */
export function SelectorSemana({
  opciones, actual, corte,
}: {
  opciones: SemanaOpcion[]; actual: number | null; corte: Corte
}) {
  const { escala, valor, onValor: onCambiar } = corte
  const i = opciones.findIndex(o => o.semana === valor)
  const sel = opciones[i]
  const prev = i > 0 ? opciones[i - 1] : null
  const next = i >= 0 && i < opciones.length - 1 ? opciones[i + 1] : null
  const Unidad = escala === 'periodo' ? 'Período' : 'Semana'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Ver por" className="flex shrink-0 rounded-[12px] bg-[#EEEAE2] p-1">
        {(['semana', 'periodo'] as const).map(e => (
          <button
            key={e}
            type="button"
            role="tab"
            aria-selected={escala === e}
            onClick={() => corte.onEscala(e)}
            className={`min-h-[40px] rounded-[9px] px-3.5 text-[14px] font-bold ${
              escala === e
                ? 'bg-[var(--cc-ink)] text-[var(--cc-on-gold)]'
                : 'text-[var(--cc-ink-2)] hover:bg-white/60 hover:text-[var(--cc-ink)]'
            }`}
          >
            {e === 'semana' ? 'Semana' : 'Mes 24→23'}
          </button>
        ))}
      </div>
      {sel && (
        <div className="flex min-w-[240px] flex-1 items-center rounded-[12px] bg-[#EEEAE2] p-1 md:flex-none">
          <FlechaSemana label={`${Unidad} anterior`} disabled={!prev} onClick={() => prev && onCambiar(prev.semana)}>
            <ChevronLeft size={18} />
          </FlechaSemana>
          <label className="relative min-w-0 flex-1 md:w-[250px] md:flex-none">
            <span className="sr-only">Elegir {Unidad.toLowerCase()}</span>
            <select
              value={valor}
              onChange={e => onCambiar(Number(e.target.value))}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            >
              {opciones.map(o => (
                <option key={o.semana} value={o.semana}>
                  {o.nombre} · {rangoFechas(o.fechaInicio, o.fechaFin)}{o.semana === actual ? ' · en curso' : ''}
                </option>
              ))}
            </select>
            <span className="pointer-events-none flex min-h-[40px] items-center justify-center gap-1.5 rounded-[9px] bg-white px-2 text-[14px] font-bold tabular-nums text-[var(--cc-ink)] shadow-[0_1px_2px_rgba(17,13,9,0.12)]">
              <span className="truncate">
                {sel.nombre}
                <span className="font-medium text-[var(--cc-ink-2)]"> · {rangoFechas(sel.fechaInicio, sel.fechaFin)}</span>
              </span>
              <ChevronDown size={15} className="shrink-0 text-[var(--cc-ink-2)]" />
            </span>
          </label>
          <FlechaSemana label={`${Unidad} siguiente`} disabled={!next} onClick={() => next && onCambiar(next.semana)}>
            <ChevronRight size={18} />
          </FlechaSemana>
        </div>
      )}
      {actual !== null && valor !== actual && (
        <button
          type="button"
          onClick={() => onCambiar(actual)}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-[10px] px-3 text-[13px] font-bold text-[var(--m-oro-texto)] hover:bg-[var(--cc-gold-soft)]"
        >
          Ir a hoy
        </button>
      )}
    </div>
  )
}

function FlechaSemana({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[40px] shrink-0 items-center justify-center rounded-[9px] text-[var(--cc-ink)] hover:bg-white/70 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

// ── Resumen de una semana (pasada, en curso o futura) ────────────────────────

/**
 * Encabezado + 3 indicadores + línea de cierre. Cambia según el estado:
 * en curso → ritmo diario que falta · cerrada → cuánto faltó o sobró ·
 * futura → solo la meta (todavía no hay avance que pintar en rojo).
 */
export function ResumenSemana({
  prefijo, fila, suma, hoy,
}: {
  prefijo?: string; fila: FilaMeta; suma: Acumulado; hoy: string
}) {
  const futura = fila.estado === 'futura'
  const nivel = futura ? null : nivelPorPct(pct(suma.realNeto, suma.metaNeto))
  const falta = suma.metaNeto - suma.realNeto
  const fuerte = 'font-bold text-[var(--cc-ink)]'
  const mes = fila.tipo === 'periodo'
  const cerrada = mes ? 'Mes cerrado' : 'Semana cerrada'

  let pie: React.ReactNode
  if (fila.estado === 'en_curso') {
    // La vista decide "en curso" con CURRENT_DATE del servidor (UTC); de noche en
    // Chile ya puede ser el día siguiente allá. Nunca contar antes del inicio.
    const dias = diasHabilesRestantes(hoy > fila.fechaInicio ? hoy : fila.fechaInicio, fila.fechaFin)
    pie = <LineaRitmo falta={falta} dias={dias} este={mes ? 'este mes' : 'esta semana'} />
  } else if (fila.estado === 'cerrada') {
    pie = (
      <p className="mt-4 text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">
        {falta > 0
          ? <>{cerrada} · quedaron <strong className={fuerte}>{clp(falta)}</strong> bajo la meta</>
          : <>{cerrada} · meta cumplida{falta < 0 && <>, superada por <strong className={fuerte}>{clp(-falta)}</strong></>}</>}
      </p>
    )
  } else {
    pie = (
      <p className="mt-4 text-[14px] font-medium text-[var(--cc-ink-2)]">
        Parte el <strong className={fuerte}>{fechaCorta(fila.fechaInicio)}</strong> · el avance se mide desde ese día
      </p>
    )
  }

  return (
    <>
      <EncabezadoSemana prefijo={prefijo} fila={fila} nivel={nivel} />
      <Indicadores items={futura ? indicadoresMeta(suma) : indicadoresDe(suma)} />
      {pie}
    </>
  )
}

export interface Indicador {
  etiqueta: string
  valor: React.ReactNode
  meta: string | null
  /** null = semana futura: sin % ni barra. */
  porcentaje: number | null
  /** Línea extra bajo la barra (p. ej. cuánto está por entregar). */
  nota?: React.ReactNode
}

/**
 * La venta de Metas cuenta el pedido completo aunque no se haya entregado:
 * la entrega ya es responsabilidad de logística, no del vendedor (Claudio,
 * 21-oct-2026). Esta línea lo hace visible para que no parezca que falta venta.
 */
export function PorEntregar({ monto, className = '' }: { monto: number; className?: string }) {
  if (Math.round(monto) <= 0) return null
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium tabular-nums text-[var(--cc-ink-2)] ${className}`}>
      <Truck size={13} className="shrink-0 text-[var(--cc-gold)]" />
      <span className="truncate">Incluye <strong className="font-bold text-[var(--cc-ink)]">{clp(monto)}</strong> por entregar</span>
    </span>
  )
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
                {it.porcentaje !== null && <PctNivel valor={it.porcentaje} className="w-[46px] text-right text-[14px]" />}
              </span>
            </div>
            {it.porcentaje !== null && (
              <div className="mt-2 flex items-center gap-3">
                <span className="flex-1"><BarraNivel valor={it.porcentaje} alto={7} /></span>
                {it.meta && <span className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--cc-ink-2)]">{it.meta}</span>}
              </div>
            )}
            {it.nota && <div className="mt-1.5 flex">{it.nota}</div>}
          </div>

          {/* Tablet y escritorio: columna */}
          <div className="hidden md:block">
            <p className="mb-1 text-[14px] font-medium text-[var(--cc-ink-2)]">{it.etiqueta}</p>
            <div className="flex items-baseline gap-3">
              <span className="truncate text-[28px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-[var(--cc-ink)] lg:text-[30px]">
                {it.valor}
              </span>
              {it.porcentaje !== null && <PctNivel valor={it.porcentaje} className="shrink-0 text-[17px]" />}
            </div>
            <p className="mb-2.5 h-[20px] truncate text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">{it.meta ?? ''}</p>
            {it.porcentaje !== null && <div className="pr-6"><BarraNivel valor={it.porcentaje} alto={9} /></div>}
            {it.nota && <div className="mt-2 flex">{it.nota}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Indicadores estándar de una semana (o de una suma de semanas). */
export function indicadoresDe(a: Acumulado): Indicador[] {
  return [
    {
      etiqueta: 'Ventas netas',
      valor: clp(a.realNeto),
      meta: `de ${clp(a.metaNeto)}`,
      porcentaje: pct(a.realNeto, a.metaNeto),
      nota: <PorEntregar monto={a.realNetoPorEntregar} />,
    },
    { etiqueta: 'Litros', valor: `${litros(a.realLitros)} L`, meta: `de ${litros(a.metaLitros)} L`, porcentaje: pct(a.realLitros, a.metaLitros) },
    {
      etiqueta: 'Clientes nuevos',
      valor: <>{entero(a.realClientes)} <span className="font-semibold text-[var(--cc-ink-3)]">/ {entero(a.metaClientes)}</span></>,
      meta: null,
      porcentaje: pct(a.realClientes, a.metaClientes),
    },
  ]
}

/** Semana futura: lo que hay que vender, sin avance. */
export function indicadoresMeta(a: Acumulado): Indicador[] {
  return [
    { etiqueta: 'Meta ventas netas', valor: clp(a.metaNeto), meta: null, porcentaje: null },
    { etiqueta: 'Meta litros', valor: `${litros(a.metaLitros)} L`, meta: null, porcentaje: null },
    { etiqueta: 'Meta clientes nuevos', valor: entero(a.metaClientes), meta: null, porcentaje: null },
  ]
}

export function LineaRitmo({ falta, dias, este = 'esta semana' }: { falta: number; dias: number; este?: string }) {
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
  } else texto = <>Faltan <strong className={fuerte}>{clp(falta)}</strong> · no quedan días hábiles {este}</>
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
  const porMes = semanas[0]?.tipo === 'periodo'
  // Los 6 meses caben siempre; solo las 25 semanas se recortan.
  const limite = porMes ? Infinity : Math.max(semanaTope(semanas), 1) + SEMANAS_ADELANTE
  const ocultas = semanas.filter(f => f.semana > limite)
  const visibles = todas ? semanas : semanas.filter(f => f.semana <= limite)

  return (
    <div>
      <div className={`hidden ${COLS_SEMANA} gap-x-3 lg:gap-x-4 border-b border-[var(--cc-line)] px-3 pb-2 ${CABECERA} md:grid`}>
        <span>{porMes ? 'Mes' : 'Semana'}</span><span>Período</span><span>Ventas / Meta</span><span /><span>Avance</span><span />
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
          {fila.corto}
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
        <PorEntregar monto={a.realNetoPorEntregar} className="mt-1.5" />
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
