'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Settings2, AlertTriangle, ChevronLeft, ChevronRight, CalendarRange, Eye, EyeOff } from 'lucide-react'
import type { CargaArrastre, DestinoArrastre, EstadoArrastre } from './useArrastreCalendario'

/**
 * Carta Gantt de ocupación de fermentadores.
 *
 * Reemplaza a las dos grillas de calendario que había antes ("Calendario de
 * Cocciones Sugeridas" y "Cronograma de Cocciones"), que mostraban la misma
 * planta en dos lugares y con dos criterios distintos. Acá hay una sola foto:
 * filas = tanques, columnas = días, bloques = cocciones.
 *
 * DÍAS CORRIDOS, NO HÁBILES. El Gantt que se llevaba en Excel usaba una
 * columna por día hábil, así que un bloque que en la realidad ocupa el tanque
 * 12 días corridos se veía de 10 y el sábado y domingo desaparecían del
 * cálculo. La fermentación no para el fin de semana: acá cada día es una
 * columna y el finde va sombreado, para que el ancho del bloque sea la
 * duración de verdad.
 *
 * Los bloques confirmados van sólidos y los sugeridos en punteado. Arrastrar
 * un sugerido lo confirma; arrastrar uno confirmado lo mueve de día y/o de
 * tanque, y eso se guarda en base (a diferencia de antes, que vivía en un
 * useState y se perdía al recargar).
 */

export interface FermentadorGantt {
  nombre: string
  tipo: string
  categoria: 'cerveza' | 'kombucha'
  capacidadLitros: number
  /** Litros que el ERP dice que tiene AHORA — para marcar el que ya está ocupado. */
  litrosActuales: number
}

export interface BloqueGantt {
  /** id del plan si está confirmado; una clave sintética si es sugerencia. */
  id: string
  tipo: 'confirmado' | 'sugerido'
  producto: string
  categoria: 'cerveza' | 'kombucha'
  litros: number
  inicioISO: string
  /** Días corridos de ocupación del tanque. */
  dias: number
  fermentador: string | null
  /** Para poder reconstruir la carga de arrastre de una sugerencia. */
  loteNro?: number
  motivo?: string | null
  atrasado?: boolean
}

export interface ConfigProducto {
  producto: string
  categoria: 'cerveza' | 'kombucha'
  diasFermentacion: number
  litrosObjetivo: number | null
  color: string
}

interface Props {
  fermentadores: FermentadorGantt[]
  bloques: BloqueGantt[]
  config: ConfigProducto[]
  /** Estado vivo del arrastre, para pintar la celda destino. */
  arrastre: EstadoArrastre | null
  propsOrigen: (carga: CargaArrastre, habilitado?: boolean) => Record<string, unknown>
  onAbrirConfig: () => void
  onAbrirBloque?: (bloque: BloqueGantt, rect?: DOMRect) => void
  /** id del bloque que se acaba de mover, para que aterrice con un latido.
   *  Lo informa quien hizo el movimiento — comparar posiciones entre renders
   *  obligaría a leer y escribir un ref durante el render, que React prohíbe. */
  bloqueRecienMovido?: string | null
  /** Movimientos de esta sesión que todavía no se reflejan en el plan. */
  anclasEnSesion?: number
  onLimpiarAnclas?: () => void
  /** Necesidad del paso 2 contra lo que hay agendado, por mes. Es lo que
   *  convierte al Gantt en tablero de control y no sólo en un calendario:
   *  responde "¿lo agendado cubre lo que dije que necesito?". */
  cobertura?: { mes: string; necesidad: number; planificado: number }[]
  /** Semanas visibles de una. */
  semanas?: number
}

const MS_DIA = 86_400_000
/* Dos densidades, no tres. El "amplio" de 40 px/día daba 2.800 px de ancho a
   diez semanas: nadie planifica scrolleando cuatro pantallas. Cada densidad
   define también el alto de fila — con 23 tanques, 44 px por fila eran mil
   píxeles de grilla antes de ver nada más. */
