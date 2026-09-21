'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Beaker, CalendarDays, Check, Move, Pin, X } from 'lucide-react'

/**
 * Panel de detalle de una cocción del calendario.
 *
 * Reemplaza al tooltip de hover anterior, que tenía un problema de fondo: era
 * un panel que se cerraba al sacar el mouse, pero adentro vivía un `<select>`
 * de tanque. Es decir, el único control real de la tarjeta estaba en el lugar
 * más frágil posible — bastaba cruzar un hueco de 8px entre el chip y el panel
 * para perderlo, y en pantalla táctil directamente no se podía abrir.
 *
 * Ahora hay dos modos, que es el patrón que pidió el usuario:
 *   · `preview`  — se abre al pasar el cursor. Sólo lectura, compacto, se
 *                  cierra solo. Sirve para barrer el calendario con la vista.
 *   · `fijado`   — se abre al hacer clic (o al tocar, en táctil). Más ancho,
 *                  con las acciones de verdad: incluir/sacar del presupuesto,
 *                  elegir tanque y mover de fecha. No se cierra por mover el
 *                  mouse: sólo con la X, Escape o un clic afuera.
 *
 * La posición se MIDE (no se adivina): el panel se monta invisible, un
 * `useLayoutEffect` lee su alto real y recién ahí se decide si abre hacia
 * arriba o hacia abajo. Se conserva del tooltip anterior porque resolvía un
 * bug concreto —una tarjeta con alarma + "no llega" + selector mide bastante
 * más que una simple, y con un alto fijo adivinado el panel tapaba la fila de
 * arriba—. Como `useLayoutEffect` corre antes de pintar, el salto no se ve.
 */

export interface LoteCalendario {
  id: string
  producto: string
  loteNro: number
  loteDe: number
  categoria: 'cerveza' | 'kombucha'
  litros: number
  tanque: string
  capacidadTanque: number
  tanqueManual: boolean
  enCurso: boolean
  leadTimeSemanas: number
  /** Día en que se cuece — es la fecha que posiciona el chip en el calendario
   *  y la que edita "Mover a otro día" (no `fechaListo`, que es cuándo sale
   *  del tanque). */
  fechaInicio: string
  fechaListo: string
  fechaEmbarriladoReal: string | null
  cubreHasta: string
  llegaATiempo: boolean
  fechaAgotamiento: string
  diasTarde: number
  fechaObjetivo: string
  movidoManual: boolean
  conAlarma: boolean
}

export interface TanqueDisponible {
  tanque: string
  capacidadLitros: number
  categoria: string
}

interface Props {
  lote: LoteCalendario
  /** Posición en pantalla del chip que lo abrió. */
  rect: DOMRect
  modo: 'preview' | 'fijado'
  hoyISO: string
  marcado: boolean
  tanques: TanqueDisponible[]
  fNum: (n: number) => string
  onAlternar: () => void
  onAnclarTanque: (tanque: string) => void
  onMoverFecha: (fechaISO: string) => void
  /** Convierte la sugerencia en un lote real del plan, con el tanque y la
   *  fecha que se ven en el panel. Hasta ahora la única forma de confirmar era
   *  arrastrar el bloque al Gantt, que exige un mouse y una mano firme sobre
   *  una grilla de columnas de 24 px; esto hace lo mismo con un clic, sin
   *  moverla de donde el modelo la puso. */
  onConfirmar?: () => void
  confirmando?: boolean
  onCerrar: () => void
  /** Sólo en modo preview: mantener abierto mientras el cursor está encima. */
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

const fFecha = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })

