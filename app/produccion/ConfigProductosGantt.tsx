'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Loader2, AlertCircle } from 'lucide-react'
import type { ConfigProducto } from './GanttProduccion'

/**
 * Configuración por producto del Gantt: cuántos días corridos ocupa el
 * fermentador, con qué litraje se suele cocer y de qué color se pinta.
 *
 * Los días son CORRIDOS. Es la pregunta que más confunde viniendo del Excel,
 * donde las columnas eran días hábiles: una kombucha que allá ocupaba "10
 * columnas" acá son 12 días, porque el sábado y el domingo el tanque sigue
 * ocupado. El texto de ayuda lo dice explícito para no tener que explicarlo
 * cada vez.
 *
 * Se guarda de a un producto por vez: la UI edita una fila a la vez y así dos
 * personas tocando productos distintos no se pisan.
 *
 * OJO con el spacing: este panel vive en un portal a document.body, o sea
 * FUERA de `.prod-root`, y el reset de globals.css anula ahí las utilidades
 * de padding/margin de Tailwind. Por eso las separaciones van en estilos
 * inline o con `gap`, nunca con `p-*` / `m-*`.
 */

const PALETA = [
  '#B5502A', '#3A6EA5', '#2F7A55', '#8B5E3C', '#7D5BA6', '#C08A2E',
  '#4A7C9B', '#A34E6B', '#5C8A3A', '#96632E', '#6B5BA6', '#B0793A',
  '#7A3B3B', '#2E6F6F', '#8A7B2E', '#555F6E',
]

interface Props {
  abierto: boolean
  config: ConfigProducto[]
  onCerrar: () => void
  onGuardado: (fila: ConfigProducto) => void
}