const DENSIDAD = {
  compacto: { dia: 14, fila: 26, etiqueta: 10 },
  normal: { dia: 24, fila: 34, etiqueta: 11 },
} as const
type Zoom = keyof typeof DENSIDAD
const ANCHO_TANQUE = 168

function isoADate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function dateAIso(d: Date) {
  return d.toISOString().slice(0, 10)
}
function sumarDias(iso: string, n: number) {
  return dateAIso(new Date(isoADate(iso).getTime() + n * MS_DIA))
}
function diffDias(desdeISO: string, hastaISO: string) {
  return Math.round((isoADate(hastaISO).getTime() - isoADate(desdeISO).getTime()) / MS_DIA)
}
function hoyISO() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

/** Negro o blanco según qué contraste mejor sobre el color del bloque. La
 *  paleta la elige el usuario desde la configuración, así que el texto no
 *  puede asumir un fondo oscuro. */
/** Litros abreviados para las cabeceras: con seis datos en una línea, los
 *  miles completos empujan el resto fuera de pantalla. */
function fLitros(n: number) {
  return n >= 10000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : Math.round(n).toLocaleString('es-CL')
}

function textoSobre(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Luminancia relativa aproximada (coeficientes ITU-R BT.601).
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#1a1a1a' : '#ffffff'
}

