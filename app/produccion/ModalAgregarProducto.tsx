'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, PackagePlus } from 'lucide-react'
import type { ConfigProducto } from './GanttProduccion'
import { hoyLocalISO } from './compartido'

/**
 * "Agregar producto" desde el Gantt mismo.
 *
 * Antes la única forma de meter un lote nuevo a la carta era ir a la
 * pestaña Plan Maestro, abrir su formulario ahí y volver — dos pantallas
 * para una acción que empieza y termina mirando el Gantt. Esto abre sobre el
 * Gantt, con los mismos datos (producto, litros, fecha), y el lote que crea
 * sale SIN fermentador asignado: aparece en la fila "sin asignar", listo para
 * arrastrarlo al tanque y al día que el usuario elija. Crear y organizar son
 * dos gestos separados a propósito — encajarlo a ciegas en el primer hueco
 * libre sería decidir por el usuario dónde cuece cada cosa.
 *
 * Vive en su propio archivo por lo mismo que ConfigProductosGantt: un portal
 * a document.body, fuera de `.prod-root`, donde el reset de globals.css
 * anula las utilidades de padding/margin de Tailwind — todo el espaciado acá
 * va en `gap` o estilos inline.
 */

interface Props {
  abierto: boolean
  config: ConfigProducto[]
  guardando: boolean
  error: string | null
  onGuardar: (datos: { producto: string; categoria: 'cerveza' | 'kombucha'; litrosPlanificados: number; fechaPlanificada: string; origen: 'manual' }) => void
  onCerrar: () => void
}

export default function ModalAgregarProducto({ abierto, config, guardando, error, onGuardar, onCerrar }: Props) {
  const [producto, setProducto] = useState('')
  const [categoria, setCategoria] = useState<'cerveza' | 'kombucha'>('cerveza')
  const [litros, setLitros] = useState('')
  const [fecha, setFecha] = useState('')

  // Se resetea cada vez que se abre — si quedó "guardando" trabado de un
  // envío anterior, reabrir no debería heredar ese estado a medio llenar.
  // Se ajusta al cambiar la prop (no en un efecto) para no renderizar dos
  // veces, y la fecha va en hora local: toISOString() da "mañana" en Chile
  // desde media tarde.
  const [abiertoAntes, setAbiertoAntes] = useState(abierto)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) { setProducto(''); setLitros(''); setFecha(hoyLocalISO()) }
  }

  useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])

  if (!abierto || typeof document === 'undefined') return null

  // Si el nombre coincide con un producto ya configurado, se hereda su
  // categoría y su color — no tiene sentido pedirle al usuario un dato que
  // el Gantt ya sabe. Uno realmente nuevo deja elegir categoría a mano.
  const conocido = config.find(c => c.producto.toLowerCase() === producto.trim().toLowerCase())
  const litrosNum = Number(litros)
  const valido = producto.trim().length > 0 && litrosNum > 0 && fecha.length > 0

  function submit() {
    if (!valido || guardando) return
    onGuardar({
      producto: producto.trim(),
      categoria: conocido?.categoria ?? categoria,
      litrosPlanificados: litrosNum,
      fechaPlanificada: fecha,
      origen: 'manual',
    })
  }

  return createPortal(
    <div
      className="prod-root prod-scrim fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(17,19,22,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onCerrar}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="prod-modal flex w-full flex-col overflow-hidden bg-(--p-card) shadow-2xl sm:w-[min(420px,94vw)] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-(--p-line-2)" style={{ padding: '18px 20px 14px' }}>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <h3 className="flex items-center text-[15px] font-bold tracking-tight text-(--p-text)" style={{ gap: 7 }}>
              <PackagePlus size={16} className="text-(--p-accent)" />
              Agregar producto
            </h3>
            <p className="text-[12px] leading-snug text-(--p-text-3)">
              Entra a la carta sin tanque asignado — se arrastra a su lugar después.
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg text-(--p-text-3) hover:bg-(--p-hover) hover:text-(--p-text-2)" style={{ padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col" style={{ padding: '18px 20px', gap: 14 }}>
          <div className="flex flex-col" style={{ gap: 5 }}>
            <label className="text-[11px] font-bold uppercase tracking-wide text-(--p-text-3)">Producto</label>
            <input
              list="prod-productos-conocidos"
              value={producto} onChange={e => setProducto(e.target.value)}
              placeholder="Ej: Doble IPA"
              autoFocus
              className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
            />
            <datalist id="prod-productos-conocidos">
              {config.map(c => <option key={c.producto} value={c.producto} />)}
            </datalist>
            {conocido && (
              <span className="flex items-center text-[11px] text-(--p-text-3)" style={{ gap: 5 }}>
                <span className="h-2 w-2 rounded-sm" style={{ background: conocido.color }} />
                {conocido.categoria === 'kombucha' ? 'Kombucha' : 'Cerveza'} · {conocido.diasFermentacion} días de fermentador
              </span>
            )}
          </div>

          {!conocido && (
            <div className="flex flex-col" style={{ gap: 5 }}>
              <label className="text-[11px] font-bold uppercase tracking-wide text-(--p-text-3)">Categoría</label>
              <select
                value={categoria} onChange={e => setCategoria(e.target.value as 'cerveza' | 'kombucha')}
                className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
              >
                <option value="cerveza">Cerveza</option>
                <option value="kombucha">Kombucha</option>
              </select>
            </div>
          )}

          <div className="flex" style={{ gap: 12 }}>
            <div className="flex flex-1 flex-col" style={{ gap: 5 }}>
              <label className="text-[11px] font-bold uppercase tracking-wide text-(--p-text-3)">Litros</label>
              <input
                type="number" min={1} value={litros} onChange={e => setLitros(e.target.value)}
                placeholder="1000"
                className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
              />
            </div>
            <div className="flex flex-1 flex-col" style={{ gap: 5 }}>
              <label className="text-[11px] font-bold uppercase tracking-wide text-(--p-text-3)">Fecha de inicio</label>
              <input
                type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-[12px] font-semibold text-(--p-bad)">{error}</p>}
        </div>

        <div className="flex justify-end border-t border-(--p-line-2)" style={{ padding: '14px 20px', gap: 8 }}>
          <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-bold text-(--p-text-3) hover:bg-(--p-hover)">
            Cancelar
          </button>
          <button
            type="button" disabled={!valido || guardando} onClick={submit}
            className="rounded-lg prod-primario px-4 py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-40"
          >
            {guardando ? 'Agregando…' : 'Agregar a la carta'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
