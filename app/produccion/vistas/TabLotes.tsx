'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { fNum } from '../compartido'
import { Franja, Kpi, Seccion, Pastillas, fFecha } from './ui'

/* Lotes con seguimiento (tablas lotes, lote_etapas, lote_envasado). Es
   independiente del Gantt y del plan maestro: trae sus datos de
   /api/produccion/lotes y no pasa por useProduccion. */

const ETAPAS = [
  { id: 'coccion', label: 'Cocción' },
  { id: 'fermentacion', label: 'Fermentación' },
  { id: 'maduracion', label: 'Maduración' },
  { id: 'listo', label: 'Listo' },
  { id: 'envasado', label: 'Envasado' },
  { id: 'finalizado', label: 'Finalizado' },
] as const
type EtapaId = (typeof ETAPAS)[number]['id']
const ETIQUETA_ETAPA = Object.fromEntries(ETAPAS.map(e => [e.id, e.label])) as Record<EtapaId, string>

interface Lote {
  id: string; codigo: string; producto: string; categoria: 'cerveza' | 'kombucha' | null
  fermentador_id: string | null; fecha_coccion: string; litros_iniciales: number; litros_merma: number
  estado: 'activo' | 'finalizado' | 'desactivado'; etapa_actual: EtapaId; observaciones: string | null
  envasado: { litros: number; barriles: number; latas: number }
}
interface Fermentador { id: string; nombre: string; capacidad_litros: number; categoria: string | null }
interface Receta { id: string; producto: string; litros_base: number }
interface Etapa { id: string; etapa: EtapaId; fecha_inicio: string; fecha_fin: string | null }
type Filtro = 'activos' | 'finalizados' | 'todos'

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
const entrada = 'rounded-lg border border-(--p-line) bg-(--p-card-2) px-2.5 py-1.5 text-sm text-(--p-text) focus:border-(--p-accent) focus:outline-none'

