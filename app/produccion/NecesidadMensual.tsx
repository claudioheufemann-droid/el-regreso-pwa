'use client'

import { useCallback, useMemo, useState } from 'react'
import { Plus, Check, Loader2, Info, TriangleAlert } from 'lucide-react'
import type { SerieForecast, StockSeguridadItem, LotePlan } from './page'
import type { ConfigProducto } from './GanttProduccion'

/**
 * Paso 2 del flujo: cuántos litros hay que producir de cada producto, mes a mes.
 *
 * Es el paso que antes se hacía a ojo sobre el gráfico del forecast —filtrar un
 * producto, mirar los litros proyectados de septiembre, octubre, noviembre y
 * diciembre, anotarlos— y después se pasaba a mano a la carta Gantt. Acá esos
 * números ya vienen leídos del modelo, se ajustan, y al confirmarlos se crean
 * las cocciones partidas por tanque que el Gantt ordena en el tiempo.
 *
 * SOBRE QUÉ CANTIDAD SE PROPONE
 * ------------------------------
 * Se ofrecen tres bases y la elección es explícita, no heredada:
 *
 *   · Límite superior  — el escenario alto del forecast. Es lo que se venía
 *     usando, pero tiene dos problemas que conviene tener a la vista: la banda
 *     de Prophet resultó subestimar ~2,2x su propio error (por eso existe el
 *     factor k del stock de seguridad), así que este "límite superior" es más
 *     angosto de lo que parece; y si TODOS los productos se planifican en su
 *     escenario alto, se está planificando un mes donde todos venden al máximo
 *     a la vez, que no ocurre.
 *   · Centro — la proyección del modelo, ya corregida por su sesgo medido.
 *   · Centro + colchón — el centro más el stock de seguridad ya calibrado. Es
 *     el que no duplica margen: la incertidumbre entra una sola vez, por el
 *     colchón, en vez de estar también inflando la cantidad.
 *
 * Se arranca en "límite superior" para no cambiar el hábito de golpe, pero las
 * tres cifras se muestran siempre para que el cambio pueda hacerse mirando la
 * diferencia.
 */

export type BaseCantidad = 'superior' | 'centro' | 'centroColchon'

export const ETIQUETA_BASE: Record<BaseCantidad, string> = {
  superior: 'Límite superior',
  centro: 'Centro del forecast',
  centroColchon: 'Centro + colchón',
}

export interface TanqueDisponible {
  tanque: string
  categoria: 'cerveza' | 'kombucha'
  capacidadLitros: number
}

interface Props {
  series: SerieForecast[]
  stockSeguridad: StockSeguridadItem[]
  plan: LotePlan[]
  tanques: TanqueDisponible[]
  config: ConfigProducto[]
  /** Cuántos meses hacia adelante se planifican de una. */
  meses?: number
  onConfirmar: (lotes: { producto: string; categoria: 'cerveza' | 'kombucha'; litros: number; mes: string }[]) => Promise<void>
}

const fNum = (n: number) => Math.round(n).toLocaleString('es-CL')