export default function PopoverCoccion({
  lote: l, rect, modo, hoyISO, marcado, tanques, fNum,
  onAlternar, onAnclarTanque, onMoverFecha, onConfirmar, confirmando = false,
  onCerrar, onMouseEnter, onMouseLeave,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; abreAbajo: boolean } | null>(null)
  const fijado = modo === 'fijado'
  const ancho = fijado ? 300 : 240

  const noLlega = !l.llegaATiempo
  const embarriladoVencido = l.enCurso && !!l.fechaEmbarriladoReal && l.fechaEmbarriladoReal < hoyISO

  // Medición real del panel → decide arriba/abajo y lo mantiene dentro de la
  // ventana. Depende del modo y del lote porque los dos cambian su alto.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const MARGEN = 10
    const alto = el.offsetHeight
    const anchoReal = el.offsetWidth
    const espacioArriba = rect.top
    const espacioAbajo = window.innerHeight - rect.bottom
    const abreAbajo = espacioArriba < alto + MARGEN && espacioAbajo > espacioArriba
    let top = abreAbajo ? rect.bottom + MARGEN : rect.top - MARGEN - alto
    top = Math.min(Math.max(top, MARGEN), window.innerHeight - alto - MARGEN)
    const centroX = rect.left + rect.width / 2
    const left = Math.min(Math.max(centroX - anchoReal / 2, MARGEN), window.innerWidth - anchoReal - MARGEN)
    setPos({ left, top, abreAbajo })
  }, [rect, modo, l.id, l.tanque, l.litros])

  // Sólo el panel fijado se cierra con Escape o clic afuera: el de hover ya se
  // cierra solo al salir el cursor, y engancharle estos listeners haría que un
  // clic en cualquier lado lo cerrara dos veces.
  useEffect(() => {
    if (!fijado) return
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    const clic = (ev: MouseEvent) => {
      if (!ref.current?.contains(ev.target as Node)) onCerrar()
    }
    document.addEventListener('keydown', tecla)
    // `capture: true` + timeout 0: sin esto, el mismo clic que abre el panel
    // llega también a este listener y lo cierra en el acto.
    const t = setTimeout(() => document.addEventListener('mousedown', clic, true), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('mousedown', clic, true)
    }
  }, [fijado, onCerrar])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={ref}
      role={fijado ? 'dialog' : undefined}
      aria-label={fijado ? `Detalle de cocción ${l.producto}` : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: ancho,
        zIndex: 9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      /* `prod-root` es imprescindible acá y no es decorativo: el panel vive en
         un portal a document.body, o sea FUERA del árbol de ProduccionClient.
         El reset global de globals.css (`*:not(.prod-root):not(.prod-root *)`)
         pone margin y padding en 0 y gana sobre `@layer utilities`, así que sin
         esta clase todas las utilidades de espaciado de Tailwind quedan en cero
         y el panel se ve con el texto pegado a los bordes. También es lo que
         devuelve a los `<select>`/`<input>` de adentro sus estilos propios en
         vez de los globales de la app. */
      className={`prod-root prod-popover max-h-[72vh] overflow-y-auto rounded-xl text-[11.5px] font-normal text-white shadow-2xl ring-1 ring-white/10 ${
        fijado ? 'bg-[#10201B] p-3.5' : 'bg-[#10201B]/95 p-3 backdrop-blur-sm'
      }`}
    >
      {/* ── Encabezado ── */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
            l.enCurso ? (embarriladoVencido ? 'bg-red-500' : 'bg-sky-400')
              : noLlega ? 'bg-red-500'
              : l.movidoManual ? 'bg-[#E6C34A]'
              : l.categoria === 'kombucha' ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight">{l.producto}</p>
          <p className="mt-0.5 text-[11px] text-white/55">
            {l.loteDe > 1 && `Cocción ${l.loteNro} de ${l.loteDe} · `}
            {l.enCurso
              ? 'Ya está fermentando'
              : `${l.categoria === 'kombucha' ? 'Kombuchería' : 'Cervecería'} · ${l.leadTimeSemanas} sem en tanque`}
          </p>
        </div>
        {fijado && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="prod-press -mr-1 -mt-1 shrink-0 rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Cifras ── */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.07] px-2.5 py-1.5">
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-white/45">{l.enCurso ? 'Salen' : 'Cocer'}</p>
          <p className="text-[13px] font-bold tabular-nums">{fNum(l.litros)} L</p>
        </div>
        <div className="rounded-lg bg-white/[0.07] px-2.5 py-1.5">
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-white/45">
            {l.enCurso ? (l.fechaEmbarriladoReal ? 'Embarrilado' : 'Estimado') : 'Queda listo'}
          </p>
          <p className="text-[13px] font-bold tabular-nums">
            {fFecha(l.enCurso ? (l.fechaEmbarriladoReal ?? l.fechaListo) : l.fechaListo)}
          </p>
        </div>
      </div>

      {!l.enCurso && (
        <p className="mt-2 text-white/70">
          <span className="text-white/45">Alcanza hasta</span>{' '}
          <strong className="tabular-nums">{fFecha(l.cubreHasta)}</strong>
          <span className="text-white/45"> — ahí toca cocer de nuevo</span>
        </p>
      )}

      {l.enCurso && (
        <p className="mt-2 text-white/70">
          <span className="text-white/45">Tanque</span>{' '}
          <strong>{l.tanque}</strong>
          <span className="text-white/45"> ({fNum(l.capacidadTanque)} L)</span>
        </p>
      )}

      {/* ── Avisos ── */}
      {noLlega && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/15 px-2.5 py-1.5 font-semibold text-red-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          No llega: el stock se agota cerca del {fFecha(l.fechaAgotamiento)} y esta cocción queda lista después.
        </p>
      )}
      {embarriladoVencido && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/15 px-2.5 py-1.5 font-semibold text-red-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Atraso de embarrilado: la fecha del ERP ya pasó y el tanque sigue ocupado.
        </p>
      )}
      {l.enCurso && !embarriladoVencido && (
        <p className="mt-2 rounded-lg bg-sky-500/15 px-2.5 py-1.5 text-sky-200">
          Ya está en el tanque. El fermentador se libera ese día y esos litros recién ahí se pueden vender.
        </p>
      )}
      {l.conAlarma && !l.enCurso && (
        <p className="mt-2 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-amber-200">
          Este producto ya tiene alarma de quiebre activa.
        </p>
      )}
      {l.diasTarde > 0 && !noLlega && !l.movidoManual && (
        <p className="mt-2 rounded-lg bg-purple-500/15 px-2.5 py-1.5 text-purple-200">
          Se corrió {l.diasTarde} {l.diasTarde === 1 ? 'día' : 'días'} de su fecha ideal ({fFecha(l.fechaObjetivo)})
          porque el tanque no estaba libre antes — igual llega a tiempo.
        </p>
      )}
      {l.movidoManual && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#C9A227]/20 px-2.5 py-1.5 font-semibold text-[#E6C34A]">
          <Move size={12} className="mt-0.5 shrink-0" />
          Movida a mano a esta fecha. Las cocciones siguientes de este producto se recalcularon con el forecast.
        </p>
      )}
      {l.tanqueManual && !l.enCurso && (
        <p className="mt-2 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-emerald-200">
          Tanque elegido a mano: se cuece lleno, más de lo que pedía el reorden. El excedente corre la próxima cocción.
        </p>
      )}

      {/* ── Acciones: sólo con el panel fijado ──
          En preview se muestra la pista de cómo abrirlas, porque meter
          controles en un panel que se cierra al mover el mouse es justamente
          lo que hacía incómoda la versión anterior. */}
      {!fijado && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/10 pt-2 text-[10.5px] text-white/45">
          <Pin size={11} className="shrink-0" />
          {l.enCurso ? 'Clic para ver el detalle completo' : 'Clic para fijar y editar tanque, fecha y presupuesto'}
        </div>
      )}

      {fijado && !l.enCurso && (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-white/10 pt-3">
          {/* Confirmar: la acción principal. Es la que saca la cocción del
              terreno de la sugerencia y la mete al plan, con el tanque y la
              fecha que muestra este mismo panel — lo que se ve es lo que se
              confirma. */}
          {onConfirmar && (
            <button
              type="button"
              onClick={onConfirmar}
              disabled={confirmando}
              className="prod-press flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#E6C34A] px-3 py-2 text-[12px] font-bold text-[#10201B] transition-colors hover:bg-[#F0D264] disabled:cursor-wait disabled:opacity-60"
            >
              <Check size={13} />
              {confirmando ? 'Confirmando…' : `Confirmar en ${l.tanque} el ${fFecha(l.fechaInicio)}`}
            </button>
          )}

          {/* Presupuesto: decide si esta cocción suma a la compra de insumos
              de abajo. */}
          <button
            type="button"
            onClick={onAlternar}
            className={`prod-press flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-colors ${
              marcado
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'border border-white/20 bg-white/5 text-white/80 hover:bg-white/10'
            }`}
          >
            {marcado ? <Check size={13} /> : null}
            {marcado ? 'En el presupuesto — sacar' : 'Incluir en el presupuesto'}
          </button>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/45">
              <Beaker size={11} /> Tanque
            </span>
            <select
              value={l.tanqueManual ? l.tanque : ''}
              onChange={ev => onAnclarTanque(ev.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/[0.07] px-2 py-1.5 text-[11.5px] font-semibold text-white focus:border-[#E6C34A] focus:outline-none"
            >
              <option value="" className="bg-[#10201B]">Automático — {l.tanque} ({fNum(l.capacidadTanque)} L)</option>
              {tanques
                .filter(t => t.categoria === l.categoria)
                .sort((a, b) => a.capacidadLitros - b.capacidadLitros)
                .map(t => (
                  <option key={t.tanque} value={t.tanque} className="bg-[#10201B]">
                    {t.tanque} ({fNum(t.capacidadLitros)} L)
                  </option>
                ))}
            </select>
          </label>

          {/* Mover por fecha, además del arrastre: en táctil es mucho más
              preciso que sostener y deslizar sobre una grilla de 7 columnas,
              y con teclado es la única forma de mover una cocción. */}
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/45">
              <CalendarDays size={11} /> Mover a otro día
            </span>
            <input
              type="date"
              min={hoyISO}
              value={l.fechaInicio.slice(0, 10)}
              onChange={ev => { if (ev.target.value) onMoverFecha(ev.target.value) }}
              className="w-full rounded-lg border border-white/15 bg-white/[0.07] px-2 py-1.5 text-[11.5px] font-semibold text-white focus:border-[#E6C34A] focus:outline-none"
            />
            <span className="text-[10px] text-white/35">
              O arrastrala directo en el calendario. El plan se vuelve a simular desde esa fecha.
            </span>
          </label>
        </div>
      )}

      {/* Flechita: apunta desde el lado por el que abrió. */}
      {pos && (
        <div
          className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 ${fijado ? 'bg-[#10201B]' : 'bg-[#10201B]/95'} ${
            pos.abreAbajo ? '-top-1' : 'top-full -translate-y-1.5'
          }`}
        />
      )}
    </div>,
    document.body,
  )
}