export default function TabLotes() {
  const [lotes, setLotes] = useState<Lote[]>([])
  const [fermentadores, setFermentadores] = useState<Fermentador[]>([])
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('activos')
  const [nuevo, setNuevo] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/produccion/lotes', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudieron cargar los lotes')
      setLotes(j.lotes); setFermentadores(j.fermentadores); setRecetas(j.recetas); setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los lotes')
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  const nombreTanque = useMemo(() => new Map(fermentadores.map(f => [f.id, f.nombre])), [fermentadores])
  const visibles = lotes.filter(l => filtro === 'todos' ? l.estado !== 'desactivado' : filtro === 'activos' ? l.estado === 'activo' : l.estado === 'finalizado')
  const activos = lotes.filter(l => l.estado === 'activo')
  const enProceso = activos.reduce((s, l) => s + l.litros_iniciales - l.litros_merma - l.envasado.litros, 0)
  const merma = lotes.reduce((s, l) => s + l.litros_merma, 0)
  const litrosTotales = lotes.reduce((s, l) => s + l.litros_iniciales, 0)

  async function enviar(url: string, metodo: 'POST' | 'PATCH', cuerpo: unknown): Promise<boolean> {
    const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error ?? 'No se pudo guardar')
      return false
    }
    setError(null)
    await cargar()
    return true
  }

  return (
    <div className="space-y-5">
      <Franja>
        <Kpi etiqueta="Lotes activos" valor={activos.length} detalle="en cocción, fermentación o envasado" />
        <Kpi etiqueta="Litros en proceso" valor={fNum(Math.round(enProceso))} unidad="L" detalle="sin envasar todavía" />
        <Kpi etiqueta="Merma" valor={litrosTotales > 0 ? `${((merma / litrosTotales) * 100).toFixed(1)}` : '—'} unidad={litrosTotales > 0 ? '%' : undefined} detalle={litrosTotales > 0 ? `${fNum(Math.round(merma))} L de ${fNum(Math.round(litrosTotales))} L cocidos` : 'sin lotes registrados'} />
        <Kpi etiqueta="Lotes registrados" valor={lotes.length} detalle="desde que se empezó a usar esta pestaña" />
      </Franja>

      {error && <div role="alert" className="rounded-xl border border-(--p-bad-line) bg-(--p-bad-soft) px-4 py-2.5 text-sm text-(--p-bad)">{error}</div>}

      <Seccion
        titulo="Lotes"
        detalle="Cada lote guarda su tanque, sus etapas y lo que salió envasado. Pasa de etapa con el selector."
        accion={
          <>
            <Pastillas<Filtro> etiqueta="Filtrar lotes" valor={filtro} onCambiar={setFiltro} opciones={[
              { id: 'activos', label: 'Activos', cuenta: activos.length },
              { id: 'finalizados', label: 'Finalizados' },
              { id: 'todos', label: 'Todos' },
            ]} />
            <button type="button" onClick={() => setNuevo(v => !v)} className="prod-press prod-accion flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold">
              <Plus size={14} />Nuevo lote
            </button>
          </>
        }
      >
        {nuevo && (
          <FormNuevoLote
            fermentadores={fermentadores}
            recetas={recetas}
            onCancelar={() => setNuevo(false)}
            onCrear={async datos => { if (await enviar('/api/produccion/lotes', 'POST', datos)) setNuevo(false) }}
          />
        )}

        {cargando ? (
          <p className="px-5 pb-5 text-sm text-(--p-text-3)">Cargando lotes…</p>
        ) : visibles.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-(--p-text-3)">
            {lotes.length === 0 ? 'Todavía no hay lotes. Crea el primero con “Nuevo lote”.' : 'No hay lotes en este filtro.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-(--p-text-3)">
                <tr className="border-y border-(--p-line-2)">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Tanque</th>
                  <th className="px-3 py-2">Cocción</th>
                  <th className="px-3 py-2 text-right">Litros</th>
                  <th className="px-3 py-2 text-right">Envasado</th>
                  <th className="px-5 py-2">Etapa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--p-line-2) tabular-nums">
                {visibles.map(l => (
                  <FilaLote
                    key={l.id}
                    lote={l}
                    tanque={l.fermentador_id ? nombreTanque.get(l.fermentador_id) ?? '—' : '—'}
                    abierto={abierto === l.id}
                    onAbrir={() => setAbierto(abierto === l.id ? null : l.id)}
                    onEtapa={etapa => void enviar(`/api/produccion/lotes/${l.id}`, 'PATCH', { etapa })}
                    onMerma={litrosMerma => enviar(`/api/produccion/lotes/${l.id}`, 'PATCH', { litrosMerma })}
                    onEnvasar={datos => enviar(`/api/produccion/lotes/${l.id}/envasado`, 'POST', datos)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  )
}

function FilaLote({ lote: l, tanque, abierto, onAbrir, onEtapa, onMerma, onEnvasar }: {
  lote: Lote; tanque: string; abierto: boolean; onAbrir: () => void
  onEtapa: (e: EtapaId) => void
  onMerma: (litros: number) => Promise<boolean>
  onEnvasar: (d: { formato: 'barril' | 'lata'; capacidadMl: number | null; unidades: number; litros: number }) => Promise<boolean>
}) {
  const util = l.litros_iniciales - l.litros_merma
  return (
    <>
      <tr>
        <td className="px-3 py-2.5">
          <button type="button" onClick={onAbrir} aria-expanded={abierto} aria-label={`Detalle del lote ${l.codigo}`} className="prod-press rounded p-1 text-(--p-text-3) hover:text-(--p-text)">
            <ChevronRight size={15} className={abierto ? 'rotate-90' : ''} />
          </button>
        </td>
        <td className="px-3 py-2.5 font-semibold text-(--p-text)">{l.codigo}</td>
        <td className="px-3 py-2.5 text-(--p-text-2)">{l.producto}</td>
        <td className="px-3 py-2.5 text-(--p-text-2)">{tanque}</td>
        <td className="px-3 py-2.5 text-(--p-text-2)">{fFecha(l.fecha_coccion)}</td>
        <td className="px-3 py-2.5 text-right text-(--p-text)">{fNum(Math.round(l.litros_iniciales))} L</td>
        <td className="px-3 py-2.5 text-right text-(--p-text-2)">{l.envasado.litros > 0 ? `${fNum(Math.round(l.envasado.litros))} L` : '—'}</td>
        <td className="px-5 py-1.5">
          <select
            aria-label={`Etapa del lote ${l.codigo}`}
            value={l.etapa_actual}
            disabled={l.estado !== 'activo'}
            onChange={e => onEtapa(e.target.value as EtapaId)}
            className={entrada}
          >
            {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td />
          <td colSpan={7} className="px-3 pb-4 pt-1">
            <DetalleLote lote={l} util={util} onMerma={onMerma} onEnvasar={onEnvasar} />
          </td>
        </tr>
      )}
    </>
  )
}

function DetalleLote({ lote: l, util, onMerma, onEnvasar }: {
  lote: Lote; util: number
  onMerma: (litros: number) => Promise<boolean>
  onEnvasar: (d: { formato: 'barril' | 'lata'; capacidadMl: number | null; unidades: number; litros: number }) => Promise<boolean>
}) {
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [formato, setFormato] = useState<'barril' | 'lata'>('barril')
  const [unidades, setUnidades] = useState('')
  const [capacidad, setCapacidad] = useState('30')

  useEffect(() => {
    let vivo = true
    fetch(`/api/produccion/lotes/${l.id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (vivo && j.etapas) setEtapas(j.etapas) })
      .catch(() => {})
    return () => { vivo = false }
  }, [l.id, l.etapa_actual])

  const porEnvasar = Math.max(0, util - l.envasado.litros)
  // Barril: capacidad en litros. Lata: capacidad en ml.
  const litrosPorUnidad = formato === 'barril' ? Number(capacidad) : Number(capacidad) / 1000
  const n = Number(unidades)
  const litros = Number.isFinite(n) && Number.isFinite(litrosPorUnidad) ? n * litrosPorUnidad : 0
  const valido = Number.isInteger(n) && n > 0 && litros > 0

  return (
    <div className="grid gap-5 rounded-xl border border-(--p-line-2) bg-(--p-card-2) p-4 lg:grid-cols-3">
      <div>
        <p className="prod-eyebrow">Etapas</p>
        <ul className="mt-2 space-y-1 text-[13px] text-(--p-text-2)">
          {etapas.length === 0 && <li className="text-(--p-text-3)">Sin historial.</li>}
          {etapas.map(e => (
            <li key={e.id} className="flex justify-between gap-3">
              <span className="font-semibold text-(--p-text)">{ETIQUETA_ETAPA[e.etapa] ?? e.etapa}</span>
              <span className="tabular-nums">{fFecha(e.fecha_inicio.slice(0, 10))}{e.fecha_fin ? ` → ${fFecha(e.fecha_fin.slice(0, 10))}` : ' → hoy'}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="prod-eyebrow">Merma</p>
        <label className="mt-2 flex items-center gap-2 text-[13px] text-(--p-text-2)">
          <input
            type="number" min={0} inputMode="decimal" defaultValue={l.litros_merma || ''} placeholder="0"
            aria-label={`Merma del lote ${l.codigo} en litros`}
            onBlur={e => { const v = Number(e.target.value || 0); if (v !== l.litros_merma && v >= 0) void onMerma(v) }}
            className={`${entrada} w-24 text-right`}
          />
          litros perdidos
        </label>
        <p className="mt-2 text-[12px] text-(--p-text-3)">Quedan {fNum(Math.round(porEnvasar))} L por envasar de {fNum(Math.round(util))} L útiles.</p>
      </div>

      <div>
        <p className="prod-eyebrow">Registrar envasado</p>
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={async e => {
            e.preventDefault()
            if (!valido) return
            const ok = await onEnvasar({ formato, capacidadMl: formato === 'barril' ? Number(capacidad) * 1000 : Number(capacidad), unidades: n, litros })
            if (ok) setUnidades('')
          }}
        >
          <select aria-label="Formato" value={formato} onChange={e => { const f = e.target.value as 'barril' | 'lata'; setFormato(f); setCapacidad(f === 'barril' ? '30' : '473') }} className={entrada}>
            <option value="barril">Barril (L)</option>
            <option value="lata">Lata (ml)</option>
          </select>
          <input aria-label="Capacidad por unidad" type="number" min={1} value={capacidad} onChange={e => setCapacidad(e.target.value)} className={`${entrada} w-20 text-right`} />
          <input aria-label="Unidades" type="number" min={1} placeholder="Unid." value={unidades} onChange={e => setUnidades(e.target.value)} className={`${entrada} w-20 text-right`} />
          <button type="submit" disabled={!valido} className="prod-press prod-accion rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50">Agregar</button>
        </form>
        <p className="mt-2 text-[12px] text-(--p-text-3)">
          {valido ? `${fNum(Math.round(litros))} L` : 'Indica unidades'} · ya envasado: {l.envasado.barriles} barriles, {fNum(l.envasado.latas)} latas
        </p>
      </div>
    </div>
  )
}

function FormNuevoLote({ fermentadores, recetas, onCancelar, onCrear }: {
  fermentadores: Fermentador[]; recetas: Receta[]
  onCancelar: () => void
  onCrear: (d: { producto: string; recetaId: string | null; fermentadorId: string | null; fechaCoccion: string; litrosIniciales: number; categoria: 'cerveza' | 'kombucha' | null }) => Promise<void>
}) {
  const [producto, setProducto] = useState('')
  const [recetaId, setRecetaId] = useState('')
  const [fermentadorId, setFermentadorId] = useState('')
  const [fecha, setFecha] = useState(hoyChile())
  const [litros, setLitros] = useState('')

  const receta = recetas.find(r => r.id === recetaId)
  const tanque = fermentadores.find(f => f.id === fermentadorId)
  const nLitros = Number(litros)
  const valido = producto.trim() !== '' && nLitros > 0 && fecha !== ''
  const excede = tanque != null && nLitros > Number(tanque.capacidad_litros)

  return (
    <form
      className="mx-5 mb-4 grid gap-3 rounded-xl border border-(--p-line-2) bg-(--p-card-2) p-4 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={e => {
        e.preventDefault()
        if (!valido) return
        const cat = tanque?.categoria === 'kombucha' ? 'kombucha' : tanque?.categoria === 'cerveza' ? 'cerveza' : null
        void onCrear({ producto: producto.trim(), recetaId: recetaId || null, fermentadorId: fermentadorId || null, fechaCoccion: fecha, litrosIniciales: nLitros, categoria: cat })
      }}
    >
      <label className="text-[12px] font-semibold text-(--p-text-3)">Receta
        <select value={recetaId} onChange={e => { setRecetaId(e.target.value); const r = recetas.find(x => x.id === e.target.value); if (r) { setProducto(r.producto); if (!litros) setLitros(String(r.litros_base)) } }} className={`${entrada} mt-1 w-full`}>
          <option value="">Sin receta</option>
          {recetas.map(r => <option key={r.id} value={r.id}>{r.producto}</option>)}
        </select>
      </label>
      <label className="text-[12px] font-semibold text-(--p-text-3)">Producto
        <input value={producto} onChange={e => setProducto(e.target.value)} placeholder={receta?.producto ?? 'Nombre del producto'} className={`${entrada} mt-1 w-full`} />
      </label>
      <label className="text-[12px] font-semibold text-(--p-text-3)">Tanque
        <select value={fermentadorId} onChange={e => setFermentadorId(e.target.value)} className={`${entrada} mt-1 w-full`}>
          <option value="">Sin asignar</option>
          {fermentadores.map(f => <option key={f.id} value={f.id}>{f.nombre} · {fNum(f.capacidad_litros)} L</option>)}
        </select>
      </label>
      <label className="text-[12px] font-semibold text-(--p-text-3)">Fecha de cocción
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={`${entrada} mt-1 w-full`} />
      </label>
      <label className="text-[12px] font-semibold text-(--p-text-3)">Litros
        <input type="number" min={1} inputMode="decimal" value={litros} onChange={e => setLitros(e.target.value)} className={`${entrada} mt-1 w-full text-right`} />
      </label>
      {excede && <p className="text-[12px] text-(--p-warn) sm:col-span-2 lg:col-span-5">Son más litros que la capacidad del tanque ({fNum(tanque!.capacidad_litros)} L).</p>}
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-5">
        <button type="button" onClick={onCancelar} className="prod-press rounded-lg border border-(--p-line) px-3 py-1.5 text-xs font-bold text-(--p-text-3)">Cancelar</button>
        <button type="submit" disabled={!valido} className="prod-press prod-primario rounded-lg px-4 py-1.5 text-xs font-extrabold disabled:opacity-50">Crear lote</button>
      </div>
    </form>
  )
}