function etiquetaMes(iso: string) {
  return new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('es-CL', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .replace('.', '')
}

/**
 * Parte un litraje objetivo en cocciones que caben en tanques reales.
 *
 * Mismo criterio que usa el plan sugerido, a propósito: si un tanque libre
 * cierra todo el volumen se usa el MÁS CHICO que lo cierre —misma merma, y los
 * grandes quedan disponibles para quien los necesite—; si ninguno alcanza se
 * llena el más grande y el resto va a la cocción siguiente.
 *
 * No mira la ocupación en el tiempo: de eso se encarga el Gantt, que marca los
 * choques. Acá sólo importa que ningún bloque nazca con un litraje que no cabe
 * en ningún tanque de su línea.
 */
export function partirEnCocciones(litros: number, tanques: TanqueDisponible[]): number[] {
  const deLinea = [...tanques].sort((a, b) => a.capacidadLitros - b.capacidadLitros)
  if (deLinea.length === 0 || litros <= 0) return []

  const out: number[] = []
  let resto = Math.round(litros)
  const mayor = deLinea[deLinea.length - 1].capacidadLitros
  // Tope de seguridad: sin él, un objetivo mal tipeado (300.000 L) generaría
  // cientos de cocciones antes de que nadie lo note.
  while (resto > 0 && out.length < 40) {
    const cierra = deLinea.find(t => t.capacidadLitros >= resto)
    if (cierra) { out.push(resto); break }
    out.push(mayor)
    resto -= mayor
  }
  return out
}

export default function NecesidadMensual({
  series, stockSeguridad, plan, tanques, config, meses = 4, onConfirmar,
}: Props) {
  const [base, setBase] = useState<BaseCantidad>('superior')
  /** Ajustes a mano, por `producto|mes`. Pisan a la base elegida. */
  const [ajustes, setAjustes] = useState<Record<string, number>>({})
  const [guardando, setGuardando] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'cerveza' | 'kombucha'>('todos')
  const [soloFaltantes, setSoloFaltantes] = useState(false)

  const colorDe = useMemo(() => {
    const m = new Map(config.map(c => [c.producto, c.color]))
    return (p: string) => m.get(p) ?? '#8C8C8C'
  }, [config])

  /** Los meses salen del propio forecast, no del calendario: así la tabla
   *  arranca donde arranca la proyección y nunca muestra un mes vacío. */
  const mesesVisibles = useMemo(() => {
    const set = new Set<string>()
    for (const s of series) {
      if (s.nivel !== 'producto') continue
      for (const p of s.puntos) if (p.tipo === 'forecast') set.add(p.mes)
    }
    return [...set].sort().slice(0, meses)
  }, [series, meses])

  /** Litros ya comprometidos en el Plan Maestro, por producto y mes. */
  const planificado = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of plan) {
      if (l.estado === 'cancelado' || l.estado === 'completado') continue
      const mes = l.fechaPlanificada.slice(0, 8) + '01'
      const k = `${l.producto}|${mes}`
      m.set(k, (m.get(k) ?? 0) + l.litrosPlanificados)
    }
    return m
  }, [plan])

  const colchonPorSerie = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stockSeguridad) {
      if (s.nivel !== 'producto') continue
      m.set(`${s.producto}|${s.mes}`, s.stockSeguridadLitros)
    }
    return m
  }, [stockSeguridad])

  /** Colchón y punto de reorden del mes más próximo: son el respaldo del
   *  número que se está decidiendo, así que van en la misma fila y no en otra
   *  pantalla. Ambos ya salen del sigma calibrado. */
  const respaldoPorProducto = useMemo(() => {
    const m = new Map<string, { colchon: number; reorden: number }>()
    for (const s of stockSeguridad) {
      if (s.nivel !== 'producto') continue
      const previo = m.get(s.producto)
      if (!previo) m.set(s.producto, { colchon: s.stockSeguridadLitros, reorden: s.puntoReordenLitros })
    }
    return m
  }, [stockSeguridad])

  const filas = useMemo(() => {
    const out = series
      .filter(s => s.nivel === 'producto' && s.producto && (filtro === 'todos' || s.categoria === filtro))
      .map(s => {
        const producto = s.producto as string
        const categoria = (s.categoria === 'kombucha' ? 'kombucha' : 'cerveza') as 'cerveza' | 'kombucha'
        const porMes = mesesVisibles.map(mes => {
          const punto = s.puntos.find(p => p.mes === mes && p.tipo === 'forecast')
          const centro = punto?.litros ?? 0
          const superior = punto?.litrosMax ?? centro
          const inferior = punto?.litrosMin ?? centro
          const colchon = colchonPorSerie.get(`${producto}|${mes}`) ?? 0
          const candidatos = { superior, centro, centroColchon: centro + colchon }
          const sugerido = candidatos[base]
          const clave = `${producto}|${mes}`
          const objetivo = ajustes[clave] ?? Math.round(sugerido)
          const yaEnPlan = planificado.get(clave) ?? 0
          return {
            mes, clave, centro, superior, inferior, colchon, candidatos,
            objetivo, yaEnPlan, faltante: Math.max(0, objetivo - yaEnPlan),
          }
        })
        const respaldo = respaldoPorProducto.get(producto)
        return {
          producto, categoria, porMes,
          colchon: respaldo?.colchon ?? null,
          reorden: respaldo?.reorden ?? null,
          total: porMes.reduce((a, c) => a + c.objetivo, 0),
        }
      })
      .filter(f => f.total > 0)
      .sort((a, b) => b.total - a.total)
    return soloFaltantes ? out.filter(f => f.porMes.some(c => c.faltante > 0)) : out
  }, [series, filtro, mesesVisibles, colchonPorSerie, respaldoPorProducto, base, ajustes, planificado, soloFaltantes])

  const totalesPorMes = useMemo(
    () => mesesVisibles.map((mes, i) => ({
      mes,
      objetivo: filas.reduce((a, f) => a + f.porMes[i].objetivo, 0),
      yaEnPlan: filas.reduce((a, f) => a + f.porMes[i].yaEnPlan, 0),
    })),
    [filas, mesesVisibles]
  )

  const confirmar = useCallback(async (
    producto: string, categoria: 'cerveza' | 'kombucha', mes: string, litros: number
  ) => {
    const deLinea = tanques.filter(t => t.categoria === categoria)
    const partes = partirEnCocciones(litros, deLinea)
    if (partes.length === 0) return
    setGuardando(`${producto}|${mes}`)
    try {
      await onConfirmar(partes.map(l => ({ producto, categoria, litros: l, mes })))
    } finally {
      setGuardando(null)
    }
  }, [tanques, onConfirmar])

  return (
    <div className="prod-enter flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Cabecera + elección de base */}
      <div className="flex flex-col gap-3 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-bold tracking-tight text-gray-900">Cuánto hay que producir</h3>
            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              {filas.length} productos · {mesesVisibles.length} meses
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['todos', 'cerveza', 'kombucha'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFiltro(f)}
                className={`prod-press rounded-full border px-3 py-1 text-[11px] font-bold capitalize transition ${
                  filtro === f ? 'border-[#2F6B4F] bg-[#2F6B4F] text-white'
                               : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}>{f}</button>
            ))}
            <button type="button" onClick={() => setSoloFaltantes(v => !v)}
              className={`prod-press rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                soloFaltantes ? 'border-[#C9A227] bg-[#C9A227]/15 text-[#7a6216]'
                              : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>Sólo lo que falta</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Basar la cantidad en</span>
          {(Object.keys(ETIQUETA_BASE) as BaseCantidad[]).map(b => (
            <button key={b} type="button" onClick={() => setBase(b)}
              className={`prod-press rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
                base === b ? 'border-[#2F6B4F] bg-[#2F6B4F]/10 text-[#2F6B4F]'
                           : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}>{ETIQUETA_BASE[b]}</button>
          ))}
        </div>

        {base === 'superior' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-900">
            <Info size={14} className="mt-px shrink-0" />
            <span>
              El límite superior es el escenario alto de <strong>cada producto por separado</strong>: planificar
              todos ahí supone un mes donde todos venden al máximo a la vez. Además el colchón de seguridad ya
              cubre esa incertidumbre, así que el margen queda contado dos veces.
              Compará con <strong>Centro + colchón</strong> antes de confirmar.
            </span>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-gray-200 bg-white text-[10px] uppercase tracking-wide text-gray-400">
              <th className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-bold">Producto</th>
              <th className="px-3 py-2 text-right font-bold" title="Stock de seguridad calibrado que respalda estos litros">Colchón</th>
              <th className="px-3 py-2 text-right font-bold" title="Litros a los que hay que volver a cocer">Pto. reorden</th>
              {mesesVisibles.map(m => (
                <th key={m} className="px-3 py-2 text-right font-bold">{etiquetaMes(m)}</th>
              ))}
              <th className="px-4 py-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="prod-stagger">
            {filas.map((f, i) => (
              <tr key={f.producto} style={{ ['--i' as string]: i }}
                className="prod-hover-row border-b border-gray-50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: colorDe(f.producto) }} />
                    <span className="font-semibold text-gray-800">{f.producto}</span>
                  </div>
                </td>

                <td className="px-3 py-2 text-right align-top text-[11px] tabular-nums text-gray-500">
                  {f.colchon != null ? `${fNum(f.colchon)} L` : '—'}
                </td>
                <td className="px-3 py-2 text-right align-top text-[11px] tabular-nums text-gray-500">
                  {f.reorden != null ? `${fNum(f.reorden)} L` : '—'}
                </td>

                {f.porMes.map(c => {
                  const cubierto = c.yaEnPlan >= c.objetivo && c.objetivo > 0
                  const cargando = guardando === c.clave
                  return (
                    <td key={c.mes} className="px-3 py-2 align-top">
                      <div className="flex flex-col items-end gap-1">
                        <input
                          type="number" min={0} step={50} value={c.objetivo}
                          onChange={e => setAjustes(a => ({ ...a, [c.clave]: Number(e.target.value) }))}
                          title={`Centro ${fNum(c.centro)} L · Superior ${fNum(c.superior)} L · Centro+colchón ${fNum(c.centro + c.colchon)} L`}
                          className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-[12px] font-bold tabular-nums text-gray-800 focus:border-[#2F6B4F] focus:outline-none"
                        />
                        {c.yaEnPlan > 0 && (
                          <span className="text-[10px] tabular-nums text-gray-400">
                            {fNum(c.yaEnPlan)} L en plan
                          </span>
                        )}
                        {c.faltante > 0 ? (
                          <button type="button" disabled={cargando}
                            onClick={() => confirmar(f.producto, f.categoria, c.mes, c.faltante)}
                            title={`Crea las cocciones que cubran ${fNum(c.faltante)} L, partidas por tanque`}
                            className="prod-press flex items-center gap-1 rounded-md bg-[#2F6B4F] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#255941] disabled:opacity-50">
                            {cargando ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                            {fNum(c.faltante)} L
                          </button>
                        ) : cubierto ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                            <Check size={10} /> cubierto
                          </span>
                        ) : null}
                      </div>
                    </td>
                  )
                })}

                <td className="px-4 py-2 text-right align-top text-[12px] font-black tabular-nums text-gray-800">
                  {fNum(f.total)} L
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 text-[11px] font-black text-gray-700">
              <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-left uppercase tracking-wide">Total del mes</td>
              <td /><td />
              {totalesPorMes.map(t => (
                <td key={t.mes} className="px-3 py-2.5 text-right tabular-nums">
                  <div>{fNum(t.objetivo)} L</div>
                  {t.yaEnPlan > 0 && (
                    <div className="text-[10px] font-semibold text-gray-400">{fNum(t.yaEnPlan)} en plan</div>
                  )}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right tabular-nums">
                {fNum(totalesPorMes.reduce((a, t) => a + t.objetivo, 0))} L
              </td>
            </tr>
          </tfoot>
        </table>

        {filas.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {soloFaltantes ? 'Todo lo proyectado ya está cubierto por el plan.' : 'No hay productos proyectados con este filtro.'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 bg-gray-50/60 px-4 py-2.5 text-[11px] text-gray-500 lg:px-6">
        <span className="flex items-center gap-1.5">
          <TriangleAlert size={12} className="text-amber-500" />
          Al confirmar se crean las cocciones partidas según los tanques de esa línea.
        </span>
        <span className="ml-auto">Pasá el cursor por una cantidad para ver las tres bases.</span>
      </div>
    </div>
  )
}
