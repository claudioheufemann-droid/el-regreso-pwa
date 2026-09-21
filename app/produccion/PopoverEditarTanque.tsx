'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Beaker, Calendar, RotateCcw, X } from 'lucide-react'

/**
 * Editor de fechas para un lote FÍSICO ya en el fermentador, detectado desde
 * el informe del ERP (bloque 'en_tanque' del Gantt).
 *
 * Existe porque el ERP no trae la fecha de cocción — la app la reconstruye
 * retrocediendo la fecha de embarrillado ESTIMADA con la duración configurada
 * del producto, y esa reconstrucción puede salir mal (pasó con Kombucha
 * Detox y Berry Menta: el default de 12 días no era el ciclo real de esos
 * lotes, que era de 40). Acá se corrige el lote puntual, sin tocar la
 * duración por defecto del producto — eso alimentaría el forecast de stock de
 * seguridad para lotes futuros que no tienen nada que ver con este.
 *
 * Mismo patrón de posicionamiento medido que PopoverCoccion: se monta
 * invisible, un `useLayoutEffect` lee el alto real y recién ahí decide si
 * abre hacia arriba o abajo, para no cortar el panel contra el borde de la
 * ventana.
 */

export interface DatosTanqueEditar {
  tanque: string
  codigoLote: string
  producto: string
  categoria: 'cerveza' | 'kombucha'
  inicioISO: string
  embarrilladoISO: string | null
  rect: DOMRect
}

interface Props {
  datos: DatosTanqueEditar
  /** true si ya existe una corrección guardada para este lote — habilita el
   *  botón de restablecer. */
  tieneAjuste: boolean
  guardando: boolean
  error: string | null
  onGuardar: (fechas: { fechaInicioManual: string; fechaEmbarriladoManual: string | null }) => void
  onRestablecer: () => void
  onCerrar: () => void
}

export default function PopoverEditarTanque({ datos, tieneAjuste, guardando, error, onGuardar, onRestablecer, onCerrar }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; abreAbajo: boolean } | null>(null)
  const [inicio, setInicio] = useState(datos.inicioISO)
  const [embarrillado, setEmbarrillado] = useState(datos.embarrilladoISO ?? '')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const MARGEN = 10
    const alto = el.offsetHeight
    const anchoReal = el.offsetWidth
    const espacioArriba = datos.rect.top
    const espacioAbajo = window.innerHeight - datos.rect.bottom
    const abreAbajo = espacioArriba < alto + MARGEN && espacioAbajo > espacioArriba
    let top = abreAbajo ? datos.rect.bottom + MARGEN : datos.rect.top - MARGEN - alto
    top = Math.min(Math.max(top, MARGEN), window.innerHeight - alto - MARGEN)
    const centroX = datos.rect.left + datos.rect.width / 2
    const left = Math.min(Math.max(centroX - anchoReal / 2, MARGEN), window.innerWidth - anchoReal - MARGEN)
    setPos({ left, top, abreAbajo })
  }, [datos.rect])

  useLayoutEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    const clic = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) onCerrar() }
    document.addEventListener('keydown', tecla)
    const t = setTimeout(() => document.addEventListener('mousedown', clic, true), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('mousedown', clic, true)
    }
  }, [onCerrar])

  if (typeof document === 'undefined') return null

  const valido = inicio.length > 0 && (embarrillado.length === 0 || embarrillado > inicio)

  return createPortal(
    <div
      ref={ref}
      className="prod-root prod-popover fixed z-[85] flex w-[280px] flex-col gap-3 rounded-xl bg-[#10201B] p-4 text-[12px] text-white shadow-2xl ring-1 ring-black/10"
      style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { left: -9999, top: -9999, visibility: 'hidden' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[13px] font-bold">
            <Beaker size={13} className="text-white/70" />
            {datos.producto}
          </span>
          <span className="text-[10.5px] text-white/50">
            {datos.tanque} · lote {datos.codigoLote} · detectado en el ERP
          </span>
        </div>
        <button type="button" onClick={onCerrar} className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <p className="text-[10.5px] leading-snug text-white/50">
        El ERP no trae la fecha de cocción — la app la calcula desde el
        embarrillado estimado. Corregí acá si no coincide con la realidad.
      </p>

      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/45">
          <Calendar size={11} /> Fecha de cocción
        </span>
        <input
          type="date" value={inicio} onChange={e => setInicio(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/[0.07] px-2 py-1.5 text-[11.5px] font-semibold text-white focus:border-[#E6C34A] focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/45">
          <Calendar size={11} /> Fecha de embarrilado (estimada)
        </span>
        <input
          type="date" value={embarrillado} onChange={e => setEmbarrillado(e.target.value)}
          min={inicio || undefined}
          className="w-full rounded-lg border border-white/15 bg-white/[0.07] px-2 py-1.5 text-[11.5px] font-semibold text-white focus:border-[#E6C34A] focus:outline-none"
        />
      </label>

      {!valido && embarrillado.length > 0 && (
        <p className="text-[11px] font-semibold text-red-300">El embarrilado tiene que ser después de la cocción.</p>
      )}
      {error && <p className="text-[11px] font-semibold text-red-300">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button" disabled={!valido || guardando}
          onClick={() => onGuardar({ fechaInicioManual: inicio, fechaEmbarriladoManual: embarrillado || null })}
          className="prod-press flex-1 rounded-lg bg-[#E6C34A] px-3 py-2 text-[12px] font-bold text-[#10201B] hover:bg-[#F0D264] disabled:cursor-wait disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {tieneAjuste && (
          <button
            type="button" disabled={guardando} onClick={onRestablecer}
            title="Volver a la fecha que calcula la app desde el ERP"
            className="prod-press flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-2.5 text-white/80 hover:bg-white/10 disabled:opacity-50"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      <div
        className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#10201B] ${
          pos?.abreAbajo ? '-top-1' : 'top-full -translate-y-1.5'
        }`}
      />
    </div>,
    document.body,
  )
}