export default function GanttProduccion({
  fermentadores, bloques, config, arrastre, propsOrigen,
  onAbrirConfig, onAbrirBloque, bloqueRecienMovido = null,
  anclasEnSesion = 0, onLimpiarAnclas, cobertura = [], semanas = 10,
}: Props) {
  const [zoom, setZoom] = useState<Zoom>('normal')
  /** Grupos plegados. Plegar NO esconde información: la cabecera del grupo
   *  lleva su propio resumen (ocupados, litros, % de capacidad), así que
   *  cerrar Laboratorio deja de costar 4 filas y no cuesta saber cómo está. */
  const [plegados, setPlegados] = useState<Set<string>>(new Set(['Laboratorio']))
  /** Los tanques sin nada agendado en la ventana son la mitad de la grilla y
   *  no aportan a leer el plan. Se esconden por defecto y se cuentan en la
   *  cabecera del grupo, que es donde importan: "quedan 8 libres". */
  const [ocultarLibres, setOcultarLibres] = useState(true)
  const alternarGrupo = useCallback((titulo: string) => {
    setPlegados(p => {
      const n = new Set(p)
      if (n.has(titulo)) n.delete(titulo); else n.add(titulo)
      return n
    })
  }, [])
  const [offsetSemanas, setOffsetSemanas] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  /** Dirección del último salto de semanas, para que la grilla entre desde
   *  el lado hacia el que se viaja en vez de aparecer sin más. */
  const [sentido, setSentido] = useState<'izq' | 'der' | null>(null)
  const irASemana = useCallback((delta: number) => {
    setSentido(delta === 0 ? null : delta > 0 ? 'der' : 'izq')
    setOffsetSemanas(o => (delta === 0 ? 0 : o + delta))
  }, [])

  const { dia: anchoDia, fila: altoFila, etiqueta: tamEtiqueta } = DENSIDAD[zoom]
  const hoy = hoyISO()

  const colorPorProducto = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of config) m.set(c.producto, c.color)
    return m
  }, [config])

  /** La ventana arranca el lunes de la semana de hoy, para que las columnas
   *  caigan siempre en el mismo día de la semana al paginar. */
  const inicioVentana = useMemo(() => {
    const d = isoADate(hoy)
    const lunes = (d.getUTCDay() + 6) % 7
    return sumarDias(hoy, -lunes + offsetSemanas * 7)
  }, [hoy, offsetSemanas])

  const dias = useMemo(() => {
    const total = semanas * 7
    return Array.from({ length: total }, (_, i) => {
      const iso = sumarDias(inicioVentana, i)
      const d = isoADate(iso)
      const dow = d.getUTCDay()
      return {
        iso, i,
        dow,
        finde: dow === 0 || dow === 6,
        dia: d.getUTCDate(),
        mes: d.getUTCMonth(),
        esHoy: iso === hoy,
        // Primer día del mes visible: sirve para cortar la banda de meses.
        primeroDeMes: d.getUTCDate() === 1 || i === 0,
      }
    })
  }, [inicioVentana, semanas, hoy])

  const finVentana = dias[dias.length - 1]?.iso ?? inicioVentana

  /** Tramos de mes para la banda superior: {label, desdeIdx, cols}. */
  const bandaMeses = useMemo(() => {
    const out: { label: string; desde: number; cols: number }[] = []
    for (const d of dias) {
      const label = isoADate(d.iso).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      const ultimo = out[out.length - 1]
      if (!ultimo || ultimo.label !== label) out.push({ label, desde: d.i, cols: 1 })
      else ultimo.cols++
    }
    return out
  }, [dias])

  /** Bloques por tanque, ya recortados a la ventana visible. Los que no tienen
   *  fermentador asignado van aparte, en una fila "sin asignar" — si no,
   *  desaparecerían del Gantt y nadie sabría que quedaron sueltos. */
  const { porTanque, sinAsignar, solapes, noCaben } = useMemo(() => {
    const porTanque = new Map<string, BloqueGantt[]>()
    const sinAsignar: BloqueGantt[] = []
    for (const b of bloques) {
      const fin = sumarDias(b.inicioISO, b.dias - 1)
      if (fin < inicioVentana || b.inicioISO > finVentana) continue
      if (!b.fermentador) { sinAsignar.push(b); continue }
      if (!porTanque.has(b.fermentador)) porTanque.set(b.fermentador, [])
      porTanque.get(b.fermentador)!.push(b)
    }
    // Dos cocciones en el mismo tanque a la vez es físicamente imposible: se
    // marcan las dos para que se vea que el plan está mal, en vez de dibujar
    // un bloque encima del otro y que parezca normal.
    const solapes = new Set<string>()
    for (const lista of porTanque.values()) {
      const orden = [...lista].sort((a, b) => a.inicioISO.localeCompare(b.inicioISO))
      for (let i = 1; i < orden.length; i++) {
        const prevFin = sumarDias(orden[i - 1].inicioISO, orden[i - 1].dias - 1)
        if (orden[i].inicioISO <= prevFin) { solapes.add(orden[i].id); solapes.add(orden[i - 1].id) }
      }
    }
    // Un bloque cuyo litraje supera la capacidad del tanque tampoco es
    // ejecutable. Se cuenta acá y no sólo se marca en la fila: con 23 filas,
    // un aviso que vive dentro de una de ellas no se ve.
    let noCaben = 0
    for (const [nombre, lista] of porTanque) {
      const cap = fermentadores.find(f => f.nombre === nombre)?.capacidadLitros ?? 0
      if (cap > 0) noCaben += lista.filter(b => b.litros > cap).length
    }
    return { porTanque, sinAsignar, solapes, noCaben }
  }, [bloques, inicioVentana, finVentana, fermentadores])

  const grupos = useMemo(() => {
    const esLab = (n: string) => /lavoratorio|laboratorio/i.test(n)
    const crudos = [
      { titulo: 'Tanques cerveza', tanques: fermentadores.filter(f => f.categoria === 'cerveza' && !esLab(f.nombre)) },
      { titulo: 'Tanques kombucha', tanques: fermentadores.filter(f => f.categoria === 'kombucha') },
      { titulo: 'Laboratorio', tanques: fermentadores.filter(f => esLab(f.nombre)) },
    ].filter(g => g.tanques.length > 0)

    // El resumen es lo que permite plegar sin perder nada: un encargado que
    // cierra un grupo sigue sabiendo cuántos tanques tiene tomados, cuántos
    // litros hay comprometidos y qué proporción de su capacidad es eso.
    return crudos.map(g => {
      const conBloques = g.tanques.filter(t => (porTanque.get(t.nombre) ?? []).length > 0)
      const litros = g.tanques.reduce(
        (a, t) => a + (porTanque.get(t.nombre) ?? []).reduce((x, b) => x + b.litros, 0), 0)
      const capacidad = g.tanques.reduce((a, t) => a + t.capacidadLitros, 0)
      const alertas = g.tanques.reduce((a, t) => a + (porTanque.get(t.nombre) ?? [])
        .filter(b => solapes.has(b.id) || b.litros > t.capacidadLitros).length, 0)
      return {
        ...g,
        ocupados: conBloques.length,
        libres: g.tanques.length - conBloques.length,
        litros, capacidad, alertas,
        pct: capacidad > 0 ? Math.round((litros / capacidad) * 100) : 0,
        visibles: ocultarLibres ? conBloques : g.tanques,
      }
    })
  }, [fermentadores, porTanque, solapes, ocultarLibres])

  const anchoGrilla = dias.length * anchoDia

  const cargaDe = useCallback((b: BloqueGantt): CargaArrastre => (
    b.tipo === 'confirmado'
      ? { tipo: 'coccion', producto: b.producto, loteNro: b.loteNro ?? 1, categoria: b.categoria, litros: b.litros }
      : { tipo: 'sugerencia', producto: b.producto, categoria: b.categoria, litros: b.litros, motivo: b.motivo ?? null }
  ), [])

  const destinoActivo = arrastre?.destino ?? null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <CalendarRange size={17} className="text-[#2F6B4F]" />
          <h3 className="font-bold tracking-tight text-gray-900">Ocupación de Fermentadores</h3>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {bloques.filter(b => b.tipo === 'confirmado').length} en plan · {bloques.filter(b => b.tipo === 'sugerido').length} sugeridas
          </span>
          {anclasEnSesion > 0 && onLimpiarAnclas && (
            <button type="button" onClick={onLimpiarAnclas}
              className="prod-press flex items-center gap-1 rounded-full border border-[#C9A227] bg-[#C9A227]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#7a6216] hover:bg-[#C9A227]/20"
              title="Volver al plan que propone el modelo">
              {anclasEnSesion} {anclasEnSesion === 1 ? 'cocción movida' : 'cocciones movidas'} — deshacer
            </button>
          )}
          {solapes.size > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
              <AlertTriangle size={11} />
              {solapes.size / 2} choque{solapes.size / 2 === 1 ? '' : 's'} de tanque
            </span>
          )}
          {noCaben > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
              <AlertTriangle size={11} />
              {noCaben} no cabe{noCaben === 1 ? '' : 'n'} en su tanque
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
            {(['compacto', 'normal'] as Zoom[]).map(z => (
              <button
                key={z} type="button" onClick={() => setZoom(z)}
                className={`prod-press rounded-md px-2 py-1 text-[11px] font-bold capitalize transition ${
                  zoom === z ? 'bg-[#2F6B4F] text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >{z}</button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
            <button type="button" onClick={() => irASemana(-2)}
              className="prod-press prod-hover-icon rounded-md p-1.5 text-gray-500 hover:bg-gray-50" title="Dos semanas atrás">
              <ChevronLeft size={15} />
            </button>
            <button type="button" onClick={() => irASemana(0)}
              className="prod-press rounded-md px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50">
              Hoy
            </button>
            <button type="button" onClick={() => irASemana(2)}
              className="prod-press prod-hover-icon rounded-md p-1.5 text-gray-500 hover:bg-gray-50" title="Dos semanas adelante">
              <ChevronRight size={15} />
            </button>
          </div>

          <button type="button" onClick={() => setOcultarLibres(v => !v)}
            title={ocultarLibres ? 'Mostrar todos los tanques' : 'Esconder los tanques sin carga'}
            className={`prod-press flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
              ocultarLibres ? 'border-[#2F6B4F] bg-[#2F6B4F]/10 text-[#2F6B4F]'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}>
            {ocultarLibres ? <EyeOff size={14} /> : <Eye size={14} />}
            Sólo con carga
          </button>

          <button type="button" onClick={onAbrirConfig}
            className="prod-press flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-50">
            <Settings2 size={14} />
            Configurar productos
          </button>
        </div>
      </div>

      {/* ── Cobertura contra la necesidad ────────────────────────────────
          Sin esto el Gantt dice dónde va cada cocción pero no si alcanzan.
          Un encargado no necesita sumar litros a mano para saber que a
          noviembre todavía le faltan 4.000 L por agendar. */}
      {cobertura.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 bg-white px-4 py-2.5 lg:px-6">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Agendado vs. necesidad
          </span>
          {cobertura.map(c => {
            const pct = c.necesidad > 0 ? Math.round((c.planificado / c.necesidad) * 100) : 100
            const falta = Math.max(0, c.necesidad - c.planificado)
            return (
              <div key={c.mes} className="flex items-center gap-1.5"
                title={`${fLitros(c.planificado)} L agendados de ${fLitros(c.necesidad)} L necesarios`}>
                <span className="text-[10.5px] font-bold uppercase text-gray-500">
                  {new Date(c.mes + 'T00:00:00Z').toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' }).replace('.', '')}
                </span>
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-200">
                  <span className="block h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: pct >= 100 ? '#2F6B4F' : pct >= 60 ? '#C9A227' : '#DC2626',
                    }} />
                </span>
                <span className={`text-[10.5px] font-bold tabular-nums ${
                  pct >= 100 ? 'text-[#2F6B4F]' : 'text-gray-600'
                }`}>{pct}%</span>
                {falta > 0 && (
                  <span className="text-[10.5px] tabular-nums text-gray-400">falta {fLitros(falta)} L</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Grilla ───────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ minWidth: ANCHO_TANQUE + anchoGrilla }}>

          {/* Banda de meses */}
          <div className="flex border-b border-gray-100 bg-gray-50/60">
            <div style={{ width: ANCHO_TANQUE, flexShrink: 0 }} className="sticky left-0 z-20 bg-gray-50/95 backdrop-blur" />
            {bandaMeses.map(m => (
              <div key={m.desde} style={{ width: m.cols * anchoDia, flexShrink: 0 }}
                className="border-l border-gray-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                {m.cols * anchoDia > 70 ? m.label : ''}
              </div>
            ))}
          </div>

          {/* Días */}
          <div className="flex border-b border-gray-200 bg-white">
            <div style={{ width: ANCHO_TANQUE, flexShrink: 0 }}
              className="sticky left-0 z-20 flex items-center bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Fermentador <span className="ml-auto normal-case text-gray-300">cap. L</span>
            </div>
            {dias.map(d => (
              <div key={d.iso} style={{ width: anchoDia, flexShrink: 0 }}
                className={`border-l py-1 text-center text-[9px] font-semibold leading-tight ${
                  d.esHoy ? 'border-[#C9A227] bg-[#C9A227]/15 text-[#7a6216]'
                  : d.finde ? 'border-gray-200 bg-gray-200/70 text-gray-500'
                  : 'border-gray-100 text-gray-500'
                }`}>
                {anchoDia >= 26 && <div className="text-[8px] text-gray-400">{'LMXJVSD'[(d.dow + 6) % 7]}</div>}
                <div>{d.dia}</div>
              </div>
            ))}
          </div>

          {/* Filas por grupo */}
          {grupos.map(grupo => {
            const plegado = plegados.has(grupo.titulo)
            return (
              <div key={grupo.titulo}>
                {/* Cabecera del grupo: es a la vez el control de plegado y el
                    resumen. Va como <button> de ancho completo y no como un
                    ícono chico — el objetivo es abrir y cerrar rápido, no
                    apuntarle a una flecha de 12 px. */}
                <button
                  type="button"
                  onClick={() => alternarGrupo(grupo.titulo)}
                  className="prod-press sticky left-0 z-20 flex w-full items-center gap-2 border-b border-gray-200 bg-gray-100/80 px-3 py-1.5 text-left hover:bg-gray-100"
                  style={{ width: ANCHO_TANQUE + anchoGrilla }}
                >
                  <ChevronRight size={13}
                    className={`shrink-0 text-gray-500 transition-transform duration-200 ${plegado ? '' : 'rotate-90'}`} />
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-gray-600">
                    {grupo.titulo}
                  </span>

                  <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-gray-500">
                    {grupo.ocupados}/{grupo.tanques.length} con carga
                  </span>

                  {/* Barra de ocupación: es el dato que un encargado mira
                      primero, y es lo que hace que plegar no cueste nada. */}
                  <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-gray-300">
                    <span className="block h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${Math.min(grupo.pct, 100)}%`,
                        background: grupo.pct >= 90 ? '#DC2626' : grupo.pct >= 70 ? '#C9A227' : '#2F6B4F',
                      }} />
                  </span>
                  <span className="shrink-0 text-[10.5px] font-bold tabular-nums text-gray-600">
                    {grupo.pct}%
                  </span>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-gray-400">
                    {fLitros(grupo.litros)} de {fLitros(grupo.capacidad)} L
                  </span>

                  {grupo.alertas > 0 && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-1.5 py-px text-[10px] font-bold text-red-700">
                      <AlertTriangle size={9} />{grupo.alertas}
                    </span>
                  )}
                  {plegado && grupo.libres > 0 && (
                    <span className="shrink-0 text-[10.5px] text-gray-400">
                      · {grupo.libres} {grupo.libres === 1 ? 'libre' : 'libres'}
                    </span>
                  )}
                </button>

                {!plegado && grupo.visibles.map((t, i) => (
                  <FilaTanque
                    key={t.nombre} tanque={t} bloques={porTanque.get(t.nombre) ?? []} dias={dias}
                    anchoDia={anchoDia} altoFila={altoFila} tamEtiqueta={tamEtiqueta}
                    inicioVentana={inicioVentana} hoy={hoy}
                    colorPorProducto={colorPorProducto} solapes={solapes}
                    destinoActivo={destinoActivo} propsOrigen={propsOrigen}
                    cargaDe={cargaDe} onAbrirBloque={onAbrirBloque}
                    fila={i} recienMovido={bloqueRecienMovido} sentido={sentido}
                    cargaArrastrada={arrastre?.carga ?? null}
                  />
                ))}

                {/* Los libres escondidos se anuncian, no desaparecen: si no,
                    alguien buscaría un tanque que existe y no está en pantalla. */}
                {!plegado && ocultarLibres && grupo.libres > 0 && (
                  <button type="button" onClick={() => setOcultarLibres(false)}
                    className="sticky left-0 z-10 flex w-full items-center gap-1.5 border-b border-gray-100 bg-white px-3 py-1 text-left text-[10.5px] text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    style={{ width: ANCHO_TANQUE + anchoGrilla }}>
                    <Eye size={11} />
                    {grupo.libres} {grupo.libres === 1 ? 'tanque libre' : 'tanques libres'} — mostrar
                  </button>
                )}
              </div>
            )
          })}

          {/* Sin tanque asignado — no se esconden: si un lote quedó suelto hay
              que verlo, porque es trabajo que nadie agendó en ningún tanque. */}
          {sinAsignar.length > 0 && (
            <div>
              <div className="flex border-b border-t border-amber-200 bg-amber-50">
                <div style={{ width: ANCHO_TANQUE, flexShrink: 0 }}
                  className="sticky left-0 z-20 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Sin tanque asignado
                </div>
                <div style={{ width: anchoGrilla, flexShrink: 0 }} className="bg-amber-50" />
              </div>
              <FilaTanque
                tanque={{ nombre: '— sin asignar —', tipo: '', categoria: 'cerveza', capacidadLitros: 0, litrosActuales: 0 }}
                bloques={sinAsignar} dias={dias} anchoDia={anchoDia}
                altoFila={altoFila} tamEtiqueta={tamEtiqueta} inicioVentana={inicioVentana}
                hoy={hoy} colorPorProducto={colorPorProducto} solapes={solapes}
                destinoActivo={destinoActivo} propsOrigen={propsOrigen} cargaDe={cargaDe}
                onAbrirBloque={onAbrirBloque} fila={0} recienMovido={bloqueRecienMovido}
                sentido={sentido} cargaArrastrada={arrastre?.carga ?? null} sinCapacidad
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 bg-gray-50/60 px-4 py-1.5 text-[10.5px] text-gray-500 lg:px-6">
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-[#2F6B4F]" /> en el plan</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm border border-dashed border-[#2F6B4F] bg-[#2F6B4F]/40" /> sugerida</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-gray-300" /> finde</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#C9A227]" /> tanque con producto hoy</span>
        <span className="ml-auto">Arrastrá un bloque para cambiarle el día o el tanque.</span>
      </div>
    </div>
  )
}

/* ── Una fila = un tanque ─────────────────────────────────────────────── */

function FilaTanque({
  tanque, bloques, dias, anchoDia, altoFila, tamEtiqueta, inicioVentana, hoy, colorPorProducto,
  solapes, destinoActivo, propsOrigen, cargaDe, onAbrirBloque, sinCapacidad,
  fila, recienMovido, sentido, cargaArrastrada,
}: {
  tanque: FermentadorGantt
  bloques: BloqueGantt[]
  dias: { iso: string; finde: boolean; esHoy: boolean }[]
  anchoDia: number
  altoFila: number
  tamEtiqueta: number
  inicioVentana: string
  hoy: string
  colorPorProducto: Map<string, string>
  solapes: Set<string>
  destinoActivo: DestinoArrastre | null
  propsOrigen: (carga: CargaArrastre, habilitado?: boolean) => Record<string, unknown>
  cargaDe: (b: BloqueGantt) => CargaArrastre
  onAbrirBloque?: (b: BloqueGantt, rect?: DOMRect) => void
  sinCapacidad?: boolean
  /** Índice dentro del grupo, para escalonar la entrada. */
  fila: number
  recienMovido: string | null
  sentido: 'izq' | 'der' | null
  cargaArrastrada: CargaArrastre | null
}) {
  // La fila entera se resalta mientras el puntero arrastra sobre ella: con
  // 23 filas de 44px, acertarle al tanque correcto sin esa guía es difícil.
  const filaActiva = !sinCapacidad && destinoActivo?.fermentador === tanque.nombre

  return (
    <div
      style={{ ['--fila' as string]: fila }}
      className={`prod-gantt-fila flex border-b border-gray-100 last:border-b-0 ${
        filaActiva ? 'bg-[#2F6B4F]/[0.07]' : 'hover:bg-gray-50/40'
      }`}
    >
      {/* Nombre del tanque */}
      <div style={{ width: ANCHO_TANQUE, flexShrink: 0, height: altoFila }}
        className="sticky left-0 z-10 flex items-center gap-1.5 border-r border-gray-100 bg-white px-3"
        title={!sinCapacidad && tanque.litrosActuales > 0
          ? `${tanque.nombre} · ${tanque.capacidadLitros.toLocaleString('es-CL')} L · ${tanque.litrosActuales.toLocaleString('es-CL')} L ocupados hoy`
          : tanque.nombre}>
        {/* Punto lleno = el ERP dice que HOY tiene producto adentro. Es el
            dato que antes ocupaba una segunda línea de texto entera. */}
        {!sinCapacidad && (
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tanque.litrosActuales > 0 ? 'bg-[#C9A227]' : 'bg-gray-200'}`} />
        )}
        <span className="truncate font-bold text-gray-800" style={{ fontSize: tamEtiqueta + 1 }}>
          {tanque.nombre.replace(/^Fermentador /, 'F. ').replace(/^Lavoratorio /, 'Lab. ')}
        </span>
        {!sinCapacidad && (
          <span className="ml-auto shrink-0 tabular-nums text-gray-400" style={{ fontSize: tamEtiqueta - 1 }}>
            {fLitros(tanque.capacidadLitros)}
          </span>
        )}
      </div>

      {/* Pista de días + bloques encima */}
      <div
        key={inicioVentana}
        className={`relative ${sentido === 'der' ? 'prod-gantt-ventana-der' : sentido === 'izq' ? 'prod-gantt-ventana-izq' : ''}`}
        style={{ width: dias.length * anchoDia, flexShrink: 0, height: altoFila }}
      >
        <div className="absolute inset-0 flex">
          {dias.map(d => {
            const esDestino = destinoActivo?.fecha === d.iso &&
              (destinoActivo.fermentador === tanque.nombre)
            return (
              <div
                key={d.iso}
                data-dia-calendario={d.iso}
                data-fermentador={sinCapacidad ? undefined : tanque.nombre}
                style={{ width: anchoDia, flexShrink: 0 }}
                className={`border-l transition-colors duration-150 ${
                  esDestino ? 'prod-gantt-destino border-[#2F6B4F] bg-[#2F6B4F]/25'
                  : d.esHoy ? 'border-[#C9A227] bg-[#C9A227]/10'
                  : d.finde ? 'border-gray-200 bg-gray-200/70'
                  : 'border-gray-100'
                }`}
              />
            )
          })}
        </div>

        {bloques.map(b => {
          const desdeIdx = Math.max(0, diffDias(inicioVentana, b.inicioISO))
          const recorteIzq = Math.max(0, diffDias(b.inicioISO, inicioVentana))
          const visibles = Math.min(b.dias - recorteIzq, dias.length - desdeIdx)
          if (visibles <= 0) return null

          const color = colorPorProducto.get(b.producto) ?? '#8C8C8C'
          const sugerido = b.tipo === 'sugerido'
          const choca = solapes.has(b.id)
          const noCabe = !sinCapacidad && tanque.capacidadLitros > 0 && b.litros > tanque.capacidadLitros
          const ancho = visibles * anchoDia
          // Se compara por producto y no por id: la carga del arrastre no
          // lleva el id del bloque, y dos bloques del mismo producto en el
          // mismo tanque serían un choque que ya está marcado igual.
          const arrastrandoEste = cargaArrastrada?.producto === b.producto
            && (cargaArrastrada.tipo === 'coccion') === (b.tipo === 'confirmado')

          return (
            <button
              key={b.id}
              type="button"
              {...propsOrigen(cargaDe(b), b.inicioISO >= hoy || b.tipo === 'sugerido')}
              onClick={e => onAbrirBloque?.(b, e.currentTarget.getBoundingClientRect())}
              title={`${b.producto} · ${b.litros.toLocaleString('es-CL')} L · ${b.dias} días desde ${b.inicioISO}` +
                (noCabe ? `\n⚠ No cabe: el tanque es de ${tanque.capacidadLitros.toLocaleString('es-CL')} L` : '') +
                (choca ? '\n⚠ Se pisa con otra cocción en este mismo tanque' : '') +
                (b.motivo ? `\n${b.motivo}` : '')}
              style={{
                position: 'absolute',
                left: desdeIdx * anchoDia + 1,
                width: Math.max(ancho - 2, 8),
                top: 3,
                height: 'calc(100% - 6px)',
                // Los sugeridos van translúcidos para distinguirse de lo
                // confirmado, pero a 18% el texto no se leía. 38% sobre blanco
                // deja el color reconocible y el texto legible; el borde va al
                // color pleno para que el punteado se vea.
                background: sugerido ? `${color}61` : color,
                borderColor: choca || noCabe ? '#DC2626' : color,
                borderStyle: sugerido ? 'dashed' : 'solid',
                borderWidth: choca || noCabe ? 2 : 1,
                color: sugerido ? '#1f2937' : textoSobre(color),
                touchAction: 'none',
              }}
              className={[
                'prod-press prod-gantt-bloque flex items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-[10px] font-bold leading-none shadow-sm',
                // Un plan imposible late hasta que alguien lo arregle.
                (choca || noCabe) ? 'prod-gantt-alerta' : '',
                // Acaba de cambiar de día o de tanque: un latido y listo.
                recienMovido === b.id ? 'prod-gantt-aterriza' : '',
                // Mientras se arrastra, el bloque de origen se apaga: el que
                // manda es el ghost que sigue al puntero.
                arrastrandoEste ? 'prod-gantt-bloque-fantasma' : '',
              ].filter(Boolean).join(' ')}
            >
              {(choca || noCabe) && <AlertTriangle size={10} className="shrink-0 text-red-600" />}
              <span className="truncate">
                {b.producto}
                {ancho > 90 && ` · ${b.litros.toLocaleString('es-CL')} L`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