export default function ConfigProductosGantt({ abierto, config, onCerrar, onGuardado }: Props) {
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'cerveza' | 'kombucha'>('todos')
  /** Ediciones en curso, por producto. Se vuelcan a base al salir del campo. */
  const [borrador, setBorrador] = useState<Record<string, Partial<ConfigProducto>>>({})

  useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])

  const visibles = useMemo(
    () => config.filter(c => filtro === 'todos' || c.categoria === filtro),
    [config, filtro]
  )

  const valorDe = (c: ConfigProducto): ConfigProducto => ({ ...c, ...borrador[c.producto] })

  async function guardar(producto: string, cambio: Partial<ConfigProducto>) {
    const base = config.find(c => c.producto === producto)
    if (!base) return
    const siguiente = { ...base, ...borrador[producto], ...cambio }
    // Nada que hacer si el valor no cambió: evita un PUT por cada blur.
    if (siguiente.diasFermentacion === base.diasFermentacion &&
        siguiente.color === base.color &&
        siguiente.litrosObjetivo === base.litrosObjetivo) return

    setGuardando(producto); setError(null)
    try {
      const r = await fetch('/api/produccion/config-producto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producto, categoria: siguiente.categoria,
          diasFermentacion: siguiente.diasFermentacion,
          litrosObjetivo: siguiente.litrosObjetivo,
          color: siguiente.color,
        }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? 'No se pudo guardar')
      onGuardado(json as ConfigProducto)
      setBorrador(b => { const n = { ...b }; delete n[producto]; return n })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(null)
    }
  }

  // Sin el flag de montaje por useEffect: setState dentro de un efecto
  // dispara renders en cascada. Basta con no tocar document en el servidor.
  if (!abierto || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(17,19,22,.55)', backdropFilter: 'blur(2px)' }}
      onClick={onCerrar}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:w-[min(880px,94vw)] sm:rounded-2xl"
        style={{ maxHeight: '88vh' }}
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100"
          style={{ padding: '18px 20px 14px' }}>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <h3 className="text-[15px] font-bold tracking-tight text-gray-900">Configuración de productos</h3>
            <p className="text-[12px] leading-snug text-gray-500">
              Cuántos días ocupa el fermentador cada producto, con qué litraje se suele cocer
              y de qué color se pinta en el Gantt.
            </p>
          </div>
          <button type="button" onClick={onCerrar}
            className="rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            style={{ padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Aviso de días corridos — es la confusión que trae el Excel. */}
        <div className="flex items-start border-b border-amber-100 bg-amber-50 text-[11.5px] leading-snug text-amber-900"
          style={{ padding: '10px 20px', gap: 8 }}>
          <AlertCircle size={15} className="shrink-0" style={{ marginTop: 1 }} />
          <span>
            Los días son <strong>corridos</strong>, no hábiles. En la planilla de Excel una kombucha
            ocupaba “10 columnas”, pero eran 10 días hábiles: el tanque en realidad queda tomado
            <strong> 12 días</strong>, porque el sábado y el domingo sigue fermentando.
          </span>
        </div>

        {/* Filtros */}
        <div className="flex items-center border-b border-gray-100 bg-gray-50/60"
          style={{ padding: '10px 20px', gap: 6 }}>
          {(['todos', 'cerveza', 'kombucha'] as const).map(f => (
            <button key={f} type="button" onClick={() => setFiltro(f)}
              className={`rounded-full border text-[11px] font-bold capitalize transition ${
                filtro === f
                  ? 'border-[#2F6B4F] bg-[#2F6B4F] text-white'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
              style={{ padding: '4px 12px' }}>
              {f}
            </button>
          ))}
          {error && (
            <span className="ml-auto flex items-center text-[11px] font-bold text-red-600" style={{ gap: 5 }}>
              <AlertCircle size={13} /> {error}
            </span>
          )}
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                <th className="text-left font-bold" style={{ padding: '8px 20px' }}>Producto</th>
                <th className="text-left font-bold" style={{ padding: '8px 10px', width: 120 }}>Días en tanque</th>
                <th className="text-left font-bold" style={{ padding: '8px 10px', width: 130 }}>Litros habituales</th>
                <th className="text-left font-bold" style={{ padding: '8px 20px', width: 230 }}>Color</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(base => {
                const c = valorDe(base)
                const sucio = !!borrador[base.producto]
                return (
                  <tr key={base.producto} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td style={{ padding: '8px 20px' }}>
                      <div className="flex items-center" style={{ gap: 8 }}>
                        <span className="inline-block rounded-sm" style={{ width: 10, height: 10, background: c.color }} />
                        <span className="font-semibold text-gray-800">{base.producto}</span>
                        {guardando === base.producto && <Loader2 size={12} className="animate-spin text-gray-400" />}
                        {!sucio && guardando !== base.producto && <Check size={12} className="text-transparent" />}
                      </div>
                    </td>

                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="number" min={1} max={120}
                        value={c.diasFermentacion}
                        onChange={e => setBorrador(b => ({
                          ...b, [base.producto]: { ...b[base.producto], diasFermentacion: Number(e.target.value) },
                        }))}
                        onBlur={() => guardar(base.producto, {})}
                        className="w-full rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-800 focus:border-[#2F6B4F] focus:outline-none"
                        style={{ padding: '5px 8px' }}
                      />
                    </td>

                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="number" min={1} step={50}
                        placeholder="Capacidad del tanque"
                        value={c.litrosObjetivo ?? ''}
                        onChange={e => setBorrador(b => ({
                          ...b,
                          [base.producto]: {
                            ...b[base.producto],
                            litrosObjetivo: e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))}
                        onBlur={() => guardar(base.producto, {})}
                        className="w-full rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-800 placeholder:font-normal placeholder:text-gray-300 focus:border-[#2F6B4F] focus:outline-none"
                        style={{ padding: '5px 8px' }}
                      />
                    </td>

                    <td style={{ padding: '8px 20px' }}>
                      <div className="flex flex-wrap" style={{ gap: 4 }}>
                        {PALETA.map(hex => (
                          <button
                            key={hex} type="button"
                            onClick={() => {
                              setBorrador(b => ({ ...b, [base.producto]: { ...b[base.producto], color: hex } }))
                              void guardar(base.producto, { color: hex })
                            }}
                            title={hex}
                            className={`rounded-full transition ${c.color.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-gray-900 ring-offset-1' : 'hover:scale-110'}`}
                            style={{ width: 16, height: 16, background: hex }}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 text-[11px] text-gray-500"
          style={{ padding: '10px 20px' }}>
          <span>Los cambios se guardan solos al salir del campo.</span>
          <button type="button" onClick={onCerrar}
            className="rounded-lg bg-[#2F6B4F] font-bold text-white hover:bg-[#255941]"
            style={{ padding: '6px 16px' }}>
            Listo
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
