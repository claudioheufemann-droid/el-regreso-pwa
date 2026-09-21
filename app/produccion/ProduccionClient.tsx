'use client'

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProductImage from '@/components/ui/ProductImage'
import {
  Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea,
  ResponsiveContainer, ComposedChart, Line, Area,
} from 'recharts'
import {
  TrendingUp, Package, CalendarDays, ShoppingCart,
  CircleDollarSign, Bell, Plus, AlertTriangle, Calendar as CalendarIcon,
  TrendingDown, Beaker, Home, ChevronDown, Filter, Info, Sigma,
  ArrowUp, ArrowDown, CheckCircle2, Trash2, X, Move,
} from 'lucide-react'
import PopoverCoccion from './PopoverCoccion'
import { useArrastreCalendario, type CargaArrastre, type DestinoArrastre } from './useArrastreCalendario'
import type { SerieForecast, CalidadItem, StockItem, AvanceMes, StockSeguridadItem, LotePlan, ConfigProductoProduccion, SugerenciaPlan, SplitFermentador, OcupacionPlanta, NecesidadInsumo, StockInsumoItem, RecetaInsumoLinea, LoteSinReceta, AjusteTanque } from './page'
import { COLORS } from './tema'
import MenuLateral, { navItems, type TabId } from './MenuLateral'
import GanttProduccion, { type BloqueGantt, type ConfigProducto } from './GanttProduccion'
import ConfigProductosGantt from './ConfigProductosGantt'
import ModalAgregarProducto from './ModalAgregarProducto'
import PopoverEditarTanque from './PopoverEditarTanque'
import NecesidadMensual from './NecesidadMensual'
import { ENVASE_LABEL, inicioDeCiclo, finDeCiclo, claveProductoEnvase, esDiaHabilISO, LEAD_TIME_INSUMOS_SEMANAS, esLineaFija, type EnvaseBucket } from '@/lib/produccion/reglas'

/** Etiqueta + color por categoría de insumo — mismas 4 del Excel de recetas
 *  (malta/lúpulo/levadura/otros), reutilizado en la tabla de Insumos y Compras. */
const CATEGORIA_INSUMO: Record<string, { label: string; badge: string }> = {
  malta: { label: 'Malta', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  lupulo: { label: 'Lúpulo', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  levadura: { label: 'Levadura', badge: 'border-purple-200 bg-purple-50 text-purple-700' },
  otros: { label: 'Otros', badge: 'border-gray-200 bg-gray-50 text-gray-600' },
}

/* ── Utilidades de formato ─────────────────────────────────────────────── */
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fNum = (n: number) => Math.round(n).toLocaleString('es-CL')

/** Cantidad de insumo en su unidad base (gr/ml) → texto legible, subiendo a
 *  kg/L cuando conviene (≥1000) — la base sigue siendo gr/ml para que el
 *  descuento de stock nunca mezcle unidades, esto es sólo de presentación. */
function fCantidadInsumo(cantidad: number, unidadBase: 'gr' | 'ml'): string {
  const unidadGrande = unidadBase === 'gr' ? 'kg' : 'L'
  if (Math.abs(cantidad) >= 1000) return `${(cantidad / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${unidadGrande}`
  return `${fNum(cantidad)} ${unidadBase}`
}

/** Orden fijo de formato — evita que un mismo producto se vea disperso al
 *  ordenar por otro criterio (Stock de Seguridad, calculadora de cobertura). */
const ORDEN_ENVASE: EnvaseBucket[] = ['barril_30', 'barril_50', 'lata', 'otros']

/** Valor sentinela del selector de Producto en la Calculadora de Cobertura
 *  para la opción agregada "Todos los productos" (compras necesita el total
 *  de latas a comprar de todo el catálogo, no producto por producto). */
const TODOS_PRODUCTOS = '__todos__'

/** Nombre de la unidad física de cada formato, para mostrar junto a los
 *  litros de disponible ("314 L · 888 latas"). */
const UNIDAD_ENVASE: Record<EnvaseBucket, string> = {
  barril_30: 'barriles', barril_50: 'barriles', lata: 'latas', otros: 'unidades',
}

/** Litros ↔ unidades, para mostrar el stock de seguridad tanto en litros
 *  como en cantidad de envases (no sólo en litros, que no dice nada sobre
 *  "cuántas latas/barriles tengo que tener siempre"). Barril es exacto (el
 *  bucket ES 30L o 50L por definición — ver bucketEnvase en reglas.ts). Lata
 *  mezcla 354ml y 473ml (decisión 4-sep-2026), así que no hay un tamaño fijo:
 *  se estima el tamaño promedio real a partir del propio inventario físico
 *  (disponibleLitros / disponibleUnidades) en vez de asumir uno solo — null
 *  si no hay stock físico contado todavía para derivar el promedio. */
function estimarUnidadesEnvase(
  envase: EnvaseBucket, litros: number, disponibleLitros: number | null, disponibleUnidades: number | null
): number | null {
  if (envase === 'barril_30') return Math.round(litros / 30)
  if (envase === 'barril_50') return Math.round(litros / 50)
  if (envase === 'lata' && disponibleLitros && disponibleUnidades) {
    const litrosPorLata = disponibleLitros / disponibleUnidades
    if (litrosPorLata > 0) return Math.round(litros / litrosPorLata)
  }
  return null
}

/** Color por formato — sólo para la barra apilada del Split de Envasado, donde
 *  hay que distinguir tres tramos de un mismo lote de un vistazo. */
const COLOR_ENVASE: Record<EnvaseBucket, string> = {
  barril_30: '#0F3D2E', barril_50: '#1A5441', lata: '#E5A922', otros: '#9CA3AF',
}

/**
 * Costo de insumos de UNA cocción: escala la receta al litraje real y la
 * valoriza al último precio de compra de cada insumo (mismo escalado lineal
 * que usa el MRP — decisión del usuario, 7-sep-2026).
 *
 * `sinPrecio` cuenta las líneas de receta que quedaron FUERA del total por no
 * tener precio cargado. Es obligatorio mostrarlo junto al costo: un total al
 * que le faltan insumos no se puede leer como el costo real del lote.
 */
function costoCoccion(producto: string, litros: number, recetaInsumos: RecetaInsumoLinea[]) {
  const lineas = recetaInsumos.filter(l => l.producto === producto)
  if (lineas.length === 0 || !(litros > 0)) {
    return { costo: null as number | null, sinPrecio: 0, lineasReceta: lineas.length }
  }
  let costo = 0
  let sinPrecio = 0
  for (const l of lineas) {
    if (l.precioUnitario == null) { sinPrecio++; continue }
    costo += l.cantidadPorLote * (litros / l.litrosBase) * l.precioUnitario
  }
  // Ninguna línea tenía precio: no hay costo que mostrar, ni siquiera $0.
  if (sinPrecio === lineas.length) return { costo: null as number | null, sinPrecio, lineasReceta: lineas.length }
  return { costo: Math.round(costo) as number | null, sinPrecio, lineasReceta: lineas.length }
}

/**
 * Qué fermentador conviene usar para una cocción de `litrosNecesarios`, de la
 * línea `categoria` (cerveza/kombucha — los tanques con código T son
 * exclusivos de cervecería y los K de kombuchería, decisión del usuario,
 * 14-sep-2026: ver la migración agregar_categoria_fermentadores).
 *
 * Sólo se ofrecen tanques VACÍOS: uno con fermentación en curso no se puede
 * compartir con una cocción nueva de otro lote, así que "tiene 200L libres
 * de 3.000L" no sirve para esto aunque sí sirva para el cálculo agregado de
 * % de ocupación de planta.
 *
 * Prioriza el tanque MÁS CHICO que alcance — no el más grande disponible —
 * para no ocupar un fermentador de 3.000L en una cocción de 300L y dejarlo
 * sin uso para la próxima cocción grande que sí lo necesite.
 */
function recomendarFermentador(
  categoria: 'cerveza' | 'kombucha',
  litrosNecesarios: number,
  tanques: OcupacionPlanta['tanques'],
): { tanque: OcupacionPlanta['tanques'][number] | null; ajustado: boolean } {
  const vacios = tanques.filter(t => t.categoria === categoria && t.litros === 0)
  if (vacios.length === 0) return { tanque: null, ajustado: false }

  const queAlcanzan = vacios.filter(t => t.capacidadLitros >= litrosNecesarios).sort((a, b) => a.capacidadLitros - b.capacidadLitros)
  if (queAlcanzan.length > 0) return { tanque: queAlcanzan[0], ajustado: false }

  // Ningún vacío alcanza solo: se ofrece igual el más grande disponible —
  // mejor que no sugerir nada — pero marcado como "ajustado" para que quede
  // claro que no cubre el volumen completo (hay que cocer menos, partir en
  // dos lotes, o esperar a que se libere uno más grande).
  const masGrande = [...vacios].sort((a, b) => b.capacidadLitros - a.capacidadLitros)[0]
  return { tanque: masGrande, ajustado: true }
}

/** Fecha de HOY en yyyy-mm-dd, en huso HORARIO LOCAL del navegador — nunca
 *  `toISOString()`, que da la fecha en UTC y en Chile (UTC-3/-4) ya marca
 *  "mañana" desde media tarde, haciendo aparecer como atrasado un lote
 *  planificado para hoy mismo. */
function hoyLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Suma (o resta, con `dias` negativo) días CORRIDOS a una fecha ISO — el
 *  mismo criterio de días del Gantt (ver GanttProduccion.tsx: la fermentación
 *  no para el fin de semana), a diferencia de sumarDiasHabilesISO de arriba,
 *  que es para plazos de compra. */
function sumarDiasCalISO(desdeISO: string, dias: number): string {
  return new Date(Date.parse(`${desdeISO}T00:00:00Z`) + Math.round(dias) * 86400000).toISOString().slice(0, 10)
}

/** Suma `diasHabiles` días hábiles a `desdeISO`, saltando fin de semana y
 *  feriados chilenos (esDiaHabilISO, en lib/produccion/reglas.ts — misma
 *  lógica de días hábiles que usa el servidor para las alarmas de quiebre) —
 *  para proyectar "hasta cuándo alcanza" en el popup de confirmación de una
 *  alarma. */
function sumarDiasHabilesISO(desdeISO: string, diasHabiles: number): string {
  let t = Date.parse(`${desdeISO}T00:00:00Z`)
  let restantes = Math.max(0, Math.round(diasHabiles))
  const MS_POR_DIA = 24 * 60 * 60 * 1000
  while (restantes > 0) {
    t += MS_POR_DIA
    if (esDiaHabilISO(new Date(t).toISOString().slice(0, 10))) restantes--
  }
  return new Date(t).toISOString().slice(0, 10)
}

/** Resta `diasHabiles` días hábiles a `desdeISO` — mismo criterio que
 *  restarDiasHabilesISO del servidor (app/produccion/page.tsx), usado acá
 *  para calcular el "último día para empezar a cocer" en Necesidades
 *  Anticipadas, que no viene precalculado desde el servidor porque la fecha
 *  de cobertura la fija el usuario en el filtro, no una alarma fija. */
function restarDiasHabilesISO(desdeISO: string, diasHabiles: number): string {
  let t = Date.parse(`${desdeISO}T00:00:00Z`)
  let restantes = Math.max(0, Math.round(diasHabiles))
  const MS_POR_DIA = 24 * 60 * 60 * 1000
  while (restantes > 0) {
    t -= MS_POR_DIA
    if (esDiaHabilISO(new Date(t).toISOString().slice(0, 10))) restantes--
  }
  return new Date(t).toISOString().slice(0, 10)
}

function diffDiasISO(desdeISO: string, hastaISO: string): number {
  return Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86400000)
}

/** Demanda proyectada (litros) de una serie entre `desdeISO` y `hastaISO` —
 *  suma el forecast mensual de Prophet ciclo por ciclo, prorateando por días
 *  calendario los ciclos que quedan cortados a la mitad. El ciclo EN CURSO no
 *  tiene forecast propio (el modelo lo excluye por estar incompleto), así que
 *  su tramo usa el ritmo de venta real de este ciclo. Mismo criterio en toda
 *  la app — Forecasting (calculadora de cobertura) y Stock de Seguridad
 *  (necesidad de producción anticipada) comparten esta única función para no
 *  arriesgarse a que las dos vistas den números distintos para la misma
 *  pregunta. */
/** Demanda proyectada con su banda de confianza: media (yhat), mínimo y máximo
 *  (yhat_lower/yhat_upper de Prophet), prorateados ciclo a ciclo igual que
 *  `demandaProyectadaEnPeriodo`. El tramo del ciclo EN CURSO no tiene banda —
 *  sale del ritmo de venta real, no de un modelo con incertidumbre — así que
 *  ahí min=max=media; no se inventa un rango donde no hay uno. */
interface DemandaConRango { media: number; min: number; max: number }

function demandaProyectadaConRangoEnPeriodo(serie: SerieForecast, avanceMes: AvanceMes, desdeISO: string, hastaISO: string): DemandaConRango {
  const ritmoDiarioSerie = avanceMes.diasHabilesTranscurridos > 0 ? serie.litrosMesEnCurso / avanceMes.diasHabilesTranscurridos : 0
  const litrosCicloActualProyectado = ritmoDiarioSerie * avanceMes.diasHabilesEnCiclo

  const ciclos: { mes: string; media: number; min: number; max: number }[] = [
    { mes: avanceMes.mes, media: litrosCicloActualProyectado, min: litrosCicloActualProyectado, max: litrosCicloActualProyectado },
    ...serie.puntos.filter(p => p.tipo === 'forecast').map(p => ({
      mes: p.mes,
      media: p.litros,
      min: p.litrosMin ?? p.litros,
      max: p.litrosMax ?? p.litros,
    })),
  ]

  let media = 0, min = 0, max = 0
  for (const c of ciclos) {
    const ini = inicioDeCiclo(c.mes)
    const fin = finDeCiclo(c.mes)
    const solapIni = ini > desdeISO ? ini : desdeISO
    const solapFin = fin < hastaISO ? fin : hastaISO
    if (solapIni > solapFin) continue
    const totalDiasCiclo = diffDiasISO(ini, fin) + 1
    const diasSolapados = diffDiasISO(solapIni, solapFin) + 1
    const frac = diasSolapados / totalDiasCiclo
    media += c.media * frac
    min += c.min * frac
    max += c.max * frac
  }
  return { media, min, max }
}

/** Sólo la media — la mayoría de los call sites (Necesidad de Producción
 *  Anticipada, alarmas, etc.) no necesitan la banda, así que se mantiene esta
 *  función corta en vez de obligarlos a desestructurar `.media` en cada uno.
 *  Implementada arriba de `demandaProyectadaConRangoEnPeriodo` para no
 *  duplicar el prorrateo por ciclo en dos lugares. */
function demandaProyectadaEnPeriodo(serie: SerieForecast, avanceMes: AvanceMes, desdeISO: string, hastaISO: string): number {
  return demandaProyectadaConRangoEnPeriodo(serie, avanceMes, desdeISO, hastaISO).media
}

/** ¿Algún ciclo de forecast dentro de [desdeISO, hastaISO] trae un empuje
 *  ESTACIONAL fuerte? — la señal de "se viene temporada alta" para este
 *  producto/formato. Reutiliza la propia descomposición de Prophet
 *  (tendencia + estacionalidad) que ya se grafica en Forecasting, en vez de
 *  inventar un umbral nuevo comparando promedios: si el modelo ya identificó
 *  que ese mes rinde bastante más que su tendencia de fondo, ese es el aviso
 *  a anticipar producción. Umbral: el empuje estacional pesa 15% o más del
 *  total proyectado de ese ciclo. */
function vieneAltaDemanda(serie: SerieForecast, desdeISO: string, hastaISO: string): boolean {
  return serie.puntos.some(p => {
    if (p.tipo !== 'forecast' || p.estacionalidad == null || p.litros <= 0) return false
    const ini = inicioDeCiclo(p.mes)
    const fin = finDeCiclo(p.mes)
    if (fin < desdeISO || ini > hastaISO) return false
    return p.estacionalidad > 0 && p.estacionalidad / p.litros >= 0.15
  })
}

function etiquetaMes(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  return `${MESES_CORTOS[m - 1]} '${String(y).slice(2)}`
}
function indiceMes(iso: string) {
  return Number(iso.split('-')[1]) - 1
}
/** "23 jul" a partir de yyyy-mm-dd — para mostrar el rango real de un ciclo
 *  interno (24→23) en el tooltip, y así no confundir el AÑO de la etiqueta
 *  del mes ("Ago '26") con un día del mes. */
function fCicloCorto(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1].toLowerCase()}`
}
/** "Camara General Barrios Bajos (Frío)" → "Camara General Barrios Bajos" —
 *  el ERP le agrega el tipo de depósito entre paréntesis a toda cámara, no
 *  aporta nada distinguir eso en la tabla de inventario. */
function nombreCamaraCorto(camara: string) {
  return camara.replace(/\s*\([^)]*\)\s*$/, '').trim()
}
function fMinutosDesde(min: number) {
  if (min < 1) return 'recién ahora'
  if (min < 60) return `hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} d`
}

/** Las seis preguntas que el módulo responde, en el orden en que se hacen
 *  de verdad en la planta: primero cuánto se va a vender, después cuánto hay
 *  que cocer, después cuándo, y al final qué comprar para poder hacerlo.
 *
 *  El `sub` no es decoración: es el criterio con el que se decidió qué va en
 *  cada pantalla. Antes "Stock de Seguridad" acumulaba siete secciones —el
 *  colchón, el calendario, la capacidad de planta y el presupuesto— bajo un
 *  nombre que describía sólo la primera, y había tres lugares distintos con
 *  números de compra. Si una sección no contesta la pregunta del `sub`, está
 *  en la pantalla equivocada. */
/** Encabezado de cada vista: la pregunta que contesta, en una línea. Es lo
 *  que evita que el módulo vuelva a convertirse en un montón de tarjetas sin
 *  jerarquía — cada pantalla declara para qué está. */
function PreguntaDeLaVista({ pregunta, detalle }: { pregunta: string; detalle: string }) {
  return (
    // Barra verde a la izquierda en vez de una tarjeta blanca más entre
    // tarjetas blancas: el encabezado tiene que leerse como el título de la
    // pantalla, no como el primer dato. Con todo del mismo color, la pregunta
    // que da sentido a la vista se perdía entre los paneles de abajo.
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 pl-5 shadow-sm sm:p-5 sm:pl-6">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: COLORS.darkGreen }} />
      <h2 className="text-base font-bold tracking-tight text-gray-900 sm:text-[19px]">{pregunta}</h2>
      <p className="mt-1 max-w-4xl text-sm leading-relaxed text-gray-500">{detalle}</p>
    </div>
  )
}

/** Alta manual de un lote al Plan Maestro. Estado propio (no vive en el
 *  padre) porque es puramente del formulario — se descarta al cerrar. */
function FormNuevoLote({
  guardando, onCancelar, onGuardar,
}: {
  guardando: boolean
  onCancelar: () => void
  onGuardar: (datos: { producto: string; categoria: 'cerveza' | 'kombucha'; litrosPlanificados: number; fechaPlanificada: string; origen: 'manual' }) => void
}) {
  const [producto, setProducto] = useState('')
  const [categoria, setCategoria] = useState<'cerveza' | 'kombucha'>('cerveza')
  const [litros, setLitros] = useState('')
  const [fecha, setFecha] = useState(() => hoyLocalISO())

  const litrosNum = Number(litros)
  const valido = producto.trim().length > 0 && litrosNum > 0 && fecha.length > 0

  function submit() {
    if (!valido) return
    onGuardar({ producto: producto.trim(), categoria, litrosPlanificados: litrosNum, fechaPlanificada: fecha, origen: 'manual' })
    setProducto(''); setLitros('')
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50/70 p-5">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Producto</label>
        <input
          value={producto} onChange={e => setProducto(e.target.value)}
          placeholder="Ej: Doble IPA"
          className="w-48 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F3D2E] focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Categoría</label>
        <select
          value={categoria} onChange={e => setCategoria(e.target.value as 'cerveza' | 'kombucha')}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F3D2E] focus:outline-none"
        >
          <option value="cerveza">Cerveza</option>
          <option value="kombucha">Kombucha</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Litros</label>
        <input
          type="number" min={1} value={litros} onChange={e => setLitros(e.target.value)}
          placeholder="1000"
          className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F3D2E] focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500">Fecha planificada</label>
        <input
          type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F3D2E] focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={!valido || guardando}
          onClick={submit}
          className="rounded-lg bg-[#0F3D2E] px-4 py-2 text-sm font-bold text-white hover:bg-[#1A5441] disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Agregar a la cola'}
        </button>
        <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100">
          Cancelar
        </button>
      </div>
    </div>
  )
}

/**
 * Popup que se abre al confirmar una alarma de quiebre ("Agregar al plan").
 *
 * Por PRODUCTO, no por formato: así se cuece en la realidad — se manda un
 * lote con el litraje TOTAL, y recién cuando el fermentador está listo se
 * decide cuánto va a lata y cuánto a barril (eso lo resuelve el Split de
 * Envasado más abajo, no esta pantalla). Antes cada formato en alerta tenía
 * su propio botón "Agregar al plan", así que cubrir Imperial Stout en sus 3
 * formatos generaba 3 lotes separados — 3 cocciones donde en la práctica es
 * una sola (decisión del usuario, 11-sep-2026).
 *
 * No agrega con el total sugerido a ciegas: deja fijar fecha de inicio y
 * cantidad, y muestra en vivo cuánta necesidad cubre y hasta cuándo alcanza
 * cada formato — todo derivado del ritmo de venta real (mismo cálculo que
 * la alarma), para decidir la orden con criterio.
 */
function ModalConfirmarLoteGrupo({
  grupo, guardando, recetaInsumos, onCancelar, onConfirmar,
}: {
  grupo: { producto: string; categoria: 'cerveza' | 'kombucha'; items: SugerenciaPlan[] }
  guardando: boolean
  recetaInsumos: RecetaInsumoLinea[]
  onCancelar: () => void
  onConfirmar: (datos: { litrosPlanificados: number; fechaPlanificada: string; necesidadCubrir: number; cubreHasta: string | null; motivo: string }) => void
}) {
  const totalSugerido = grupo.items.reduce((s, i) => s + i.litrosSugeridos, 0)
  // Propone el ÚLTIMO día para empezar a cocer del formato más apremiante del
  // grupo (quiebre − lead time), no una fecha arbitraria: antes era hoy+7 fijo
  // aunque el producto quebrara en 5 días o en 40. Si esa fecha ya pasó se
  // propone hoy, que es lo más temprano que se puede hacer algo.
  const [fecha, setFecha] = useState(() => {
    const hoy = hoyLocalISO()
    const limites = grupo.items.map(i => i.fechaLimiteInicio).filter((f): f is string => f != null)
    if (limites.length === 0) return hoy
    const masApremiante = limites.sort()[0]
    return masApremiante < hoy ? hoy : masApremiante
  })
  const hayAtrasado = grupo.items.some(i => i.atrasado)
  const [litros, setLitros] = useState(String(Math.round(totalSugerido)))

  const litrosNum = Number(litros)
  const valido = litrosNum > 0 && fecha.length > 0

  // Ritmo agregado de TODOS los formatos en alerta — para estimar hasta
  // cuándo alcanza el total combinado, no un formato aislado.
  const ritmoTotal = grupo.items.reduce((s, i) => s + i.ritmoDiarioActual, 0)
  const diasCobertura = ritmoTotal > 0 ? litrosNum / ritmoTotal : null
  const cubreHasta = diasCobertura != null ? sumarDiasHabilesISO(fecha, diasCobertura) : null

  // Cuánto sale cocinar esto: la receta escalada al litraje que se está por
  // confirmar, valorizada al último precio de compra de cada insumo.
  const costo = costoCoccion(grupo.producto, litrosNum, recetaInsumos)

  function submit() {
    if (!valido) return
    const motivo = grupo.items.length === 1
      ? grupo.items[0].motivo
      : `Cubre la necesidad combinada de ${grupo.items.length} formatos (${grupo.items.map(i => ENVASE_LABEL[i.envase] ?? i.envase).join(', ')}). El reparto por formato se decide en el Split de Envasado cuando el lote esté listo.`
    onConfirmar({ litrosPlanificados: litrosNum, fechaPlanificada: fecha, necesidadCubrir: totalSugerido, cubreHasta, motivo })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <ProductImage nombre={grupo.producto} categoria={grupo.categoria} size={36} radius={9} />
          <div>
            <h3 className="font-bold text-gray-800">{grupo.producto}</h3>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
              {grupo.items.length} {grupo.items.length === 1 ? 'formato en alerta' : 'formatos en alerta'}
            </p>
          </div>
          <button onClick={onCancelar} className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Desglose por formato — qué compone el total sugerido, aunque el
            lote que se va a crear es uno solo por el litraje combinado. */}
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Necesidad por formato:</p>
          <div className="mt-1.5 flex flex-col gap-1">
            {grupo.items.map((i, idx) => (
              <div key={`${i.envase}-${idx}`} className="flex items-center justify-between text-xs">
                <span>{ENVASE_LABEL[i.envase] ?? i.envase} — disponible {fNum(i.disponibleLitros)} L</span>
                <span className="font-bold">{fNum(i.litrosSugeridos)} L</span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-t border-amber-200 pt-2">
            <strong>Total sugerido: {fNum(totalSugerido)} L</strong>, sumando todos los formatos en alerta.
          </p>
        </div>

        {hayAtrasado && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <p>
              <strong>Este lote ya va atrasado.</strong> Con el lead time de este producto, ni empezando
              hoy alcanza a estar listo antes del quiebre — igual conviene largarlo cuanto antes para
              acortar el tiempo sin stock.
            </p>
          </div>
        )}

        <div className="mb-4 flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Fecha de inicio de elaboración</label>
            <input
              type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F3D2E] focus:outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">Cantidad total a producir (L)</label>
            <input
              type="number" min={1} value={litros} onChange={e => setLitros(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F3D2E] focus:outline-none"
            />
          </div>
        </div>

        {/* Costo de la cocción — responde "¿cuánto me sale cocinar esto?" en
            vivo mientras se ajusta el litraje. */}
        {costo.lineasReceta > 0 && (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Costo de insumos de esta cocción</p>
              {costo.sinPrecio > 0 && (
                <p className="mt-0.5 text-xs text-blue-600">
                  Parcial: {costo.sinPrecio} de {costo.lineasReceta} insumos de la receta sin precio cargado.
                </p>
              )}
            </div>
            {costo.costo != null ? (
              <div className="text-right">
                <p className="text-xl font-black tabular-nums text-blue-900">${fNum(costo.costo)}</p>
                {litrosNum > 0 && (
                  <p className="text-xs text-blue-600">${fNum(Math.round(costo.costo / litrosNum))} por litro</p>
                )}
              </div>
            ) : (
              <p className="text-sm font-semibold text-blue-700">Sin precios cargados</p>
            )}
          </div>
        )}

        {/* Cobertura — responde "hasta cuándo nos durará esto", en vivo según
            lo que el usuario haya puesto en Cantidad y Fecha de inicio. */}
        <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          {ritmoTotal > 0 && diasCobertura != null && cubreHasta ? (
            <p className="text-gray-700">
              Con {fNum(litrosNum)} L, la cobertura combinada dura <strong>~{Math.round(diasCobertura)} días hábiles</strong> al
              ritmo actual — alcanzaría hasta el <strong>{new Date(cubreHasta + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong>.
              El reparto exacto entre formatos se define después, en el Split de Envasado.
            </p>
          ) : (
            <p className="text-gray-500">Sin ventas en las últimas 4 semanas — no se puede estimar hasta cuándo alcanza.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100">
            Cancelar
          </button>
          <button
            disabled={!valido || guardando}
            onClick={submit}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-40"
          >
            {guardando ? 'Agregando…' : 'Confirmar y agregar al plan'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ── Chip de desviación del modelo (MAPE del backtest) ──────────────────
   OJO, esto NO es una "confiabilidad" en el sentido de 0-100% siendo mejor
   arriba — es el error porcentual absoluto medio: mientras MÁS ALTO, PEOR el
   modelo. Se llamó "Confiabilidad" hasta que un usuario vio un "450%" y con
   razón le pareció absurdo ("¿cómo la confiabilidad supera el 100%?") — con
   el nombre correcto, un desvío de 450% es una afirmación coherente (aunque
   mala), no un número roto. Pasa fácil de 100% en series de bajo volumen
   (ej. 30L vendidos en el mes): ahí un error chico en litros absolutos ya es
   un porcentaje enorme. */
function ChipDesviacion({ mape, derivado = false }: { mape: number | null; derivado?: boolean }) {
  if (mape == null) return <span className="text-xs text-gray-300">—</span>
  const color = mape < 15 ? 'emerald' : mape < 30 ? 'amber' : 'red'
  const clases = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }[color]
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${clases}`}
      title={
        derivado
          ? 'Desvío del PRODUCTO (no de este formato puntual): esta fila se derivó del forecast del producto, y escalar una serie por una proporción constante no cambia su error porcentual, así que se reutiliza el mismo MAPE.'
          : 'Desvío del modelo (MAPE): error porcentual promedio comparando la proyección contra la venta real de los últimos 3 meses. Más alto es peor. En series de bajo volumen puede superar el 100% — un error chico en litros ya es un % grande.'
      }
    >
      {mape.toFixed(0)}%
    </span>
  )
}

export default function ProduccionClient({
  series, calidad, planProduccion, configProductos, sugerenciasPlan, splitFermentadores, ajustesTanque: ajustesTanqueIniciales, ocupacionPlanta, necesidadInsumos, stockInsumos, recetaInsumos, lotesSinReceta, stock, stockSeguridad, ultimaCorrida, minutosDesdeSyncStock, avanceMes, nombreUsuario, inicialesUsuario,
}: {
  series: SerieForecast[]
  calidad: CalidadItem[]
  /** Cola real del Plan Maestro (tabla plan_produccion), ya ordenada por prioridad. */
  planProduccion: LotePlan[]
  /** Días en tanque, litraje habitual y color de cada producto en el Gantt. */
  configProductos: ConfigProductoProduccion[]
  /** Sugerencias calculadas en vivo comparando disponible vs. punto de reorden — no persistidas hasta que el usuario las confirma. */
  sugerenciasPlan: SugerenciaPlan[]
  /** Cómo repartir entre formatos lo que está hoy en los fermentadores. */
  splitFermentadores: SplitFermentador[]
  ajustesTanque: AjusteTanque[]
  /** Litros y tanques ocupados en la sala de fermentación. */
  ocupacionPlanta: OcupacionPlanta
  /** Insumos que hacen falta para cubrir la cola activa del Plan Maestro, escalando cada receta al litraje real de cada lote. */
  necesidadInsumos: NecesidadInsumo[]
  stockInsumos: StockInsumoItem[]
  recetaInsumos: RecetaInsumoLinea[]
  /** Lotes del plan cuyo producto no tiene receta cargada — su necesidad de insumos no se pudo calcular. */
  lotesSinReceta: LoteSinReceta[]
  stock: StockItem[]
  stockSeguridad: StockSeguridadItem[]
  ultimaCorrida: string | null
  /** Minutos desde la última sincronización de stock del ERP (erp_sync_log),
   *  calculados server-side. Distinto de `ultimaCorrida` (cuándo corrió el
   *  forecast mensual) — el "disponible" de Stock de Seguridad se recalcula
   *  en CADA carga de página contra el stock actual, esto es lo que prueba
   *  que es así en vez de dejarlo como una afirmación sin respaldo visual. */
  minutosDesdeSyncStock: number | null
  avanceMes: AvanceMes
  nombreUsuario: string
  inicialesUsuario: string
}) {
  const [activeTab, setActiveTab] = useState<TabId>('resumen')

  /* ── Menú lateral: ancho según el espacio real ────────────────────────
     En notebooks (1280-1440 px) los 256 px del menú son ~20% del ancho, y
     estas pantallas son tableros anchos: el Gantt llega a 3.000 px. Por eso
     en 'auto' el menú va como riel de iconos y sólo se abre en monitores
     grandes (2xl, 1536 px+).

     El modo 'auto' se resuelve POR CSS, no leyendo window.innerWidth: hacerlo
     en JS obliga a decidir el ancho después del primer render, lo que da
     parpadeo al cargar y desajuste de hidratación. Con clases responsive el
     servidor y el cliente pintan lo mismo.

     Una vez que el usuario lo toca, manda su elección y se recuerda: nada
     peor que un menú que se vuelve a cerrar solo cada vez que se abre. */
  const router = useRouter()
  // Estado local del Plan Maestro, sincronizado con la prop del servidor pero
  // actualizado optimistamente en cada acción (reordenar, agregar, cambiar
  // estado) para que la UI responda al toque — router.refresh() por detrás
  // trae el estado real del servidor y lo reconcilia.
  const [plan, setPlan] = useState<LotePlan[]>(planProduccion)
  const [guardandoPlan, setGuardandoPlan] = useState(false)
  const [errorPlan, setErrorPlan] = useState<string | null>(null)
  const [mostrarFormLote, setMostrarFormLote] = useState(false)
  /** Alarma sobre la que se abrió el popup de confirmación — null = cerrado. */
  const [sugerenciaModal, setSugerenciaModal] = useState<{ producto: string; categoria: 'cerveza' | 'kombucha'; items: SugerenciaPlan[] } | null>(null)
  React.useEffect(() => { setPlan(planProduccion) }, [planProduccion])

  async function moverLote(id: string, direccion: -1 | 1) {
    const idx = plan.findIndex(l => l.id === id)
    const destino = idx + direccion
    if (idx < 0 || destino < 0 || destino >= plan.length) return
    const nuevo = [...plan]
    ;[nuevo[idx], nuevo[destino]] = [nuevo[destino], nuevo[idx]]
    setPlan(nuevo)
    setErrorPlan(null)
    try {
      const r = await fetch('/api/produccion/plan/reordenar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: nuevo.map(l => l.id) }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo reordenar')
      router.refresh()
    } catch (e) {
      setPlan(plan) // revierte el optimista
      setErrorPlan(e instanceof Error ? e.message : 'Error al reordenar')
    }
  }

  async function cambiarEstadoLote(id: string, estado: LotePlan['estado']) {
    const previo = plan
    setPlan(estado === 'cancelado' || estado === 'completado' ? plan.filter(l => l.id !== id) : plan.map(l => l.id === id ? { ...l, estado } : l))
    setErrorPlan(null)
    try {
      const r = await fetch(`/api/produccion/plan/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo actualizar')
      router.refresh()
    } catch (e) {
      setPlan(previo)
      setErrorPlan(e instanceof Error ? e.message : 'Error al actualizar el estado')
    }
  }

  /** Guarda (o reemplaza) la corrección de fecha de un lote 'en_tanque'. El
   *  estado local se actualiza antes de esperar la respuesta —igual que
   *  mover un bloque en el Gantt— porque el usuario ya está mirando el
   *  bloque y esperar el roundtrip para verlo moverse se siente lento. */
  async function guardarAjusteTanque(fechas: { fechaInicioManual: string; fechaEmbarriladoManual: string | null }) {
    if (!editarTanqueAbierto) return
    const { tanque, codigoLote } = editarTanqueAbierto
    setGuardandoAjusteTanque(true)
    setErrorAjusteTanque(null)
    try {
      const r = await fetch('/api/produccion/ajuste-tanque', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tanque, codigoLote, ...fechas }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo guardar la corrección')
      setAjustesTanque(prev => [
        ...prev.filter(a => !(a.tanque === tanque && a.codigoLote === codigoLote)),
        { tanque, codigoLote, fechaInicioManual: fechas.fechaInicioManual, fechaEmbarriladoManual: fechas.fechaEmbarriladoManual },
      ])
      setEditarTanqueAbierto(null)
    } catch (e) {
      setErrorAjusteTanque(e instanceof Error ? e.message : 'Error al guardar la corrección')
    } finally {
      setGuardandoAjusteTanque(false)
    }
  }

  /** Vuelve a la fecha que calcula la app (ERP + duración del producto) —
   *  borra el ajuste en vez de guardarlo vacío, para no confundir "nunca se
   *  corrigió" con "se corrigió a nada". */
  async function restablecerAjusteTanque() {
    if (!editarTanqueAbierto) return
    const { tanque, codigoLote } = editarTanqueAbierto
    setGuardandoAjusteTanque(true)
    setErrorAjusteTanque(null)
    try {
      const r = await fetch(`/api/produccion/ajuste-tanque?tanque=${encodeURIComponent(tanque)}&codigoLote=${encodeURIComponent(codigoLote)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo restablecer')
      setAjustesTanque(prev => prev.filter(a => !(a.tanque === tanque && a.codigoLote === codigoLote)))
      setEditarTanqueAbierto(null)
    } catch (e) {
      setErrorAjusteTanque(e instanceof Error ? e.message : 'Error al restablecer')
    } finally {
      setGuardandoAjusteTanque(false)
    }
  }

  async function agregarLote(datos: {
    producto: string; categoria: 'cerveza' | 'kombucha'; litrosPlanificados: number; fechaPlanificada: string
    motivo?: string | null; origen?: 'sugerido' | 'manual'
    /** Tanque donde se suelta en el Gantt. Null = queda sin asignar. */
    fermentador?: string | null
    /** Sólo para el detalle del evento de Google Calendar. */
    necesidadCubrir?: number | null; cubreHasta?: string | null
  }) {
    setGuardandoPlan(true)
    setErrorPlan(null)
    try {
      const r = await fetch('/api/produccion/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo agregar el lote')
      const nuevo = await r.json()
      setPlan(p => [...p, {
        id: nuevo.id, producto: nuevo.producto, categoria: nuevo.categoria,
        litrosPlanificados: Number(nuevo.litros_planificados), fechaPlanificada: String(nuevo.fecha_planificada).slice(0, 10),
        prioridad: Number(nuevo.prioridad), estado: nuevo.estado, origen: nuevo.origen,
        motivo: nuevo.motivo, observaciones: nuevo.observaciones,
        fermentador: (nuevo.fermentador as string | null) ?? datos.fermentador ?? null,
        diasOcupacion: nuevo.dias_ocupacion == null ? null : Number(nuevo.dias_ocupacion),
      }])
      setMostrarFormLote(false)
      setSugerenciaModal(null)
      setAgregarProductoAbierto(false)
      router.refresh()
    } catch (e) {
      setErrorPlan(e instanceof Error ? e.message : 'Error al agregar el lote')
    } finally {
      setGuardandoPlan(false)
    }
  }

  /** Agrupa las alarmas de quiebre por producto — con 46+ combinaciones
   *  producto×envase, una grilla plana de tarjetas era imposible de barrer
   *  con la vista. Se agrupa (una foto por producto, formatos en lista
   *  debajo) conservando el orden de urgencia que ya trae `sugerenciasPlan`
   *  del servidor: el primer producto en aparecer es el que tiene el
   *  formato más próximo a quebrar. */
  const alarmasPorProducto = useMemo(() => {
    const grupos = new Map<string, { producto: string; categoria: 'cerveza' | 'kombucha'; items: SugerenciaPlan[] }>()
    for (const s of sugerenciasPlan) {
      if (!grupos.has(s.producto)) grupos.set(s.producto, { producto: s.producto, categoria: s.categoria, items: [] })
      grupos.get(s.producto)!.items.push(s)
    }
    return [...grupos.values()]
  }, [sugerenciasPlan])

  const [busquedaInsumo, setBusquedaInsumo] = useState('')
  const [panelInsumosAbierto, setPanelInsumosAbierto] = useState<'stock' | 'mrp' | 'necesidad'>('stock')
  /** Horizonte del MRP en días. 30/60/90 para poder presupuestar a 1, 2 o 3
   *  meses — el forecast alcanza hasta abril 2027, así que los tres tienen
   *  dato real detrás (antes estaba fijo en 30 y no se podía presupuestar
   *  más allá del mes). */
  const [mrpHorizonteDias, setMrpHorizonteDias] = useState<30 | 60 | 90>(30)
  /** Capacidad de Planta arranca colapsada: son 23 tarjetas de tanque, mucho
   *  espacio vertical para algo que no hace falta ver en cada carga de la
   *  pantalla — igual que el acordeón de Insumos y Compras. */
  const [capacidadPlantaAbierta, setCapacidadPlantaAbierta] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState<'todas' | 'cerveza' | 'kombucha'>('todas')
  const [filtroEnvase, setFiltroEnvase] = useState<string>('todos')
  /** Muestra la descomposición del modelo (tendencia + estacionalidad). */
  const [verModelo, setVerModelo] = useState(false)
  // Meses reales proyectados (yyyy-mm-01), no meses calendario 1-12: el
  // cálculo ahora sale del forecast, así que cada fila corresponde a un mes
  // concreto del horizonte y no tiene sentido ofrecer "Ene" si el forecast
  // no llega hasta enero.
  const mesesSeguridad = useMemo(
    () => [...new Set(stockSeguridad.map(s => s.mes))].sort(),
    [stockSeguridad]
  )
  const [mesSeguridad, setMesSeguridad] = useState<string>('')
  const [filtroCategoriaSeg, setFiltroCategoriaSeg] = useState<'todas' | 'cerveza' | 'kombucha'>('todas')
  const [filtroEnvaseSeg, setFiltroEnvaseSeg] = useState<string>('todos')
  const mesSeguridadActivo = mesSeguridad && mesesSeguridad.includes(mesSeguridad)
    ? mesSeguridad
    : mesesSeguridad[0] ?? ''

  const serieGeneral = series.find(s => s.nivel === 'general') ?? null

  const productosDisponibles = useMemo(
    () => [...new Set(series.filter(s => s.nivel === 'producto' && s.producto).map(s => s.producto!))].sort((a, b) => a.localeCompare(b)),
    [series]
  )
  /** Categoría de cada producto — para que las pastillas "Cerveza"/"Kombucha"
   *  sepan qué productos mostrar, tanto en Forecasting como en la
   *  Calculadora de Cobertura. Sale de la propia serie nivel='producto', que
   *  ya trae la categoría resuelta (costos_precios.categoria). */
  const categoriaPorProducto = useMemo(() => {
    const m = new Map<string, 'cerveza' | 'kombucha'>()
    for (const s of series) {
      if (s.nivel === 'producto' && s.producto && (s.categoria === 'cerveza' || s.categoria === 'kombucha')) {
        m.set(s.producto, s.categoria)
      }
    }
    return m
  }, [series])

  /* ── Selector de Forecasting, por pastillas conectadas ───────────────────
     Reemplaza el <select> único (difícil de buscar con ~90 combinaciones) por
     tres filas de pastillas que se acotan entre sí: Categoría (filtra qué
     productos/envases se ofrecen más abajo, no selecciona una serie por sí
     sola — no existe un forecast agregado "toda la kombucha"), Envase
     (Formato) y Producto. Decisión del usuario, 17-sep-2026.

     Resolución de qué serie mostrar, de más a menos específica:
       1) Producto + Envase → producto_envase (si esa combinación existe).
       2) Producto solo → producto (todos los formatos juntos).
       3) Envase solo (sin producto), con categoría en "Todas" → envase
          (agregado de ese formato en todo el catálogo — sí existe esa serie).
       4) Nada de lo anterior → general (consolidado). Cubre también el caso
          "sólo elegí una categoría": esa pastilla filtra la lista de abajo,
          pero como no hay serie agregada por categoría, el gráfico se queda
          en el consolidado hasta que además se elige un producto o envase. */
  const [filtroCategoriaForecast, setFiltroCategoriaForecast] = useState<'todas' | 'cerveza' | 'kombucha'>('todas')
  const [filtroEnvaseForecast, setFiltroEnvaseForecast] = useState<'todos' | EnvaseBucket>('todos')
  const [filtroProductoForecast, setFiltroProductoForecast] = useState<string | null>(null)

  const productosForecastDisponibles = useMemo(
    () => productosDisponibles.filter(p => {
      if (filtroCategoriaForecast !== 'todas' && categoriaPorProducto.get(p) !== filtroCategoriaForecast) return false
      if (filtroEnvaseForecast !== 'todos' && !series.some(s => s.nivel === 'producto_envase' && s.producto === p && s.envaseBucket === filtroEnvaseForecast)) return false
      return true
    }),
    [productosDisponibles, categoriaPorProducto, filtroCategoriaForecast, filtroEnvaseForecast, series]
  )
  const envasesForecastDisponibles = useMemo(
    () => ORDEN_ENVASE.filter(b => series.some(s =>
      s.nivel === 'producto_envase' && s.envaseBucket === b &&
      (!filtroProductoForecast || s.producto === filtroProductoForecast) &&
      (filtroCategoriaForecast === 'todas' || s.categoria === filtroCategoriaForecast)
    )),
    [series, filtroProductoForecast, filtroCategoriaForecast]
  )

  const serieActual = useMemo(() => {
    if (filtroProductoForecast && filtroEnvaseForecast !== 'todos') {
      const s = series.find(s => s.nivel === 'producto_envase' && s.producto === filtroProductoForecast && s.envaseBucket === filtroEnvaseForecast)
      if (s) return s
    }
    if (filtroProductoForecast) {
      const s = series.find(s => s.nivel === 'producto' && s.producto === filtroProductoForecast)
      if (s) return s
    }
    if (filtroEnvaseForecast !== 'todos' && filtroCategoriaForecast === 'todas') {
      const s = series.find(s => s.nivel === 'envase' && s.envaseBucket === filtroEnvaseForecast)
      if (s) return s
    }
    return serieGeneral
  }, [series, filtroProductoForecast, filtroEnvaseForecast, filtroCategoriaForecast, serieGeneral])

  // Elegir una categoría no filtra por sí sola una serie (no existe un
  // agregado "toda la kombucha") — si el producto elegido queda fuera de la
  // categoría nueva, se limpia para no dejar seleccionado algo que ya no
  // aparece en la lista de pastillas de abajo.
  const cambiarCategoriaForecast = useCallback((cat: 'todas' | 'cerveza' | 'kombucha') => {
    setFiltroCategoriaForecast(cat)
    setFiltroProductoForecast(prev => (prev && cat !== 'todas' && categoriaPorProducto.get(prev) !== cat ? null : prev))
  }, [categoriaPorProducto])

  // Ritmo del mes en curso: si vendimos X en D días HÁBILES, a ese ritmo el
  // ciclo completo cierra en X/D*diasHabilesEnCiclo — la forma más simple de
  // responder "¿vamos a cumplir lo proyectado?" sin esperar a que termine el
  // ciclo. Días hábiles, no calendario: el reparto no vende fin de semana,
  // así que dividir por días corridos subestimaba el ritmo real.
  const mtdLitros = serieActual?.litrosMesEnCurso ?? 0
  const ritmoProyectado = avanceMes.diasHabilesTranscurridos > 0
    ? (mtdLitros / avanceMes.diasHabilesTranscurridos) * avanceMes.diasHabilesEnCiclo
    : 0

  /* ── Calculadora de cobertura ("¿cuánto necesito de X para cubrir hasta
     tal fecha?") ──────────────────────────────────────────────────────────
     Sirve cualquier producto en cualquier formato (o "todos los formatos").
     Suma el forecast mensual de Prophet ciclo por ciclo entre HOY y la fecha
     objetivo, prorateando por días calendario los ciclos que quedan cortados
     a la mitad (el forecast es de granularidad mensual, no diaria — es la
     forma estándar de repartirlo dentro de un rango arbitrario). El ciclo EN
     CURSO no tiene punto de forecast propio (el modelo lo excluye a
     propósito por estar incompleto — ver generar_forecast.py), así que para
     su tramo se usa el ritmo de venta real de este ciclo, mismo criterio que
     "a este ritmo cerrarías con X L" de arriba. */
  const [coberturaCategoria, setCoberturaCategoria] = useState<'todas' | 'cerveza' | 'kombucha'>('todas')
  const [coberturaProducto, setCoberturaProducto] = useState('')
  const [coberturaEnvase, setCoberturaEnvase] = useState<'todos' | EnvaseBucket>('todos')
  const [coberturaFecha, setCoberturaFecha] = useState(() => hoyLocalISO(new Date(Date.now() + 30 * 86400000)))
  const productoCobertura = coberturaProducto || TODOS_PRODUCTOS
  /** Pastillas de producto de la Calculadora de Cobertura — a diferencia de
   *  Forecasting, acá "Todos los productos" SÍ es una opción real (suma el
   *  catálogo completo, ver resultadoCobertura), así que no hace falta caer
   *  a un consolidado por defecto: se puede dejar sin producto elegido. */
  const productosCoberturaDisponibles = useMemo(
    () => productosDisponibles.filter(p => {
      if (coberturaCategoria !== 'todas' && categoriaPorProducto.get(p) !== coberturaCategoria) return false
      if (coberturaEnvase !== 'todos' && !series.some(s => s.nivel === 'producto_envase' && s.producto === p && s.envaseBucket === coberturaEnvase)) return false
      return true
    }),
    [productosDisponibles, categoriaPorProducto, coberturaCategoria, coberturaEnvase, series]
  )
  const cambiarCategoriaCobertura = useCallback((cat: 'todas' | 'cerveza' | 'kombucha') => {
    setCoberturaCategoria(cat)
    setCoberturaProducto(prev => (prev && prev !== TODOS_PRODUCTOS && cat !== 'todas' && categoriaPorProducto.get(prev) !== cat ? '' : prev))
  }, [categoriaPorProducto])

  /* ── Litros por lata, por producto ───────────────────────────────────────
     El bucket 'lata' fusiona 354ml y 473ml (ver EnvaseBucket en reglas.ts),
     así que no hay una conversión litros→latas fija: hay que sacarla del
     propio stock, donde el nombre crudo del ERP trae el tamaño ("Lata (473
     ml) de X"). En la práctica cada producto usa SIEMPRE un solo tamaño
     (verificado contra datos reales), así que basta con tomar el litraje de
     cualquier fila de stock en lata de ese producto y dividirlo por su
     cantidad de unidades. */
  const litrosPorLataPorProducto = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const s of stock) {
      if (s.envaseBucket !== 'lata' || mapa.has(s.producto) || s.litros == null || s.cantidad <= 0) continue
      mapa.set(s.producto, s.litros / s.cantidad)
    }
    return mapa
  }, [stock])

  /** El ERP carga el formato de lata estándar como "Lata (354 ml)" en el
   *  nombre del producto (ver litrosLata en page.tsx), pero el tamaño físico
   *  real es 375 ml — corrección del usuario, 16-sep-2026. Sólo para ESTA
   *  conversión litros→unidades del gráfico de Forecasting: no se toca el
   *  litraje que ya usan Stock de Seguridad / Calculadora de Cobertura /
   *  Inventario Actual (viene del ERP tal cual, cantidad × 0.354), porque
   *  corregirlo ahí cambiaría números de stock disponible en todo el módulo
   *  — un cambio más grande que lo pedido acá. Se detecta por cercanía al
   *  valor mal cargado (0.354) en vez de comparar con el string crudo del
   *  ERP, que ya se perdió al armar litrosPorLataPorProducto. */
  const LITROS_LATA_ERP_MAL_CARGADO = 0.354
  const LITROS_LATA_REAL = 0.375

  /* ── Conversión litros → unidades para la serie del gráfico de Forecasting ──
     Sólo tiene sentido cuando la serie elegida es un producto×envase
     concreto: "Todos los formatos" o "Todos los productos" no tienen un
     tamaño de envase único que convertir. Barril es exacto (30L o 50L, el
     bucket ES el tamaño — ver bucketEnvase en reglas.ts); lata se estima del
     propio inventario físico porque el bucket mezcla dos tamaños (mismo
     criterio que litrosPorLataPorProducto arriba, reutilizado acá). */
  const unidadEnvaseSerieActual = useMemo(() => {
    if (!serieActual || serieActual.nivel !== 'producto_envase' || !serieActual.envaseBucket || !serieActual.producto) return null
    const bucket = serieActual.envaseBucket as EnvaseBucket
    if (bucket === 'barril_30') return { litrosPorUnidad: 30, nombre: UNIDAD_ENVASE.barril_30 }
    if (bucket === 'barril_50') return { litrosPorUnidad: 50, nombre: UNIDAD_ENVASE.barril_50 }
    if (bucket === 'lata') {
      const litrosPorLataERP = litrosPorLataPorProducto.get(serieActual.producto)
      if (!litrosPorLataERP) return null
      const litrosPorLata = Math.abs(litrosPorLataERP - LITROS_LATA_ERP_MAL_CARGADO) < 0.01
        ? LITROS_LATA_REAL
        : litrosPorLataERP
      return { litrosPorUnidad: litrosPorLata, nombre: UNIDAD_ENVASE.lata }
    }
    return null
  }, [serieActual, litrosPorLataPorProducto])

  const envasesCoberturaDisponibles = useMemo(
    () => productoCobertura === TODOS_PRODUCTOS
      ? ORDEN_ENVASE.filter(b => series.some(s =>
          s.nivel === 'producto_envase' && s.envaseBucket === b &&
          (coberturaCategoria === 'todas' || s.categoria === coberturaCategoria)
        ))
      : ORDEN_ENVASE.filter(b => series.some(s => s.nivel === 'producto_envase' && s.producto === productoCobertura && s.envaseBucket === b)),
    [series, productoCobertura, coberturaCategoria]
  )

  const resultadoCobertura = useMemo(() => {
    if (!productoCobertura) return null
    const hoyISO = hoyLocalISO()
    if (coberturaFecha <= hoyISO) return { error: 'La fecha objetivo debe ser posterior a hoy.' as const }

    // "Todos los productos": suma los números de CADA producto (no resta
    // el sobrante de uno contra el faltante de otro — cada necesidad neta
    // se calcula por producto y después se suman, mismo criterio que ya
    // usa el desglose por formato de abajo). Las latas a comprar se calculan
    // siempre sobre el formato lata de cada producto, sin importar qué
    // Formato esté elegido arriba — compras necesita ese total igual.
    if (productoCobertura === TODOS_PRODUCTOS) {
      const primerMesStock = [...new Set(stockSeguridad.map(s => s.mes))].sort()[0]
      let demandaProyectada = 0, demandaProyectadaMin = 0, demandaProyectadaMax = 0
      let disponibleTotal = 0
      // Bodega (físico, contable, listo para despachar) vs. fermentando
      // (todavía dentro del tanque, sin envasar) — ver el comentario largo
      // en la UI de más abajo sobre por qué NO se pueden sumar sin más.
      let disponibleBodegaTotal = 0, disponibleFermentandoTotal = 0
      let hayDisponible = false
      let necesidadNeta = 0, necesidadNetaMin = 0, necesidadNetaMax = 0
      let latasACubrir = 0
      for (const producto of productosDisponibles) {
        if (coberturaCategoria !== 'todas' && categoriaPorProducto.get(producto) !== coberturaCategoria) continue
        const envasesProducto = ORDEN_ENVASE.filter(b => series.some(s => s.nivel === 'producto_envase' && s.producto === producto && s.envaseBucket === b))
        if (coberturaEnvase !== 'todos' && !envasesProducto.includes(coberturaEnvase)) continue

        const envaseSel = coberturaEnvase !== 'todos' ? coberturaEnvase : null
        const nivelBuscado = envaseSel ? 'producto_envase' : 'producto'
        const claveBuscada = envaseSel ? claveProductoEnvase(producto, envaseSel) : producto
        const serie = series.find(s => s.nivel === nivelBuscado && s.clave === claveBuscada)
        if (!serie) continue

        const { media: demandaProducto, min: demandaProductoMin, max: demandaProductoMax } =
          demandaProyectadaConRangoEnPeriodo(serie, avanceMes, hoyISO, coberturaFecha)
        const filaStock = stockSeguridad.find(s => s.nivel === nivelBuscado && s.mes === primerMesStock && s.producto === producto && (envaseSel ? s.envase === envaseSel : true))
        const disponibleProducto = filaStock ? (filaStock.stockActualLitros ?? 0) + filaStock.litrosEnProduccion : null
        demandaProyectada += demandaProducto
        demandaProyectadaMin += demandaProductoMin
        demandaProyectadaMax += demandaProductoMax
        if (disponibleProducto != null) {
          disponibleTotal += disponibleProducto
          disponibleBodegaTotal += filaStock?.stockActualLitros ?? 0
          disponibleFermentandoTotal += filaStock?.litrosEnProduccion ?? 0
          hayDisponible = true
        }
        necesidadNeta += disponibleProducto != null ? Math.max(demandaProducto - disponibleProducto, 0) : 0
        necesidadNetaMin += disponibleProducto != null ? Math.max(demandaProductoMin - disponibleProducto, 0) : 0
        necesidadNetaMax += disponibleProducto != null ? Math.max(demandaProductoMax - disponibleProducto, 0) : 0

        const litrosPorLata = litrosPorLataPorProducto.get(producto) ?? null
        if (litrosPorLata != null && envasesProducto.includes('lata')) {
          const serieLata = envaseSel === 'lata' ? serie : series.find(s => s.nivel === 'producto_envase' && s.clave === claveProductoEnvase(producto, 'lata'))
          const demandaLata = serieLata ? demandaProyectadaEnPeriodo(serieLata, avanceMes, hoyISO, coberturaFecha) : 0
          const filaStockLata = envaseSel === 'lata' ? filaStock : stockSeguridad.find(s => s.nivel === 'producto_envase' && s.mes === primerMesStock && s.producto === producto && s.envase === 'lata')
          const disponibleLata = filaStockLata ? (filaStockLata.stockActualLitros ?? 0) + filaStockLata.litrosEnProduccion : null
          const necesidadLata = disponibleLata != null ? Math.max(demandaLata - disponibleLata, 0) : 0
          latasACubrir += Math.ceil(necesidadLata / litrosPorLata)
        }
      }
      return {
        demandaProyectada: Math.round(demandaProyectada),
        demandaProyectadaMin: Math.round(demandaProyectadaMin),
        demandaProyectadaMax: Math.round(demandaProyectadaMax),
        disponible: hayDisponible ? disponibleTotal : null,
        disponibleBodega: hayDisponible ? Math.round(disponibleBodegaTotal) : null,
        disponibleFermentando: hayDisponible ? Math.round(disponibleFermentandoTotal) : null,
        necesidadNeta, necesidadNetaMin, necesidadNetaMax,
        categoria: null,
        latasACubrir: latasACubrir > 0 ? latasACubrir : null,
        litrosPorLata: null,
      }
    }

    const envaseSel = coberturaEnvase !== 'todos' && envasesCoberturaDisponibles.includes(coberturaEnvase) ? coberturaEnvase : null
    const nivelBuscado = envaseSel ? 'producto_envase' : 'producto'
    const claveBuscada = envaseSel ? claveProductoEnvase(productoCobertura, envaseSel) : productoCobertura
    const serie = series.find(s => s.nivel === nivelBuscado && s.clave === claveBuscada)
    if (!serie) return null

    const { media: demandaProyectada, min: demandaProyectadaMin, max: demandaProyectadaMax } =
      demandaProyectadaConRangoEnPeriodo(serie, avanceMes, hoyISO, coberturaFecha)

    const primerMesStock = [...new Set(stockSeguridad.map(s => s.mes))].sort()[0]
    const filaStock = stockSeguridad.find(s =>
      s.nivel === nivelBuscado && s.mes === primerMesStock && s.producto === productoCobertura &&
      (envaseSel ? s.envase === envaseSel : true)
    )
    const disponible = filaStock ? (filaStock.stockActualLitros ?? 0) + filaStock.litrosEnProduccion : null
    const necesidadNeta = disponible != null ? Math.max(demandaProyectada - disponible, 0) : null
    const necesidadNetaMin = disponible != null ? Math.max(demandaProyectadaMin - disponible, 0) : null
    const necesidadNetaMax = disponible != null ? Math.max(demandaProyectadaMax - disponible, 0) : null

    const litrosPorLata = envaseSel === 'lata' ? litrosPorLataPorProducto.get(productoCobertura) ?? null : null
    const latasACubrir = litrosPorLata != null && necesidadNeta != null ? Math.ceil(necesidadNeta / litrosPorLata) : null

    return {
      demandaProyectada: Math.round(demandaProyectada),
      demandaProyectadaMin: Math.round(demandaProyectadaMin),
      demandaProyectadaMax: Math.round(demandaProyectadaMax),
      disponible,
      disponibleBodega: filaStock ? filaStock.stockActualLitros ?? 0 : null,
      disponibleFermentando: filaStock ? filaStock.litrosEnProduccion : null,
      necesidadNeta, necesidadNetaMin, necesidadNetaMax,
      categoria: serie.categoria as 'cerveza' | 'kombucha' | null, latasACubrir, litrosPorLata,
    }
  }, [productoCobertura, coberturaCategoria, coberturaEnvase, coberturaFecha, envasesCoberturaDisponibles, productosDisponibles, categoriaPorProducto, series, stockSeguridad, avanceMes, litrosPorLataPorProducto])

  /* ── Desglose por formato de envasado ────────────────────────────────────
     Se cuece por PRODUCTO (un solo lote), y ese lote se envasa después en
     los distintos formatos — no se cuece "para lata" o "para barril" por
     separado. Por eso, elegido un producto, siempre se muestra cuánto hace
     falta de CADA formato y el total (= lo que hay que cocer), sin importar
     qué opción esté elegida en el selector de Formato de arriba (ese sigue
     sirviendo para mirar un formato puntual en el resumen de 3 números). */
  const desgloseCoberturaFormatos = useMemo(() => {
    if (!productoCobertura || productoCobertura === TODOS_PRODUCTOS) return null
    const hoyISO = hoyLocalISO()
    if (coberturaFecha <= hoyISO) return null

    const primerMesStock = [...new Set(stockSeguridad.map(s => s.mes))].sort()[0]
    const filas = envasesCoberturaDisponibles.map(envase => {
      const serie = series.find(s => s.nivel === 'producto_envase' && s.clave === claveProductoEnvase(productoCobertura, envase))
      const { media: demandaProyectada, min: demandaMin, max: demandaMax } = serie
        ? demandaProyectadaConRangoEnPeriodo(serie, avanceMes, hoyISO, coberturaFecha)
        : { media: 0, min: 0, max: 0 }
      const filaStock = stockSeguridad.find(s => s.nivel === 'producto_envase' && s.mes === primerMesStock && s.producto === productoCobertura && s.envase === envase)
      const disponible = filaStock ? (filaStock.stockActualLitros ?? 0) + filaStock.litrosEnProduccion : null
      const necesidadNeta = disponible != null ? Math.max(demandaProyectada - disponible, 0) : null
      const necesidadNetaMin = disponible != null ? Math.max(demandaMin - disponible, 0) : null
      const necesidadNetaMax = disponible != null ? Math.max(demandaMax - disponible, 0) : null
      const litrosPorLata = envase === 'lata' ? litrosPorLataPorProducto.get(productoCobertura) ?? null : null
      const latasACubrir = litrosPorLata != null && necesidadNeta != null ? Math.ceil(necesidadNeta / litrosPorLata) : null
      return {
        envase, demandaProyectada: Math.round(demandaProyectada),
        demandaMin: Math.round(demandaMin), demandaMax: Math.round(demandaMax),
        disponible,
        disponibleBodega: filaStock ? filaStock.stockActualLitros ?? 0 : null,
        disponibleFermentando: filaStock ? filaStock.litrosEnProduccion : null,
        necesidadNeta, necesidadNetaMin, necesidadNetaMax, latasACubrir,
      }
    })
    if (filas.length === 0) return null

    const totalNecesidad = filas.reduce((acc, f) => acc + (f.necesidadNeta ?? 0), 0)
    const totalNecesidadMin = filas.reduce((acc, f) => acc + (f.necesidadNetaMin ?? 0), 0)
    const totalNecesidadMax = filas.reduce((acc, f) => acc + (f.necesidadNetaMax ?? 0), 0)
    return { filas, totalNecesidad, totalNecesidadMin, totalNecesidadMax }
  }, [productoCobertura, coberturaFecha, envasesCoberturaDisponibles, series, stockSeguridad, avanceMes, litrosPorLataPorProducto])

  /* ── Desglose por producto (sólo con "Todos los productos" elegido) ─────
     El equivalente al desglose por formato, pero cuando se está mirando el
     agregado: acá cada fila es un producto (respetando el Formato elegido
     arriba), con su propia columna de latas a comprar — así compras no
     tiene que ir producto por producto para armar la lista de compra. */
  const desgloseCoberturaProductos = useMemo(() => {
    if (productoCobertura !== TODOS_PRODUCTOS) return null
    const hoyISO = hoyLocalISO()
    if (coberturaFecha <= hoyISO) return null

    const primerMesStock = [...new Set(stockSeguridad.map(s => s.mes))].sort()[0]
    const filas = productosDisponibles.flatMap(producto => {
      if (coberturaCategoria !== 'todas' && categoriaPorProducto.get(producto) !== coberturaCategoria) return []
      const envasesProducto = ORDEN_ENVASE.filter(b => series.some(s => s.nivel === 'producto_envase' && s.producto === producto && s.envaseBucket === b))
      if (coberturaEnvase !== 'todos' && !envasesProducto.includes(coberturaEnvase)) return []

      const envaseSel = coberturaEnvase !== 'todos' ? coberturaEnvase : null
      const nivelBuscado = envaseSel ? 'producto_envase' : 'producto'
      const claveBuscada = envaseSel ? claveProductoEnvase(producto, envaseSel) : producto
      const serie = series.find(s => s.nivel === nivelBuscado && s.clave === claveBuscada)
      if (!serie) return []

      const { media: demandaProyectada, min: demandaMin, max: demandaMax } =
        demandaProyectadaConRangoEnPeriodo(serie, avanceMes, hoyISO, coberturaFecha)
      const filaStock = stockSeguridad.find(s => s.nivel === nivelBuscado && s.mes === primerMesStock && s.producto === producto && (envaseSel ? s.envase === envaseSel : true))
      const disponible = filaStock ? (filaStock.stockActualLitros ?? 0) + filaStock.litrosEnProduccion : null
      const necesidadNeta = disponible != null ? Math.max(demandaProyectada - disponible, 0) : null
      const necesidadNetaMin = disponible != null ? Math.max(demandaMin - disponible, 0) : null
      const necesidadNetaMax = disponible != null ? Math.max(demandaMax - disponible, 0) : null

      const litrosPorLata = litrosPorLataPorProducto.get(producto) ?? null
      let latasACubrir: number | null = null
      if (litrosPorLata != null && envasesProducto.includes('lata')) {
        const serieLata = envaseSel === 'lata' ? serie : series.find(s => s.nivel === 'producto_envase' && s.clave === claveProductoEnvase(producto, 'lata'))
        const demandaLata = serieLata ? demandaProyectadaEnPeriodo(serieLata, avanceMes, hoyISO, coberturaFecha) : 0
        const filaStockLata = envaseSel === 'lata' ? filaStock : stockSeguridad.find(s => s.nivel === 'producto_envase' && s.mes === primerMesStock && s.producto === producto && s.envase === 'lata')
        const disponibleLata = filaStockLata ? (filaStockLata.stockActualLitros ?? 0) + filaStockLata.litrosEnProduccion : null
        const necesidadLata = disponibleLata != null ? Math.max(demandaLata - disponibleLata, 0) : 0
        latasACubrir = Math.ceil(necesidadLata / litrosPorLata)
      }

      return [{
        producto, demandaProyectada: Math.round(demandaProyectada),
        demandaMin: Math.round(demandaMin), demandaMax: Math.round(demandaMax),
        disponible,
        disponibleBodega: filaStock ? filaStock.stockActualLitros ?? 0 : null,
        disponibleFermentando: filaStock ? filaStock.litrosEnProduccion : null,
        necesidadNeta, necesidadNetaMin, necesidadNetaMax, latasACubrir,
      }]
    })
    if (filas.length === 0) return null

    filas.sort((a, b) => (b.necesidadNeta ?? 0) - (a.necesidadNeta ?? 0))
    const totalNecesidad = filas.reduce((acc, f) => acc + (f.necesidadNeta ?? 0), 0)
    const totalNecesidadMin = filas.reduce((acc, f) => acc + (f.necesidadNetaMin ?? 0), 0)
    const totalNecesidadMax = filas.reduce((acc, f) => acc + (f.necesidadNetaMax ?? 0), 0)
    const totalLatas = filas.reduce((acc, f) => acc + (f.latasACubrir ?? 0), 0)
    return { filas, totalNecesidad, totalNecesidadMin, totalNecesidadMax, totalLatas }
  }, [productoCobertura, coberturaCategoria, coberturaEnvase, coberturaFecha, productosDisponibles, categoriaPorProducto, series, stockSeguridad, avanceMes, litrosPorLataPorProducto])

  /* ── Serie seleccionada → filas para Recharts ─────────────────────────
     La proyección arranca repitiendo el último mes real, para que las dos
     líneas queden pegadas en el gráfico en vez de mostrar un corte.

     El ritmo del mes en curso (litros hasta hoy extrapolados a mes
     completo) se dibuja como una línea PROPIA que también arranca del
     último mes real — igual que la verde — para que corra al lado de la
     proyección del modelo en la misma columna y se compare de un vistazo:
     ¿el ritmo actual queda arriba o abajo de lo que el modelo esperaba?
     Antes se probó conectar la venta real cruda (litros del mes a medias)
     directo a la línea de "Venta Real": comparada contra meses completos
     se veía como una caída al vacío, no como una proyección — engañoso.
     Extrapolar a mes completo es la comparación correcta. */
  const chartData = useMemo(() => {
    if (!serieActual) return []
    const puntos = [...serieActual.puntos].sort((a, b) => a.mes.localeCompare(b.mes))
    const idxCorte = puntos.findIndex(p => p.tipo === 'forecast')
    const idxUltimoReal = idxCorte > 0 ? idxCorte - 1 : puntos.length - 1
    const filas = puntos.map((p, i) => {
      const esUltimoReal = idxCorte > 0 && i === idxCorte - 1
      return {
        month: etiquetaMes(p.mes),
        mesIso: p.mes,
        ventaReal: p.tipo === 'historico' ? p.litros : null,
        ventaProyectada: p.tipo === 'forecast' || esUltimoReal ? p.litros : null,
        rango: p.litrosMin != null && p.litrosMax != null ? [p.litrosMin, p.litrosMax] : null,
        ritmo: i === idxUltimoReal ? p.litros : null,
        // Descomposición del modelo. `tendencia` se dibuja como línea sobre
        // toda la serie —incluido el historial— porque ahí es donde se ve que
        // el modelo la ajustó a los datos y no la inventó para el futuro.
        tendencia: p.tendencia,
        estacionalidad: p.estacionalidad,
      }
    })
    // El mes en curso puede no venir en `puntos` (el modelo lo excluyó del
    // historial y todavía no corrió con él como forecast, ej. recién
    // empezó el mes) — si falta, se agrega igual para no perder el ritmo.
    const yaEsta = filas.some(f => f.mesIso === avanceMes.mes)
    if (!yaEsta) {
      filas.push({
        month: etiquetaMes(avanceMes.mes), mesIso: avanceMes.mes,
        ventaReal: null, ventaProyectada: null, rango: null, ritmo: null,
        tendencia: null, estacionalidad: null,
      })
      filas.sort((a, b) => a.mesIso.localeCompare(b.mesIso))
    }
    const idxMesEnCurso = filas.findIndex(f => f.mesIso === avanceMes.mes)
    if (idxMesEnCurso >= 0) filas[idxMesEnCurso].ritmo = ritmoProyectado
    return filas
  }, [serieActual, avanceMes.mes, ritmoProyectado])

  /* ── Descomposición del modelo ─────────────────────────────────────────
     Sólo existe si la serie llegó a proyectarse (historial suficiente y no
     descontinuada); si no, el botón "Ver el modelo" ni se ofrece. */
  const hayDescomposicion = useMemo(
    () => chartData.some(d => d.tendencia != null),
    [chartData]
  )

  /** Primer mes proyectado, para poner números concretos en la ecuación. */
  const descomposicionProximo = useMemo(() => {
    const f = chartData.find(d => d.ventaReal == null && d.tendencia != null && d.estacionalidad != null)
    if (!f) return null
    return { mesIso: f.mesIso, tendencia: f.tendencia as number, estacionalidad: f.estacionalidad as number }
  }, [chartData])

  /** Curva estacional del año, promediando la componente `yearly` por mes
   *  calendario. Es la forma más directa de mostrar qué aprendió el modelo:
   *  no "diciembre vende más" dicho por alguien, sino cuántos litros estima
   *  que aporta cada mes por encima o debajo de la tendencia. */
  const curvaEstacional = useMemo(() => {
    const suma = new Array(12).fill(0)
    const n = new Array(12).fill(0)
    for (const d of chartData) {
      if (d.estacionalidad == null) continue
      const i = indiceMes(d.mesIso)
      suma[i] += d.estacionalidad
      n[i] += 1
    }
    if (!n.some(c => c > 0)) return []
    return MESES_CORTOS.map((mes, i) => ({ mes, efecto: n[i] > 0 ? suma[i] / n[i] : 0 }))
  }, [chartData])

  /* ── Ecuación del modelo, con las constantes REALES de esta corrida ──────
     Prophet ajusta y(t) = g(t) + s(t) + h(t) + εₜ. Acá h(t)=0 siempre: el
     modelo se entrena sin feriados (ver generar_forecast.py), así que se
     omite en vez de mostrar un término que nunca se usa.

     g(t) — tendencia — se recupera EXACTA, no aproximada: Prophet ajusta el
     crecimiento como lineal a trozos con quiebres (changepoints) dentro del
     historial, pero el tramo que va desde el último changepoint hacia
     adelante es una sola recta. Los puntos de `tendencia` del FORECAST caen
     todos en ese tramo final, así que una regresión sobre ellos devuelve la
     pendiente/intercepto que el modelo realmente está usando para proyectar
     — no un ajuste hecho a mano.

     s(t) — estacionalidad — es la parte que sí se aproxima: Prophet la ajusta
     como una suma de varios armónicos de Fourier, y acá se muestra el
     armónico principal (un único seno) con la amplitud y fase que mejor
     calzan con `curvaEstacional` (el promedio real de `estacionalidad` por
     mes calendario). Es una simplificación visual, no la fórmula interna
     completa — se lo aclara en el pie de la tarjeta.

     t se mide en MESES DESDE EL PRIMER MES PROYECTADO (t=0), para que las
     constantes tengan el mismo significado que "Próximo mes" en el resto del
     panel. Se recalcula solo con cada corrida nueva del modelo (chartData/
     curvaEstacional salen de `series`, que viene del servidor). */
  const ecuacionModelo = useMemo(() => {
    const futuros = chartData
      .filter(d => d.ventaReal == null && d.tendencia != null)
      .sort((a, b) => a.mesIso.localeCompare(b.mesIso))
    if (futuros.length === 0 || curvaEstacional.length === 0) return null

    const n = futuros.length
    const ys = futuros.map(f => f.tendencia as number)
    let k = 0
    const m = ys[0]
    if (n >= 2) {
      const xs = futuros.map((_, i) => i)
      const mediaX = xs.reduce((a, b) => a + b, 0) / n
      const mediaY = ys.reduce((a, b) => a + b, 0) / n
      let num = 0, den = 0
      for (let i = 0; i < n; i++) { num += (xs[i] - mediaX) * (ys[i] - mediaY); den += (xs[i] - mediaX) ** 2 }
      k = den !== 0 ? num / den : 0
    }

    // A y fase del armónico principal: proyección de Fourier de mínimos
    // cuadrados de curvaEstacional sobre sin(2π·t/12), no "amplitud por
    // (máximo−mínimo)/2 con fase ajustada al mes pico". La curva real de
    // estacionalidad casi nunca es una sinusoide limpia (acá tiene un pico
    // marcado en enero-febrero y una meseta baja en invierno), así que
    // amplitud+pico se probó contra los datos reales y quedaba lejos del
    // valor real en varios meses (RMSE ~1735 L); esta proyección es el mejor
    // ajuste posible de UN solo seno (RMSE ~1331 L) — sigue siendo una
    // aproximación (Prophet usa varios armónicos), pero es la más cercana
    // posible con una función de una sola línea.
    const mesT0Idx = indiceMes(futuros[0].mesIso)
    let a = 0, b = 0
    for (let i = 0; i < 12; i++) {
      const tDesdeT0 = ((i - mesT0Idx) % 12 + 12) % 12
      const theta = (2 * Math.PI * tDesdeT0) / 12
      a += curvaEstacional[i].efecto * Math.sin(theta)
      b += curvaEstacional[i].efecto * Math.cos(theta)
    }
    a *= 2 / 12; b *= 2 / 12
    const A = Math.hypot(a, b)
    const fase = Math.atan2(b, a)

    return { k, m, A, fase, t0mes: futuros[0].mesIso }
  }, [chartData, curvaEstacional])

  /* ── Temporada alta (Dic–Feb): tramos consecutivos para las ReferenceArea ── */
  const tramosTemporadaAlta = useMemo(() => {
    const tramos: { x1: string; x2: string }[] = []
    let inicio: string | null = null
    let previo: string | null = null
    for (const fila of chartData) {
      const alta = [11, 0, 1].includes(indiceMes(fila.mesIso))
      if (alta && inicio === null) inicio = fila.month
      if (!alta && inicio !== null && previo !== null) {
        tramos.push({ x1: inicio, x2: previo })
        inicio = null
      }
      previo = fila.month
    }
    if (inicio !== null && previo !== null) tramos.push({ x1: inicio, x2: previo })
    return tramos
  }, [chartData])

  /* ── KPIs reales ──────────────────────────────────────────────────────── */
  const productosEnRiesgo = useMemo(
    () => series.filter(s => s.nivel === 'producto' && (s.mape == null || s.mape > 30)),
    [series]
  )

  const desviacionGeneral = serieGeneral?.mape ?? null
  const precisionSerie = serieActual?.mape != null ? Math.max(0, 100 - serieActual.mape) : null

  const proximosMeses = useMemo(
    () => (serieGeneral?.puntos ?? []).filter(p => p.tipo === 'forecast').slice(0, 3),
    [serieGeneral]
  )
  const litrosProximoMes = proximosMeses[0]?.litros ?? null

  const advertencias = calidad.filter(c => c.severidad === 'advertencia')

  /* ── Tabla de detalle producto × envase, debajo del gráfico ────────────
     Cada fila es una combinación real (ej. "Doble IPA — Barril 30L").
     Filtrable por categoría (cerveza/kombucha) y por tipo de envase;
     agrupada visualmente por producto para no repetir el nombre en cada
     línea de envase. */
  const envasesDisponibles = useMemo(() => {
    const set = new Set(series.filter(s => s.nivel === 'producto_envase' && s.envaseBucket).map(s => s.envaseBucket as string))
    return [...set]
  }, [series])

  const filasTablaDetalle = useMemo(() => {
    return series
      .filter(s => s.nivel === 'producto_envase')
      .filter(s => filtroCategoria === 'todas' || s.categoria === filtroCategoria)
      .filter(s => filtroEnvase === 'todos' || s.envaseBucket === filtroEnvase)
      .map(s => {
        const proximo = s.puntos.filter(p => p.tipo === 'forecast').sort((a, b) => a.mes.localeCompare(b.mes))[0] ?? null
        return { serie: s, proximo }
      })
      .sort((a, b) => (a.serie.producto ?? '').localeCompare(b.serie.producto ?? '') || (a.serie.envaseBucket ?? '').localeCompare(b.serie.envaseBucket ?? ''))
  }, [series, filtroCategoria, filtroEnvase])

  /* ── Stock de seguridad del mes elegido ─────────────────────────────────
     Estado se define comparando el DISPONIBLE (inventario en bodega + lo ya
     declarado en producción, que va a llegar dentro del lead time) contra
     dos umbrales: por debajo del stock de seguridad = crítico (ni el colchón
     alcanza); entre el colchón y el punto de reorden = bajo (ya toca
     reponer); por encima del punto de reorden = ok.

     Sin sumar lo que está en fermentación, un producto con la cocción ya
     lanzada aparecía igual como crítico y gatillaba una cocción redundante. */
  const filasStockSeguridad = useMemo(() => {
    return stockSeguridad
      .filter(s => s.mes === mesSeguridadActivo && s.nivel === 'producto_envase')
      .filter(s => filtroCategoriaSeg === 'todas' || s.categoria === filtroCategoriaSeg)
      .filter(s => filtroEnvaseSeg === 'todos' || s.envase === filtroEnvaseSeg)
      .map(s => {
        const disponible = s.stockActualLitros != null
          ? s.stockActualLitros + s.litrosEnProduccion
          : null
        const estado: 'critico' | 'bajo' | 'ok' | 'sin_dato' =
          disponible == null ? 'sin_dato'
            : disponible < s.stockSeguridadLitros ? 'critico'
              : disponible < s.puntoReordenLitros ? 'bajo' : 'ok'
        return { ...s, disponible, estado }
      })
  }, [stockSeguridad, mesSeguridadActivo, filtroCategoriaSeg, filtroEnvaseSeg])

  /* ── Agrupado por producto, segmentado por formato ──────────────────────
     Antes la tabla ordenaba TODAS las filas por estado global, así que los
     3 formatos de un mismo producto quedaban dispersos en secciones
     distintas (crítico/bajo/ok) — confundía qué número era de qué envase
     (bug real reportado: "el barril de West Coast dice 87L", cuando 87L era
     la fila de Lata, a varias pantallas de las filas de Barril del mismo
     producto). Ahora se agrupa por producto (con su foto, mismo patrón que
     Inventario Actual) y cada formato queda SIEMPRE en el mismo orden
     (Barril 30L, Barril 50L, Lata, Otros) debajo de su producto. */
  type FilaStockSeguridad = (typeof filasStockSeguridad)[number]
  const gruposStockSeguridad = useMemo(() => {
    interface Grupo { producto: string; categoria: 'cerveza' | 'kombucha'; filas: FilaStockSeguridad[] }
    const porProducto = new Map<string, Grupo>()
    for (const f of filasStockSeguridad) {
      if (!porProducto.has(f.producto)) porProducto.set(f.producto, { producto: f.producto, categoria: f.categoria, filas: [] })
      porProducto.get(f.producto)!.filas.push(f)
    }
    const PESO_ESTADO = { critico: 0, sin_dato: 1, bajo: 2, ok: 3 }
    const resultado = [...porProducto.values()]
    for (const g of resultado) {
      g.filas.sort((a, b) => ORDEN_ENVASE.indexOf(a.envase as EnvaseBucket) - ORDEN_ENVASE.indexOf(b.envase as EnvaseBucket))
    }
    resultado.sort((a, b) => {
      const peorA = Math.min(...a.filas.map(f => PESO_ESTADO[f.estado]))
      const peorB = Math.min(...b.filas.map(f => PESO_ESTADO[f.estado]))
      if (peorA !== peorB) return peorA - peorB
      return a.producto.localeCompare(b.producto)
    })
    return resultado
  }, [filasStockSeguridad])

  /* ── Necesidad de producción anticipada ──────────────────────────────────
     El resto de Stock de Seguridad responde "¿estoy bien HOY?" comparando
     contra un solo mes. Esto responde la otra pregunta, la que importa para
     no improvisar: "¿cuánto necesito PRODUCIR para llegar bien hasta tal
     fecha futura?" — para cualquier producto/formato, no uno a la vez.
     Reutiliza exactamente el mismo cálculo que la Calculadora de Cobertura
     de Forecasting (demandaProyectadaEnPeriodo), aplicado a TODAS las
     combinaciones producto×envase de una vez, y le suma una alerta de
     "viene alta demanda" basada en la propia estacionalidad que ya calcula
     Prophet — así se detectan también los casos donde el disponible de hoy
     alcanza pero se acerca una temporada alta que se lo va a comer rápido. */
  const [fechaCoberturaSeg, setFechaCoberturaSeg] = useState(() => hoyLocalISO(new Date(Date.now() + 60 * 86400000)))

  /** Hasta dónde de verdad se puede cubrir: el último mes con forecast real
   *  (`mesesSeguridad`, calculado arriba). Elegir una fecha más allá de esto
   *  no rompe nada, pero es una trampa silenciosa — `demandaProyectadaEnPeriodo`
   *  sólo suma litros donde hay un ciclo de forecast; para los meses sin dato
   *  simplemente no suma nada, así que "A producir" se ve más chico de lo que
   *  en realidad hace falta, sin ningún aviso. Se usa como tope del selector
   *  para que esa fecha ni se pueda elegir. */
  const horizonteCoberturaISO = mesesSeguridad.length > 0 ? finDeCiclo(mesesSeguridad[mesesSeguridad.length - 1]) : ''

  /** Atajos sobre la fecha "Cubrir hasta" — antes era un único campo de fecha
   *  suelto que arrancaba en +60 días y daba la impresión de estar fijo ahí.
   *  Los atajos cubren los horizontes que de verdad se preguntan (mes a mes,
   *  trimestre, semestre) y quedan acotados al horizonte real de arriba: no
   *  tiene sentido ofrecer "6 meses" si el forecast sólo llega a 4. */
  const presetsCobertura = useMemo(() => {
    const hoyMs = Date.now()
    const candidatos = [
      { label: '1 mes', dias: 30 },
      { label: '2 meses', dias: 60 },
      { label: '3 meses', dias: 90 },
      { label: '6 meses', dias: 180 },
    ].map(p => ({ label: p.label, fecha: hoyLocalISO(new Date(hoyMs + p.dias * 86400000)) }))
      .filter(p => !horizonteCoberturaISO || p.fecha <= horizonteCoberturaISO)
    // Si el horizonte cae justo sobre un atajo que ya existe (ej.: el
    // forecast termina exactamente a 6 meses), no se agrega un botón
    // duplicado que apunte a la misma fecha con otro nombre.
    if (horizonteCoberturaISO && !candidatos.some(p => p.fecha === horizonteCoberturaISO)) {
      candidatos.push({ label: 'Fin del forecast', fecha: horizonteCoberturaISO })
    }
    return candidatos
  }, [horizonteCoberturaISO])

  const necesidadesAnticipadas = useMemo(() => {
    const hoyISO = hoyLocalISO()
    if (fechaCoberturaSeg <= hoyISO) return []
    const primerMesStock = [...new Set(stockSeguridad.map(s => s.mes))].sort()[0]
    const resultado: (SugerenciaPlan & { altaDemanda: boolean; stockSeguridadLitros: number })[] = []

    for (const serie of series) {
      if (serie.nivel !== 'producto_envase' || !serie.producto || !serie.envaseBucket) continue
      if (filtroCategoriaSeg !== 'todas' && serie.categoria !== filtroCategoriaSeg) continue
      if (filtroEnvaseSeg !== 'todos' && serie.envaseBucket !== filtroEnvaseSeg) continue
      const envase = serie.envaseBucket as EnvaseBucket

      const filaStock = stockSeguridad.find(s =>
        s.nivel === 'producto_envase' && s.mes === primerMesStock && s.producto === serie.producto && s.envase === envase
      )
      if (!filaStock) continue

      const demandaProyectada = demandaProyectadaEnPeriodo(serie, avanceMes, hoyISO, fechaCoberturaSeg)
      const disponible = (filaStock.stockActualLitros ?? 0) + filaStock.litrosEnProduccion
      const necesidadNeta = Math.round(Math.max(demandaProyectada - disponible, 0))
      const altaDemanda = vieneAltaDemanda(serie, hoyISO, fechaCoberturaSeg)
      if (necesidadNeta <= 0 && !altaDemanda) continue

      const ritmoDiarioActual = avanceMes.diasHabilesTranscurridos > 0 ? serie.litrosMesEnCurso / avanceMes.diasHabilesTranscurridos : 0
      const diasHastaQuiebre = ritmoDiarioActual > 0 ? disponible / ritmoDiarioActual : null
      const fechaEstimadaQuiebre = diasHastaQuiebre != null ? sumarDiasHabilesISO(hoyISO, diasHastaQuiebre) : null
      const fechaLabel = new Date(`${fechaCoberturaSeg}T00:00:00Z`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

      // Cuándo hay que EMPEZAR a cocer para llegar a tiempo — mismo cálculo
      // que las alarmas de quiebre (quiebre − lead time), pero acá derivado
      // en el cliente porque la fecha de cobertura la fija el usuario en el
      // filtro, no viene de una alarma fija del servidor. Sólo tiene sentido
      // cuando hay ritmo real para proyectar una fecha de quiebre — sin
      // ventas no hay "cuándo" que calcular, sólo "cuánto".
      const fechaLimiteInicio = fechaEstimadaQuiebre != null
        ? restarDiasHabilesISO(fechaEstimadaQuiebre, filaStock.leadTimeSemanas * 5)
        : null
      const atrasado = fechaLimiteInicio != null && fechaLimiteInicio <= hoyISO

      // Cuándo hay que empezar a GESTIONAR con el proveedor para que los
      // insumos lleguen a tiempo — siempre antes que fechaLimiteInicio,
      // porque sin insumos en planta no se puede ni largar la cocción. Ver
      // LEAD_TIME_INSUMOS_SEMANAS (~2 semanas de gestión real, 16-sep-2026).
      const fechaLimiteGestion = fechaEstimadaQuiebre != null
        ? restarDiasHabilesISO(fechaEstimadaQuiebre, (filaStock.leadTimeSemanas + LEAD_TIME_INSUMOS_SEMANAS) * 5)
        : null
      const atrasadoGestion = fechaLimiteGestion != null && fechaLimiteGestion <= hoyISO

      let motivo = `Cubrir hasta ${fechaLabel}: demanda proyectada ${Math.round(demandaProyectada)} L, disponible ${Math.round(disponible)} L.`
      if (altaDemanda) motivo += ' El modelo anticipa una temporada de alta demanda dentro de este período.'
      if (fechaLimiteInicio) {
        const limiteLabel = new Date(`${fechaLimiteInicio}T00:00:00Z`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })
        motivo += atrasado
          ? ` Debiste empezar a cocer el ${limiteLabel} (${filaStock.leadTimeSemanas} semanas de lead time).`
          : ` Último día para empezar a cocer: ${limiteLabel} (${filaStock.leadTimeSemanas} semanas de lead time).`
      }
      if (fechaLimiteGestion) {
        const limiteGestionLabel = new Date(`${fechaLimiteGestion}T00:00:00Z`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })
        motivo += atrasadoGestion
          ? ` Debiste gestionar los insumos con el proveedor el ${limiteGestionLabel} (${LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión + ${filaStock.leadTimeSemanas} de cocción).`
          : ` Último día para empezar a gestionar insumos con el proveedor: ${limiteGestionLabel} (${LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión + ${filaStock.leadTimeSemanas} de cocción).`
      }

      resultado.push({
        producto: serie.producto, envase, categoria: (serie.categoria as 'cerveza' | 'kombucha') ?? 'cerveza',
        disponibleLitros: Math.round(disponible), disponibleUnidades: filaStock.stockActualUnidades,
        litrosSugeridos: necesidadNeta, leadTimeSemanas: filaStock.leadTimeSemanas,
        ritmoDiarioActual: Math.round(ritmoDiarioActual * 10) / 10,
        diasHastaQuiebre: diasHastaQuiebre != null ? Math.round(diasHastaQuiebre) : null,
        fechaEstimadaQuiebre, motivo, altaDemanda,
        stockSeguridadLitros: Math.round(filaStock.stockSeguridadLitros),
        puntoReordenLitros: Math.round(filaStock.puntoReordenLitros),
        // Esta sección (Necesidades Anticipadas) no prioriza por línea fija,
        // sólo por temporada de alta demanda — el campo queda en false acá
        // porque SugerenciaPlan lo exige, no porque se use en este cálculo.
        lineaFija: false,
        // Ídem: esta sección mira la cobertura a meses vista (fechaCoberturaSeg),
        // no el detalle fino de fermentador-vs-bodega que sí usa la alarma de
        // quiebre inmediato — se deja en 0/null porque el campo es requerido.
        litrosFermentando: 0,
        fechaFermentandoListo: null,
        fechaLimiteInicio,
        atrasado,
        fechaLimiteGestion,
        atrasadoGestion,
      })
    }

    return resultado.sort((a, b) => Number(b.altaDemanda) - Number(a.altaDemanda) || b.litrosSugeridos - a.litrosSugeridos)
  }, [series, stockSeguridad, avanceMes, fechaCoberturaSeg, filtroCategoriaSeg, filtroEnvaseSeg])

  const anticipadasPorProducto = useMemo(() => {
    // Totales por producto EN LITROS, sumando los 3 formatos — la pregunta
    // "¿cuánto tengo que cocer en total para este producto?" no distingue
    // envase (el envasado se decide después, ver Split de Envasado); pedir
    // el número desglosado por formato y sumarlo a mano era el gap.
    interface Grupo {
      producto: string; categoria: 'cerveza' | 'kombucha'; items: typeof necesidadesAnticipadas
      totalAProducir: number; totalStockSeguridad: number
      fermentadorSugerido: OcupacionPlanta['tanques'][number] | null
      fermentadorAjustado: boolean
    }
    const grupos = new Map<string, Grupo>()
    for (const item of necesidadesAnticipadas) {
      if (!grupos.has(item.producto)) {
        grupos.set(item.producto, {
          producto: item.producto, categoria: item.categoria, items: [],
          totalAProducir: 0, totalStockSeguridad: 0,
          fermentadorSugerido: null, fermentadorAjustado: false,
        })
      }
      const grupo = grupos.get(item.producto)!
      grupo.items.push(item)
      grupo.totalAProducir += item.litrosSugeridos
      grupo.totalStockSeguridad += item.stockSeguridadLitros
    }
    // La recomendación de tanque se calcula DESPUÉS de sumar todos los
    // formatos: el litraje que importa para elegir fermentador es el total
    // del producto (lo que realmente se cuece de una vez), no cada formato
    // por separado — mismo criterio que "Agregar al plan" del Plan Maestro.
    for (const grupo of grupos.values()) {
      if (grupo.totalAProducir <= 0) continue
      const { tanque, ajustado } = recomendarFermentador(grupo.categoria, grupo.totalAProducir, ocupacionPlanta.tanques)
      grupo.fermentadorSugerido = tanque
      grupo.fermentadorAjustado = ajustado
    }
    return [...grupos.values()]
  }, [necesidadesAnticipadas, ocupacionPlanta.tanques])

  /* ══════════ MOTOR DE PLANIFICACIÓN DE PRODUCCIÓN ══════════
     UN solo cálculo arma todo el plan; el calendario diario, el resumen
     mensual y los avisos son proyecciones de ESE resultado.

     El motor es una SIMULACIÓN DÍA A DÍA del inventario de cada producto a
     lo largo del horizonte, no un reparto de "cuánto falta este mes". Ese
     cambio es el que arregla el defecto que se veía en pantalla: cuando el
     plan se armaba por mes, todas las cocciones caían amontonadas el mismo
     día (el primero disponible), porque la única fecha que existía era "lo
     antes posible". Acá cada cocción nace de un evento propio del producto
     —su stock cayó al punto de reorden— así que se reparten solas en el
     tiempo, cada una en el día en que de verdad hay que prenderla.

     El ciclo que simula, por producto:
       1. ARRANQUE: la primera cocción va en la fecha que ya propone el Plan
          Maestro (`fechaLimiteInicio` de la alarma de quiebre: el último día
          hábil para cocer y todavía llegar). Es el mismo número que el
          usuario ve en "Alarmas de quiebre de stock" — las dos pantallas no
          pueden decir fechas distintas para lo mismo.
       2. LISTO: esa cocción entra a bodega en inicio + lead time y ahí
          recién suma stock vendible.
       3. CONSUMO: el stock baja todos los días al ritmo del forecast del mes
          que corresponda (por eso el plan se reacomoda solo cuando el
          forecast se recalcula el día 24).
       4. REORDEN: cuando el inventario proyectado (stock + lo que viene en
          camino) toca el PUNTO DE REORDEN del producto, se dispara la
          siguiente cocción. Y así hasta el fin del horizonte.

     Lo que limita al ciclo —y sin esto el calendario sería una lista de
     deseos, no un plan:
       • TAMAÑO REAL de los fermentadores: cada cocción se acota a un tanque
         que existe. Lo que no cabe queda para el siguiente reorden.
       • LÍNEA del tanque: los T sólo cervecería, los K sólo kombuchería.
       • OCUPACIÓN en el tiempo: un tanque queda tomado el lead time completo,
         y los que hoy tienen producto recién se liberan en su fecha estimada
         de embarrilado (dato real del ERP). Si el día del reorden no hay
         tanque libre de la línea, la cocción NO se inventa: espera, y esos
         días de espera quedan registrados (`diasTarde`) — es capacidad
         faltante, y así se ve.
       • PRIORIDAD para repartir tanques escasos: primero lo que ya tiene
         alarma de quiebre real, después línea fija, después orden alfabético
         para que el resultado sea estable entre cargas.

     "Llega tarde" lo decide la propia simulación: si el stock del producto
     cruza cero mientras la cocción viene en camino, ese lote se marca como
     que no alcanzó. No es una comparación contra el borde del mes. */
  /** Con cuántos meses arranca el selector de horizonte de abajo — no tiene
   *  ningún efecto sobre qué queda marcado en el presupuesto (eso ahora es
   *  uniforme: nada arranca marcado, ver `estaSeleccionado` más abajo). Es
   *  sólo el valor inicial antes de que el usuario toque los atajos. */
  const HORIZONTE_PLAN_INICIAL = 3

  /** Cuántos meses simula el motor — antes era una constante fija en 3, así
   *  que el calendario nunca pasaba de noviembre. Ahora es ajustable
   *  (selector más abajo) y tiene un solo tope real: no hay forecast más
   *  allá de `mesesSeguridad`, así que pedirle más al motor no agrega
   *  cocciones nuevas, sólo un horizonte vacío. */
  const [horizontePlanMeses, setHorizontePlanMeses] = useState(HORIZONTE_PLAN_INICIAL)
  const horizontePlanMax = mesesSeguridad.length || HORIZONTE_PLAN_INICIAL

  /** Cocciones que el usuario movió a mano arrastrándolas en el calendario:
   *  `producto|Nº de cocción` → fecha pedida. La clave NO es el id del lote
   *  porque al mover una cocción se vuelve a simular todo lo que viene
   *  detrás y los ids se regeneran; "la 2ª cocción de Mocho English" sí
   *  sobrevive a esa regeneración. */
  const [anclasCoccion, setAnclasCoccion] = useState<Map<string, string>>(new Map())

  /** Detalle de una cocción del calendario, en dos modos (ver
   *  PopoverCoccion.tsx): `preview` al pasar el cursor —sólo lectura, se
   *  cierra solo— y `fijado` al hacer clic, que es donde viven las acciones.
   *
   *  Antes era un único tooltip de hover que además contenía el `<select>` de
   *  tanque: el control real estaba en un panel que se cerraba al mover el
   *  mouse, y en pantalla táctil no se podía abrir de ninguna forma. Separar
   *  los dos modos es lo que resuelve las dos cosas a la vez. */
  const [detalleCoccion, setDetalleCoccion] = useState<
    { lote: (typeof planSugerido.lotes)[number]; rect: DOMRect; modo: 'preview' | 'fijado' } | null
  >(null)
  // Margen antes de cerrar el preview: sin esto, mover el mouse del chip hacia
  // el propio panel lo cierra a mitad de camino, porque el panel vive en un
  // portal y entre los dos hay un hueco sin ningún elemento encima.
  const cierrePreviewRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelarCierrePreview = () => {
    if (cierrePreviewRef.current) { clearTimeout(cierrePreviewRef.current); cierrePreviewRef.current = null }
  }
  const programarCierrePreview = () => {
    cancelarCierrePreview()
    cierrePreviewRef.current = setTimeout(() => {
      setDetalleCoccion(prev => (prev?.modo === 'fijado' ? prev : null))
    }, 140)
  }
  const fijarDetalle = (lote: (typeof planSugerido.lotes)[number], rect: DOMRect) => {
    cancelarCierrePreview()
    setDetalleCoccion({ lote, rect, modo: 'fijado' })
  }
  const cerrarDetalle = () => { cancelarCierrePreview(); setDetalleCoccion(null) }

  const anclarCoccion = (producto: string, nro: number, fechaISO: string) => {
    setAnclasCoccion(prev => new Map(prev).set(`${producto}|${nro}`, fechaISO))
  }

  /** Igual que `anclasCoccion` pero para el TANQUE — el usuario elige a mano
   *  en qué fermentador cocer, desde el desplegable de la tarjeta. Misma
   *  clave `producto|Nº de cocción` y mismo motivo: al recalcular el plan
   *  los ids se regeneran, pero "la 2ª cocción de Mocho English" no. */
  const [anclasTanque, setAnclasTanque] = useState<Map<string, string>>(new Map())
  const anclarTanque = (producto: string, nro: number, tanque: string) => {
    setAnclasTanque(prev => {
      const siguiente = new Map(prev)
      if (tanque) siguiente.set(`${producto}|${nro}`, tanque); else siguiente.delete(`${producto}|${nro}`)
      return siguiente
    })
  }
  const limpiarAnclas = () => { setAnclasCoccion(new Map()); setAnclasTanque(new Map()) }

  /** Arrastre del calendario (Pointer Events: mouse, lápiz y dedo por el mismo
   *  camino — ver useArrastreCalendario.ts). Dos cargas posibles:
   *
   *   · `coccion`    — una cocción ya planificada que se MUEVE de día. Queda
   *                    anclada a esa fecha y el plan se re-simula desde ahí.
   *   · `sugerencia` — un producto que el modelo pide cocer pero que todavía
   *                    no existe como lote. Soltarlo en un día lo CREA en el
   *                    Plan Maestro con esa fecha, sin pasar por el modal.
   *
   *  No se puede soltar en el pasado: una cocción no se agenda para ayer. */
  /* ── Gantt de ocupación de fermentadores ──────────────────────────────
     Reemplaza a las dos grillas de calendario que había antes (una en
     "Cuándo cocer" con las sugerencias y otra en Resumen con lo confirmado):
     mostraban la misma planta en dos lugares con dos criterios distintos.
     Acá hay una sola foto — filas = tanques, columnas = días corridos. */

  const [configGantt, setConfigGantt] = useState<ConfigProducto[]>(configProductos)
  const [configAbierta, setConfigAbierta] = useState(false)
  const [agregarProductoAbierto, setAgregarProductoAbierto] = useState(false)
  /** Correcciones de fecha para lotes 'en_tanque' — ver ajuste_lote_tanque.
   *  En estado local (no derivado en cada render de la prop) para que
   *  guardar una corrección se sienta al toque, igual que mover un lote en
   *  el Gantt. */
  const [ajustesTanque, setAjustesTanque] = useState<AjusteTanque[]>(ajustesTanqueIniciales)
  const [editarTanqueAbierto, setEditarTanqueAbierto] = useState<{
    tanque: string; codigoLote: string; producto: string; categoria: 'cerveza' | 'kombucha'
    inicioISO: string; embarrilladoISO: string | null; rect: DOMRect
  } | null>(null)
  const [guardandoAjusteTanque, setGuardandoAjusteTanque] = useState(false)
  const [errorAjusteTanque, setErrorAjusteTanque] = useState<string | null>(null)
  /** Bloque que acaba de moverse, para que el Gantt lo haga aterrizar con un
   *  latido. Se limpia solo: es feedback de un gesto, no estado del plan. */
  const [bloqueRecienMovido, setBloqueRecienMovido] = useState<string | null>(null)
  const marcarMovido = useCallback((id: string) => {
    setBloqueRecienMovido(id)
    setTimeout(() => setBloqueRecienMovido(a => (a === id ? null : a)), 800)
  }, [])

  /** Los callbacks del arrastre se crean una vez (deps vacías a propósito,
   *  para no re-suscribir listeners a mitad del gesto), así que leen el plan
   *  y la categoría en curso por ref en vez de por closure. */
  const planRef = useRef(plan)
  useEffect(() => { planRef.current = plan }, [plan])
  const arrastreCategoriaRef = useRef<'cerveza' | 'kombucha' | null>(null)

  const diasDe = useCallback((producto: string, categoria: 'cerveza' | 'kombucha') => {
    const c = configGantt.find(x => x.producto === producto)
    // Sin configuración propia, el default por línea: son los del Gantt que
    // se llevaba en Excel, convertidos de días hábiles a corridos.
    return c?.diasFermentacion ?? (categoria === 'cerveza' ? 24 : 12)
  }, [configGantt])

  /** Persiste el movimiento. El ancla de sesión ya movió el bloque en
   *  pantalla, así que esto es confirmación: si falla, se avisa y se recarga
   *  para no dejar la pantalla mostrando algo que la base no tiene. */
  const moverLoteEnGantt = useCallback(async (id: string, destino: DestinoArrastre) => {
    try {
      const r = await fetch(`/api/produccion/plan/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaPlanificada: destino.fecha, fermentador: destino.fermentador }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo mover el lote')
      setPlan(p => p.map(l => l.id === id
        ? { ...l, fechaPlanificada: destino.fecha, fermentador: destino.fermentador }
        : l))
    } catch (e) {
      setErrorPlan(e instanceof Error ? e.message : 'No se pudo mover el lote')
      router.refresh()
    }
  }, [router])

  const puedeSoltarEnCelda = useCallback((destino: DestinoArrastre) => {
    if (destino.fecha < hoyLocalISO()) return false
    // Un tanque de cerveza no fermenta kombucha y al revés: la celda de la
    // otra línea no es un destino válido, y se apaga mientras se arrastra en
    // vez de dejar soltar y avisar después.
    if (destino.fermentador) {
      const t = ocupacionPlanta.tanques.find(x => x.tanque === destino.fermentador)
      const cat = arrastreCategoriaRef.current
      if (t && cat && t.categoria !== cat) return false
    }
    return true
  }, [ocupacionPlanta.tanques])

  const alSoltarEnCelda = useCallback((carga: CargaArrastre, destino: DestinoArrastre) => {
    if (carga.tipo === 'coccion') {
      // Mover una cocción YA CONFIRMADA. Se busca por `carga.id` — el id real
      // de plan_produccion — y no por producto: dos lotes confirmados del
      // mismo producto (agregar uno nuevo a mano cuando ya había otro en la
      // cola) tienen el mismo `producto` y el mismo `loteNro` bobo (los
      // lotes agregados a mano no traen numeración de cocción), así que
      // buscar por nombre encontraba SIEMPRE el primero de la cola y
      // arrastrar el segundo terminaba moviendo el primero.
      //
      // Tampoco se anclan `anclasCoccion`/`anclasTanque` acá: esas dos existen
      // para que `planSugerido` — la SIMULACIÓN de lo que conviene cocer —
      // respete una fecha o tanque que el usuario fijó a mano para una
      // cocción SUGERIDA. Un lote ya confirmado no pasa por esa simulación
      // (planSugerido nunca lee plan_produccion), así que anclarlo con su
      // `loteNro` bobo sólo podía contaminar el ancla real de otra cocción
      // sugerida del mismo producto que sí cayera en el slot "1".
      const lote = planRef.current.find(l => l.id === carga.id && l.estado !== 'cancelado')
      if (lote) { marcarMovido(lote.id); void moverLoteEnGantt(lote.id, destino) }
      return
    }
    void agregarLote({
      producto: carga.producto,
      categoria: carga.categoria,
      litrosPlanificados: carga.litros,
      fechaPlanificada: destino.fecha,
      motivo: carga.motivo ?? 'Arrastrado al Gantt desde las sugerencias del modelo',
      origen: 'sugerido',
      necesidadCubrir: carga.necesidadCubrir ?? null,
      cubreHasta: carga.cubreHasta ?? null,
      fermentador: destino.fermentador,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const { arrastre, propsOrigen } = useArrastreCalendario({
    onSoltar: alSoltarEnCelda,
    puedeSoltarEn: puedeSoltarEnCelda,
  })

  /** Cocciones que la sala puede sacar en un día POR LÍNEA (cervecería y
   *  kombuchería son procesos separados, así que el tope es por cada una).
   *
   *  Sin este tope el calendario era físicamente imposible: como casi todos
   *  los productos ya están bajo su punto de reorden HOY, los 14 disparaban
   *  el mismo día y el plan mostraba 14 cocciones en una sola jornada. Tener
   *  tanque libre no significa poder macerar: la olla es una sola.
   *
   *  Si el número real es otro, se cambia acá y todo el plan se reacomoda
   *  solo — es el único lugar donde vive el supuesto. */
  const COCCIONES_POR_DIA_LINEA = 2


  const planSugerido = useMemo(() => {
    const hoyISO = hoyLocalISO()
    const sumarDiasCalISO = (desde: string, dias: number) =>
      new Date(Date.parse(`${desde}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10)
    const diffDias = (a: string, b: string) =>
      Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)
    const mesDe = (iso: string) => iso.slice(0, 8) + '01'

    interface LoteSugerido {
      id: string; producto: string; categoria: 'cerveza' | 'kombucha'
      litros: number; tanque: string; capacidadTanque: number
      fechaInicio: string; fechaListo: string
      /** Mes en que se COCE (el que agrupa el calendario y el resumen). */
      mes: string
      /** Día en que el reorden pidió esta cocción; si no había tanque libre,
       *  `fechaInicio` es posterior y la diferencia son los `diasTarde`. */
      fechaObjetivo: string; diasTarde: number
      leadTimeSemanas: number; conAlarma: boolean
      loteNro: number; loteDe: number
      /** Cuándo se agota lo que hay si esta cocción no llegara. */
      fechaAgotamiento: string
      /** Hasta cuándo alcanza el stock UNA VEZ que entra esta cocción. */
      cubreHasta: string
      /** El stock no llegó a cero mientras este lote venía en camino. */
      llegaATiempo: boolean
      /** true = NO es una sugerencia: ya está fermentando en el tanque. Se
       *  muestra en el calendario el día que sale, no el día que entró. */
      enCurso: boolean
      /** true si esta cocción está anclada a una fecha que el usuario eligió
       *  arrastrándola en el calendario, en vez de a su punto de reorden. */
      movidoManual: boolean
      /** true si el TANQUE lo eligió el usuario (desplegable de la tarjeta),
       *  no el modelo. Cuando es así, `litros` es la capacidad completa del
       *  tanque elegido, no sólo lo que pedía el punto de reorden — llenarlo
       *  entero cuesta la misma merma que llenarlo a medias, y el excedente
       *  sobre lo pedido queda como stock: la propia simulación lo descuenta
       *  del consumo de los meses siguientes y corre sola la próxima cocción
       *  más adelante (se ve reflejado en `cubreHasta`). */
      tanqueManual: boolean
      /** Sólo para `enCurso`: la fecha de embarrilado ESTIMADA tal cual la
       *  trae el ERP, sin ajustar — puede estar vencida (el enólogo calculó
       *  una fecha y el embarrilado se corrió). El calendario la usa para
       *  posicionar el chip, en vez de `fechaListo` (que sí se recorta a hoy
       *  como mínimo, porque ésa alimenta la simulación de stock y no puede
       *  sumar litros en un día que ya pasó). Null para todo lo demás: las
       *  cocciones sugeridas no tienen esta ambigüedad, `fechaListo` ya es
       *  la fecha real proyectada. */
      fechaEmbarriladoReal: string | null
    }
    interface MesPlan {
      mes: string; etiqueta: string
      litrosCerveza: number; litrosKombucha: number
      lotesCerveza: number; lotesKombucha: number
      lotesTarde: number; severidad: 'critico' | 'ajustado' | 'ok'
    }
    const vacio = {
      lotes: [] as LoteSugerido[],
      porMes: [] as MesPlan[],
      sinTanque: [] as { producto: string; litros: number; motivo: string }[],
    }

    const filasProducto = stockSeguridad.filter(s => s.nivel === 'producto')
    const meses = [...new Set(filasProducto.map(s => s.mes))].sort().slice(0, horizontePlanMeses)
    if (meses.length === 0 || ocupacionPlanta.tanques.length === 0) return vacio

    // El horizonte termina al cerrar el último mes proyectado.
    const [uAnio, uMes] = meses[meses.length - 1].split('-').map(Number)
    const finISO = new Date(Date.UTC(uAnio, uMes, 1)).toISOString().slice(0, 10)

    /* La fecha de arranque sale del Plan Maestro (mismo dato que la pantalla
       de alarmas), no de un cálculo paralelo: si las dos vistas propusieran
       fechas distintas para la misma cocción, el plan deja de ser creíble. */
    const alarmaPorProducto = new Map<string, string>()
    for (const g of alarmasPorProducto) {
      const f = g.items.map(i => i.fechaLimiteInicio).filter((x): x is string => x != null).sort()[0]
      if (f) alarmaPorProducto.set(g.producto, f)
    }
    const lineaFijaPorProducto = new Set(sugerenciasPlan.filter(s => s.lineaFija).map(s => s.producto))

    /* ── 1. Estado inicial de cada producto ───────────────────────────── */
    interface ParamsMes {
      mes: string; consumoDiario: number
      puntoReorden: number; stockSeguridad: number; demandaMensual: number
    }
    interface Estado {
      producto: string; categoria: 'cerveza' | 'kombucha'
      leadTimeSemanas: number; leadDias: number
      lineaFija: boolean; conAlarma: boolean
      forzarEl: string | null
      stock: number
      enCamino: LoteSugerido[]
      params: ParamsMes[]
      pendienteDesde: string | null
      nro: number
      faltante: number
    }
    const estados = new Map<string, Estado>()
    for (const s of filasProducto) {
      if (!meses.includes(s.mes)) continue
      let e = estados.get(s.producto)
      if (!e) {
        const alarma = alarmaPorProducto.get(s.producto)
        e = {
          producto: s.producto, categoria: s.categoria,
          leadTimeSemanas: s.leadTimeSemanas, leadDias: Math.round(s.leadTimeSemanas * 7),
          lineaFija: lineaFijaPorProducto.has(s.producto), conAlarma: !!alarma,
          // Una alarma vencida (el plazo ya pasó) no se agenda en el pasado:
          // se cuece hoy, que es lo antes que se puede hacer algo.
          forzarEl: alarma ? (alarma > hoyISO ? alarma : hoyISO) : null,
          /* SÓLO lo que está envasado en bodega. Los litros que están en un
             fermentador AHORA no son stock: no se pueden vender hasta que se
             embarrilen. Entran más abajo como lotes en curso, con su fecha
             real de salida. Contarlos acá —como se hacía— hacía creer que el
             producto estaba cubierto hoy y atrasaba la cocción siguiente:
             Fisura tiene 3.000 L en el Bright tank T4 que recién salen el
             22-sep, y el plan le daba CERO cocciones en tres meses. */
          stock: s.stockActualLitros ?? 0,
          enCamino: [], params: [], pendienteDesde: null, nro: 0, faltante: 0,
        }
        estados.set(s.producto, e)
      }
      e.params.push({
        mes: s.mes,
        // El consumo se prorratea sobre días corridos: la venta real es de
        // lunes a viernes, pero acá sólo define CUÁNDO se gatilla el reorden,
        // no cuántos litros se cuecen.
        consumoDiario: s.demandaMensualProyectada / 30,
        puntoReorden: s.puntoReordenLitros,
        stockSeguridad: s.stockSeguridadLitros,
        demandaMensual: s.demandaMensualProyectada,
      })
    }
    for (const e of estados.values()) e.params.sort((a, b) => a.mes.localeCompare(b.mes))
    const paramsDe = (e: Estado, mes: string): ParamsMes => {
      let elegido = e.params[0]
      for (const p of e.params) if (p.mes <= mes) elegido = p
      return elegido
    }

    const lotes: LoteSugerido[] = []
    const sinTanque: { producto: string; litros: number; motivo: string }[] = []

    /* ── 1b. Lo que HOY está en los fermentadores ─────────────────────────
       El plan tiene que conversar con la planta real: cada tanque con
       producto es una cocción que ya ocurrió y que va a aterrizar en bodega
       en una fecha concreta. Entra al modelo como un lote EN CURSO —no como
       stock disponible— así que:
         · suma recién el día que se embarrila (y hasta entonces el producto
           puede quebrar, que es justo lo que hay que ver),
         · deja el tanque tomado hasta esa fecha,
         · y aparece en el calendario, para que se vea junto a lo sugerido.
       La fecha viene del ERP (columna "Fecha embarrilado estimada"). Puede
       venir VENCIDA —hoy 3 de los 4 tanques la tienen— porque es la fecha
       que calculó el enólogo y el embarrilado se corrió: en ese caso se toma
       hoy, que es lo antes que ese volumen puede estar disponible. */
    const enCursoPorProducto = new Map<string, number>()
    for (const sf of splitFermentadores) {
      const e = estados.get(sf.producto)
      if (!e) continue
      for (const t of sf.tanques) {
        if (t.litros <= 0) continue
        const sale = t.fechaEstimada && t.fechaEstimada > hoyISO ? t.fechaEstimada : hoyISO
        const lote: LoteSugerido = {
          id: `curso|${t.nombre}|${sf.producto}`,
          producto: sf.producto, categoria: e.categoria,
          litros: Math.round(t.litros), tanque: t.nombre,
          capacidadTanque: ocupacionPlanta.tanques.find(x => x.tanque === t.nombre)?.capacidadLitros ?? t.litros,
          // Una cocción en curso no tiene fecha de inicio conocida (el ERP no
          // la trae): se retrocede el lead time desde la salida, sólo para
          // poder ordenarla. Lo que importa y se muestra es `fechaListo`.
          fechaInicio: sumarDiasCalISO(sale, -e.leadDias),
          fechaListo: sale, mes: mesDe(sale),
          fechaObjetivo: sale, diasTarde: 0,
          leadTimeSemanas: e.leadTimeSemanas, conAlarma: e.conAlarma,
          loteNro: 0, loteDe: 0,
          fechaAgotamiento: sale, cubreHasta: sale,
          llegaATiempo: true, enCurso: true, movidoManual: false, tanqueManual: false,
          fechaEmbarriladoReal: t.fechaEstimada ?? null,
        }
        e.enCamino.push(lote)
        lotes.push(lote)
        enCursoPorProducto.set(sf.producto, (enCursoPorProducto.get(sf.producto) ?? 0) + lote.litros)
      }
    }
    /* Red de seguridad: si el informe declara litros en producción de un
       producto que el split no desglosó por tanque, esos litros no se
       pierden — entran con la fecha estimada del producto, o con un lead
       time completo si tampoco hay. */
    for (const s of filasProducto) {
      if (s.mes !== meses[0]) continue
      const e = estados.get(s.producto)
      if (!e) continue
      const faltan = Math.round(s.litrosEnProduccion - (enCursoPorProducto.get(s.producto) ?? 0))
      if (faltan < 1) continue
      const sf = splitFermentadores.find(x => x.producto === s.producto)
      const sale = sf?.fechaDisponibleEstimada && sf.fechaDisponibleEstimada > hoyISO
        ? sf.fechaDisponibleEstimada
        : sumarDiasCalISO(hoyISO, e.leadDias)
      e.enCamino.push({
        id: `curso|sintanque|${s.producto}`,
        producto: s.producto, categoria: e.categoria,
        litros: faltan, tanque: '—', capacidadTanque: faltan,
        fechaInicio: sumarDiasCalISO(sale, -e.leadDias), fechaListo: sale, mes: mesDe(sale),
        fechaObjetivo: sale, diasTarde: 0,
        leadTimeSemanas: e.leadTimeSemanas, conAlarma: e.conAlarma,
        loteNro: 0, loteDe: 0, fechaAgotamiento: sale, cubreHasta: sale,
        llegaATiempo: true, enCurso: true, movidoManual: false, tanqueManual: false,
        fechaEmbarriladoReal: sf?.fechaDisponibleEstimada ?? null,
      })
    }

    /* ── 2. Desde cuándo queda libre cada tanque ──────────────────────── */
    const libreDesde = new Map<string, string>()
    for (const t of ocupacionPlanta.tanques) libreDesde.set(t.tanque, hoyISO)
    for (const sf of splitFermentadores) {
      const leadDias = (sf.categoria === 'kombucha' ? 3 : 4) * 7
      for (const t of sf.tanques) {
        if (t.litros <= 0) continue
        // Sin fecha del ERP se asume un lead time completo desde hoy:
        // preferible pasarse de conservador a planificar sobre un tanque
        // que en realidad sigue ocupado.
        libreDesde.set(t.nombre, t.fechaEstimada ?? sumarDiasCalISO(hoyISO, leadDias))
      }
    }

    /* ── 3. Simulación día a día ──────────────────────────────────────── */
    const orden = [...estados.values()].sort((a, b) =>
      Number(b.conAlarma) - Number(a.conAlarma) ||
      Number(b.lineaFija) - Number(a.lineaFija) ||
      a.producto.localeCompare(b.producto)
    )
    for (let d = hoyISO; d < finISO; d = sumarDiasCalISO(d, 1)) {
      const mesHoy = mesDe(d)
      /* Cupo de la sala de cocción para ESTE día. Sábados, domingos y
         feriados no tienen cupo: nadie macera un 18 de septiembre. El stock
         igual se sigue vendiendo y consumiendo esos días — lo único que no
         pasa es que se prenda la olla. */
      const coccionesHoy = new Map<'cerveza' | 'kombucha', number>()
      const diaHabil = esDiaHabilISO(d)
      for (const e of orden) {
        const p = paramsDe(e, mesHoy)

        // a) Llega lo que estaba en camino.
        const llegan = e.enCamino.filter(l => l.fechaListo === d)
        if (llegan.length > 0) {
          for (const l of llegan) e.stock += l.litros
          e.enCamino = e.enCamino.filter(l => l.fechaListo !== d)
        }

        // b) Se vende el día.
        e.stock -= p.consumoDiario
        if (e.stock < 0) {
          // Quiebre proyectado: lo que venga en camino ya no alcanzó.
          for (const l of e.enCamino) l.llegaATiempo = false
        }

        /* c) ¿Toca cocer? Dos gatillos: la alarma del Plan Maestro (sólo la
              primera vez) o el punto de reorden del producto.

           OJO con el control de flujo: esto vive dentro del for de productos,
           así que cada salida tiene que ser `continue` (pasar al SIGUIENTE
           producto), nunca `break`. Con `break` el primer producto que no
           necesitaba cocer cortaba el día entero para todos los que venían
           detrás, y el calendario mostraba un solo estilo. */
        const enCaminoLitros = e.enCamino.reduce((s, l) => s + l.litros, 0)
        const posicion = e.stock + enCaminoLitros

        /* ANCLA MANUAL: la fecha que el usuario le puso arrastrando la
           cocción en el calendario. Se identifica por producto + número de
           cocción (la 1ª, la 2ª…) y no por el id del lote, a propósito: al
           mover una cocción se vuelve a simular TODO lo que viene después, y
           los ids se regeneran. "La 2ª cocción de Mocho English" sobrevive a
           esa regeneración; un id no.

           Manda en los dos sentidos, que es lo que hace útil arrastrar:
             · hacia adelante — no se cuece aunque el stock ya haya tocado el
               punto de reorden, porque el usuario la corrió;
             · hacia atrás — se cuece aunque todavía sobre stock.
           Lo que el ancla NO puede saltarse es la planta: si ese día no hay
           tanque libre de su línea, no hay cupo de sala o es feriado, la
           cocción cae en el primer día que sí se pueda y la diferencia queda
           registrada como `diasTarde` contra la fecha pedida. */
        const ancla = anclasCoccion.get(`${e.producto}|${e.nro + 1}`)
        if (ancla && d < ancla) continue
        const anclado = ancla != null
        const forzado = anclado || (e.forzarEl != null && d >= e.forzarEl)
        if (!forzado && posicion > p.puntoReorden) continue
        if (e.nro >= 12) continue
        // La sala de cocción tiene un tope diario, y no se cuece sábado,
        // domingo ni feriado: si no hay cupo, la cocción espera (y ese
        // atraso queda contado más abajo como `diasTarde`). Una sola cocción
        // por producto y por día: dos lotes del mismo estilo el mismo día
        // son dos macerados, no caben en una jornada.
        if (!diaHabil) continue
        if ((coccionesHoy.get(e.categoria) ?? 0) >= COCCIONES_POR_DIA_LINEA) continue

        /* Nivel objetivo de reposición: se repone hasta DEJAR EL INVENTARIO
           POR ENCIMA del punto de reorden, con un mes de venta de holgura.
           Esto tiene que ser mayor que el punto de reorden sí o sí, y no es
           un detalle: el punto de reorden ya cubre el lead time + el período
           de revisión (≈2 meses de venta) más el colchón. Reponer sólo "un
           mes + colchón" deja el stock POR DEBAJO del reorden apenas entra,
           así que el modelo vuelve a pedir cocción al día siguiente, y al
           otro, en pedazos cada vez más chicos. Probado contra los datos
           reales: con ese nivel salían 71 cocciones, varias de 1 y 2 litros
           ocupando un fermentador entero. */
        let objetivo = Math.max(p.puntoReorden + p.demandaMensual - posicion, 0)
        // Una cocción disparada por la alarma del Plan Maestro nunca es un
        // completar de 3 litros: si hay que prender la olla, se cuece al
        // menos un mes de venta.
        if (forzado) objetivo = Math.max(objetivo, p.demandaMensual)
        if (objetivo < 1) continue

        const flota = ocupacionPlanta.tanques.filter(t => t.categoria === e.categoria)
        if (flota.length === 0) {
          sinTanque.push({ producto: e.producto, litros: Math.round(objetivo), motivo: 'No hay fermentadores cargados para esa línea.' })
          e.forzarEl = null
          continue
        }
        if (e.pendienteDesde == null) e.pendienteDesde = anclado && ancla ? ancla : d

        const libres = flota.filter(t => (libreDesde.get(t.tanque) ?? hoyISO) <= d)

        /* ANCLA DE TANQUE: el usuario eligió a mano en qué fermentador cocer
           esta cocción (desplegable de la tarjeta del calendario). Igual que
           el ancla de fecha, nunca se salta la planta — si el tanque elegido
           sigue ocupado hoy, la cocción ESPERA a que se libere (no cae a
           otro tanque en su lugar): eso es justo lo que hace útil elegir,
           coordinar la ocupación real en vez de una preferencia que el
           modelo puede pasar por alto. */
        const tanqueAncla = anclasTanque.get(`${e.producto}|${e.nro + 1}`)
        const forzadoTanque = tanqueAncla ? flota.find(t => t.tanque === tanqueAncla) : undefined

        let elegido: (typeof flota)[number]
        let tanqueManual = false
        if (forzadoTanque) {
          if (!libres.some(t => t.tanque === tanqueAncla)) continue // sigue ocupado: se reintenta mañana
          elegido = forzadoTanque
          tanqueManual = true
        } else {
          if (libres.length === 0) continue // sin capacidad hoy: se reintenta mañana

          /* Elección AUTOMÁTICA — la regla de rentabilidad de la planta.
             La merma de una cocción (fondos, trub, purgas, lo que queda en
             mangueras) es casi la misma cueza 150 L o 3.000 L. Lo que
             encarece el litro no es usar un tanque grande: es PARTIR el
             volumen en varias cocciones, porque cada una paga su propia
             merma y su propia jornada de sala. Así que el criterio es
             minimizar el número de cocciones, y recién después no
             desperdiciar tanque:

               1. Si algún tanque libre cierra TODO el volumen de una vez, se
                  usa el MÁS CHICO que lo cierre. Es una sola cocción igual
                  que con uno grande, pero deja los grandes libres para los
                  volúmenes que sí los necesitan. (Acá caen los casos chicos:
                  22 L de un experimental van al Lavoratorio de 150, no a un
                  T de 1.700 — mismo costo de merma, un fermentador menos
                  bloqueado cuatro semanas.)
               2. Si ninguno alcanza, se usa el MÁS GRANDE disponible y se
                  llena entero. El resto queda para la cocción siguiente.

             La versión anterior —"el mayor tanque que se llene al menos al
             70%"— parecía la misma idea pero hacía lo contrario: con 700 L a
             cocer y un T de 450 libre, tomaba el de 450 y dejaba 250 L
             colgando, que caían al día siguiente en un Lavoratorio de 150, y
             al otro en otro. Cuatro cocciones y cuatro mermas donde cabía
             UNA de 700 L en el de 1.500. Verificado contra los datos reales:
             Imperial Stout salía como 450+150+150+150+292 L. */
          const queCierran = libres.filter(t => t.capacidadLitros >= objetivo)
          elegido = queCierran.length > 0
            ? queCierran.reduce((mejor, t) => (t.capacidadLitros < mejor.capacidadLitros ? t : mejor), queCierran[0])
            : libres.reduce((mejor, t) => (t.capacidadLitros > mejor.capacidadLitros ? t : mejor), libres[0])
        }

        /* Tanque elegido a mano: se llena ENTERO, no sólo lo que pedía el
           punto de reorden — la merma es casi la misma a medias que llena, y
           el excedente sobre `objetivo` queda como stock: la propia
           simulación lo descuenta del consumo de los meses siguientes y
           corre sola la próxima cocción más adelante (se refleja abajo en
           `cubreHasta`). Tanque automático: se respeta el tope de `objetivo`
           como siempre. */
        const litros = Math.round(tanqueManual ? elegido.capacidadLitros : Math.min(objetivo, elegido.capacidadLitros))
        const fechaListo = sumarDiasCalISO(d, e.leadDias)
        const objetivoFecha = e.pendienteDesde ?? d
        const consumo = p.consumoDiario
        e.nro++
        const lote: LoteSugerido = {
          id: `${e.producto}|${d}|${e.nro}`,
          producto: e.producto, categoria: e.categoria,
          litros, tanque: elegido.tanque, capacidadTanque: elegido.capacidadLitros,
          fechaInicio: d, fechaListo, mes: mesHoy,
          fechaObjetivo: objetivoFecha, diasTarde: Math.max(0, diffDias(d, objetivoFecha)),
          leadTimeSemanas: e.leadTimeSemanas, conAlarma: e.conAlarma,
          loteNro: e.nro, loteDe: 0,
          fechaAgotamiento: sumarDiasCalISO(d, consumo > 0 ? Math.max(0, Math.floor(posicion / consumo)) : 3650),
          cubreHasta: sumarDiasCalISO(fechaListo, consumo > 0 ? Math.max(0, Math.floor((posicion + litros) / consumo)) : 3650),
          llegaATiempo: true, enCurso: false, movidoManual: anclado, tanqueManual,
          fechaEmbarriladoReal: null,
        }
        lotes.push(lote)
        e.enCamino.push(lote)
        libreDesde.set(elegido.tanque, fechaListo)
        coccionesHoy.set(e.categoria, (coccionesHoy.get(e.categoria) ?? 0) + 1)
        e.forzarEl = null
        e.pendienteDesde = null
      }
    }

    // Lo que quedó pedido y nunca encontró tanque dentro del horizonte.
    for (const e of orden) {
      if (e.pendienteDesde == null) continue
      const p = paramsDe(e, mesDe(finISO))
      const falta = Math.max(p.demandaMensual + p.stockSeguridad - (e.stock + e.enCamino.reduce((s, l) => s + l.litros, 0)), 0)
      if (falta < 1) continue
      sinTanque.push({
        producto: e.producto, litros: Math.round(falta),
        motivo: 'Pidió cocción pero no hubo ningún fermentador libre de su línea dentro del horizonte.',
      })
    }

    // La numeración "cocción N de M" cuenta sólo lo sugerido: un lote que ya
    // está en el tanque no es una cocción por hacer.
    const sugeridos = lotes.filter(l => !l.enCurso)
    const totalPorProducto = new Map<string, number>()
    for (const l of sugeridos) totalPorProducto.set(l.producto, (totalPorProducto.get(l.producto) ?? 0) + 1)
    for (const l of sugeridos) l.loteDe = totalPorProducto.get(l.producto) ?? 1
    lotes.sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio) || a.producto.localeCompare(b.producto))

    /* ── 4. Resumen mensual, derivado del plan real (no un cálculo aparte) */
    const porMes: MesPlan[] = meses.map(mes => {
      // Litros A COCER del mes: lo que ya está fermentando no se cuece de
      // nuevo, así que queda fuera del resumen (sí se ve en el calendario).
      const delMes = sugeridos.filter(l => l.mes === mes)
      const cerveza = delMes.filter(l => l.categoria === 'cerveza')
      const kombucha = delMes.filter(l => l.categoria === 'kombucha')
      const lotesTarde = delMes.filter(l => !l.llegaATiempo).length
      return {
        mes, etiqueta: etiquetaMes(mes),
        litrosCerveza: cerveza.reduce((s, l) => s + l.litros, 0),
        litrosKombucha: kombucha.reduce((s, l) => s + l.litros, 0),
        lotesCerveza: cerveza.length, lotesKombucha: kombucha.length,
        lotesTarde,
        severidad: (lotesTarde > 0 ? 'critico' : delMes.some(l => l.diasTarde > 0) ? 'ajustado' : 'ok') as MesPlan['severidad'],
      }
    })

    return { lotes, porMes, sinTanque }
  }, [stockSeguridad, alarmasPorProducto, sugerenciasPlan, splitFermentadores, ocupacionPlanta.tanques, anclasCoccion, anclasTanque, horizontePlanMeses])

  /** Confirma la necesidad de un producto para un mes: crea las cocciones ya
   *  partidas por tanque. Se agendan escalonadas dentro del mes, no todas el
   *  día 1 — arrancar cinco cocciones el mismo día no es ejecutable, y dejarlas
   *  amontonadas obligaría a separarlas a mano en el Gantt. Desde ahí se
   *  arrastran a la fecha y el tanque definitivos. */
  const confirmarNecesidad = useCallback(async (
    lotes: { producto: string; categoria: 'cerveza' | 'kombucha'; litros: number; mes: string }[]
  ) => {
    const hoy = hoyLocalISO()
    for (let i = 0; i < lotes.length; i++) {
      const l = lotes[i]
      // Una cocción cada 3 días dentro del mes; nunca en el pasado.
      const base = new Date(Date.parse(`${l.mes}T00:00:00Z`) + i * 3 * 86400000)
        .toISOString().slice(0, 10)
      await agregarLote({
        producto: l.producto,
        categoria: l.categoria,
        litrosPlanificados: l.litros,
        fechaPlanificada: base < hoy ? hoy : base,
        origen: 'sugerido',
        motivo: `Confirmado desde la necesidad mensual de ${l.mes.slice(0, 7)}`,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bloquesGantt = useMemo<BloqueGantt[]>(() => {
    const hoy = hoyLocalISO()
    const confirmados: BloqueGantt[] = plan
      .filter(l => l.estado === 'planificado' || l.estado === 'en_curso')
      .map(l => ({
        id: l.id,
        tipo: 'confirmado' as const,
        producto: l.producto,
        categoria: l.categoria,
        litros: l.litrosPlanificados,
        inicioISO: l.fechaPlanificada,
        dias: l.diasOcupacion ?? diasDe(l.producto, l.categoria),
        fermentador: l.fermentador,
        motivo: l.motivo,
        atrasado: l.fechaPlanificada < hoy && l.estado === 'planificado',
      }))

    // Las sugerencias que YA existen como lote confirmado no se repiten: el
    // plan manda, y ver el mismo producto dos veces en el mismo tanque haría
    // pensar que hay que cocerlo dos veces.
    const yaEnPlan = new Set(confirmados.map(b => `${b.producto}|${b.inicioISO}`))
    const sugeridos: BloqueGantt[] = (planSugerido.lotes ?? [])
      .filter(l => !yaEnPlan.has(`${l.producto}|${l.fechaInicio}`) && esLineaFija(l.producto))
      .map(l => ({
        id: `sug:${l.id}`,
        tipo: 'sugerido' as const,
        producto: l.producto,
        categoria: l.categoria,
        litros: l.litros,
        inicioISO: l.fechaInicio,
        dias: diasDe(l.producto, l.categoria),
        fermentador: l.tanque || null,
        loteNro: l.loteNro,
        motivo: l.llegaATiempo ? null : 'El stock se agota antes de que esta cocción esté lista.',
      }))

    /* Lo que el ERP dice que hay AHORA en los fermentadores, para los tanques
     * que ningún lote 'en_curso' del plan ya cubre. Sin esto, un tanque
     * físicamente ocupado —lo carga el enólogo directo en planta, sin pasar
     * por esta app— sólo se veía como un puntito ámbar junto al nombre del
     * tanque: ocupado, pero sin fecha, sin producto, sin saber desde cuándo.
     *
     * No hay fecha de INICIO en el informe del ERP, sólo la de embarrilado
     * ESTIMADA (columna del enólogo). El inicio se retrocede desde ahí con la
     * duración de fermentación del producto — la misma que usa el resto del
     * Gantt — así que el rango es una reconstrucción, no un dato que el ERP
     * entregó directamente. Si el ERP tampoco trajo la fecha de embarrilado,
     * se asume que arrancó hoy: sigue siendo mejor que el punto sin fecha que
     * había antes, y el motivo lo deja explícito para no confundirlo con un
     * dato firme.
     */
    const tanquesConLoteEnCurso = new Set(
      plan.filter(l => l.estado === 'en_curso' && l.fermentador).map(l => l.fermentador as string)
    )
    // Corrección manual por lote físico (tanque + código de lote del ERP) —
    // ver ajuste_lote_tanque. Se cruza por las dos claves juntas para que un
    // ajuste no se quede pegado al tanque cuando el lote real ya cambió.
    const ajustePorTanqueYCodigo = new Map(
      ajustesTanque.map(a => [`${a.tanque}|${a.codigoLote}`, a])
    )
    const enTanque: BloqueGantt[] = splitFermentadores.flatMap(sf => {
      const categoria = sf.categoria ?? 'cerveza'
      return sf.tanques
        .filter(t => t.litros > 0 && !tanquesConLoteEnCurso.has(t.nombre))
        .map(t => {
          const diasCalculados = diasDe(sf.producto, categoria)
          const conFecha = t.fechaEstimada != null
          // El ERP no siempre trae código de lote. Sin uno, se usa el nombre
          // del tanque como clave — no identifica el lote físico tan bien
          // (una corrección podría "heredarla" el próximo lote que ocupe ese
          // mismo tanque), pero es mejor que dejar el bloque sin poder
          // editarse nunca por faltarle un dato que el ERP no siempre trae.
          const codigoLote = t.codigoLote ?? t.nombre
          const ajuste = ajustePorTanqueYCodigo.get(`${t.nombre}|${codigoLote}`)

          // La fecha de embarrilado que se usa para retroceder es la manual
          // si existe, si no la del ERP. El inicio, en cambio, prioriza la
          // fecha de cocción manual DIRECTA sobre la reconstrucción — es
          // justo el dato que el usuario puede corregir con más certeza que
          // cualquier cálculo hacia atrás.
          const embarrilladoUsado = ajuste?.fechaEmbarriladoManual ?? (t.fechaEstimada as string | null)
          let inicioISO: string
          let dias: number
          if (ajuste?.fechaInicioManual) {
            inicioISO = ajuste.fechaInicioManual
            dias = embarrilladoUsado ? Math.max(1, diffDiasISO(inicioISO, embarrilladoUsado)) : diasCalculados
          } else if (embarrilladoUsado) {
            dias = diasCalculados
            inicioISO = sumarDiasCalISO(embarrilladoUsado, -dias)
          } else {
            dias = diasCalculados
            inicioISO = hoy
          }

          return {
            id: `erp:${t.nombre}`,
            tipo: 'en_tanque' as const,
            producto: sf.producto,
            categoria,
            litros: t.litros,
            inicioISO,
            dias,
            fermentador: t.nombre,
            codigoLote,
            motivo: ajuste
              ? 'Fecha corregida a mano para este lote.'
              : conFecha
                ? `Detectado en el informe del ERP — inicio estimado hacia atrás desde el embarrilado que calculó el enólogo (${t.fechaEstimada}). Clic para corregir.`
                : 'Detectado en el informe del ERP — sin fecha de embarrilado en el informe, se asume que arrancó hoy. Clic para corregir.',
          }
        })
    })

    return [...confirmados, ...sugeridos, ...enTanque]
  }, [plan, planSugerido.lotes, diasDe, splitFermentadores, ajustesTanque])

  /** Necesidad del paso 2 contra lo agendado, mes a mes. Se calcula con el
   *  MISMO criterio que la tabla de necesidad (límite superior del forecast,
   *  que es la base con la que se viene trabajando) para que las dos
   *  pantallas no muestren dos verdades distintas del mismo mes. */
  const coberturaGantt = useMemo(() => {
    const meses = [...new Set(
      series.filter(s => s.nivel === 'producto')
        .flatMap(s => s.puntos.filter(p => p.tipo === 'forecast').map(p => p.mes))
    )].sort().slice(0, 4)

    return meses.map(mes => {
      const necesidad = series
        .filter(s => s.nivel === 'producto')
        .reduce((a, s) => {
          const p = s.puntos.find(x => x.mes === mes && x.tipo === 'forecast')
          return a + (p?.litrosMax ?? p?.litros ?? 0)
        }, 0)
      const planificado = plan
        .filter(l => l.estado !== 'cancelado' && l.estado !== 'completado'
          && l.fechaPlanificada.slice(0, 8) + '01' === mes)
        .reduce((a, l) => a + l.litrosPlanificados, 0)
      return { mes, necesidad: Math.round(necesidad), planificado }
    })
  }, [series, plan])

  /** Stock de hoy y ritmo de venta proyectado por producto, para que el Gantt
   *  calcule hasta cuándo alcanza. El ritmo sale del forecast mes a mes y no
   *  de un promedio plano: diciembre consume más rápido que septiembre, y la
   *  fecha de quiebre tiene que reflejarlo. */
  const necesidadGantt = useMemo(() => {
    const stockPorProducto = new Map<string, number>()
    /* El colchón de cada producto, para que el Gantt sepa dónde poner el
       ámbar. Se toma la fila del mes más cercano (la primera, que es como ya
       se toma el stock actual): el stock de seguridad cambia mes a mes con la
       estacionalidad, y el que importa para decidir hoy es el de hoy. */
    const colchonPorProducto = new Map<string, number>()
    for (const ss of stockSeguridad) {
      if (ss.nivel !== 'producto' || ss.stockActualLitros == null) continue
      if (!stockPorProducto.has(ss.producto)) stockPorProducto.set(ss.producto, ss.stockActualLitros)
      if (!colchonPorProducto.has(ss.producto)) colchonPorProducto.set(ss.producto, ss.stockSeguridadLitros)
    }
    return series
      // Sólo el catálogo estable. Un rotativo que se agota no es una alarma:
      // se agota porque dejó de producirse a propósito.
      .filter(s => s.nivel === 'producto' && s.producto && esLineaFija(s.producto))
      .map(s => {
        const ritmo = s.puntos
          .filter(p => p.tipo === 'forecast')
          .map(p => {
            const d = new Date(Date.parse(p.mes + 'T00:00:00Z'))
            const diasDelMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
            return { mes: p.mes, litrosDia: p.litros / diasDelMes }
          })
        return {
          producto: s.producto as string,
          categoria: (s.categoria === 'kombucha' ? 'kombucha' : 'cerveza') as 'cerveza' | 'kombucha',
          stockActual: stockPorProducto.get(s.producto as string) ?? 0,
          colchon: colchonPorProducto.get(s.producto as string),
          ritmo,
        }
      })
      .filter(n => n.ritmo.length > 0)
  }, [series, stockSeguridad])

  /** Último mes proyectado: hasta ahí llega la grilla del Gantt. */
  const ultimoMesForecast = useMemo(() => {
    const meses = series
      .filter(s => s.nivel === 'producto')
      .flatMap(s => s.puntos.filter(p => p.tipo === 'forecast').map(p => p.mes))
    return meses.length > 0 ? meses.sort()[meses.length - 1] : null
  }, [series])

  const fermentadoresGantt = useMemo(
    () => ocupacionPlanta.tanques.map(t => ({
      nombre: t.tanque, tipo: t.tipo, categoria: t.categoria as 'cerveza' | 'kombucha',
      capacidadLitros: t.capacidadLitros, litrosActuales: t.litros,
    })),
    [ocupacionPlanta.tanques]
  )


  /** Mes que muestra el calendario diario — 0 = mes actual, navegable con
   *  las flechas. Sólo cambia qué página del plan ya calculado se mira; el
   *  horizonte de planificación son siempre 3 meses. */
  // El navegador de mes vivía en la cabecera del calendario que reemplazó el
  // Gantt (que trae el suyo, por semanas). `calendarioCobertura` sigue
  // alimentando las tarjetas de cocciones, así que el offset queda fijo en el
  // mes en curso en vez de arrastrar un setter que ya nadie llama.
  const mesCoberturaOffset = 0

  /* ── Calendario diario: proyección del plan sobre el mes visible ─────── */
  const calendarioCobertura = useMemo(() => {
    const hoy = new Date()
    const base = new Date(hoy.getFullYear(), hoy.getMonth() + mesCoberturaOffset, 1)
    const anio = base.getFullYear(), mesIdx = base.getMonth()
    const diasEnMesCal = new Date(anio, mesIdx + 1, 0).getDate()
    const offsetPrimerDia = (new Date(anio, mesIdx, 1).getDay() + 6) % 7

    const porDia = new Map<number, typeof planSugerido.lotes>()
    for (const l of planSugerido.lotes) {
      // Una cocción sugerida se muestra el día que hay que PRENDER LA OLLA.
      // Una que ya está en el tanque, el día real de EMBARRILADO que trae el
      // ERP — aunque esté vencido: eso es justo lo que hay que ver (un
      // fermentador que debió liberarse hace días y sigue con producto), no
      // esconderlo bajo "hoy". `fechaListo` (que sí se recorta a hoy) sólo
      // alimenta la simulación de stock, no la posición en el calendario.
      const posicion = l.enCurso ? (l.fechaEmbarriladoReal ?? l.fechaListo) : l.fechaInicio
      const [y, m, d] = posicion.split('-').map(Number)
      if (y !== anio || m !== mesIdx + 1) continue
      if (!porDia.has(d)) porDia.set(d, [])
      porDia.get(d)!.push(l)
    }
    const dias = Array.from({ length: diasEnMesCal }, (_, i) => ({ dia: i + 1, lotes: porDia.get(i + 1) ?? [] }))
    return {
      dias, offsetPrimerDia, anio, mesIdx, hoyISO: hoyLocalISO(),
      etiqueta: base.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
      lotesEnElMes: [...porDia.values()].reduce((s, arr) => s + arr.length, 0),
    }
  }, [planSugerido, mesCoberturaOffset])

  /* ══════════ PRESUPUESTO DE INSUMOS DEL CALENDARIO ══════════
     Toma las cocciones SELECCIONADAS del calendario, las baja a insumos por
     receta y las valoriza. Es distinto del MRP de más abajo y de "Presupuesto
     de insumos mes a mes": aquéllos parten del forecast agregado ("cuántos
     litros voy a vender"), éste parte del PLAN CONCRETO ("estas cocciones,
     estos días, en estos tanques"), así que cada peso tiene una cocción con
     fecha detrás y se puede emitir la orden de compra.

     Lo que aporta y no existía:
       · Fecha de compra por insumo: la cocción menos el lead time de compra.
       · Selección: se presupuesta lo que el usuario marca, no todo.
       · Ventana libre de meses (mensual, trimestral, lo que elija).
       · Exportable a Excel como orden de compra. */

  /** Lead time de compra de insumos: días HÁBILES entre emitir la orden y
   *  tener el insumo en planta. Se deriva de LEAD_TIME_INSUMOS_SEMANAS (misma
   *  constante que usa el punto de reorden de Necesidad de Producción
   *  Anticipada y las Alarmas de quiebre de stock, ver lib/produccion/reglas)
   *  para no mantener dos números de "cuánto se demora un insumo" por
   *  separado — actualizado 16-sep-2026 de 1 a 2 semanas (5→10 días hábiles)
   *  con el tiempo real que toma la gestión con los proveedores, medido por
   *  el usuario. */
  const LEAD_COMPRA_DIAS_HABILES = LEAD_TIME_INSUMOS_SEMANAS * 5

  /** Ninguna cocción SUGERIDA arranca marcada para el presupuesto — ni
   *  siquiera las de este mes. Toda sugerencia es una proyección (forecast +
   *  punto de reorden + tanque asignado por el modelo, no algo que ya se
   *  decidió cocer), así que ninguna debería sumar plata al presupuesto sin
   *  que alguien la mire primero y la active a mano.
   *
   *  Las cocciones EN CURSO (ya en un fermentador) son la única excepción, y
   *  ni siquiera pasan por acá: no son una sugerencia que activar, ya
   *  ocurrieron — quedan afuera del set de selección directamente (`!l.enCurso`
   *  en `lotesEnVentana` más abajo), se ven en el calendario en azul, y nunca
   *  entran al presupuesto porque sus insumos ya se compraron. */
  const [togglesPresupuesto, setTogglesPresupuesto] = useState<Set<string>>(new Set())
  const [presupuestoDesde, setPresupuestoDesde] = useState<string>('')
  const [presupuestoHasta, setPresupuestoHasta] = useState<string>('')
  const [vistaPresupuesto, setVistaPresupuesto] = useState<'insumo' | 'producto'>('insumo')
  const [descargando, setDescargando] = useState(false)

  /** Lotes CONFIRMADOS (plan_produccion, estado 'planificado') que
   *  planSugerido no generó por su cuenta — un producto agregado a mano
   *  desde el Gantt ("Agregar producto"), o cualquiera fuera de las
   *  LINEAS_FIJAS que la simulación no cubre (planSugerido sólo mira ésas).
   *
   *  Sin esto, confirmar algo en el Gantt no movía un peso el presupuesto:
   *  esta sección leía sólo lo que el MODELO propone, nunca lo que el
   *  usuario ya decidió cocer — que es justo lo que se supone que hay que
   *  poder comprar. 'en_curso' queda afuera igual que en `lotesEnVentana`
   *  más abajo: sus insumos ya se compraron.
   *
   *  Se dedupe contra planSugerido por producto+fecha para no mostrar dos
   *  veces la misma cocción cuando la simulación ya la generó (mismo
   *  criterio que `yaEnPlan` en bloquesGantt, más arriba). */
  const lotesConfirmadosParaPresupuesto = useMemo(() => {
    const yaSimulado = new Set(planSugerido.lotes.map(l => `${l.producto}|${l.fechaInicio}`))
    return plan
      .filter(l => l.estado === 'planificado' && !yaSimulado.has(`${l.producto}|${l.fechaPlanificada}`))
      .map(l => {
        const dias = l.diasOcupacion ?? diasDe(l.producto, l.categoria)
        const fechaListo = sumarDiasCalISO(l.fechaPlanificada, dias)
        const capacidadTanque = l.fermentador
          ? ocupacionPlanta.tanques.find(t => t.tanque === l.fermentador)?.capacidadLitros ?? l.litrosPlanificados
          : l.litrosPlanificados
        const leadTimeSemanas = stockSeguridad.find(s => s.nivel === 'producto' && s.producto === l.producto)?.leadTimeSemanas ?? 4
        return {
          id: l.id, producto: l.producto, categoria: l.categoria,
          litros: l.litrosPlanificados, tanque: l.fermentador ?? '—', capacidadTanque,
          fechaInicio: l.fechaPlanificada, fechaListo, mes: l.fechaPlanificada.slice(0, 8) + '01',
          fechaObjetivo: l.fechaPlanificada, diasTarde: 0,
          leadTimeSemanas, conAlarma: false, loteNro: 1, loteDe: 1,
          // No hay proyección de stock detrás de un lote agregado a mano —
          // eso lo calcula planSugerido, y este lote quedó afuera de esa
          // simulación a propósito. Se deja optimista (llega a tiempo, cubre
          // hasta que sale) en vez de inventar un número.
          fechaAgotamiento: fechaListo, cubreHasta: fechaListo,
          llegaATiempo: true, enCurso: false,
          movidoManual: l.fermentador != null, tanqueManual: l.fermentador != null,
          fechaEmbarriladoReal: null,
        }
      })
  }, [plan, planSugerido.lotes, diasDe, ocupacionPlanta.tanques, stockSeguridad])

  const idsConfirmadosPresupuesto = useMemo(
    () => new Set(lotesConfirmadosParaPresupuesto.map(l => l.id)),
    [lotesConfirmadosParaPresupuesto]
  )

  const lotesPresupuestables = useMemo(
    () => [...planSugerido.lotes, ...lotesConfirmadosParaPresupuesto],
    [planSugerido.lotes, lotesConfirmadosParaPresupuesto]
  )

  /** Meses que ofrece el selector de ventana: los que tienen cocciones. */
  const mesesPlan = useMemo(
    () => [...new Set(lotesPresupuestables.filter(l => !l.enCurso).map(l => l.fechaInicio.slice(0, 7)))].sort(),
    [lotesPresupuestables]
  )
  const ventanaDesde = presupuestoDesde || mesesPlan[0] || ''
  const ventanaHasta = presupuestoHasta || mesesPlan[mesesPlan.length - 1] || ''

  /** Cocciones dentro de la ventana elegida. Una cocción EN CURSO no entra
   *  nunca: sus insumos ya se compraron y ya están en el tanque. */
  const lotesEnVentana = useMemo(
    () => lotesPresupuestables.filter(l =>
      !l.enCurso && l.fechaInicio.slice(0, 7) >= ventanaDesde && l.fechaInicio.slice(0, 7) <= ventanaHasta
    ),
    [lotesPresupuestables, ventanaDesde, ventanaHasta]
  )
  /** Una SUGERENCIA arranca sin marcar (hay que activarla a mano, ver el
   *  comentario de arriba); un lote ya CONFIRMADO arranca marcado — el
   *  usuario ya decidió cocerlo, así que ya debería sumar al presupuesto sin
   *  que haga falta un segundo clic para lo que ya es un hecho. El mismo Set
   *  sirve para las dos cosas con sentido invertido según el caso: para un
   *  confirmado, estar en el Set es haberlo EXCLUIDO a mano. */
  const estaSeleccionado = (l: { id: string }) =>
    idsConfirmadosPresupuesto.has(l.id) ? !togglesPresupuesto.has(l.id) : togglesPresupuesto.has(l.id)
  const alternarLote = (l: { id: string }) => {
    setTogglesPresupuesto(prev => {
      const siguiente = new Set(prev)
      if (siguiente.has(l.id)) siguiente.delete(l.id); else siguiente.add(l.id)
      return siguiente
    })
  }

  /** Redondea un desglose por mes de forma que la suma dé EXACTAMENTE el
   *  total. Redondear cada mes por su cuenta deja un descuadre de unos pesos
   *  (el total se redondea una vez por insumo y el desglose una vez por
   *  insumo y mes), y un presupuesto cuyos meses no suman el total se lee
   *  como roto aunque la diferencia sea $87 sobre $16 millones. Método del
   *  resto mayor: se redondea hacia abajo y los pesos que sobran van a los
   *  meses con el decimal más grande. */
  function repartirExacto(entradas: [string, number][], total: number) {
    if (entradas.length === 0) return []
    /* Primero se escalan los meses para que su suma sea el total. Hace falta
       porque las dos cifras se calculan por caminos distintos: el total sale
       de redondear `precio × a-comprar` UNA vez por insumo, y el desglose de
       repartir cantidades sin redondear entre las cocciones. Sobre $16
       millones la diferencia era de $87 — invisible en plata, pero deja el
       desglose sin cuadrar con su propio total. */
    const sumaCruda = entradas.reduce((s, [, v]) => s + v, 0)
    const factor = sumaCruda > 0 ? total / sumaCruda : 0
    const piso = entradas.map(([mes, v]) => {
      const ajustado = v * factor
      return { mes, costo: Math.floor(ajustado), resto: ajustado - Math.floor(ajustado) }
    })
    let sobran = total - piso.reduce((s, p) => s + p.costo, 0)
    for (const p of [...piso].sort((a, b) => b.resto - a.resto)) {
      if (sobran <= 0) break
      p.costo++
      sobran--
    }
    return piso.map(({ mes, costo }) => ({ mes, costo }))
  }

  const presupuesto = useMemo(() => {
    interface LineaInsumo {
      insumo: string; categoria: string; unidadBase: 'gr' | 'ml'
      cantidad: number; precioUnitario: number | null; costo: number | null
      /** Lo antes que hay que emitir la orden para que llegue a tiempo. */
      fechaCompra: string
      /** Qué cocciones lo piden — el vínculo producto → insumo que hace
       *  auditable cada línea del presupuesto. */
      detalle: {
        producto: string; fechaCoccion: string; fechaCompra: string
        litros: number; tanque: string; cantidad: number; costo: number | null
      }[]
      disponible: number | null
      aComprar: number
      costoAComprar: number | null
    }
    interface GrupoProducto {
      producto: string; cocciones: number; litros: number
      costo: number | null; sinPrecio: number
      insumos: { insumo: string; cantidad: number; unidadBase: 'gr' | 'ml'; costo: number | null }[]
    }
    const vacio = {
      lineas: [] as LineaInsumo[], porProducto: [] as GrupoProducto[],
      porMesCompra: [] as { mes: string; costo: number }[],
      total: 0, totalBruto: 0, cocciones: 0, litros: 0,
      sinPrecio: [] as string[], sinReceta: [] as string[],
    }

    const seleccionados = lotesEnVentana.filter(l => estaSeleccionado(l))
    if (seleccionados.length === 0) return vacio

    const disponiblePorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.disponible]))
    const lineasPorProducto = new Map<string, RecetaInsumoLinea[]>()
    for (const l of recetaInsumos) {
      const arr = lineasPorProducto.get(l.producto) ?? []
      arr.push(l)
      lineasPorProducto.set(l.producto, arr)
    }

    const porInsumo = new Map<string, LineaInsumo>()
    const porProducto = new Map<string, GrupoProducto>()
    const sinReceta = new Set<string>()
    const sinPrecio = new Set<string>()

    for (const lote of seleccionados) {
      const receta = lineasPorProducto.get(lote.producto)
      if (!receta || receta.length === 0) { sinReceta.add(lote.producto); continue }
      const fechaCompra = restarDiasHabilesISO(lote.fechaInicio, LEAD_COMPRA_DIAS_HABILES)

      const grupo = porProducto.get(lote.producto)
        ?? { producto: lote.producto, cocciones: 0, litros: 0, costo: 0 as number | null, sinPrecio: 0, insumos: [] }
      grupo.cocciones++
      grupo.litros += lote.litros

      for (const linea of receta) {
        // La receta está escrita para `litrosBase`; se escala al volumen real
        // de ESTA cocción, que sale del tamaño del tanque asignado.
        const cantidad = linea.cantidadPorLote * (lote.litros / linea.litrosBase)
        const costo = linea.precioUnitario != null ? cantidad * linea.precioUnitario : null
        if (linea.precioUnitario == null) { sinPrecio.add(linea.insumo); grupo.sinPrecio++ }
        else if (grupo.costo != null) grupo.costo += costo ?? 0

        /* Un mismo insumo puede venir varias veces en la misma receta con
           distinto uso (el mismo lúpulo en whirlpool y en dry hop, por
           ejemplo — verificado en los datos: pasa en 5 recetas). Para cocer
           son momentos distintos; para COMPRAR es el mismo saco, así que acá
           se suman. */
        const acc = porInsumo.get(linea.insumo) ?? {
          insumo: linea.insumo, categoria: linea.categoria, unidadBase: linea.unidadBase,
          cantidad: 0, precioUnitario: linea.precioUnitario, costo: linea.precioUnitario != null ? 0 : null,
          fechaCompra, detalle: [], disponible: disponiblePorInsumo.get(linea.insumo) ?? null,
          aComprar: 0, costoAComprar: null,
        }
        acc.cantidad += cantidad
        if (acc.costo != null && costo != null) acc.costo += costo
        // La fecha que manda es la MÁS TEMPRANA: si el insumo se usa en tres
        // cocciones, la orden hay que emitirla para la primera.
        if (fechaCompra < acc.fechaCompra) acc.fechaCompra = fechaCompra
        const yaEsaCoccion = acc.detalle.find(d => d.producto === lote.producto && d.fechaCoccion === lote.fechaInicio)
        if (yaEsaCoccion) {
          yaEsaCoccion.cantidad += cantidad
          if (yaEsaCoccion.costo != null && costo != null) yaEsaCoccion.costo += costo
        } else {
          acc.detalle.push({
            producto: lote.producto, fechaCoccion: lote.fechaInicio, fechaCompra,
            litros: lote.litros, tanque: lote.tanque, cantidad, costo,
          })
        }
        porInsumo.set(linea.insumo, acc)

        const gi = grupo.insumos.find(x => x.insumo === linea.insumo)
        if (gi) { gi.cantidad += cantidad; if (gi.costo != null && costo != null) gi.costo += costo }
        else grupo.insumos.push({ insumo: linea.insumo, cantidad, unidadBase: linea.unidadBase, costo })
      }
      porProducto.set(lote.producto, grupo)
    }

    /* Neteo contra el inventario de insumos que ya hay en bodega: no se
       compra lo que está en la estantería. Es una aproximación deliberada —
       el stock se descuenta del total del período, no cocción por cocción,
       porque el informe de insumos es una foto sin reservas por lote. Por eso
       se muestran las dos cifras (necesidad y a comprar) y no sólo una. */
    const lineas = [...porInsumo.values()].map(l => {
      const cantidad = Math.round(l.cantidad)
      const aComprar = l.disponible != null ? Math.max(cantidad - l.disponible, 0) : cantidad
      return {
        ...l, cantidad,
        costo: l.costo != null ? Math.round(l.costo) : null,
        aComprar,
        costoAComprar: l.precioUnitario != null ? Math.round(l.precioUnitario * aComprar) : null,
        detalle: l.detalle.sort((a, b) => a.fechaCoccion.localeCompare(b.fechaCoccion)),
      }
    }).sort((a, b) => (b.costoAComprar ?? 0) - (a.costoAComprar ?? 0) || a.insumo.localeCompare(b.insumo))

    /* Desembolso por mes: se reparte COCCIÓN POR COCCIÓN, no se carga entero
       al mes de la compra más temprana. La diferencia no es cosmética: un
       insumo que usan cocciones de septiembre, octubre y noviembre tiene una
       sola `fechaCompra` (la más temprana, que es cuando hay que emitir la
       primera orden), y cargarle todo el costo a ese mes metía el presupuesto
       entero en el primer mes del horizonte. Con el reparto, cada mes muestra
       lo que de verdad hay que desembolsar.

       El stock de bodega se asigna a las cocciones MÁS TEMPRANAS primero
       (FIFO): lo que ya está en la estantería se consume en la próxima
       cocción, no se reserva para diciembre. Por construcción la suma de los
       meses da exactamente el mismo total que la línea agregada. */
    const porMes = new Map<string, number>()
    for (const l of lineas) {
      if (l.precioUnitario == null) continue
      let cubiertoPorBodega = l.disponible ?? 0
      for (const d of l.detalle) {
        const desdeBodega = Math.min(cubiertoPorBodega, d.cantidad)
        cubiertoPorBodega -= desdeBodega
        const aComprarAcá = d.cantidad - desdeBodega
        if (aComprarAcá <= 0) continue
        const mes = d.fechaCompra.slice(0, 7)
        porMes.set(mes, (porMes.get(mes) ?? 0) + l.precioUnitario * aComprarAcá)
      }
    }

    return {
      lineas,
      porProducto: [...porProducto.values()]
        .map(g => ({ ...g, litros: Math.round(g.litros), costo: g.costo != null ? Math.round(g.costo) : null,
          insumos: g.insumos.map(i => ({ ...i, cantidad: Math.round(i.cantidad), costo: i.costo != null ? Math.round(i.costo) : null }))
            .sort((a, b) => (b.costo ?? 0) - (a.costo ?? 0)) }))
        .sort((a, b) => (b.costo ?? 0) - (a.costo ?? 0)),
      porMesCompra: repartirExacto([...porMes.entries()].sort(), lineas.reduce((s, l) => s + (l.costoAComprar ?? 0), 0)),
      total: lineas.reduce((s, l) => s + (l.costoAComprar ?? 0), 0),
      totalBruto: lineas.reduce((s, l) => s + (l.costo ?? 0), 0),
      cocciones: seleccionados.length,
      litros: seleccionados.reduce((s, l) => s + l.litros, 0),
      sinPrecio: [...sinPrecio].sort(),
      sinReceta: [...sinReceta].sort(),
    }
    // `estaSeleccionado` se deriva de togglesPresupuesto, que ya está en la
    // lista — no hace falta como dependencia propia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotesEnVentana, togglesPresupuesto, recetaInsumos, stockInsumos])

  /** Excel de orden de compra. El xlsx se carga sólo al apretar el botón
   *  (import dinámico): es una librería pesada y no tiene por qué viajar en
   *  el bundle de todos los que abren Producción. */
  async function descargarPresupuesto() {
    if (presupuesto.lineas.length === 0) return
    setDescargando(true)
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.utils.book_new()

      // Hoja 1 — la orden de compra propiamente tal.
      const compra = presupuesto.lineas.map(l => ({
        'Fecha de compra': l.fechaCompra,
        'Insumo': l.insumo,
        'Categoría': l.categoria,
        'Necesidad total': l.cantidad,
        'En bodega': l.disponible ?? '',
        'A comprar': l.aComprar,
        'Unidad': l.unidadBase,
        'Precio unitario': l.precioUnitario ?? '',
        'Costo a comprar': l.costoAComprar ?? '',
        'Para cocciones': l.detalle.map(d => `${d.producto} ${d.fechaCoccion} (${Math.round(d.litros)} L)`).join(' · '),
      }))
      compra.push({
        'Fecha de compra': '', 'Insumo': 'TOTAL', 'Categoría': '', 'Necesidad total': '' as never,
        'En bodega': '', 'A comprar': '' as never, 'Unidad': '' as never, 'Precio unitario': '',
        'Costo a comprar': presupuesto.total, 'Para cocciones': '',
      })
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(compra), 'Orden de compra')

      // Hoja 2 — el vínculo cocción → insumo, línea por línea, para auditar
      // de dónde sale cada peso.
      const detalle: Record<string, string | number>[] = []
      for (const l of presupuesto.lineas) {
        for (const d of l.detalle) {
          detalle.push({
            'Fecha de compra': d.fechaCompra, 'Fecha de cocción': d.fechaCoccion,
            'Producto': d.producto, 'Litros': Math.round(d.litros), 'Tanque': d.tanque,
            'Insumo': l.insumo, 'Cantidad': Math.round(d.cantidad), 'Unidad': l.unidadBase,
            'Precio unitario': l.precioUnitario ?? '', 'Costo': d.costo != null ? Math.round(d.costo) : '',
          })
        }
      }
      detalle.sort((a, b) => String(a['Fecha de compra']).localeCompare(String(b['Fecha de compra'])))
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalle), 'Detalle por cocción')

      // Hoja 3 — resumen por producto y por mes de compra.
      const resumen: Record<string, string | number>[] = [
        { Concepto: 'Ventana', Valor: `${ventanaDesde} a ${ventanaHasta}` },
        { Concepto: 'Cocciones consideradas', Valor: presupuesto.cocciones },
        { Concepto: 'Litros a producir', Valor: presupuesto.litros },
        { Concepto: 'Costo insumos (necesidad total)', Valor: presupuesto.totalBruto },
        { Concepto: 'Costo a comprar (neto de bodega)', Valor: presupuesto.total },
        { Concepto: '', Valor: '' },
        { Concepto: 'POR MES DE COMPRA', Valor: '' },
        ...presupuesto.porMesCompra.map(m => ({ Concepto: m.mes, Valor: m.costo })),
        { Concepto: '', Valor: '' },
        { Concepto: 'POR PRODUCTO', Valor: '' },
        ...presupuesto.porProducto.map(p => ({ Concepto: `${p.producto} (${p.cocciones} cocc., ${p.litros} L)`, Valor: p.costo ?? '' })),
      ]
      if (presupuesto.sinPrecio.length > 0) {
        resumen.push({ Concepto: '', Valor: '' },
          { Concepto: 'INSUMOS SIN PRECIO (quedaron fuera del total)', Valor: presupuesto.sinPrecio.join(', ') })
      }
      if (presupuesto.sinReceta.length > 0) {
        resumen.push({ Concepto: 'PRODUCTOS SIN RECETA (no se pudo costear)', Valor: presupuesto.sinReceta.join(', ') })
      }
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), 'Resumen')

      XLSX.writeFile(libro, `presupuesto-insumos-${ventanaDesde}-a-${ventanaHasta}.xlsx`)
    } finally {
      setDescargando(false)
    }
  }

  /* ── Inventario actual agrupado: producto → formato → cámara ───────────
     `stock` llega como una fila por (producto, formato, cámara) — se
     reagrupa acá para que la tabla muestre de un vistazo cuánto hay de cada
     producto, segmentado entre lata y barril 30L/50L, y en qué depósito
     está cada parte (un barril de 30L en Frío Planta no sirve para lo mismo
     que uno en Barrios Bajos si hay que ir a buscarlo). */
  const inventarioAgrupado = useMemo(() => {
    interface FilaCamara { camara: string; cantidad: number; litros: number | null }
    interface GrupoFormato { bucket: EnvaseBucket; cantidad: number; litros: number | null; camaras: FilaCamara[] }
    interface GrupoProducto { producto: string; categoria: string | null; cantidad: number; litros: number | null; formatos: GrupoFormato[] }

    const porProducto = new Map<string, GrupoProducto>()
    for (const s of stock) {
      let grupo = porProducto.get(s.producto)
      if (!grupo) {
        grupo = { producto: s.producto, categoria: s.categoria, cantidad: 0, litros: null, formatos: [] }
        porProducto.set(s.producto, grupo)
      }
      grupo.cantidad += s.cantidad
      if (s.litros != null) grupo.litros = (grupo.litros ?? 0) + s.litros

      let formato = grupo.formatos.find(f => f.bucket === s.envaseBucket)
      if (!formato) {
        formato = { bucket: s.envaseBucket, cantidad: 0, litros: null, camaras: [] }
        grupo.formatos.push(formato)
      }
      formato.cantidad += s.cantidad
      if (s.litros != null) formato.litros = (formato.litros ?? 0) + s.litros

      const nombreCamara = s.camara ?? 'Sin cámara'
      let filaCamara = formato.camaras.find(c => c.camara === nombreCamara)
      if (!filaCamara) {
        filaCamara = { camara: nombreCamara, cantidad: 0, litros: null }
        formato.camaras.push(filaCamara)
      }
      filaCamara.cantidad += s.cantidad
      if (s.litros != null) filaCamara.litros = (filaCamara.litros ?? 0) + s.litros
    }

    const resultado = [...porProducto.values()]
    for (const g of resultado) {
      g.formatos.sort((a, b) => ORDEN_ENVASE.indexOf(a.bucket) - ORDEN_ENVASE.indexOf(b.bucket))
      for (const f of g.formatos) f.camaras.sort((a, b) => b.cantidad - a.cantidad)
    }
    resultado.sort((a, b) => (b.litros ?? 0) - (a.litros ?? 0) || b.cantidad - a.cantidad)
    return resultado
  }, [stock])

  /* ── Contadores del menú ───────────────────────────────────────────────
     Sólo los que se pueden calcular de verdad: advertencias del modelo y
     productos en o bajo su punto de reorden. Las secciones de maqueta no
     llevan número — inventar uno ahí sería peor que no mostrarlo. */
  const alertasPorTab = useMemo<Partial<Record<TabId, number>>>(() => ({
    forecasting: advertencias.length,
    seguridad: filasStockSeguridad.filter(f => f.estado === 'critico' || f.estado === 'bajo').length,
    // Una cocción que no alcanza a estar lista antes de que el producto se
    // agote es exactamente lo que hay que ver sin entrar a la pantalla.
    calendario: planSugerido.lotes.filter(l => !l.enCurso && !l.llegaATiempo).length
      + planSugerido.sinTanque.length,
  }), [advertencias.length, filasStockSeguridad, planSugerido])

  // Antes se derivaba de necesidadInsumos, que con la cola de producción
  // vacía queda vacío también (aunque el stock SÍ esté cargado) — ese falso
  // "sin dato" fue justamente la confusión que reportó el usuario, 11-sep-2026.
  const stockInsumosVacio = stockInsumos.every(i => i.disponible == null)
  const insumosFiltrados = necesidadInsumos.filter(i =>
    i.insumo.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
    i.categoria.toLowerCase().includes(busquedaInsumo.toLowerCase())
  )
  const stockInsumosFiltrado = stockInsumos.filter(i =>
    i.insumo.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
    i.categoria.toLowerCase().includes(busquedaInsumo.toLowerCase())
  )

  /* ── MRP neto simple ──────────────────────────────────────────────────
     A diferencia de "Necesidad de Insumos" (que sólo escala los lotes YA
     en la cola del Plan Maestro), acá la fuente de la necesidad es el
     FORECAST del modelo — cuánto se espera vender de cada producto en los
     próximos 30 días — así que no depende de que haya algo planificado
     todavía. Es "neto simple": no reparte por semana ni considera lead
     time de compra, sólo dice cuánto hace falta comprar en total dentro
     del horizonte.

     Mismo criterio de escalado lineal que Necesidad de Insumos (decisión
     del usuario, 7-sep-2026): cantidadPorLote × (demanda del horizonte /
     litrosBase de la receta). */
  const mrpInsumos = useMemo(() => {
    const hoyISO = hoyLocalISO()
    // Suma pura sobre el string ISO (no Date.now()): mismo horizonte para
    // todo el cálculo sin importar cuándo exactamente re-renderiza React.
    const hastaISO = new Date(Date.parse(`${hoyISO}T00:00:00Z`) + mrpHorizonteDias * 86400000)
      .toISOString().slice(0, 10)
    const disponiblePorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.disponible]))
    const precioPorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.precioUnitario]))

    const demandaPorProducto = new Map<string, number>()
    const productosSinForecast = new Set<string>()
    for (const producto of new Set(recetaInsumos.map(l => l.producto))) {
      const serie = series.find(s => s.nivel === 'producto' && s.clave === producto)
      if (!serie) { productosSinForecast.add(producto); continue }
      const demanda = Math.max(demandaProyectadaEnPeriodo(serie, avanceMes, hoyISO, hastaISO), 0)
      if (demanda > 0) demandaPorProducto.set(producto, demanda)
    }

    const necesidadPorInsumo = new Map<string, {
      categoria: string; unidadBase: 'gr' | 'ml'; bruta: number
      productos: { producto: string; litrosDemanda: number }[]
    }>()
    for (const linea of recetaInsumos) {
      const demandaLitros = demandaPorProducto.get(linea.producto)
      if (!demandaLitros) continue
      const factor = demandaLitros / linea.litrosBase
      const acc = necesidadPorInsumo.get(linea.insumo)
        ?? { categoria: linea.categoria, unidadBase: linea.unidadBase, bruta: 0, productos: [] }
      acc.bruta += linea.cantidadPorLote * factor
      if (!acc.productos.some(p => p.producto === linea.producto)) {
        acc.productos.push({ producto: linea.producto, litrosDemanda: Math.round(demandaLitros) })
      }
      necesidadPorInsumo.set(linea.insumo, acc)
    }

    const filas = [...necesidadPorInsumo.entries()].map(([insumo, n]) => {
      const bruta = Math.round(n.bruta)
      const disponible = disponiblePorInsumo.get(insumo) ?? null
      const necesidadNeta = disponible != null ? Math.max(bruta - disponible, 0) : bruta
      const precioUnitario = precioPorInsumo.get(insumo) ?? null
      return {
        insumo, categoria: n.categoria as NecesidadInsumo['categoria'], unidadBase: n.unidadBase,
        necesidadBruta: bruta, disponible, necesidadNeta,
        costoCompra: precioUnitario != null ? Math.round(precioUnitario * necesidadNeta) : null,
        productos: n.productos.sort((a, b) => b.litrosDemanda - a.litrosDemanda),
      }
    }).sort((a, b) => b.necesidadNeta - a.necesidadNeta)

    // Valorización del horizonte completo: es la cifra que se pide para
    // presupuestar a 1-3 meses. `sinPrecio` cuenta las filas que quedaron
    // fuera del total por no tener precio cargado — sin eso el total se lee
    // como presupuesto completo cuando en realidad es parcial.
    const conNecesidad = filas.filter(f => f.necesidadNeta > 0)
    const costoTotal = conNecesidad.reduce((s, f) => s + (f.costoCompra ?? 0), 0)
    const sinPrecio = conNecesidad.filter(f => f.costoCompra == null).length

    return {
      filas, hastaISO, costoTotal, sinPrecio,
      conNecesidad: conNecesidad.length,
      productosSinForecast: [...productosSinForecast].sort(),
    }
  }, [recetaInsumos, series, avanceMes, stockInsumos, mrpHorizonteDias])

  /* ── Presupuesto de insumos, mes a mes ────────────────────────────────────
     Responde "cuánto plata necesito para comprar insumos los próximos meses".
     Usa el forecast mensual de cada producto (litros), lo baja a insumos por
     receta y lo valoriza al último precio de compra.

     Lo que lo hace un presupuesto de COMPRA y no de consumo: el stock actual
     se va descontando mes a mes en cadena. Lo que ya está en bodega cubre
     primero el mes 1; sólo lo que falta se compra. El mes 2 arranca con el
     remanente que dejó el 1, y así. Sin esto, el mes 1 pediría comprar cosas
     que ya están compradas. */
  const PRESUPUESTO_MESES = 3
  const presupuestoInsumos = useMemo(() => {
    const seriePorProducto = new Map(
      series.filter(s => s.nivel === 'producto' && s.clave).map(s => [s.clave as string, s])
    )
    const meses = [...new Set(
      series.flatMap(s => s.puntos.filter(p => p.tipo === 'forecast').map(p => p.mes))
    )].sort().slice(0, PRESUPUESTO_MESES)

    const precioPorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.precioUnitario]))
    // Saldo de bodega que se va consumiendo a lo largo de los meses.
    const stockRestante = new Map(stockInsumos.map(s => [s.insumo, s.disponible ?? 0]))

    const filas = meses.map(mes => {
      // Necesidad bruta del mes por insumo, separando cuánto viene de cerveza
      // y cuánto de kombucha — un mismo insumo (azúcar, CO₂) lo piden las dos
      // líneas, así que el costo se reparte después en esa misma proporción.
      const bruta = new Map<string, { total: number; cerveza: number; kombucha: number }>()
      for (const l of recetaInsumos) {
        const serie = seriePorProducto.get(l.producto)
        const litros = serie?.puntos.find(p => p.mes === mes && p.tipo === 'forecast')?.litros ?? 0
        if (litros <= 0) continue
        const cantidad = l.cantidadPorLote * (litros / l.litrosBase)
        const acc = bruta.get(l.insumo) ?? { total: 0, cerveza: 0, kombucha: 0 }
        acc.total += cantidad
        if (serie?.categoria === 'kombucha') acc.kombucha += cantidad
        else acc.cerveza += cantidad
        bruta.set(l.insumo, acc)
      }

      let cerveza = 0
      let kombucha = 0
      let sinPrecio = 0
      for (const [insumo, n] of bruta) {
        const hay = stockRestante.get(insumo) ?? 0
        const cubierto = Math.min(hay, n.total)
        stockRestante.set(insumo, hay - cubierto)
        const aComprar = n.total - cubierto
        if (aComprar <= 0) continue
        const precio = precioPorInsumo.get(insumo) ?? null
        if (precio == null) { sinPrecio++; continue }
        const propCerveza = n.total > 0 ? n.cerveza / n.total : 0
        cerveza += aComprar * precio * propCerveza
        kombucha += aComprar * precio * (1 - propCerveza)
      }

      return {
        mes,
        etiqueta: etiquetaMes(mes),
        cerveza: Math.round(cerveza),
        kombucha: Math.round(kombucha),
        total: Math.round(cerveza + kombucha),
        sinPrecio,
      }
    })

    return {
      filas,
      total: filas.reduce((s, f) => s + f.total, 0),
      totalCerveza: filas.reduce((s, f) => s + f.cerveza, 0),
      totalKombucha: filas.reduce((s, f) => s + f.kombucha, 0),
      sinPrecio: filas.reduce((m, f) => Math.max(m, f.sinPrecio), 0),
    }
  }, [series, recetaInsumos, stockInsumos])

  const mrpFiltrado = mrpInsumos.filas.filter(i =>
    i.insumo.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
    i.categoria.toLowerCase().includes(busquedaInsumo.toLowerCase())
  )

  const tituloActual = navItems.find(i => i.id === activeTab)?.label ?? ''
  const subtituloActual = navItems.find(i => i.id === activeTab)?.sub ?? ''

  return (
    // prod-root: excluye a este módulo del reset global `* { padding: 0 }` de
    // globals.css, que anulaba todas las utilidades de spacing de Tailwind.
    // Ver el comentario extenso en app/globals.css.
    <div className="prod-root flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-100 font-sans text-gray-800 lg:flex-row">

      <MenuLateral
        activeTab={activeTab}
        onCambiarTab={setActiveTab}
        alertasPorTab={alertasPorTab}
        ultimaCorrida={ultimaCorrida}
        nombreUsuario={nombreUsuario}
        inicialesUsuario={inicialesUsuario}
      />

      {/* ══ ÁREA PRINCIPAL ══ */}
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-gray-100">

        {/* ── Barra superior ── */}
        <header className="mobile-safe-top flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur lg:h-16 lg:px-8 lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Volver al inicio" className="prod-press shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden">
              <Home size={18} />
            </Link>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold tracking-tight text-gray-900 lg:text-xl">{tituloActual}</h2>
              <p className="truncate text-[11px] text-gray-400 lg:text-xs">{subtituloActual}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 lg:gap-4">
            {/* Cuándo corrió el modelo. No es un desplegable —nunca lo fue— así
                que se le sacó la flechita que lo hacía parecer uno. */}
            <div
              className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[13px] font-medium text-gray-600 xl:flex"
              title="Última corrida del modelo de forecast"
            >
              <CalendarIcon size={15} className="text-gray-400" />
              <span className="tabular-nums">{ultimaCorrida ? ultimaCorrida.slice(0, 10) : 'Sin corrida'}</span>
            </div>

            {/* Antes era un <div> con cursor-pointer: se veía clickeable, no
                respondía al teclado y ningún lector de pantalla lo anunciaba.
                Ahora es un botón real que lleva a las advertencias. */}
            <button
              type="button"
              onClick={() => setActiveTab('resumen')}
              aria-label={`${advertencias.length} advertencias del modelo`}
              title={`${advertencias.length} advertencias del modelo`}
              className="prod-press prod-hover-icon relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <Bell size={19} />
              {advertencias.length > 0 && (
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
              )}
            </button>

            <button
              onClick={() => { setActiveTab('plan'); setMostrarFormLote(true) }}
              className="prod-press flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-black/5 hover:brightness-105 lg:px-4"
              style={{ backgroundColor: COLORS.amber }}
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Nueva Cocción</span>
            </button>
          </div>
        </header>

        {errorPlan && (
          <div className="flex shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 lg:px-8">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>{errorPlan}</span>
            <button onClick={() => setErrorPlan(null)} className="ml-auto shrink-0 font-bold hover:underline">Cerrar</button>
          </div>
        )}

        {/* ── Tabs (móvil) ── */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2 lg:hidden">
          {navItems.map(item => {
            const activo = activeTab === item.id
            const alertas = alertasPorTab[item.id] ?? 0
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                aria-current={activo ? 'page' : undefined}
                className={`prod-press relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                  activo ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{ backgroundColor: activo ? COLORS.darkGreen : undefined }}
              >
                <item.icon size={14} />
                {item.label}
                {/* En el teléfono no se ve el menú lateral, así que la marca
                    de alertas tiene que viajar acá o se pierde. */}
                {alertas > 0 && (
                  <span className={`rounded-full px-1.5 text-[10px] font-black tabular-nums ${
                    activo ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'
                  }`}>
                    {alertas}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Contenido ── */}
        <div className="flex-1 overflow-auto p-4 lg:p-8">

          {/* ══════════ VISTA 1: RESUMEN GENERAL ══════════ */}
          {activeTab === 'resumen' && (
            <div className="prod-enter flex flex-col gap-6">

              {/* KPIs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 lg:gap-6">

                <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                    <AlertTriangle size={18} style={{ color: COLORS.amber }} />
                    Productos en Riesgo
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-4xl font-bold text-gray-900">{productosEnRiesgo.length}</span>
                    <div className="text-right text-xs font-medium leading-tight text-red-600">
                      {productosEnRiesgo.slice(0, 2).map(p => <div key={p.id}>• {p.label}</div>)}
                      {productosEnRiesgo.length > 2 && <div className="text-gray-400">+{productosEnRiesgo.length - 2} más</div>}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">Forecast poco confiable (desvío &gt; 30%)</p>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                    <CalendarDays size={18} className="text-green-600" />
                    Demanda Próximo Mes
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-3xl font-bold text-gray-900">
                        {litrosProximoMes != null ? fNum(litrosProximoMes) : '—'}
                      </span>
                      <span className="text-sm font-semibold text-gray-700">litros proyectados</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">Consolidado, todos los productos</p>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                    <TrendingDown size={18} className="text-red-500" />
                    Desviación del Modelo
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <span className={`text-3xl font-bold ${desviacionGeneral != null && desviacionGeneral > 30 ? 'text-red-600' : 'text-gray-900'}`}>
                      {desviacionGeneral != null ? `${desviacionGeneral.toFixed(0)}%` : '—'}
                    </span>
                    <span className="mb-1 text-xs font-medium text-gray-500">backtest 3 meses</span>
                  </div>
                  <p className="text-[11px] text-gray-400">Error medio vs. venta real</p>
                </div>

                {/* En Fermentación — desde que existe la capacidad real de cada
                    tanque (tabla fermentadores, 14-sep-2026), el % de ocupación
                    ya no es inventado. */}
                <div
                  className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                  title={ocupacionPlanta.tanques.map(t => `${t.tanque} (${t.tipo}): ${fNum(t.litros)} / ${fNum(t.capacidadLitros)} L`).join('\n')}
                >
                  <div className="flex items-center justify-between gap-2 text-sm font-medium text-gray-500">
                    <span className="flex items-center gap-2">
                      <Beaker size={18} style={{ color: COLORS.darkGreen }} />
                      En Fermentación
                    </span>
                    {ocupacionPlanta.porcentajeOcupacion != null && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        ocupacionPlanta.porcentajeOcupacion >= 85 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {ocupacionPlanta.porcentajeOcupacion}% ocupado
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="whitespace-nowrap text-3xl font-bold text-gray-900">
                      {fNum(ocupacionPlanta.litrosEnFermentacion)} L
                    </span>
                    <span className="whitespace-nowrap text-xs font-bold text-emerald-700">
                      en {ocupacionPlanta.fermentadoresOcupados} {ocupacionPlanta.fermentadoresOcupados === 1 ? 'tanque' : 'tanques'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {ocupacionPlanta.litrosLibres != null
                      ? `${fNum(ocupacionPlanta.litrosLibres)} L libres de ${fNum(ocupacionPlanta.capacidadTotalLitros!)} L — a granel, sin envasar`
                      : 'A granel, sin envasar — ver el split en Plan Maestro'}
                  </p>
                </div>
              </div>

              {/* Calendario + Alertas */}
              <div className="flex flex-col gap-6 xl:h-[600px] xl:flex-row">

                {/* El Cronograma de Cocciones que vivía acá se fusionó con el
                    Calendario de Cocciones Sugeridas en un solo Gantt, en la
                    pestaña "Cuándo cocer". Eran la misma planta mostrada en dos
                    lugares con dos criterios distintos (confirmado vs. sugerido),
                    y había que mirar los dos para entender qué tanque quedaba
                    libre. Acá queda el atajo, no una tercera vista. */}
                <button
                  type="button"
                  onClick={() => setActiveTab('calendario')}
                  className="prod-press flex flex-[3] flex-col items-start justify-center gap-2 overflow-hidden rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm hover:border-[#2F6B4F]/40 hover:bg-[#2F6B4F]/[0.03]"
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarDays size={18} style={{ color: COLORS.darkGreen }} />
                    <h3 className="font-bold tracking-tight text-gray-900">Ocupación de Fermentadores</h3>
                  </div>
                  <p className="max-w-md text-sm leading-relaxed text-gray-500">
                    El cronograma ahora es una carta Gantt: cada fila es un tanque y cada bloque
                    una cocción, que se arrastra para cambiarle el día o el fermentador.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="rounded-full bg-[#2F6B4F]/10 px-2.5 py-1 text-[11px] font-bold text-[#2F6B4F]">
                      {bloquesGantt.filter(b => b.tipo === 'confirmado').length} cocciones en el plan
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500">
                      {bloquesGantt.filter(b => b.tipo === 'sugerido').length} sugeridas
                    </span>
                    <span className="text-[12px] font-bold text-[#2F6B4F]">Abrir el Gantt →</span>
                  </div>
                </button>

                {/* Alertas — REALES, salen de forecast_calidad_datos */}
                <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm xl:max-w-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <h3 className="text-sm font-bold text-gray-800">Alertas del Modelo</h3>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">{calidad.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto p-2">
                    {calidad.length === 0 && (
                      <p className="p-4 text-center text-sm text-gray-400">Sin alertas. El modelo no encontró problemas de datos.</p>
                    )}
                    {calidad.map((alerta, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          alerta.severidad === 'advertencia' ? 'border-amber-100 bg-amber-50/50' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <div className={`mt-0.5 shrink-0 ${alerta.severidad === 'advertencia' ? 'text-amber-500' : 'text-gray-400'}`}>
                          {alerta.severidad === 'advertencia' ? <AlertTriangle size={16} /> : <Info size={16} />}
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-sm font-medium leading-snug text-gray-800">{alerta.detalle}</span>
                          {alerta.clave && <span className="text-xs font-medium text-gray-400">{alerta.clave}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ══════════ VISTA 2: FORECASTING (datos reales) ══════════ */}
          {activeTab === 'forecasting' && (
            // h-full (no min-h-full) forzaba esta columna a la altura exacta
            // del viewport: con sólo filtros+gráfico entraba justo, pero al
            // agregar la tabla de detalle abajo, flexbox la comprimía a 0px
            // en vez de dejar crecer la columna y que el contenedor de más
            // arriba (flex-1 overflow-auto) scrolleara — confirmado con el
            // computed height de la tarjeta de la tabla: 35px de alto,
            // wrapper interno en 0px pese a tener 94 filas en el DOM.
            <div className="prod-enter flex min-h-full flex-col gap-6">
              <PreguntaDeLaVista
                pregunta="¿Cuánto vamos a vender?"
                detalle="La proyección de demanda que alimenta todo lo demás: el colchón de seguridad, el calendario de cocciones y el presupuesto de insumos salen de acá."
              />


              {/* Filtros — pastillas conectadas en vez de un <select> único con
                  ~90 combinaciones (producto × envase), donde buscar un
                  producto puntual era tedioso. Categoría acota qué productos y
                  envases se ofrecen; Producto y Envase se combinan entre sí
                  para llegar a la serie exacta (ver la resolución de
                  serieActual más arriba). */}
              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-gray-500">Categoría</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['todas', 'cerveza', 'kombucha'] as const).map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => cambiarCategoriaForecast(c)}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                          filtroCategoriaForecast === c ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                        style={filtroCategoriaForecast === c ? { backgroundColor: COLORS.darkGreen } : undefined}
                      >
                        {c === 'todas' ? 'Todas' : c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-gray-500">Formato</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFiltroEnvaseForecast('todos')}
                      className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                        filtroEnvaseForecast === 'todos' ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                      style={filtroEnvaseForecast === 'todos' ? { backgroundColor: COLORS.amber } : undefined}
                    >
                      Todos los formatos
                    </button>
                    {envasesForecastDisponibles.map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setFiltroEnvaseForecast(b)}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                          filtroEnvaseForecast === b ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                        style={filtroEnvaseForecast === b ? { backgroundColor: COLORS.amber } : undefined}
                      >
                        {ENVASE_LABEL[b]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-2">
                  <span className="w-20 shrink-0 pt-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Producto</span>
                  <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setFiltroProductoForecast(null)}
                      className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                        !filtroProductoForecast ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                      style={!filtroProductoForecast ? { backgroundColor: '#374151' } : undefined}
                    >
                      Todos (consolidado)
                    </button>
                    {productosForecastDisponibles.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFiltroProductoForecast(p)}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                          filtroProductoForecast === p ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                        style={filtroProductoForecast === p ? { backgroundColor: '#374151' } : undefined}
                      >
                        {p}
                      </button>
                    ))}
                    {productosForecastDisponibles.length === 0 && (
                      <span className="py-1.5 text-xs text-gray-400">Ningún producto tiene ese formato en esta categoría.</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  <Filter size={14} className="shrink-0 text-gray-400" />
                  <span className="font-semibold text-gray-700">{serieActual?.label ?? 'Consolidado'}</span>
                  <span className="text-gray-300">·</span>
                  <span>
                    {serieActual?.mesesHistorial != null
                      ? `${serieActual.mesesHistorial} meses de ventas reales`
                      : `${chartData.filter(d => d.ventaReal != null).length} meses de ventas reales`}
                  </span>
                </div>
              </div>

              {/* Gráfico */}
              <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-gray-800">
                      Proyección de Demanda (Litros) vs. Venta Real
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {serieActual?.label ?? '—'} · el área ámbar marca la temporada alta (Dic–Feb).
                    </p>
                    {/* La conversión a unidades sólo aparece cuando la serie elegida
                        es un producto×envase concreto (no "todos los formatos" ni un
                        consolidado) — ahí sí hay un tamaño de envase único con el que
                        convertir litros a barriles/latas. Se aclara la base acá para
                        que el número de la tabla/tooltip no parezca sacado de la nada. */}
                    {unidadEnvaseSerieActual && (
                      <p className="mt-0.5 text-xs font-semibold text-gray-400">
                        pasa el mouse por el gráfico para ver también la cantidad de {unidadEnvaseSerieActual.nombre} pronosticadas
                        {unidadEnvaseSerieActual.nombre === 'latas'
                          ? ` (≈${Math.round(unidadEnvaseSerieActual.litrosPorUnidad * 1000)} ml/lata, estimado del inventario físico)`
                          : ` (${unidadEnvaseSerieActual.litrosPorUnidad} L/barril)`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Interruptor de la descomposición: por defecto apagado
                        para no sobrecargar la lectura rápida, pero a un clic
                        de mostrar de qué está hecha la proyección. */}
                    {hayDescomposicion && (
                      <button
                        onClick={() => setVerModelo(v => !v)}
                        aria-pressed={verModelo}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
                          verModelo ? 'text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                        style={verModelo ? { backgroundColor: COLORS.darkGreen, borderColor: COLORS.darkGreen } : undefined}
                      >
                        <Sigma size={15} />
                        Ver el modelo
                      </button>
                    )}
                    {precisionSerie != null && (
                      <div className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                        precisionSerie >= 85 ? 'border-green-200 bg-green-50 text-green-700'
                          : precisionSerie >= 70 ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                      }`}>
                        Precisión Histórica: {precisionSerie.toFixed(0)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Función matemática del modelo, con las constantes de ESTA
                    corrida — para que quede claro que la proyección sale de
                    una función real, no de una regla de tres, y que esa
                    función cambia sola cuando el modelo se reentrena. */}
                {verModelo && ecuacionModelo && (
                  <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Función del modelo
                    </p>
                    <p className="mt-1.5 overflow-x-auto whitespace-nowrap font-mono text-base font-bold text-gray-800 sm:text-lg">
                      y(t) = g(t) + s(t) + ε<sub>t</sub>
                    </p>
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-gray-100 pt-3 font-mono text-sm text-gray-600">
                      <p className="overflow-x-auto whitespace-nowrap">
                        g(t) = {fNum(ecuacionModelo.m)} {ecuacionModelo.k >= 0 ? '+' : '−'} {Math.abs(ecuacionModelo.k).toFixed(1)}·t
                      </p>
                      <p className="overflow-x-auto whitespace-nowrap">
                        s(t) ≈ {fNum(ecuacionModelo.A)}·sin(2π·t/12 {ecuacionModelo.fase >= 0 ? '+' : '−'} {Math.abs(ecuacionModelo.fase).toFixed(2)})
                      </p>
                    </div>
                    <p className="mt-3 text-xs leading-snug text-gray-400">
                      t = meses desde {etiquetaMes(ecuacionModelo.t0mes)} (t=0). g(t) es la tendencia exacta que usa
                      el modelo para proyectar — sale del tramo lineal posterior al último <em>changepoint</em>, no de
                      un ajuste a mano. s(t) es una aproximación de un solo armónico a la estacionalidad de Fourier
                      real de Prophet, para que la fórmula sea legible. Sin componente de feriados (h(t)): este
                      modelo no los usa. Las constantes se recalculan solas en cada corrida del modelo.
                    </p>
                  </div>
                )}

                {/* Ecuación del modelo, con los números del mes proyectado.
                    Es la parte que hace evidente que la línea verde no es una
                    regla de tres: sale de dos componentes que Prophet estima
                    por separado sobre el historial y después suma. */}
                {verModelo && descomposicionProximo && (
                  <div className="mb-5 flex flex-wrap items-stretch gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                    <div className="min-w-[190px] flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Tendencia</p>
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.lightGreen }}>
                        {fNum(descomposicionProximo.tendencia)} L
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-gray-500">
                        Hacia dónde va el negocio, sin el efecto del mes. Se ajusta con
                        <em> changepoints</em>: quiebres de pendiente detectados en los datos.
                      </p>
                    </div>
                    <div className="flex items-center text-2xl font-light text-gray-300">+</div>
                    <div className="min-w-[190px] flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Estacionalidad de {etiquetaMes(descomposicionProximo.mesIso)}</p>
                      <p className="text-xl font-black tabular-nums" style={{ color: descomposicionProximo.estacionalidad >= 0 ? COLORS.amber : '#EF4444' }}>
                        {descomposicionProximo.estacionalidad >= 0 ? '+' : '−'}{fNum(Math.abs(descomposicionProximo.estacionalidad))} L
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-gray-500">
                        Cuánto se aparta ese mes del año respecto de la tendencia. Curva de Fourier
                        ajustada sobre {serieActual?.mesesHistorial ?? chartData.filter(d => d.ventaReal != null).length} meses.
                      </p>
                    </div>
                    <div className="flex items-center text-2xl font-light text-gray-300">=</div>
                    <div className="min-w-[150px] flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Proyección</p>
                      <p className="text-xl font-black tabular-nums" style={{ color: COLORS.darkGreen }}>
                        {fNum(descomposicionProximo.tendencia + descomposicionProximo.estacionalidad)} L
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-gray-500">
                        El rango sombreado es el intervalo de predicción al 80%: 4 de cada 5 meses
                        deberían caer dentro.
                      </p>
                    </div>
                  </div>
                )}

                {/* Altura fija en vez de heredada por flex/min-height: Recharts
                    necesita que ALGÚN ancestro tenga una altura resuelta en
                    píxeles para poder calcular su height="100%" — una cadena
                    de flex-1/min-height no se lo garantiza (se rompió al
                    cambiar el wrapper de la pestaña de h-full a min-h-full
                    para la tabla de abajo: el SVG dejó de dibujarse, 0px). */}
                <div className="relative h-[360px] w-full">
                  {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      Todavía no hay una corrida del modelo. Se genera automáticamente el día 2 de cada mes.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                        <defs>
                          {/* El intervalo se desvanece hacia abajo en vez de
                              ser un bloque plano: se lee como incertidumbre,
                              no como una segunda serie de datos. */}
                          <linearGradient id="gradRango" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={COLORS.darkGreen} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={COLORS.darkGreen} stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                          dataKey="month" axisLine={false} tickLine={false} minTickGap={24}
                          tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }} dy={10}
                        />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dx={-6}
                          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                        />
                        {/* Tooltip a medida: en el mes ancla (el último real,
                            donde arranca la línea de proyección) "Venta Real",
                            "Venta Proyectada" y "Ritmo proyectado" quedan con
                            el MISMO número a propósito, sólo para que esas
                            tres líneas conecten visualmente ahí — mostrar los
                            tres en el tooltip como si fueran datos distintos
                            confunde (se ve como si el modelo hubiera
                            "proyectado" un mes que ya cerró). Se ocultan las
                            dos entradas redundantes en ese punto puntual. */}
                        {/* La etiqueta "Ago '26" es el mes Y AÑO (Agosto,
                            2026) — el '26 es el año abreviado, no un día del
                            mes. Como el ciclo real corre 24→23 y no calendario
                            (ver lib/produccion/reglas.ts), eso generó
                            confusión real ("¿por qué a veces aparece 25 o 26
                            del mes?", cuando en realidad eran años distintos
                            en distintos puntos del historial). Se agrega el
                            rango de fechas exacto del ciclo debajo del mes
                            para que no quede ambigüedad. */}
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) return null
                            const fila = payload[0]?.payload as (typeof chartData)[number] | undefined
                            const esAncla = !!fila && fila.ventaReal != null && fila.ventaProyectada != null && fila.mesIso !== avanceMes.mes
                            const visibles = payload.filter(entrada => {
                              if (entrada.value == null) return false
                              if (esAncla && (entrada.dataKey === 'ventaProyectada' || entrada.dataKey === 'ritmo')) return false
                              return true
                            })
                            if (visibles.length === 0) return null
                            return (
                              <div className="rounded-lg bg-white px-3.5 py-2.5 text-xs shadow-lg">
                                <p className="font-bold text-gray-700">{label}</p>
                                {fila && (
                                  <p className="mb-1.5 text-[11px] text-gray-400">
                                    {fCicloCorto(inicioDeCiclo(fila.mesIso))} – {fCicloCorto(finDeCiclo(fila.mesIso))}
                                  </p>
                                )}
                                {visibles.map(entrada => {
                                  const valor = entrada.value
                                  const texto = Array.isArray(valor)
                                    ? `${fNum(Number(valor[0]))} – ${fNum(Number(valor[1]))} L`
                                    : `${fNum(Number(valor))} L`
                                  // Además de litros, cuántos envases son — sólo tiene sentido
                                  // para las series de demanda (no para tendencia/estacionalidad,
                                  // que son componentes del modelo, no litros vendibles) y sólo
                                  // cuando la serie elegida es un producto×envase con conversión
                                  // conocida (ver unidadEnvaseSerieActual).
                                  const mostrarUnidades = unidadEnvaseSerieActual != null &&
                                    ['ventaProyectada', 'ventaReal', 'ritmo', 'rango'].includes(String(entrada.dataKey))
                                  const unidadesTexto = mostrarUnidades
                                    ? Array.isArray(valor)
                                      ? `${fNum(Math.round(Number(valor[0]) / unidadEnvaseSerieActual!.litrosPorUnidad))} – ${fNum(Math.round(Number(valor[1]) / unidadEnvaseSerieActual!.litrosPorUnidad))} ${unidadEnvaseSerieActual!.nombre}`
                                      : `≈ ${fNum(Math.round(Number(valor) / unidadEnvaseSerieActual!.litrosPorUnidad))} ${unidadEnvaseSerieActual!.nombre}`
                                    : null
                                  return (
                                    <p key={String(entrada.dataKey)} style={{ color: entrada.color }} className="font-semibold">
                                      {entrada.name}: {texto}
                                      {unidadesTexto && <span className="ml-1 font-normal text-gray-400">({unidadesTexto})</span>}
                                    </p>
                                  )
                                })}
                              </div>
                            )
                          }}
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#374151' }} />

                        {tramosTemporadaAlta.map((t, i) => (
                          <ReferenceArea key={i} x1={t.x1} x2={t.x2} fill={COLORS.lightAmber} fillOpacity={0.4} />
                        ))}

                        <Area
                          dataKey="rango" name="Rango estimado (80%)" stroke="none"
                          fill="url(#gradRango)" connectNulls
                        />
                        {/* Tendencia del modelo sobre TODA la serie, historial
                            incluido: ahí se ve que está ajustada a los datos
                            reales y no dibujada sólo hacia el futuro. */}
                        {verModelo && (
                          <Line
                            type="monotone" dataKey="tendencia" name="Tendencia (sin estacionalidad)"
                            stroke={COLORS.lightGreen} strokeWidth={2} strokeDasharray="6 4"
                            dot={false} activeDot={false} connectNulls isAnimationActive={false}
                          />
                        )}
                        <Line
                          type="monotone" dataKey="ventaProyectada" name="Venta Proyectada"
                          stroke={COLORS.darkGreen} strokeWidth={3} connectNulls
                          dot={{ r: 3, fill: COLORS.darkGreen, strokeWidth: 0 }} activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone" dataKey="ventaReal" name="Venta Real"
                          stroke={COLORS.amber} strokeWidth={3} strokeDasharray="5 5" connectNulls={false}
                          dot={false} activeDot={{ r: 6 }}
                        />
                        {/* Ritmo proyectado: arranca del mismo último mes real
                            que la línea verde (no del dato crudo del mes a
                            medias, que comparado contra meses completos se
                            veía como una caída al vacío) y corre AL LADO de
                            la proyección del modelo hasta el mes en curso —
                            así se compara directo: ¿vendiendo al ritmo de
                            estos días, cerramos arriba o abajo de lo que el
                            modelo esperaba? */}
                        <Line
                          type="monotone" dataKey="ritmo" name="Ritmo proyectado a fin de mes"
                          stroke={COLORS.amber} strokeWidth={2.5} strokeDasharray="2 3" connectNulls
                          dot={(props: { cx?: number; cy?: number; index?: number; payload?: { mesIso?: string } }) => {
                            const { cx, cy, index, payload } = props
                            // Sólo un punto visible, en el mes en curso — el
                            // ancla (último mes real) ya tiene su propio dot
                            // de "Venta Proyectada"/"Venta Real" ahí mismo.
                            if (payload?.mesIso !== avanceMes.mes || cx == null || cy == null) return <React.Fragment key={index} />
                            return <circle key={index} cx={cx} cy={cy} r={5} fill="#fff" stroke={COLORS.amber} strokeWidth={2.5} />
                          }}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* ── Curva estacional aprendida por el modelo ── */}
              {verModelo && curvaEstacional.length > 0 && (
                <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-800">Estacionalidad aprendida por el modelo</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Litros que cada mes del año suma o resta respecto de la tendencia. No es una regla
                      escrita a mano: es la curva de Fourier que Prophet ajustó sobre el historial de esta serie.
                    </p>
                  </div>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={curvaEstacional} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }} dy={8} />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dx={-6}
                          tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value) => {
                            const n = Number(value)
                            return [`${n >= 0 ? '+' : '−'}${fNum(Math.abs(n))} L`, n >= 0 ? 'Sobre la tendencia' : 'Bajo la tendencia']
                          }}
                        />
                        {/* Una barra por mes, verde arriba de la tendencia y
                            ámbar abajo — el signo se lee sin mirar el eje. */}
                        <Bar dataKey="efecto" name="Efecto del mes" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                          {curvaEstacional.map(d => (
                            <Cell key={d.mes} fill={d.efecto >= 0 ? COLORS.lightGreen : COLORS.amber} />
                          ))}
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ¿Vamos a cumplir lo proyectado? — comparación simple del mes en curso */}
              {mtdLitros > 0 && (() => {
                const objetivo = chartData.find(f => f.mesIso === avanceMes.mes)?.ventaProyectada ?? null
                const pct = objetivo != null && objetivo > 0 ? (ritmoProyectado / objetivo) * 100 : null
                const cumple = pct != null && pct >= 95
                const avancePct = Math.min(100, (avanceMes.diaActual / avanceMes.diasEnMes) * 100)
                return (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="grid gap-px bg-gray-200 sm:grid-cols-3">
                      <div className="bg-white p-5">
                        <p
                          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400"
                          title="Cuenta por fecha de pedido, no de entrega — a diferencia de Ventas, que sólo suma lo ya despachado. Producción necesita la señal apenas se toma el pedido, no cuando se despacha."
                        >
                          Vendido este mes
                          <Info size={11} className="text-gray-300" />
                        </p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-gray-900">{fNum(mtdLitros)} L</p>
                        <p className="text-[10px] text-gray-400">por fecha de pedido, no de entrega</p>
                        {/* Barra de avance del mes: el número solo no dice si
                            vamos temprano o tarde en el período. */}
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full" style={{ width: `${avancePct}%`, backgroundColor: COLORS.gray }} />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">día {avanceMes.diaActual} de {avanceMes.diasEnMes}</p>
                      </div>

                      <div className="bg-white p-5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">A este ritmo cerrarías con</p>
                        <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: COLORS.amber }}>{fNum(ritmoProyectado)} L</p>
                        <p className="mt-[14px] text-xs text-gray-500">extrapolación lineal de lo vendido</p>
                      </div>

                      {objetivo != null && pct != null && (
                        <div className="bg-white p-5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">El modelo proyectó</p>
                          <p className="mt-1 text-3xl font-black tabular-nums" style={{ color: COLORS.darkGreen }}>{fNum(objetivo)} L</p>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(100, pct)}%`, backgroundColor: cumple ? '#059669' : '#EF4444' }}
                            />
                          </div>
                          <p className={`mt-1.5 text-xs font-bold ${cumple ? 'text-emerald-600' : 'text-red-600'}`}>
                            {cumple ? '✓' : '⚠'} vas al {pct.toFixed(0)}% de lo proyectado
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Calculadora de cobertura — responde "¿cuánto necesito de X
                  producto, en Y formato, para cubrir de aquí a tal fecha?"
                  para cualquier producto/envase, no sólo el que está
                  seleccionado arriba en el gráfico. */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="font-bold text-gray-800">Calculadora de Cobertura</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Ej.: ¿cuántos litros de Fisura en Lata necesito para cubrir de aquí al 27 de marzo?
                </p>
                {/* Mismas pastillas conectadas que Forecasting (Categoría → Formato →
                    Producto), para no repetir el problema de "buscar el producto en un
                    select gigante" acá también. A diferencia de Forecasting, "Todos los
                    productos" SÍ es un resultado real (suma el catálogo completo). */}
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-gray-500">Categoría</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(['todas', 'cerveza', 'kombucha'] as const).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => cambiarCategoriaCobertura(c)}
                          className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                            coberturaCategoria === c ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                          style={coberturaCategoria === c ? { backgroundColor: COLORS.darkGreen } : undefined}
                        >
                          {c === 'todas' ? 'Todas' : c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-gray-500">Formato</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCoberturaEnvase('todos')}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                          coberturaEnvase === 'todos' ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                        style={coberturaEnvase === 'todos' ? { backgroundColor: COLORS.amber } : undefined}
                      >
                        Todos los formatos
                      </button>
                      {envasesCoberturaDisponibles.map(b => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setCoberturaEnvase(b)}
                          className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                            coberturaEnvase === b ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                          style={coberturaEnvase === b ? { backgroundColor: COLORS.amber } : undefined}
                        >
                          {ENVASE_LABEL[b]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start gap-2">
                    <span className="w-20 shrink-0 pt-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Producto</span>
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => { setCoberturaProducto(''); setCoberturaEnvase('todos') }}
                        className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                          productoCobertura === TODOS_PRODUCTOS ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                        style={productoCobertura === TODOS_PRODUCTOS ? { backgroundColor: '#374151' } : undefined}
                      >
                        Todos los productos
                      </button>
                      {productosCoberturaDisponibles.map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => { setCoberturaProducto(p); setCoberturaEnvase('todos') }}
                          className={`prod-press rounded-full px-3 py-1.5 text-xs font-bold ${
                            productoCobertura === p ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                          style={productoCobertura === p ? { backgroundColor: '#374151' } : undefined}
                        >
                          {p}
                        </button>
                      ))}
                      {productosCoberturaDisponibles.length === 0 && (
                        <span className="py-1.5 text-xs text-gray-400">Ningún producto tiene ese formato en esta categoría.</span>
                      )}
                    </div>
                  </div>

                  <div className="flex min-w-[160px] flex-col gap-1.5 border-t border-gray-100 pt-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Cubrir hasta</label>
                    <input
                      type="date" value={coberturaFecha} onChange={e => setCoberturaFecha(e.target.value)}
                      className="w-48 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {resultadoCobertura && 'error' in resultadoCobertura ? (
                  <p className="mt-4 text-sm font-semibold text-red-600">{resultadoCobertura.error}</p>
                ) : resultadoCobertura ? (
                  <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-gray-200 sm:grid-cols-3">
                    <div className="bg-gray-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Demanda proyectada en el período</p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-gray-800">{fNum(resultadoCobertura.demandaProyectada)} L</p>
                      {/* Banda de confianza de Prophet (yhat_lower/yhat_upper), prorateada
                          al mismo período — el ciclo en curso no trae banda (sale del ritmo
                          real, no del modelo), así que el rango sólo se angosta si el período
                          es corto o está cerca de hoy. */}
                      {(resultadoCobertura.demandaProyectadaMin !== resultadoCobertura.demandaProyectada ||
                        resultadoCobertura.demandaProyectadaMax !== resultadoCobertura.demandaProyectada) && (
                        <p className="mt-0.5 text-xs font-semibold text-gray-400">
                          rango {fNum(resultadoCobertura.demandaProyectadaMin)}–{fNum(resultadoCobertura.demandaProyectadaMax)} L
                        </p>
                      )}
                    </div>
                    <div className="bg-gray-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Disponible ahora</p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-gray-800">
                        {resultadoCobertura.disponible != null ? `${fNum(resultadoCobertura.disponible)} L` : 'Sin dato'}
                      </p>
                      {/* Este total SUMA bodega (físico, contable) + lo que todavía está
                          fermentando en el tanque, sin envasar — a propósito, para que el
                          modelo no sugiera cocer de más cuando ya hay un lote en camino
                          (ver el comentario largo en page.tsx sobre litrosEnProduccion). Pero
                          mostrar sólo el total confunde "cuánto puedo despachar hoy" con
                          "cuánto va a existir" — desglosado acá para que no vuelva a pasar
                          (caso real: Aguas Blancas Lata mostraba 1.540 L acá cuando en bodega
                          había 168 L reales; el resto era el tanque en curso, repartido por
                          el Split de Envasado hacia el formato con más necesidad). */}
                      {resultadoCobertura.disponibleFermentando != null && resultadoCobertura.disponibleFermentando > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-gray-400">
                          {fNum(resultadoCobertura.disponibleBodega ?? 0)} L en bodega
                          <span className="text-purple-500"> + {fNum(resultadoCobertura.disponibleFermentando)} L fermentando (sin envasar)</span>
                        </p>
                      )}
                    </div>
                    <div className="bg-amber-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Necesidad neta a cubrir</p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-amber-800">
                        {resultadoCobertura.necesidadNeta != null ? `${fNum(resultadoCobertura.necesidadNeta)} L` : '—'}
                      </p>
                      {/* Necesidad calculada con el mismo rango de arriba: si vendemos al
                          límite bajo de la banda puede que no haga falta nada (mínimo se
                          recorta en 0 como el resto de "necesidad neta"); si vendemos al
                          límite alto, esto es lo que realmente haría falta cocer. */}
                      {resultadoCobertura.necesidadNetaMin != null && resultadoCobertura.necesidadNetaMax != null &&
                        (resultadoCobertura.necesidadNetaMin !== resultadoCobertura.necesidadNeta ||
                          resultadoCobertura.necesidadNetaMax !== resultadoCobertura.necesidadNeta) && (
                        <p className="mt-0.5 text-xs font-semibold text-amber-600">
                          rango {fNum(resultadoCobertura.necesidadNetaMin)}–{fNum(resultadoCobertura.necesidadNetaMax)} L
                        </p>
                      )}
                      {resultadoCobertura.latasACubrir != null && (
                        <p className="mt-1 text-xs font-bold text-amber-700">
                          ≈ {fNum(resultadoCobertura.latasACubrir)} latas{resultadoCobertura.litrosPorLata != null ? ` de ${Math.round(resultadoCobertura.litrosPorLata * 1000)} ml` : ''} a comprar
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Desglose por formato: el lote se cuece completo y después se
                    envasa en los distintos formatos, así que además del número
                    del formato elegido arriba, siempre se ve cuánto hace falta
                    de CADA uno y el total a cocer. */}
                {desgloseCoberturaFormatos && desgloseCoberturaFormatos.filas.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
                    <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Desglose por formato — {productoCobertura}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-4 py-2 text-left font-bold">Formato</th>
                          <th className="px-4 py-2 text-right font-bold">Demanda proyectada</th>
                          <th className="px-4 py-2 text-right font-bold">Disponible</th>
                          <th className="px-4 py-2 text-right font-bold">Necesidad neta</th>
                          <th className="px-4 py-2 text-right font-bold">Latas a comprar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {desgloseCoberturaFormatos.filas.map(f => (
                          <tr key={f.envase}>
                            <td className="px-4 py-2.5 font-semibold text-gray-700">{ENVASE_LABEL[f.envase] ?? f.envase}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                              {fNum(f.demandaProyectada)} L
                              {(f.demandaMin !== f.demandaProyectada || f.demandaMax !== f.demandaProyectada) && (
                                <span className="block text-[11px] font-normal text-gray-400">{fNum(f.demandaMin)}–{fNum(f.demandaMax)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                              {f.disponible != null ? `${fNum(f.disponible)} L` : 'Sin dato'}
                              {f.disponibleFermentando != null && f.disponibleFermentando > 0 && (
                                <span className="block text-[11px] font-normal text-purple-500">{fNum(f.disponibleBodega ?? 0)} bodega + {fNum(f.disponibleFermentando)} fermentando</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-800">
                              {f.necesidadNeta != null ? `${fNum(f.necesidadNeta)} L` : '—'}
                              {f.necesidadNetaMin != null && f.necesidadNetaMax != null &&
                                (f.necesidadNetaMin !== f.necesidadNeta || f.necesidadNetaMax !== f.necesidadNeta) && (
                                <span className="block text-[11px] font-normal text-amber-500">{fNum(f.necesidadNetaMin)}–{fNum(f.necesidadNetaMax)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-amber-700">{f.latasACubrir != null ? fNum(f.latasACubrir) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-amber-50">
                          <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-amber-700">
                            Total a cocer (todos los formatos)
                          </td>
                          <td className="px-4 py-3 text-right text-lg font-black tabular-nums text-amber-800">
                            {fNum(desgloseCoberturaFormatos.totalNecesidad)} L
                            {(desgloseCoberturaFormatos.totalNecesidadMin !== desgloseCoberturaFormatos.totalNecesidad ||
                              desgloseCoberturaFormatos.totalNecesidadMax !== desgloseCoberturaFormatos.totalNecesidad) && (
                              <span className="block text-[11px] font-semibold text-amber-600">
                                {fNum(desgloseCoberturaFormatos.totalNecesidadMin)}–{fNum(desgloseCoberturaFormatos.totalNecesidadMax)}
                              </span>
                            )}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Desglose por producto: sólo con "Todos los productos" elegido —
                    el equivalente de arriba pero para armar de un vistazo la lista
                    de compra de latas de todo el catálogo. */}
                {desgloseCoberturaProductos && desgloseCoberturaProductos.filas.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
                    <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Desglose por producto — {coberturaEnvase === 'todos' ? 'todos los formatos' : ENVASE_LABEL[coberturaEnvase]}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-4 py-2 text-left font-bold">Producto</th>
                          <th className="px-4 py-2 text-right font-bold">Demanda proyectada</th>
                          <th className="px-4 py-2 text-right font-bold">Disponible</th>
                          <th className="px-4 py-2 text-right font-bold">Necesidad neta</th>
                          <th className="px-4 py-2 text-right font-bold">Latas a comprar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {desgloseCoberturaProductos.filas.map(f => (
                          <tr key={f.producto}>
                            <td className="px-4 py-2.5 font-semibold text-gray-700">{f.producto}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                              {fNum(f.demandaProyectada)} L
                              {(f.demandaMin !== f.demandaProyectada || f.demandaMax !== f.demandaProyectada) && (
                                <span className="block text-[11px] font-normal text-gray-400">{fNum(f.demandaMin)}–{fNum(f.demandaMax)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                              {f.disponible != null ? `${fNum(f.disponible)} L` : 'Sin dato'}
                              {f.disponibleFermentando != null && f.disponibleFermentando > 0 && (
                                <span className="block text-[11px] font-normal text-purple-500">{fNum(f.disponibleBodega ?? 0)} bodega + {fNum(f.disponibleFermentando)} fermentando</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-800">
                              {f.necesidadNeta != null ? `${fNum(f.necesidadNeta)} L` : '—'}
                              {f.necesidadNetaMin != null && f.necesidadNetaMax != null &&
                                (f.necesidadNetaMin !== f.necesidadNeta || f.necesidadNetaMax !== f.necesidadNeta) && (
                                <span className="block text-[11px] font-normal text-amber-500">{fNum(f.necesidadNetaMin)}–{fNum(f.necesidadNetaMax)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-amber-700">{f.latasACubrir != null ? fNum(f.latasACubrir) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-amber-50">
                          <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-amber-700">
                            Total ({desgloseCoberturaProductos.filas.length} productos)
                          </td>
                          <td className="px-4 py-3 text-right text-lg font-black tabular-nums text-amber-800">
                            {fNum(desgloseCoberturaProductos.totalNecesidad)} L
                            {(desgloseCoberturaProductos.totalNecesidadMin !== desgloseCoberturaProductos.totalNecesidad ||
                              desgloseCoberturaProductos.totalNecesidadMax !== desgloseCoberturaProductos.totalNecesidad) && (
                              <span className="block text-[11px] font-semibold text-amber-600">
                                {fNum(desgloseCoberturaProductos.totalNecesidadMin)}–{fNum(desgloseCoberturaProductos.totalNecesidadMax)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-lg font-black tabular-nums text-amber-800">
                            {desgloseCoberturaProductos.totalLatas > 0 ? fNum(desgloseCoberturaProductos.totalLatas) : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                <p className="mt-3 text-xs text-gray-400">
                  Suma el forecast mensual por ciclo entre hoy y la fecha elegida (prorateado por días en los ciclos
                  parciales); el ciclo en curso usa el ritmo de venta real de este ciclo, no el forecast. El total del
                  desglose es la suma de la necesidad neta de cada formato — lo que hay que cocer, ya que el lote se
                  envasa después según ese reparto. El número chico debajo de cada litraje de demanda/necesidad es la
                  banda de confianza de Prophet (mínimo–máximo proyectado, no sólo el promedio) — el ciclo en curso no
                  trae banda porque sale del ritmo de venta real, no del modelo. El número chico debajo de “Disponible”
                  es distinto: separa lo que ya está en bodega (físico, contable) de lo que todavía está fermentando en
                  el tanque sin envasar — el total los suma para no sugerir cocer de más cuando ya hay un lote en
                  camino, pero sólo la parte de bodega es lo que existe hoy como producto terminado.
                </p>
              </div>

              {/* ── Detalle por producto y envase ── */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 p-5">
                  <div>
                    <h3 className="font-bold text-gray-800">Detalle por producto y envase</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {filasTablaDetalle.length} combinaciones · litros vendidos en lo que va del mes y proyección del próximo mes cerrado.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['todas', 'cerveza', 'kombucha'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setFiltroCategoria(c)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
                          filtroCategoria === c
                            ? 'text-white'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                        style={{ backgroundColor: filtroCategoria === c ? COLORS.darkGreen : undefined, borderColor: filtroCategoria === c ? COLORS.darkGreen : undefined }}
                      >
                        {c === 'todas' ? 'Todas' : c}
                      </button>
                    ))}
                    <span className="mx-1 self-center text-gray-300">|</span>
                    <select
                      value={filtroEnvase}
                      onChange={e => setFiltroEnvase(e.target.value)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="todos">Todos los envases</option>
                      {envasesDisponibles.map(b => <option key={b} value={b}>{ENVASE_LABEL[b as EnvaseBucket] ?? b}</option>)}
                    </select>
                  </div>
                </div>

                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                      <tr>
                        <th className="px-6 py-3 font-bold">Producto</th>
                        <th className="px-4 py-3 font-bold">Envase</th>
                        <th className="px-4 py-3 font-bold">Categoría</th>
                        <th className="px-4 py-3 text-right font-bold">Vendido este mes</th>
                        <th className="px-4 py-3 text-right font-bold text-amber-700">Próximo mes (proy.)</th>
                        <th className="px-6 py-3 text-center font-bold" title="Error del backtest (MAPE) — más alto es peor, no una confiabilidad de 0-100%.">Desviación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filasTablaDetalle.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Sin combinaciones para este filtro.</td></tr>
                      )}
                      {filasTablaDetalle.map(({ serie, proximo }, i) => {
                        const productoRepetido = i > 0 && filasTablaDetalle[i - 1].serie.producto === serie.producto
                        return (
                          <tr key={serie.id} className="prod-hover-row transition-colors hover:bg-gray-50">
                            <td className="px-6 py-2.5 font-semibold text-gray-800">
                              {productoRepetido ? (
                                <span className="pl-[42px] text-gray-300">″</span>
                              ) : (
                                <span className="inline-flex items-center gap-2.5">
                                  <ProductImage
                                    nombre={serie.producto} categoria={serie.categoria}
                                    esBarril={serie.envaseBucket === 'barril_30' || serie.envaseBucket === 'barril_50'}
                                    size={32} radius={8}
                                  />
                                  {serie.producto}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">
                              <span className="inline-flex items-center gap-2">
                                {ENVASE_LABEL[(serie.envaseBucket ?? 'otros') as EnvaseBucket] ?? serie.envaseBucket}
                                {serie.metodo === 'derivado' && (
                                  <span
                                    className="inline-block rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600"
                                    title="Muy poca historia propia para confiar en un modelo entrenado sólo sobre este formato — se repartió el forecast del producto según qué % de él fue este formato recientemente."
                                  >
                                    derivado
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {serie.categoria && (
                                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold capitalize ${
                                  serie.categoria === 'cerveza' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                                }`}>
                                  {serie.categoria}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                              {serie.litrosMesEnCurso > 0 ? `${fNum(serie.litrosMesEnCurso)} L` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums text-gray-900">
                              {proximo ? `${fNum(proximo.litros)} L` : <span className="text-gray-300">sin datos</span>}
                            </td>
                            <td className="px-6 py-2.5 text-center">
                              <ChipDesviacion mape={serie.mape} derivado={serie.metodo === 'derivado'} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ VISTA 3: STOCK DE SEGURIDAD ══════════ */}
          {activeTab === 'seguridad' && (
            <div className="prod-enter flex flex-col gap-6">
              <PreguntaDeLaVista
                pregunta="¿Cuántos litros hay que producir de cada producto, mes a mes?"
                detalle="Los litros proyectados por el modelo para los próximos meses, con el colchón de seguridad al lado. Se ajustan acá y al confirmarlos se crean las cocciones, partidas según los tanques de cada línea. El cuándo y en qué tanque es el paso 3."
              />

              {/* El paso que antes se hacía a ojo sobre el gráfico del forecast:
                  filtrar un producto, leer los litros de cada mes, anotarlos y
                  pasarlos a mano a la carta Gantt. */}
              <NecesidadMensual
                series={series}
                stockSeguridad={stockSeguridad}
                plan={plan}
                tanques={ocupacionPlanta.tanques.map(t => ({
                  tanque: t.tanque,
                  categoria: t.categoria as 'cerveza' | 'kombucha',
                  capacidadLitros: t.capacidadLitros,
                }))}
                config={configGantt}
                onConfirmar={confirmarNecesidad}
              />


              {stockSeguridad.length === 0 ? (
                <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  <p>
                    Todavía no hay una corrida del cálculo de stock de seguridad. Se genera junto con el forecast,
                    el día 2 de cada mes.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
                  <Info size={18} className="mt-0.5 shrink-0 text-gray-400" />
                  <p>
                    Stock de seguridad = <strong>Z · √(ventana · σ<sub>semanal</sub>² + demanda<sub>semanal</sub>² · σ<sub>LT</sub>²)</strong>,
                    con Z=1,645 (95% de nivel de servicio). Tanto la demanda como su dispersión salen del
                    <strong> mismo forecast de Prophet</strong> que ves en el gráfico —σ se deriva del ancho de
                    su intervalo de predicción, así que ya incorpora la estacionalidad y la tendencia del mes
                    proyectado en vez de estimarse aparte. La ventana es{' '}
                    <strong>lead time + período de revisión</strong> (reponemos una vez al mes, así que el
                    riesgo corre hasta la siguiente oportunidad de pedir, no sólo hasta que llega el lote).
                    Lead time: <strong>4 semanas cerveza</strong>, <strong>3 semanas kombucha</strong>.
                  </p>
                </div>
              )}

              {/* Prueba visual de que "disponible" está conectado al stock
                  actual: el estado crítico/bajo/ok se recalcula en CADA
                  carga de esta página contra la última foto del ERP — no
                  sólo cuando corre el forecast mensual. Antes esto era una
                  afirmación sin respaldo en pantalla; ahora se ve. */}
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: minutosDesdeSyncStock != null && minutosDesdeSyncStock < 180 ? '#34D399' : COLORS.gray }}
                />
                Inventario del ERP {minutosDesdeSyncStock != null ? fMinutosDesde(minutosDesdeSyncStock) : 'sin sincronizar aún'}
                {' '}— el estado de abajo se recalcula contra esto cada vez que abrís esta pantalla.
              </div>

              {/* KPIs de estado */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {([
                  { estado: 'critico' as const, label: 'Crítico', color: 'red' },
                  { estado: 'bajo' as const, label: 'Bajo (reponer)', color: 'amber' },
                  { estado: 'ok' as const, label: 'OK', color: 'emerald' },
                  { estado: 'sin_dato' as const, label: 'Sin dato de stock', color: 'gray' },
                ]).map(({ estado, label, color }) => (
                  <div key={estado} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</p>
                    <p className={`text-3xl font-black ${
                      color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : color === 'emerald' ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      {filasStockSeguridad.filter(f => f.estado === estado).length}
                    </p>
                  </div>
                ))}
              </div>



              {/* Necesidad de Producción Anticipada — responde "¿cuánto
                  necesito producir para cubrir hasta tal fecha?" y avisa
                  cuándo se viene una temporada de alta demanda, no sólo si
                  hoy está bien. Mismo lenguaje visual que las alarmas de
                  quiebre del Plan Maestro para que se reconozca de un
                  vistazo como una lista accionable. */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-gray-800">Necesidad de Producción Anticipada</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Cuánto hay que producir de cada producto y formato para llegar bien hasta una fecha futura —
                      y qué productos vienen con una temporada de alta demanda por delante.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Cubrir hasta</label>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {/* Atajos a los horizontes que de verdad se preguntan — antes
                          sólo había un campo de fecha suelto arrancando en +60
                          días, sin señal de que se podía mover más allá. */}
                      {presetsCobertura.map(p => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setFechaCoberturaSeg(p.fecha)}
                          className={`prod-press rounded-full px-2.5 py-1 text-xs font-bold ${
                            fechaCoberturaSeg === p.fecha
                              ? 'text-white'
                              : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                          style={fechaCoberturaSeg === p.fecha ? { backgroundColor: COLORS.darkGreen } : undefined}
                        >
                          {p.label}
                        </button>
                      ))}
                      <input
                        type="date" value={fechaCoberturaSeg} onChange={e => setFechaCoberturaSeg(e.target.value)}
                        min={hoyLocalISO(new Date(Date.now() + 86400000))}
                        max={horizonteCoberturaISO || undefined}
                        className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    {/* El tope no es arbitrario: es donde se acaba el forecast.
                        Elegir algo más allá no rompe el cálculo, pero lo hace
                        mentir por defecto — los meses sin forecast simplemente
                        no suman demanda, así que "A producir" se vería más chico
                        de lo real sin ningún aviso. Por eso el date input ya no
                        deja pasar de ahí, y acá se explica por qué. */}
                    {horizonteCoberturaISO && (
                      <p className="text-[11px] text-gray-400">
                        El forecast llega hasta el{' '}
                        {new Date(horizonteCoberturaISO + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                        {' '}— no se puede cubrir más allá sin proyección de venta.
                      </p>
                    )}
                  </div>
                </div>

                {anticipadasPorProducto.length === 0 ? (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
                    <CheckCircle2 size={16} />
                    Con el disponible y lo en producción actual, no hace falta cocer nada más para cubrir hasta esa fecha
                    (respetando los filtros de categoría/envase de arriba).
                  </div>
                ) : (
                  <div className="prod-stagger mt-4 flex flex-col gap-3">
                    {anticipadasPorProducto.map((grupo, idxGrupo) => (
                      <div key={grupo.producto} style={{ '--i': idxGrupo } as React.CSSProperties} className="prod-hover-card overflow-hidden rounded-lg border border-amber-200 bg-white">
                        <div className="flex flex-wrap items-center gap-2.5 border-b border-amber-100 bg-amber-50/60 px-4 py-2.5">
                          <ProductImage nombre={grupo.producto} categoria={grupo.categoria} size={30} radius={7} />
                          <span className="font-semibold text-gray-800">{grupo.producto}</span>
                          {/* Total EN LITROS del producto completo, sumando los 3 formatos —
                              independiente del envase, tal como se pidió: "cuánto necesitamos
                              cubrir en total" sin tener que sumar las filas de abajo a mano. */}
                          {grupo.totalAProducir > 0 && (
                            <span className="rounded-full bg-amber-200/70 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                              Total a producir: {fNum(grupo.totalAProducir)} L
                            </span>
                          )}
                          {grupo.totalStockSeguridad > 0 && (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700" title="Colchón mínimo que este producto debe tener siempre en stock, sumando sus 3 formatos — no es lo mismo que 'a producir' (la brecha actual).">
                              Stock de seguridad total: {fNum(grupo.totalStockSeguridad)} L
                            </span>
                          )}
                          {/* Recomendación de fermentador — sólo tanques vacíos de la
                              línea correcta (T=cerveza, K=kombucha), el más chico que
                              alcance para el litraje total del producto. Es sugerencia,
                              no asignación: el jefe de producción decide con esto delante,
                              no en base a esto solo. */}
                          {grupo.totalAProducir > 0 && (
                            grupo.fermentadorSugerido ? (
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                                  grupo.fermentadorAjustado
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : 'border-purple-200 bg-purple-50 text-purple-700'
                                }`}
                                title={grupo.fermentadorAjustado
                                  ? `Ningún tanque vacío de esta línea alcanza el litraje completo — ${grupo.fermentadorSugerido.tanque} (${fNum(grupo.fermentadorSugerido.capacidadLitros)} L) es el más grande disponible. Hay que cocer menos, partir en dos lotes, o esperar a que se libere uno más grande.`
                                  : `${grupo.fermentadorSugerido.tanque} está vacío y es el más chico que alcanza para ${fNum(grupo.totalAProducir)} L — no ocupa de más un tanque grande.`}
                              >
                                <Beaker size={11} className="mr-1 inline" />
                                {grupo.fermentadorAjustado ? 'No entra completo — ' : 'Usar '}
                                {grupo.fermentadorSugerido.tanque} ({fNum(grupo.fermentadorSugerido.capacidadLitros)} L)
                              </span>
                            ) : (
                              <span
                                className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-bold text-gray-500"
                                title={`No hay ningún fermentador de ${grupo.categoria === 'cerveza' ? 'cervecería (código T)' : 'kombuchería (código K)'} vacío en este momento.`}
                              >
                                Sin tanque vacío disponible
                              </span>
                            )
                          )}
                          {/* Mismo modo que "Agregar al plan" del Plan Maestro: un
                              solo botón por PRODUCTO con el litraje total, no uno
                              por formato — el reparto entre lata/barril se decide
                              después en el Split de Envasado, igual que en la
                              cocción real. La necesidad desglosada por envase sigue
                              abajo, fila por fila, sólo que ya no dispara un lote
                              cada una. */}
                          {grupo.totalAProducir > 0 && (
                            <button
                              disabled={guardandoPlan}
                              onClick={() => setSugerenciaModal(grupo)}
                              className="prod-press ml-auto shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              Agregar al plan — {fNum(grupo.totalAProducir)} L total
                            </button>
                          )}
                        </div>
                        <div className="divide-y divide-gray-100">
                          {grupo.items.map((item, i) => (
                            <div key={`${item.envase}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5" title={item.motivo}>
                              <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-amber-700">
                                {ENVASE_LABEL[item.envase] ?? item.envase}
                              </span>
                              <div className="min-w-[160px] flex-1">
                                {item.altaDemanda && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                                    <TrendingUp size={12} />
                                    Viene alta demanda
                                  </span>
                                )}
                                {/* Cuándo hay que largar la cocción para llegar a tiempo — la pieza
                                    que faltaba para armar planificación desde esta pantalla: antes
                                    sólo decía CUÁNTO producir, nunca CUÁNDO empezar. */}
                                {item.fechaLimiteInicio && item.litrosSugeridos > 0 && (
                                  <span
                                    className={`ml-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${
                                      item.atrasado ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                    title={item.atrasado
                                      ? `Con ${item.leadTimeSemanas} semanas de lead time, empezar hoy ya no llega antes del quiebre proyectado.`
                                      : `Último día hábil para empezar a cocer y llegar antes del quiebre proyectado (${item.leadTimeSemanas} semanas de lead time).`}
                                  >
                                    <CalendarIcon size={12} />
                                    {item.atrasado ? 'Atrasado — debió cocerse el ' : 'Cocer antes del '}
                                    {new Date(item.fechaLimiteInicio + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                  </span>
                                )}
                                {/* Antes de poder cocer hace falta tener los insumos en planta —
                                    eso toma su propio lead time de gestión con el proveedor
                                    (LEAD_TIME_INSUMOS_SEMANAS, ~2 semanas), así que este límite
                                    siempre cae antes que "Cocer antes del" de arriba. */}
                                {item.fechaLimiteGestion && item.litrosSugeridos > 0 && (
                                  <span
                                    className={`ml-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${
                                      item.atrasadoGestion ? 'bg-red-600 text-white' : 'bg-indigo-100 text-indigo-800'
                                    }`}
                                    title={item.atrasadoGestion
                                      ? `Con ${LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión de insumos + ${item.leadTimeSemanas} de cocción, empezar a gestionar hoy ya no llega antes del quiebre proyectado.`
                                      : `Último día hábil para empezar a gestionar los insumos con el proveedor y llegar antes del quiebre proyectado (${LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión + ${item.leadTimeSemanas} de cocción).`}
                                  >
                                    <ShoppingCart size={12} />
                                    {item.atrasadoGestion ? 'Atrasado — debió gestionarse el ' : 'Gestionar insumos antes del '}
                                    {new Date(item.fechaLimiteGestion + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                  </span>
                                )}
                                {/* litrosSugeridos sólo puede ser 0 cuando la fila entró a la lista
                                    por altaDemanda (el filtro de arriba descarta las que no tienen
                                    ni necesidad ni alza) — el disponible alcanza hoy, pero avisa
                                    igual porque se viene la temporada. */}
                                {item.litrosSugeridos === 0 && (
                                  <span className="ml-1.5 text-xs text-gray-400">Disponible alcanza por ahora.</span>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-right">
                                {/* Cuánto DEBE haber siempre (el colchón) — no la brecha a producir,
                                    para responder "cuál es nuestro stock de seguridad" tal cual se
                                    pidió, no sólo la necesidad de venta. */}
                                <div className="w-24">
                                  <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-sky-500">Stock seguridad</p>
                                  <p className="text-sm font-bold tabular-nums text-sky-700">{fNum(item.stockSeguridadLitros)} L</p>
                                  {(() => {
                                    const unidades = estimarUnidadesEnvase(item.envase, item.stockSeguridadLitros, item.disponibleLitros, item.disponibleUnidades)
                                    return unidades != null
                                      ? <p className="text-[11px] text-sky-400">≈{fNum(unidades)} {UNIDAD_ENVASE[item.envase]}</p>
                                      : null
                                  })()}
                                </div>
                                {/* A cuántos litros hay que reaccionar y empezar a gestionar —
                                    ya incluye el lead time de gestión de insumos con el proveedor
                                    (LEAD_TIME_INSUMOS_SEMANAS), no sólo el de cocción. Mismo dato
                                    que "Punto de reorden" en la tabla de Stock de Seguridad de
                                    abajo, acá al lado de "Disponible" para leerlo sin bajar. */}
                                <div className="w-24">
                                  <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-indigo-500">Punto reorden</p>
                                  <p className="text-sm font-bold tabular-nums text-indigo-700">{fNum(item.puntoReordenLitros)} L</p>
                                </div>
                                <div className="w-24">
                                  <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-gray-400">Disponible</p>
                                  <p className="text-sm font-bold tabular-nums text-gray-500">{fNum(item.disponibleLitros)} L</p>
                                  {item.disponibleUnidades != null && (
                                    <p className="text-[11px] text-gray-400">{fNum(item.disponibleUnidades)} {UNIDAD_ENVASE[item.envase]}</p>
                                  )}
                                </div>
                                <div className="w-20">
                                  <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-amber-600">A producir</p>
                                  <p className="text-sm font-bold tabular-nums text-gray-800">{fNum(item.litrosSugeridos)} L</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-gray-400">
                  Demanda proyectada = forecast de Prophet ciclo a ciclo entre hoy y la fecha elegida (el ciclo en curso
                  usa el ritmo de venta real, lun-vie). “Viene alta demanda” = el modelo ya identificó un empuje
                  estacional fuerte en algún mes dentro del período — anticiparse antes de que el punto de reorden lo
                  marque como crítico. “Punto reorden” ya suma {LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión de
                  insumos con el proveedor al lead time de cocción — “Gestionar insumos antes del” es el límite real
                  para reaccionar, antes de “Cocer antes del”.
                </p>
              </div>

              {/* Tabla de stock de seguridad */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
                  <div>
                    <h3 className="font-bold text-gray-800">Stock de Seguridad y Punto de Reorden</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {gruposStockSeguridad.length} productos · {filasStockSeguridad.length} combinaciones producto × formato · comparado contra el inventario actual del ERP.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Producto</span>
                      <div className="flex overflow-hidden rounded-md border border-gray-200">
                        {(['todas', 'cerveza', 'kombucha'] as const).map(c => (
                          <button
                            key={c}
                            onClick={() => setFiltroCategoriaSeg(c)}
                            className={`px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                              filtroCategoriaSeg === c ? 'bg-[#0F3D2E] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {c === 'todas' ? 'Todos' : c}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="envaseSeg" className="text-xs font-bold uppercase tracking-wider text-gray-500">Envase</label>
                      <select
                        id="envaseSeg"
                        value={filtroEnvaseSeg}
                        onChange={e => setFiltroEnvaseSeg(e.target.value)}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="todos">Todos los envases</option>
                        {ORDEN_ENVASE.map(b => <option key={b} value={b}>{ENVASE_LABEL[b]}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label htmlFor="mesSeg" className="text-xs font-bold uppercase tracking-wider text-gray-500">Mes</label>
                      <select
                        id="mesSeg"
                        value={mesSeguridadActivo}
                        onChange={e => setMesSeguridad(e.target.value)}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        {mesesSeguridad.map(m => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                      <tr>
                        <th className="px-6 py-3 font-bold">Producto</th>
                        <th className="px-4 py-3 font-bold">Categoría</th>
                        <th className="px-4 py-3 font-bold">Formato</th>
                        <th className="px-4 py-3 text-center font-bold">Ventana</th>
                        <th className="px-4 py-3 text-right font-bold">Demanda en ventana</th>
                        <th className="px-4 py-3 text-right font-bold text-amber-700">Stock Seguridad</th>
                        <th className="px-4 py-3 text-right font-bold text-amber-700">Punto Reorden</th>
                        <th className="px-4 py-3 text-right font-bold">En bodega</th>
                        <th className="px-4 py-3 text-right font-bold">En producción</th>
                        <th className="px-4 py-3 text-right font-bold">Disponible</th>
                        <th className="px-6 py-3 text-center font-bold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {gruposStockSeguridad.length === 0 && (
                        <tr><td colSpan={11} className="px-6 py-10 text-center text-gray-400">Sin datos para este filtro.</td></tr>
                      )}
                      {gruposStockSeguridad.map(grupo => grupo.filas.map((f, i) => (
                        <tr key={`${f.producto}::${f.envase ?? ''}`} className="prod-hover-row transition-colors hover:bg-gray-50">
                          {i === 0 && (
                            <td rowSpan={grupo.filas.length} className="border-r border-gray-100 px-6 py-3 align-top font-semibold text-gray-800">
                              <span className="inline-flex items-center gap-2.5">
                                <ProductImage nombre={grupo.producto} categoria={grupo.categoria} size={32} radius={8} />
                                {grupo.producto}
                              </span>
                            </td>
                          )}
                          {i === 0 && (
                            <td rowSpan={grupo.filas.length} className="border-r border-gray-100 px-4 py-3 align-top">
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-bold capitalize ${
                                grupo.categoria === 'cerveza' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}>
                                {grupo.categoria}
                              </span>
                            </td>
                          )}
                          {/* flex+gap para separar el chip, NO ml-2: el reset
                              global `* { margin:0; padding:0 }` de globals.css
                              gana sobre las utilidades de margin/padding de
                              Tailwind (van en @layer, el reset no), así que
                              ml-* y px-* quedan en 0. gap sí funciona. */}
                          <td className="px-4 py-3 text-gray-600">
                            <span className="inline-flex items-center gap-2">
                              {f.envase ? (ENVASE_LABEL[f.envase as keyof typeof ENVASE_LABEL] ?? f.envase) : '—'}
                              {f.metodo === 'derivado' && (
                                <span
                                  className="inline-block rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600"
                                  title="Muy poca historia propia (o un modelo propio con demasiado error) para confiar en un forecast entrenado sólo sobre este formato. Se repartió el forecast del producto —que tiene mucha más historia y es más estable— según qué % de ese producto fue este formato en los últimos meses."
                                >
                                  derivado
                                </span>
                              )}
                              {f.confianza !== 'alta' && (
                                <span
                                  className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                                    f.confianza === 'media' ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-gray-200 bg-gray-50 text-gray-400'
                                  }`}
                                  title={
                                    `Confianza ${f.confianza}. ` +
                                    (f.mapeBacktest != null ? `Error del modelo en el backtest: ${f.mapeBacktest.toFixed(0)}%. ` : 'Sin backtest disponible. ') +
                                    (f.mesesHistorial != null ? `${f.mesesHistorial} meses de historial.` : '')
                                  }
                                >
                                  confianza {f.confianza}
                                </span>
                              )}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3 text-center tabular-nums text-gray-600"
                            title={`Lead time de cocción ${f.leadTimeSemanas} sem. + gestión de insumos con el proveedor ${LEAD_TIME_INSUMOS_SEMANAS} sem. + revisión mensual ${f.periodoRevisionSemanas.toFixed(1)} sem.`}
                          >
                            {(f.leadTimeSemanas + LEAD_TIME_INSUMOS_SEMANAS + f.periodoRevisionSemanas).toFixed(1)} sem.
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fNum(f.demandaEnVentana)} L</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-amber-700">{fNum(f.stockSeguridadLitros)} L</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{fNum(f.puntoReordenLitros)} L</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {f.stockActualLitros != null ? `${fNum(f.stockActualLitros)} L` : <span className="text-gray-300">sin dato</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                            {f.litrosEnProduccion > 0 ? `+${fNum(f.litrosEnProduccion)} L` : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800">
                            {f.disponible != null ? `${fNum(f.disponible)} L` : <span className="text-gray-300">sin dato</span>}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                              f.estado === 'critico' ? 'border-red-200 bg-red-50 text-red-600'
                                : f.estado === 'bajo' ? 'border-amber-200 bg-amber-50 text-amber-600'
                                  : f.estado === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                    : 'border-gray-200 bg-gray-50 text-gray-400'
                            }`}>
                              {f.estado === 'critico' ? 'CRÍTICO' : f.estado === 'bajo' ? 'BAJO' : f.estado === 'ok' ? 'OK' : 'SIN DATO'}
                            </span>
                          </td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Inventario actual, agrupado producto → formato → cámara */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-4">
                  <h3 className="font-bold text-gray-800">Inventario Actual</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Foto del último informe de stock del ERP · {inventarioAgrupado.length} productos, {stock.length} líneas.
                  </p>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                      <tr>
                        <th className="px-6 py-3 font-bold">Producto</th>
                        <th className="px-4 py-3 font-bold">Categoría</th>
                        <th className="px-4 py-3 font-bold">Formato</th>
                        <th className="px-4 py-3 font-bold">Cámara</th>
                        <th className="px-4 py-3 text-right font-bold">Cantidad</th>
                        <th className="px-6 py-3 text-right font-bold">Litros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {inventarioAgrupado.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Sin informe de stock cargado.</td></tr>
                      )}
                      {inventarioAgrupado.map(grupo => {
                        const filasCamara = grupo.formatos.reduce((n, f) => n + f.camaras.length, 0)
                        let primeraFilaProducto = true
                        return (
                          <React.Fragment key={grupo.producto}>
                            {grupo.formatos.map(formato => {
                              let primeraFilaFormato = true
                              return formato.camaras.map(fc => {
                                const fila = (
                                  <tr key={`${grupo.producto}::${formato.bucket}::${fc.camara}`} className="prod-hover-row transition-colors hover:bg-gray-50">
                                    {primeraFilaProducto && (
                                      <td rowSpan={filasCamara} className="border-r border-gray-100 px-6 py-2.5 align-top font-semibold text-gray-800">
                                        <span className="inline-flex items-center gap-2.5">
                                          <ProductImage nombre={grupo.producto} categoria={grupo.categoria} size={32} radius={8} />
                                          {grupo.producto}
                                        </span>
                                      </td>
                                    )}
                                    {primeraFilaProducto && (
                                      <td rowSpan={filasCamara} className="border-r border-gray-100 px-4 py-2.5 align-top">
                                        {grupo.categoria && (
                                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold capitalize ${
                                            grupo.categoria === 'cerveza' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                                          }`}>
                                            {grupo.categoria}
                                          </span>
                                        )}
                                      </td>
                                    )}
                                    {primeraFilaFormato && (
                                      <td rowSpan={formato.camaras.length} className="border-r border-gray-100 px-4 py-2.5 align-top font-semibold text-gray-700">
                                        {ENVASE_LABEL[formato.bucket]}
                                      </td>
                                    )}
                                    <td className="px-4 py-2.5 text-gray-600">{nombreCamaraCorto(fc.camara)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fNum(fc.cantidad)}</td>
                                    <td className="px-6 py-2.5 text-right tabular-nums text-gray-600">{fc.litros != null ? `${fNum(fc.litros)} L` : '—'}</td>
                                  </tr>
                                )
                                primeraFilaProducto = false
                                primeraFilaFormato = false
                                return fila
                              })
                            })}
                            {/* Subtotal del producto: lo que pide la vista agrupada —
                                cuánto hay en total, sin tener que sumar a mano las
                                filas de formato×cámara de arriba. */}
                            <tr className="bg-gray-50/70 font-bold text-gray-700">
                              <td colSpan={4} className="px-6 py-2 text-right text-xs uppercase tracking-wide text-gray-500">
                                Total {grupo.producto}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">{fNum(grupo.cantidad)}</td>
                              <td className="px-6 py-2 text-right tabular-nums">{grupo.litros != null ? `${fNum(grupo.litros)} L` : '—'}</td>
                            </tr>
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ VISTA: CUÁNDO COCINAR ══════════
              El calendario de producción. Antes vivía adentro de "Stock de
              Seguridad", que ya se había vuelto un cajón de siete secciones
              con nombre de una sola. Son dos preguntas distintas y ahora son
              dos pantallas: allá se responde CUÁNTO hay que cocer (colchón,
              punto de reorden, necesidad); acá CUÁNDO, con qué tanque y en
              qué orden. */}
          {activeTab === 'calendario' && (
            <div className="flex flex-col gap-4 pb-4">
              <PreguntaDeLaVista
                pregunta="¿Cuándo vamos a cocinar, y en qué tanque?"
                detalle="El plan sale del forecast y del punto de reorden de cada producto, acotado a los fermentadores que existen de verdad. Arrastrá una cocción para moverla: se replanifica todo lo que viene después."
              />
              {/* ══════════ PLAN DE COBERTURA ══════════
                  Resumen mensual del MISMO plan que muestra el calendario de
                  abajo — no un cálculo aparte. Cada cifra de acá es la suma
                  de lotes reales ya asignados a un tanque concreto, así que
                  las dos vistas no pueden contradecirse. */}
              {planSugerido.porMes.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CalendarIcon size={18} style={{ color: COLORS.darkGreen }} />
                      <h3 className="font-bold text-gray-800">Plan de Cobertura — {horizontePlanMeses} {horizontePlanMeses === 1 ? 'mes' : 'meses'}</h3>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                        {planSugerido.lotes.filter(l => !l.enCurso).length} {planSugerido.lotes.filter(l => !l.enCurso).length === 1 ? 'cocción' : 'cocciones'} programadas
                      </span>
                      {/* El plan arranca de la planta real: lo que hoy está en los
                          tanques no se vuelve a cocer, y esos fermentadores no se
                          pueden usar hasta que se embarrilen. */}
                      {planSugerido.lotes.some(l => l.enCurso) && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                          + {fNum(planSugerido.lotes.filter(l => l.enCurso).reduce((a, l) => a + l.litros, 0))} L ya fermentando
                          en {planSugerido.lotes.filter(l => l.enCurso).length} {planSugerido.lotes.filter(l => l.enCurso).length === 1 ? 'tanque' : 'tanques'}
                        </span>
                      )}
                    </div>
                    {/* Cuánto simula el motor hacia adelante. Tope real: no hay
                        forecast más allá de horizontePlanMax, así que no tiene
                        sentido ofrecer más — sería un horizonte vacío. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[3, 6, 9, 12]
                        .filter(n => n <= horizontePlanMax)
                        .map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setHorizontePlanMeses(n)}
                            className={`prod-press rounded-full px-2.5 py-1 text-xs font-bold ${
                              horizontePlanMeses === n ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                            style={horizontePlanMeses === n ? { backgroundColor: COLORS.darkGreen } : undefined}
                          >
                            {n} {n === 1 ? 'mes' : 'meses'}
                          </button>
                        ))}
                      {horizontePlanMax > 3 && (
                        <button
                          type="button"
                          onClick={() => setHorizontePlanMeses(horizontePlanMax)}
                          className={`prod-press rounded-full px-2.5 py-1 text-xs font-bold ${
                            horizontePlanMeses === horizontePlanMax ? 'text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                          style={horizontePlanMeses === horizontePlanMax ? { backgroundColor: COLORS.darkGreen } : undefined}
                        >
                          Hasta fin del forecast
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    Todas las cocciones sugeridas —de este mes o de más adelante— entran{' '}
                    <strong className="mx-1">desmarcadas</strong> del presupuesto: son propuestas del modelo, no algo
                    ya decidido, así que hay que activarlas a mano (clic en la tarjeta) antes de que sumen a la compra.
                    Lo que ya está fermentando no necesita esto — sus insumos ya se compraron.
                  </p>
                  <p className="mb-4 text-sm text-gray-500">
                    Simulación día a día del inventario de cada producto: el stock baja al ritmo del forecast y se
                    programa una cocción cada vez que toca su punto de reorden, arrancando por la fecha que ya propone
                    el Plan Maestro. Cada cocción se acota al tamaño de un tanque que existe de verdad, con su
                    fermentador asignado. Parte de la planta como está hoy: lo que ya se está fermentando no se vuelve
                    a cocer, suma a stock recién el día que se embarrila, y mantiene su tanque ocupado hasta entonces
                    — el detalle día por día está en el calendario de abajo.
                  </p>

                  {planSugerido.sinTanque.length > 0 && (
                    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                      <div>
                        <p className="font-bold">
                          {planSugerido.sinTanque.length} {planSugerido.sinTanque.length === 1 ? 'volumen sin tanque' : 'volúmenes sin tanque'} donde ponerlo
                        </p>
                        <p className="mt-0.5 text-red-700">
                          {planSugerido.sinTanque.map(s => `${s.producto} (${fNum(s.litros)} L)`).join(', ')} — no alcanzan
                          los fermentadores de esa línea dentro del horizonte. Hay que sumar capacidad, correr la
                          cobertura, o aceptar el quiebre.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <div className="flex min-w-max gap-3 pb-1">
                      {planSugerido.porMes.map(f => (
                        <div
                          key={f.mes}
                          className={`prod-hover-card w-60 shrink-0 rounded-lg border p-3 ${
                            f.severidad === 'critico' ? 'border-red-300 bg-red-50/60'
                              : f.severidad === 'ajustado' ? 'border-amber-300 bg-amber-50/60'
                              : 'border-emerald-200 bg-emerald-50/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold capitalize text-gray-800">{f.etiqueta}</span>
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                f.severidad === 'critico' ? 'bg-red-500' : f.severidad === 'ajustado' ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              title={
                                f.severidad === 'critico' ? 'Hay cocciones que no alcanzan a estar listas antes de que el producto se agote.'
                                  : f.severidad === 'ajustado' ? 'Alguna cocción tuvo que correrse de su fecha ideal por falta de tanque libre.'
                                  : 'Todo entra en fecha con los tanques disponibles.'
                              }
                            />
                          </div>

                          <div className="mt-2.5 border-t border-gray-200/70 pt-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Cervecería (T)</span>
                              <span className="text-xs font-bold tabular-nums text-gray-800">{fNum(f.litrosCerveza)} L</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              {f.lotesCerveza === 0 ? 'Sin cocciones' : `${f.lotesCerveza} ${f.lotesCerveza === 1 ? 'cocción' : 'cocciones'}`}
                            </p>
                          </div>

                          <div className="mt-2 border-t border-gray-200/70 pt-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Kombuchería (K)</span>
                              <span className="text-xs font-bold tabular-nums text-gray-800">{fNum(f.litrosKombucha)} L</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              {f.lotesKombucha === 0 ? 'Sin cocciones' : `${f.lotesKombucha} ${f.lotesKombucha === 1 ? 'cocción' : 'cocciones'}`}
                            </p>
                          </div>

                          {f.lotesTarde > 0 ? (
                            <p className="mt-2.5 border-t border-gray-200/70 pt-2 text-[11px] font-bold text-red-600">
                              {f.lotesTarde} {f.lotesTarde === 1 ? 'cocción no llega' : 'cocciones no llegan'} antes de que se agote el producto.
                            </p>
                          ) : f.lotesCerveza + f.lotesKombucha === 0 ? (
                            <p className="mt-2.5 border-t border-gray-200/70 pt-2 text-[11px] text-emerald-600">
                              Cubierto con stock + colchón, sin cocer nada nuevo.
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Carta Gantt de ocupación de fermentadores — reemplaza a las
                  dos grillas de calendario que había antes (ésta, con las
                  sugerencias, y el Cronograma de Cocciones de Resumen, con lo
                  confirmado). Eran la misma planta contada dos veces: había
                  que mirar las dos para saber si quedaba un tanque libre.

                  Acá filas = tanques y columnas = días CORRIDOS. Lo confirmado
                  va sólido y lo sugerido punteado; arrastrar un bloque cambia
                  su día y su tanque, y eso se guarda en base. */}
              <GanttProduccion
                fermentadores={fermentadoresGantt}
                bloques={bloquesGantt}
                config={configGantt}
                arrastre={arrastre}
                propsOrigen={(carga, habilitado) => {
                  // La categoría de lo que se está arrastrando se guarda acá
                  // porque puedeSoltarEnCelda corre dentro de un listener
                  // global que no puede leerla del closure.
                  const base = propsOrigen(carga, habilitado) as Record<string, unknown>
                  const onPointerDown = base.onPointerDown as ((e: React.PointerEvent) => void) | undefined
                  return {
                    ...base,
                    onPointerDown: (e: React.PointerEvent) => {
                      arrastreCategoriaRef.current = carga.categoria
                      onPointerDown?.(e)
                    },
                  }
                }}
                cobertura={coberturaGantt}
                necesidad={necesidadGantt}
                hastaMes={ultimoMesForecast}
                bloqueRecienMovido={bloqueRecienMovido}
                anclasEnSesion={anclasCoccion.size + anclasTanque.size}
                onLimpiarAnclas={limpiarAnclas}
                onAbrirConfig={() => setConfigAbierta(true)}
                onAgregarProducto={() => setAgregarProductoAbierto(true)}
                onAbrirBloque={(b, rect) => {
                  if (!rect) return
                  // Detectado en el ERP: no hay lote de plan detrás, así que
                  // no hay un popover de cocción que abrir — se abre el editor
                  // de fechas, que es la única acción que tiene sentido acá.
                  if (b.tipo === 'en_tanque') {
                    if (!b.codigoLote || !b.fermentador) return
                    setErrorAjusteTanque(null)
                    setEditarTanqueAbierto({
                      tanque: b.fermentador, codigoLote: b.codigoLote,
                      producto: b.producto, categoria: b.categoria,
                      inicioISO: b.inicioISO,
                      embarrilladoISO: sumarDiasCalISO(b.inicioISO, b.dias),
                      rect,
                    })
                    return
                  }
                  // El popover trabaja sobre la simulación de planSugerido
                  // (litros, tanque, cuándo queda listo, hasta cuándo alcanza),
                  // así que sólo se abre para bloques sugeridos: un lote ya
                  // confirmado no tiene esa proyección detrás.
                  const lote = planSugerido.lotes.find(l => `sug:${l.id}` === b.id)
                  if (lote) fijarDetalle(lote, rect)
                }}
                onQuitarBloque={b => {
                  // El id de un bloque confirmado ES el id del lote (ver
                  // bloquesGantt más arriba) — no hace falta buscarlo.
                  // Cancelar y no borrar: `cambiarEstadoLote` ya trata
                  // 'cancelado' como sacarlo del plan, y deja el registro en
                  // base por si hay que auditar qué se quitó y cuándo.
                  void cambiarEstadoLote(b.id, 'cancelado')
                }}
              />

              {/* Tarjetas de cocciones sugeridas — quedan como estaban: el
                  Gantt responde "cuándo y en qué tanque", y estas tarjetas
                  "por qué y con qué litraje", que es donde se confirman. */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="hidden overflow-auto p-4 sm:block">

                {/* Detalle de la cocción: preview al pasar el cursor, panel
                    fijado al hacer clic. Vive en un portal a document.body
                    (dentro del componente) para que ninguna celda con scroll
                    lo recorte, sin importar en qué borde de la grilla esté. */}
                {detalleCoccion && (
                  <PopoverCoccion
                    lote={detalleCoccion.lote}
                    rect={detalleCoccion.rect}
                    modo={detalleCoccion.modo}
                    hoyISO={calendarioCobertura.hoyISO}
                    marcado={!detalleCoccion.lote.enCurso && estaSeleccionado(detalleCoccion.lote)}
                    tanques={ocupacionPlanta.tanques}
                    fNum={fNum}
                    onAlternar={() => alternarLote(detalleCoccion.lote)}
                    onAnclarTanque={t => anclarTanque(detalleCoccion.lote.producto, detalleCoccion.lote.loteNro, t)}
                    onMoverFecha={f => {
                      anclarCoccion(detalleCoccion.lote.producto, detalleCoccion.lote.loteNro, f)
                      cerrarDetalle()
                    }}
                    /* Confirmar la sugerencia tal como está. Antes la única
                       forma era arrastrarla al Gantt, lo que obligaba a
                       reubicarla para aceptarla: si el modelo ya la puso donde
                       corresponde, mover es ruido. Los lotes sin tanque
                       (`—`, los que nunca encontraron fermentador) se
                       confirman igual pero sin asignar, para que queden
                       visibles en la fila "sin asignar" en vez de perderse. */
                    onConfirmar={detalleCoccion.lote.enCurso ? undefined : () => {
                      const l = detalleCoccion.lote
                      void agregarLote({
                        producto: l.producto,
                        categoria: l.categoria,
                        litrosPlanificados: l.litros,
                        fechaPlanificada: l.fechaInicio,
                        motivo: l.conAlarma
                          ? `Confirmado desde el Gantt — alarma de quiebre, cubre hasta el ${l.cubreHasta}`
                          : `Confirmado desde el Gantt — punto de reorden, cubre hasta el ${l.cubreHasta}`,
                        origen: 'sugerido',
                        cubreHasta: l.cubreHasta,
                        fermentador: l.tanque === '—' ? null : l.tanque,
                      })
                      cerrarDetalle()
                    }}
                    confirmando={guardandoPlan}
                    onCerrar={cerrarDetalle}
                    onMouseEnter={detalleCoccion.modo === 'preview' ? cancelarCierrePreview : undefined}
                    onMouseLeave={detalleCoccion.modo === 'preview' ? programarCierrePreview : undefined}
                  />
                )}

                  <p className="mt-3 text-xs text-gray-400">
                    Cada tarjeta es una cocción concreta: un volumen que cabe en un tanque que existe, con ese tanque
                    ya asignado y su fecha. La primera cocción de cada producto va en la fecha que propone el Plan
                    Maestro; de ahí en adelante se simula el consumo del forecast día a día y la siguiente se agenda
                    cuando el stock proyectado toca el punto de reorden — por eso las cocciones de un mismo producto
                    se reparten en el tiempo en vez de amontonarse. Cada tanque queda tomado el lead time completo
                    antes de poder reutilizarse, y la sala de cocción tiene tope: hasta {COCCIONES_POR_DIA_LINEA} cocciones
                    por día por línea, sólo en días hábiles (no se macera sábado, domingo ni feriado). El tanque se
                    elige para cocer lo menos veces posible, que es lo que baja la merma: si un fermentador libre cierra
                    todo el volumen se usa el más chico que lo cierre —misma merma, y los grandes quedan libres para
                    quien los necesita—; si ninguno alcanza se llena el más grande disponible y el resto va a la cocción
                    siguiente. <strong>Arrastrá una cocción a otro día para moverla</strong>: el plan se vuelve a simular completo
                    desde ahí, así que las cocciones siguientes de ese producto se recalculan con el forecast (si la
                    adelantás, la que viene se corre; si la atrasás, se acerca) y el presupuesto de abajo se ajusta con
                    sus nuevas fechas de compra. Una cocción movida no puede saltarse la planta: si ese día no hay
                    tanque libre de su línea, no hay cupo de sala o es feriado, cae en el primer día que sí se pueda y
                    el panel de detalle lo dice. Pasá el cursor por una cocción para ver litros, tanque, cuándo queda listo y hasta
                    cuándo alcanza; <strong>hacé clic para fijar el panel</strong> y desde ahí incluirla en el presupuesto, cambiarle el
                    tanque o moverla de fecha. Borde punteado = sugerencia sin confirmar; borde azul lleno = <strong>ya está fermentando</strong> (no hay que
                    cocerla: se muestra en la fecha real de embarrilado que trae el ERP, que es cuando entra a bodega y
                    se libera el fermentador); borde azul con ⚠ = esa fecha de embarrilado <strong>ya pasó</strong> y el
                    tanque sigue con producto según el ERP — vale la pena confirmar en planta si es un dato viejo o si
                    de verdad sigue tomado; <Beaker size={9} className="inline text-purple-600" /> = se corrió de su fecha ideal
                    porque no había tanque libre de su línea, pero llega igual; borde rojo = el stock se agota antes de
                    que esta cocción esté lista; <strong>tarjeta gris y apagada</strong> = está fuera del presupuesto —
                    TODA cocción sugerida entra así por defecto, sea de este mes o de dentro de un año, porque sigue
                    siendo una propuesta del modelo y no algo ya decidido; un clic la activa; <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" /> = <strong>tanque elegido a mano</strong> desde el desplegable del tooltip —
                    se llena entero en vez de sólo lo que pedía el reorden, y el excedente corre la próxima cocción más
                    adelante (&quot;Alcanza hasta&quot; lo refleja); &quot;Automático&quot; en el desplegable vuelve al criterio del
                    modelo. Elegir tanque nunca desplaza lo que ya está adentro: si el elegido sigue ocupado, la
                    cocción espera a que se libere, igual que al mover la fecha. El lead time es por línea (4 semanas
                    cerveza / 3 kombucha), no por estilo puntual — todavía no hay ese dato cargado por receta. Se
                    recalcula solo con cada carga de la pantalla. Confirmalas desde las tarjetas de abajo o desde Plan Maestro.
                  </p>
                </div>
              </div>

              {/* Capacidad de Planta — la dimensión que faltaba para que la
                  planificación de arriba sea ejecutable: de nada sirve saber
                  cuánto y cuándo cocer si no se sabe si hay tanque libre para
                  meterlo. Va ANTES de "Necesidad de Producción Anticipada" a
                  propósito: primero el espacio disponible, después la
                  decisión de qué llenar con él. */}
              {ocupacionPlanta.capacidadTotalLitros != null && (() => {
                // Desglose por línea: los tanques T son exclusivos de
                // cervecería y los K de kombuchería (decisión del usuario,
                // 14-sep-2026) — verlas por separado importa porque un 90%
                // de ocupación GENERAL puede esconder que la línea que
                // realmente falta llenar está casi vacía.
                const porCategoria = (cat: 'cerveza' | 'kombucha') => {
                  const tanquesCat = ocupacionPlanta.tanques.filter(t => t.categoria === cat)
                  const capacidad = tanquesCat.reduce((s, t) => s + t.capacidadLitros, 0)
                  const ocupado = tanquesCat.reduce((s, t) => s + t.litros, 0)
                  return { capacidad, ocupado, libre: capacidad - ocupado }
                }
                const cerveza = porCategoria('cerveza')
                const kombucha = porCategoria('kombucha')

                return (
                <div className={`rounded-xl border bg-white shadow-sm transition-shadow duration-300 ${capacidadPlantaAbierta ? 'border-gray-300 shadow-md' : 'border-gray-200'}`}>
                  <button
                    type="button"
                    onClick={() => setCapacidadPlantaAbierta(v => !v)}
                    aria-expanded={capacidadPlantaAbierta}
                    className="prod-press flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-gray-50/60 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4 sm:p-5"
                  >
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-800">Capacidad de Planta — Fermentadores y Estanques</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Cuánto espacio real hay para la próxima cocción, tanque por tanque — el jefe de producción
                        es el último filtro: esto sólo muestra dónde entra, no decide qué cocer.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span><span className="font-bold text-gray-700">Cervecería (T):</span> {fNum(cerveza.libre)} L libres de {fNum(cerveza.capacidad)} L</span>
                        <span><span className="font-bold text-gray-700">Kombuchería (K):</span> {fNum(kombucha.libre)} L libres de {fNum(kombucha.capacidad)} L</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Libre</p>
                        <p className="text-xl font-black text-emerald-700">{fNum(ocupacionPlanta.litrosLibres!)} L</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Ocupado</p>
                        <p className="text-xl font-black text-gray-800">{fNum(ocupacionPlanta.litrosEnFermentacion)} L</p>
                      </div>
                      <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                        (ocupacionPlanta.porcentajeOcupacion ?? 0) >= 85 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {ocupacionPlanta.porcentajeOcupacion}% ocupado
                      </span>
                      <ChevronDown
                        size={20}
                        className={`shrink-0 text-gray-400 transition-transform duration-300 ${capacidadPlantaAbierta ? 'rotate-180 text-gray-600' : ''}`}
                      />
                    </div>
                  </button>

                  <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${capacidadPlantaAbierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-5 sm:px-5">
                        {/* Barra agregada de planta — mismo lenguaje visual que las
                            barras por tanque de abajo, a escala de toda la planta. */}
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${(ocupacionPlanta.porcentajeOcupacion ?? 0) >= 85 ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, ocupacionPlanta.porcentajeOcupacion ?? 0)}%` }}
                          />
                        </div>

                        {/* Tanques ordenados por espacio LIBRE descendente — el
                            jefe de producción mira primero dónde hay más lugar para
                            meter la próxima cocción, no dónde hay más contenido. */}
                        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                          {[...ocupacionPlanta.tanques]
                            .sort((a, b) => b.libreLitros - a.libreLitros)
                            .map(t => {
                              const pct = t.capacidadLitros > 0 ? Math.min(100, Math.round((t.litros / t.capacidadLitros) * 100)) : 0
                              const vacio = t.litros === 0
                              return (
                                <div
                                  key={t.tanque}
                                  className={`prod-hover-card rounded-lg border p-2.5 ${vacio ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}
                                  title={`${t.tanque} (${t.tipo}, ${t.categoria === 'cerveza' ? 'cervecería' : 'kombuchería'}) — ${fNum(t.litros)} / ${fNum(t.capacidadLitros)} L, ${fNum(t.libreLitros)} L libres`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="truncate text-xs font-bold text-gray-800">{t.tanque}</p>
                                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${
                                      t.categoria === 'cerveza' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {t.categoria === 'cerveza' ? 'CERV' : 'KOMB'}
                                    </span>
                                  </div>
                                  <p className="truncate text-[10px] text-gray-400">{t.tipo}</p>
                                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                    <div
                                      className={`h-full rounded-full ${vacio ? 'bg-gray-200' : pct >= 90 ? 'bg-red-500' : 'bg-[#0F3D2E]'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 flex items-baseline justify-between">
                                    <span className="text-[11px] tabular-nums text-gray-500">{fNum(t.litros)}/{fNum(t.capacidadLitros)} L</span>
                                    {vacio ? (
                                      <span className="text-[10px] font-bold text-emerald-600">Libre</span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-gray-400">{fNum(t.libreLitros)} L libres</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                )
              })()}

              {/* Puente al presupuesto: lo que se marca acá es lo que se
                  compra allá. Sin esta tira el usuario no ve que su selección
                  tuvo efecto, porque el presupuesto vive en otra pestaña. */}
              {presupuesto.cocciones > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('insumos')}
                  className="prod-press prod-hover-card flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingCart size={18} style={{ color: COLORS.darkGreen }} />
                    <div>
                      <p className="text-sm font-bold text-gray-800">
                        {presupuesto.cocciones} {presupuesto.cocciones === 1 ? 'cocción marcada' : 'cocciones marcadas'} · {fNum(presupuesto.litros)} L
                      </p>
                      <p className="text-xs text-gray-500">Insumos para cocerlas, con su fecha de compra</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold tabular-nums" style={{ color: COLORS.darkGreen }}>
                      ${fNum(presupuesto.total)}
                    </span>
                    <span className="text-xs font-bold text-gray-400">Ver presupuesto</span>
                  </div>
                </button>
              )}
            </div>
          )}


          {/* ══════════ VISTA 4: PLAN MAESTRO ══════════
              Cola priorizada (estilo kanban/MRP: arriba = próximo a cocer).
              Combina lo agendado a mano con alarmas de quiebre en vivo — por
              producto×envase, cruzando el punto de reorden (Stock de
              Seguridad) con el ritmo de venta real del ciclo — para
              balancear quiebre de stock vs. sobreproducción sin inventar una
              fórmula nueva. */}
          {activeTab === 'plan' && (
            <div className="prod-enter flex h-full flex-col gap-6">
              <PreguntaDeLaVista
                pregunta="¿Qué está confirmado para cocinar?"
                detalle="La cola real de cocciones ya comprometidas, con su prioridad y su split de envasado. Lo de acá ya se decidió; lo sugerido vive en Cuándo cocinar."
              />


              {/* ── Split de Envasado ──────────────────────────────────────
                  Lo que está en el fermentador es líquido a granel, sin
                  envase todavía. Esto responde la pregunta de quien va a
                  envasar: de estos N litros, ¿cuánto va a cada formato? El
                  reparto sale de la NECESIDAD de cada formato según el
                  forecast (qué tan lejos está de su punto de reorden), no de
                  un porcentaje fijo. */}
              {splitFermentadores.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Beaker size={18} className="text-blue-600" />
                    <h3 className="font-bold text-blue-900">Split de Envasado</h3>
                    <span className="rounded-full bg-blue-200/70 px-2 py-0.5 text-xs font-bold text-blue-800">
                      {fNum(splitFermentadores.reduce((a, s) => a + s.litrosEnFermentador, 0))} L en fermentadores
                    </span>
                  </div>
                  <p className="mb-2 text-sm text-blue-800/80">
                    Lo que está fermentando todavía no tiene envase. Cada lote se reparte entre formatos y, dentro de
                    eso, cumple tres funciones: <strong>reponer el colchón</strong> de stock de seguridad,{' '}
                    <strong>cubrir la venta</strong> mientras llega la próxima cocción, y el <strong>excedente</strong>,
                    que estira la cobertura hacia adelante.
                  </p>
                  {/* Un lote pasa 3+ semanas en el tanque: el reparto no es una
                      decisión de una sola vez, se recalcula con cada sync. */}
                  <p className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-blue-700/70">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    El reparto se recalcula con cada entrada de ventas — si un formato se acelera, el split se corrige
                    solo, sin esperar la corrida mensual del forecast.
                    {minutosDesdeSyncStock != null && <span>· Inventario {fMinutosDesde(minutosDesdeSyncStock)}</span>}
                  </p>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {splitFermentadores.map(s => (
                      <div key={s.producto} className="rounded-lg border border-blue-200 bg-white p-4">
                        <div className="flex items-center gap-2.5">
                          <ProductImage nombre={s.producto} categoria={s.categoria} size={30} radius={7} />
                          <div className="flex flex-col">
                            <span className="font-semibold leading-tight text-gray-800">{s.producto}</span>
                            <span className="text-[11px] text-gray-400">
                              {s.tanques.length > 0
                                ? s.tanques.map(t => t.nombre).join(' · ')
                                : 'Sin tanque identificado'}
                            </span>
                          </div>
                          <span className="ml-auto text-right">
                            <span className="block text-lg font-black tabular-nums text-blue-800">{fNum(s.litrosEnFermentador)} L</span>
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">a granel</span>
                          </span>
                        </div>

                        {/* Fecha embarrilado ESTIMADA (la calcula el enólogo,
                            no un hecho ya ocurrido) — es lo que conecta este
                            panel con el Plan Maestro: hasta que no llega esta
                            fecha, el lote no existe como producto envasado
                            que se pueda vender. */}
                        {s.fechaDisponibleEstimada && (() => {
                          const hoyISO = hoyLocalISO()
                          const atrasado = s.fechaDisponibleEstimada < hoyISO
                          const fechaFmt = new Date(s.fechaDisponibleEstimada + 'T00:00:00Z')
                            .toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })
                          return (
                            <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold ${atrasado ? 'text-amber-700' : 'text-blue-700'}`}>
                              <CalendarDays size={12} />
                              {atrasado
                                ? `Debería haber salido del fermentador el ${fechaFmt} — revisar atraso`
                                : `Sale del fermentador ≈ ${fechaFmt}${s.tanques.length > 1 ? ' (todos los tanques)' : ''}`}
                            </p>
                          )
                        })()}

                        {/* Lote sin forecast por formato: se muestra igual —
                            hay que envasarlo — pero sin inventar un reparto. */}
                        {s.reparto.length === 0 ? (
                          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                            Sin forecast por formato para este producto todavía, así que no hay con qué calcular el
                            reparto. El lote igual hay que envasarlo: defínelo a mano al sacarlo del tanque.
                          </div>
                        ) : (
                        <>
                        {/* Barra apilada: el reparto de un vistazo. */}
                        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                          {s.reparto.map(r => (
                            <div
                              key={r.envase}
                              title={`${ENVASE_LABEL[r.envase] ?? r.envase}: ${r.porcentaje}%`}
                              style={{ width: `${r.porcentaje}%`, backgroundColor: COLOR_ENVASE[r.envase] }}
                            />
                          ))}
                        </div>

                        <div className="mt-3 flex flex-col gap-1.5">
                          {s.reparto.map(r => (
                            <div key={r.envase} className="flex items-center gap-2 text-sm">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLOR_ENVASE[r.envase] }} />
                              <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-gray-500">
                                {ENVASE_LABEL[r.envase] ?? r.envase}
                              </span>
                              <span className="w-12 shrink-0 text-right text-sm font-black tabular-nums text-gray-800">{r.porcentaje}%</span>
                              <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-blue-800">{fNum(r.litros)} L</span>
                              {/* Los tres destinos, para que el número no sea mágico. */}
                              <span className="ml-auto text-right text-[11px] text-gray-400">
                                {[
                                  r.litrosColchon > 0 ? `${fNum(r.litrosColchon)} colchón` : null,
                                  r.litrosVentanaReposicion > 0 ? `${fNum(r.litrosVentanaReposicion)} venta` : null,
                                  r.litrosExcedente > 0 ? `${fNum(r.litrosExcedente)} excedente` : null,
                                ].filter(Boolean).join(' + ')} L
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* ── Destino del lote: para qué sirve, no sólo en qué
                            envase queda. El colchón no se vende (está para
                            absorber variabilidad); lo demás sí. ── */}
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-gray-400">Colchón</p>
                            <p className="mt-1 text-sm font-bold tabular-nums text-gray-700">{fNum(s.litrosColchon)} L</p>
                            <p className="text-[10px] text-gray-400">repone stock de seguridad</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-gray-400">Venta reposición</p>
                            <p className="mt-1 text-sm font-bold tabular-nums text-gray-700">{fNum(s.litrosVentanaReposicion)} L</p>
                            <p className="text-[10px] text-gray-400">hasta la próxima cocción</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-blue-600">Excedente</p>
                            <p className="mt-1 text-sm font-bold tabular-nums text-blue-800">{fNum(s.excedente)} L</p>
                            <p className="text-[10px] text-gray-400">
                              {s.semanasExcedente != null && s.excedente > 0
                                ? `≈ ${s.semanasExcedente.toLocaleString('es-CL')} semanas más`
                                : 'sin excedente'}
                            </p>
                          </div>
                        </div>

                        {!s.cubreTodaLaNecesidad ? (
                          <p className="mt-2.5 text-[11px] font-semibold text-amber-700">
                            El lote no alcanza a cubrir la necesidad de todos los formatos — se reparte a prorrata de ella.
                          </p>
                        ) : s.cubreVentaHasta && s.semanasVentaTotal != null && (
                          <p className="mt-2.5 text-[11px] text-gray-500">
                            Con este lote la venta queda cubierta <strong>≈ {s.semanasVentaTotal.toLocaleString('es-CL')} semanas</strong>,
                            hasta cerca del{' '}
                            {new Date(s.cubreVentaHasta + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                            {' '}(estimado con la demanda proyectada
                            {s.fechaDisponibleEstimada && s.fechaDisponibleEstimada > hoyLocalISO()
                              ? ', contado desde que salga del fermentador'
                              : ''}
                            ).
                          </p>
                        )}

                        {s.ajustadoPorVentas && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                            <TrendingUp size={11} />
                            Reparto ya corregido: algún formato se está vendiendo más rápido de lo que proyectaba el forecast.
                          </p>
                        )}
                        </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sugerenciasPlan.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-600" />
                    <h3 className="font-bold text-amber-900">Alarmas de quiebre de stock</h3>
                    <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {sugerenciasPlan.length}
                    </span>
                  </div>
                  <p className="mb-4 text-sm text-amber-800/80">
                    Las alertas se detectan por <strong>formato</strong> (un mismo producto puede ir sobrado en lata
                    y crítico en barril) cruzando el stock de seguridad, el forecast y el{' '}
                    <strong>ritmo de venta real de las últimas 4 semanas (lunes a viernes)</strong>, pero se cubren
                    por <strong>producto</strong>: un solo lote con el litraje total — el reparto entre formatos se
                    decide después, en el Split de Envasado, igual que en la cocción real.
                    Las <strong>líneas fijas</strong> (el catálogo estable) van siempre primero: no pueden quebrar stock.
                  </p>
                  <div className="prod-stagger flex flex-col gap-3">
                    {alarmasPorProducto.map((grupo, idxGrupo) => {
                      const grupoEsLineaFija = grupo.items[0]?.lineaFija ?? false
                      const totalGrupo = grupo.items.reduce((s, i) => s + i.litrosSugeridos, 0)
                      return (
                      <div key={grupo.producto} style={{ '--i': idxGrupo } as React.CSSProperties} className={`prod-hover-card overflow-hidden rounded-lg border bg-white shadow-sm ${grupoEsLineaFija ? 'border-red-300' : 'border-amber-200'}`}>
                        <div className={`flex flex-wrap items-center gap-2.5 border-b px-4 py-2.5 ${grupoEsLineaFija ? 'border-red-100 bg-red-50/60' : 'border-amber-100 bg-amber-50/60'}`}>
                          <ProductImage nombre={grupo.producto} categoria={grupo.categoria} size={30} radius={7} />
                          <span className="font-semibold text-gray-800">{grupo.producto}</span>
                          {grupoEsLineaFija && (
                            <span className="rounded-full bg-red-200/70 px-2 py-0.5 text-xs font-bold text-red-800" title="Línea fija del catálogo — no puede quebrar stock.">
                              Línea fija
                            </span>
                          )}
                          <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-bold text-amber-800">
                            {grupo.items.length} {grupo.items.length === 1 ? 'formato' : 'formatos'} en alerta
                          </span>
                          <button
                            disabled={guardandoPlan}
                            onClick={() => setSugerenciaModal(grupo)}
                            className="prod-press ml-auto shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            Agregar al plan — {fNum(totalGrupo)} L total
                          </button>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {grupo.items.map((s, i) => {
                            // diasHastaQuiebre viene en días HÁBILES (lun-vie) — leadTimeSemanas se
                            // pasa a días hábiles (×5) para comparar en la misma unidad.
                            const urgente = s.diasHastaQuiebre != null && s.diasHastaQuiebre <= s.leadTimeSemanas * 5
                            return (
                              <div key={`${s.envase}-${i}`} className="prod-hover-row flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-gray-50" title={s.motivo}>
                                <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-amber-700">
                                  {ENVASE_LABEL[s.envase] ?? s.envase}
                                </span>
                                <div className="min-w-[180px] flex-1">
                                  {s.fechaEstimadaQuiebre ? (
                                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${urgente ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                      <AlertTriangle size={12} />
                                      Se agota en ~{s.diasHastaQuiebre} días hábiles
                                      ({new Date(s.fechaEstimadaQuiebre + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })})
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-500">
                                      Sin ventas en 4 semanas — sin fecha estimada
                                    </span>
                                  )}
                                  {/* Cuándo hay que largar la cocción — quiebre menos lead
                                      time. Es la acción concreta de la alarma: la fecha de
                                      quiebre dice cuándo duele, ésta dice cuándo actuar. */}
                                  {s.fechaLimiteInicio && (
                                    <span
                                      className={`ml-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${
                                        s.atrasado ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-800'
                                      }`}
                                      title={s.atrasado
                                        ? `Con ${s.leadTimeSemanas} semanas de lead time, empezar hoy ya no llega antes del quiebre.`
                                        : `Último día hábil para empezar a cocer y llegar antes del quiebre (${s.leadTimeSemanas} semanas de lead time).`}
                                    >
                                      <CalendarIcon size={12} />
                                      {s.atrasado ? 'Atrasado — debió cocerse el ' : 'Cocer antes del '}
                                      {new Date(s.fechaLimiteInicio + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                    </span>
                                  )}
                                  {/* Antes de cocer hace falta tener los insumos en planta —
                                      lead time de gestión con el proveedor, siempre anterior
                                      al límite de "Cocer antes del". */}
                                  {s.fechaLimiteGestion && (
                                    <span
                                      className={`ml-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${
                                        s.atrasadoGestion ? 'bg-red-600 text-white' : 'bg-indigo-100 text-indigo-800'
                                      }`}
                                      title={s.atrasadoGestion
                                        ? `Con ${LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión de insumos + ${s.leadTimeSemanas} de cocción, empezar a gestionar hoy ya no llega antes del quiebre.`
                                        : `Último día hábil para empezar a gestionar los insumos con el proveedor y llegar antes del quiebre (${LEAD_TIME_INSUMOS_SEMANAS} semanas de gestión + ${s.leadTimeSemanas} de cocción).`}
                                    >
                                      <ShoppingCart size={12} />
                                      {s.atrasadoGestion ? 'Atrasado — debió gestionarse el ' : 'Gestionar insumos antes del '}
                                      {new Date(s.fechaLimiteGestion + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                    </span>
                                  )}
                                  {s.litrosFermentando > 0 && (
                                    <span
                                      className="ml-1.5 inline-flex items-center gap-1.5 rounded-md bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700"
                                      title="Litros a granel ya fermentando para este producto — todavía sin envase, no cuentan como stock vendible hasta que salgan del fermentador."
                                    >
                                      <Beaker size={12} />
                                      {fNum(s.litrosFermentando)} L fermentando
                                      {s.fechaFermentandoListo && ` — listos ${new Date(s.fechaFermentandoListo + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`}
                                    </span>
                                  )}
                                </div>
                                {/* Dos números lado a lado, cada uno con su etiqueta — nunca un
                                    número suelto: "1.697 L" sin contexto se leyó una vez como
                                    "tengo 1.697 L" cuando en realidad es lo que FALTA producir
                                    (el disponible real era 314 L). */}
                                <div className="flex shrink-0 items-center gap-3 text-right">
                                  <div className="w-24">
                                    <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-indigo-500">Punto reorden</p>
                                    <p className="text-sm font-bold tabular-nums text-indigo-700">{fNum(s.puntoReordenLitros)} L</p>
                                  </div>
                                  <div className="w-24">
                                    <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-gray-400">Disponible</p>
                                    <p className="text-sm font-bold tabular-nums text-gray-500">{fNum(s.disponibleLitros)} L</p>
                                    {s.disponibleUnidades != null && (
                                      <p className="text-[11px] text-gray-400">{fNum(s.disponibleUnidades)} {UNIDAD_ENVASE[s.envase]}</p>
                                    )}
                                  </div>
                                  <div className="w-20">
                                    <p className="text-[10px] font-bold uppercase leading-none tracking-wide text-amber-600">A producir</p>
                                    <p className="text-sm font-bold tabular-nums text-gray-800">{fNum(s.litrosSugeridos)} L</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 p-5">
                  <div>
                    <h3 className="font-bold text-gray-800">Plan Maestro de Producción</h3>
                    <p className="text-xs text-gray-500">
                      Cola priorizada — la fila de arriba es la próxima cocción. Usa las flechas para reordenar.
                    </p>
                  </div>
                  <button
                    onClick={() => setMostrarFormLote(v => !v)}
                    className="flex items-center gap-2 rounded-lg bg-[#0F3D2E] px-4 py-2 text-sm font-bold text-white hover:bg-[#1A5441]"
                  >
                    {mostrarFormLote ? <X size={16} /> : <Plus size={16} />}
                    {mostrarFormLote ? 'Cerrar' : 'Agregar lote'}
                  </button>
                </div>

                {mostrarFormLote && (
                  <FormNuevoLote guardando={guardandoPlan} onCancelar={() => setMostrarFormLote(false)} onGuardar={agregarLote} />
                )}

                <div className="flex-1 overflow-auto">
                  {plan.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-gray-400">
                      <CalendarIcon size={40} className="opacity-50" />
                      <p className="text-sm">
                        Todavía no hay lotes en el plan. Agrega uno manual o confirma alguna sugerencia de arriba.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="w-16 px-4 py-2.5 text-left">Orden</th>
                          <th className="px-4 py-2.5 text-left">Producto</th>
                          <th className="px-4 py-2.5 text-right">Litros</th>
                          <th className="px-4 py-2.5 text-left">Fecha planificada</th>
                          <th className="px-4 py-2.5 text-left">Origen</th>
                          <th className="px-4 py-2.5 text-left">Estado</th>
                          <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {plan.map((lote, idx) => {
                          const atrasado = lote.estado === 'planificado' && lote.fechaPlanificada < hoyLocalISO()
                          return (
                            <tr key={lote.id} className={atrasado ? 'bg-red-50/40' : undefined}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <span className="w-5 text-center font-bold tabular-nums text-gray-400">{idx + 1}</span>
                                  <div className="flex flex-col">
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => moverLote(lote.id, -1)}
                                      className="rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-20"
                                      title="Subir prioridad"
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <button
                                      disabled={idx === plan.length - 1}
                                      onClick={() => moverLote(lote.id, 1)}
                                      className="rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-20"
                                      title="Bajar prioridad"
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <ProductImage nombre={lote.producto} categoria={lote.categoria} size={30} radius={7} />
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-gray-800">{lote.producto}</span>
                                    {lote.motivo && <span className="text-xs text-gray-400">{lote.motivo}</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-700">
                                {fNum(lote.litrosPlanificados)} L
                              </td>
                              <td className="px-4 py-3">
                                <span className={atrasado ? 'font-semibold text-red-600' : 'text-gray-600'}>
                                  {new Date(lote.fechaPlanificada + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                  {atrasado && ' · atrasado'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                  lote.origen === 'sugerido' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {lote.origen === 'sugerido' ? 'Sugerido' : 'Manual'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                  lote.estado === 'en_curso' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {lote.estado === 'en_curso' ? 'En curso' : 'Planificado'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1.5">
                                  {lote.estado === 'planificado' && (
                                    <button
                                      onClick={() => cambiarEstadoLote(lote.id, 'en_curso')}
                                      className="rounded-lg px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50"
                                      title="Marcar en curso"
                                    >
                                      Iniciar
                                    </button>
                                  )}
                                  <button
                                    onClick={() => cambiarEstadoLote(lote.id, 'completado')}
                                    className="rounded-lg p-1.5 text-green-600 hover:bg-green-50"
                                    title="Marcar completado"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => cambiarEstadoLote(lote.id, 'cancelado')}
                                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                                    title="Cancelar lote"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════ VISTA: QUÉ COMPRAR ══════════
              Las tres miradas de compra en UNA pantalla, de la más concreta a
              la más gruesa. Antes estaban repartidas en dos pestañas y el
              usuario tenía que saber cuál mirar:
                1. El presupuesto del CALENDARIO — cocciones con fecha y
                   tanque. Es el que se puede convertir en orden de compra.
                2. El MRP del forecast — cuánto hace falta para vender lo
                   proyectado, sin plan de cocción todavía.
                3. El stock de insumos y la necesidad del Plan Maestro. */}
          {/* ══════════ VISTA 5: INSUMOS Y COMPRAS ══════════
              Cruza el Plan Maestro con las recetas cargadas: cada receta
              escala linealmente al litraje real de cada lote, y se suma
              entre todos los lotes activos que usan el mismo insumo. El
              precio queda pendiente (columna "Costo" vacía) hasta que exista
              una lista de precios — decisión del usuario, 7-sep-2026: ver
              la necesidad en CANTIDAD primero, valorizar después. */}
          {/* SIN h-full, y con shrink-0 en cada tarjeta, a propósito: con una
              altura fija acá las tarjetas (que llevan overflow-hidden) se
              encogían por debajo de su propio contenido para caber —en CSS un
              flex item con overflow distinto de visible tiene min-size
              automático 0— y terminaban recortando su propio encabezado, con
              el chevron adentro. Ese era el "se acoplan y se sobreponen"
              original. El scroll lo maneja el contenedor de arriba
              (flex-1 overflow-auto). */}
          {activeTab === 'insumos' && (
            <div className="prod-enter flex flex-col gap-6">
              <PreguntaDeLaVista
                pregunta="¿Cuánto comprar, cuándo y para qué cocción?"
                detalle="Arriba, los insumos de las cocciones que marcaste en el calendario, con su fecha de orden. Abajo, la mirada gruesa contra el forecast y el inventario de insumos."
              />

              {/* ══════════ PRESUPUESTO DE INSUMOS ══════════
                  Va pegado al calendario a propósito: es la traducción a
                  plata de las cocciones de arriba, y las dos vistas comparten
                  la selección. Lo que se marca allá es lo que se compra acá. */}
              {mesesPlan.length > 0 && (
                <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ShoppingCart size={18} style={{ color: COLORS.darkGreen }} />
                        <h3 className="font-bold text-gray-800">Presupuesto de insumos del calendario</h3>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                          {presupuesto.cocciones} de {lotesEnVentana.length} cocciones
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={descargarPresupuesto}
                        disabled={descargando || presupuesto.lineas.length === 0}
                        className="prod-press flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ backgroundColor: COLORS.darkGreen }}
                      >
                        <ArrowDown size={15} />
                        {descargando ? 'Generando…' : 'Descargar Excel'}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
                      Cada cocción del calendario se baja a insumos por su receta, escalada al volumen real del tanque
                      asignado, y se valoriza al último precio de compra. La fecha de compra es la cocción menos{' '}
                      {LEAD_COMPRA_DIAS_HABILES} días hábiles, para que el insumo esté en planta cuando se macera.
                      Hacé clic en cualquier cocción del calendario de arriba para sacarla o incluirla.
                    </p>

                    {/* Ventana libre: mensual, trimestral, o lo que elija */}
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Desde</span>
                        <select
                          value={ventanaDesde}
                          onChange={e => setPresupuestoDesde(e.target.value)}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700"
                        >
                          {mesesPlan.map(m => <option key={m} value={m}>{etiquetaMes(m + '-01')}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Hasta</span>
                        <select
                          value={ventanaHasta}
                          onChange={e => setPresupuestoHasta(e.target.value)}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700"
                        >
                          {mesesPlan.map(m => <option key={m} value={m}>{etiquetaMes(m + '-01')}</option>)}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { setPresupuestoDesde(mesesPlan[0]); setPresupuestoHasta(mesesPlan[0]) }}
                          className="prod-press rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                        >
                          Mensual
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPresupuestoDesde(mesesPlan[0]); setPresupuestoHasta(mesesPlan[mesesPlan.length - 1]) }}
                          className="prod-press rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                        >
                          Todo el horizonte ({mesesPlan.length} {mesesPlan.length === 1 ? 'mes' : 'meses'})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTogglesPresupuesto(new Set(planSugerido.lotes.filter(l => !l.enCurso).map(l => l.id)))}
                          className="prod-press rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                        >
                          Marcar todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setTogglesPresupuesto(new Set())}
                          className="prod-press rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                        >
                          Desmarcar todas
                        </button>
                      </div>
                    </div>
                  </div>

                  {presupuesto.lineas.length === 0 ? (
                    <p className="p-5 text-sm text-gray-400">
                      No hay cocciones marcadas en esta ventana. Marcá alguna en el calendario de arriba.
                    </p>
                  ) : (
                    <>
                      {/* Cifras de cabecera */}
                      <div className="grid gap-px border-b border-gray-100 bg-gray-100 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="bg-white p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">A comprar</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: COLORS.darkGreen }}>
                            ${fNum(presupuesto.total)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">neto de lo que ya hay en bodega</p>
                        </div>
                        <div className="bg-white p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Necesidad total</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-700">${fNum(presupuesto.totalBruto)}</p>
                          <p className="mt-0.5 text-[11px] text-gray-400">si no hubiera nada en bodega</p>
                        </div>
                        <div className="bg-white p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Producción</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-700">{fNum(presupuesto.litros)} L</p>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            {presupuesto.cocciones} {presupuesto.cocciones === 1 ? 'cocción' : 'cocciones'} ·{' '}
                            {presupuesto.total > 0 && presupuesto.litros > 0
                              ? `$${fNum(presupuesto.total / presupuesto.litros)}/L`
                              : '—'}
                          </p>
                        </div>
                        <div className="bg-white p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Insumos</p>
                          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-700">
                            {presupuesto.lineas.filter(l => l.aComprar > 0).length}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            de {presupuesto.lineas.length} que pide la receta
                          </p>
                        </div>
                      </div>

                      {/* Un total al que le faltan insumos no se puede leer como
                          presupuesto completo — hay que decirlo, no omitirlo. */}
                      {(presupuesto.sinPrecio.length > 0 || presupuesto.sinReceta.length > 0) && (
                        <div className="flex items-start gap-2.5 border-b border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                          <div>
                            {presupuesto.sinReceta.length > 0 && (
                              <p>
                                <strong>{presupuesto.sinReceta.length} producto{presupuesto.sinReceta.length === 1 ? '' : 's'} sin receta cargada</strong> —
                                sus cocciones están en el calendario pero NO en este total: {presupuesto.sinReceta.join(', ')}.
                              </p>
                            )}
                            {presupuesto.sinPrecio.length > 0 && (
                              <p className={presupuesto.sinReceta.length > 0 ? 'mt-1' : ''}>
                                <strong>{presupuesto.sinPrecio.length} insumo{presupuesto.sinPrecio.length === 1 ? '' : 's'} sin precio</strong> —
                                se piden igual pero no suman al presupuesto: {presupuesto.sinPrecio.join(', ')}.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Cuándo sale la plata */}
                      {presupuesto.porMesCompra.length > 1 && (
                        <div className="border-b border-gray-100 px-5 py-4">
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                            Desembolso por mes de compra
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {presupuesto.porMesCompra.map(m => (
                              <div key={m.mes} className="rounded-lg border border-gray-200 px-3 py-2">
                                <p className="text-xs font-bold capitalize text-gray-600">{etiquetaMes(m.mes + '-01')}</p>
                                <p className="text-sm font-bold tabular-nums" style={{ color: COLORS.darkGreen }}>${fNum(m.costo)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Lista de compra */}
                      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
                        {(['insumo', 'producto'] as const).map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setVistaPresupuesto(v)}
                            className={`prod-press rounded-lg px-3 py-1.5 text-xs font-bold ${
                              vistaPresupuesto === v ? 'text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                            style={vistaPresupuesto === v ? { backgroundColor: COLORS.darkGreen } : undefined}
                          >
                            {v === 'insumo' ? 'Qué comprar' : 'Por receta de producto'}
                          </button>
                        ))}
                      </div>

                      {vistaPresupuesto === 'insumo' ? (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[820px] text-sm">
                            <thead className="border-b border-gray-100 bg-gray-50/60 text-[10px] uppercase tracking-wide text-gray-500">
                              <tr>
                                <th className="px-4 py-2.5 text-left font-bold">Comprar el</th>
                                <th className="px-4 py-2.5 text-left font-bold">Insumo</th>
                                <th className="px-4 py-2.5 text-right font-bold">Necesidad</th>
                                <th className="px-4 py-2.5 text-right font-bold">En bodega</th>
                                <th className="px-4 py-2.5 text-right font-bold">A comprar</th>
                                <th className="px-4 py-2.5 text-right font-bold">Precio</th>
                                <th className="px-4 py-2.5 text-right font-bold">Costo</th>
                                <th className="px-4 py-2.5 text-left font-bold">Para qué cocciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {presupuesto.lineas.map(l => (
                                <tr key={l.insumo} className={`prod-hover-row ${l.aComprar === 0 ? 'text-gray-400' : ''}`}>
                                  <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-gray-700">
                                    {new Date(l.fechaCompra + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-bold text-gray-800">{l.insumo}</p>
                                    <p className="text-[11px] capitalize text-gray-400">{l.categoria}</p>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fNum(l.cantidad)} {l.unidadBase}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-500">
                                    {l.disponible != null ? `${fNum(l.disponible)} ${l.unidadBase}` : 'sin dato'}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                                    {l.aComprar > 0 ? `${fNum(l.aComprar)} ${l.unidadBase}` : '—'}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-500">
                                    {l.precioUnitario != null ? `$${l.precioUnitario.toLocaleString('es-CL', { maximumFractionDigits: 2 })}` : '—'}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums" style={{ color: l.costoAComprar ? COLORS.darkGreen : undefined }}>
                                    {l.costoAComprar != null ? `$${fNum(l.costoAComprar)}` : 'sin precio'}
                                  </td>
                                  <td className="px-4 py-3 text-[11px] text-gray-500">
                                    {l.detalle.map(d => (
                                      <span key={d.producto + d.fechaCoccion} className="mr-2 inline-block whitespace-nowrap">
                                        {d.producto}{' '}
                                        <span className="text-gray-400">
                                          {new Date(d.fechaCoccion + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                          {' · '}{fNum(d.cantidad)} {l.unidadBase}
                                        </span>
                                      </span>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="border-t border-gray-200 bg-gray-50/60">
                              <tr>
                                <td colSpan={6} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Total a comprar</td>
                                <td className="px-4 py-3 text-right text-base font-bold tabular-nums" style={{ color: COLORS.darkGreen }}>${fNum(presupuesto.total)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {presupuesto.porProducto.map(g => (
                            <div key={g.producto} className="p-5">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="font-bold text-gray-800">{g.producto}</p>
                                <p className="text-sm font-bold tabular-nums" style={{ color: COLORS.darkGreen }}>
                                  {g.costo != null ? `$${fNum(g.costo)}` : 'sin costo'}
                                </p>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {g.cocciones} {g.cocciones === 1 ? 'cocción' : 'cocciones'} · {fNum(g.litros)} L
                                {g.costo != null && g.litros > 0 && ` · $${fNum(g.costo / g.litros)}/L`}
                                {g.sinPrecio > 0 && ` · ${g.sinPrecio} línea${g.sinPrecio === 1 ? '' : 's'} sin precio`}
                              </p>
                              <div className="mt-3 overflow-x-auto">
                                <table className="w-full min-w-[420px] text-sm">
                                  <tbody className="divide-y divide-gray-50">
                                    {g.insumos.map(i => (
                                      <tr key={i.insumo} className="prod-hover-row">
                                        <td className="py-2 pr-3 text-gray-700">{i.insumo}</td>
                                        <td className="whitespace-nowrap py-2 px-3 text-right tabular-nums text-gray-600">{fNum(i.cantidad)} {i.unidadBase}</td>
                                        <td className="whitespace-nowrap py-2 pl-3 text-right font-bold tabular-nums text-gray-800">
                                          {i.costo != null ? `$${fNum(i.costo)}` : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="border-t border-gray-100 p-4 text-xs text-gray-400">
                        La cantidad de cada insumo sale de la receta escalada al volumen de la cocción, no de un
                        promedio: una cocción de 3.000 L de un tanque grande pide exactamente cuatro veces lo de una
                        de 750 L. Cuando una receta usa el mismo insumo en dos momentos (el mismo lúpulo en whirlpool y
                        en dry hop, por ejemplo) acá se suman: para cocer son etapas distintas, para comprar es el
                        mismo saco. &quot;A comprar&quot; descuenta lo que ya hay en bodega según el último informe de stock de
                        insumos — ese descuento se aplica sobre el total de la ventana, no cocción por cocción, porque
                        el informe es una foto sin reservas por lote. El Excel trae tres hojas: la orden de compra, el
                        detalle de qué cocción pide cada insumo, y el resumen por mes y por producto.
                      </p>
                    </>
                  )}
                </div>
              )}


              {lotesSinReceta.length > 0 && (
                <div className="flex shrink-0 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-bold">
                      {lotesSinReceta.length} {lotesSinReceta.length === 1 ? 'lote' : 'lotes'} del Plan Maestro sin receta cargada
                    </p>
                    <p className="mt-1 text-amber-700">
                      No se puede calcular su necesidad de insumos: {lotesSinReceta.map(l => `${l.producto} (${fNum(l.litrosPlanificados)} L)`).join(', ')}.
                    </p>
                  </div>
                </div>
              )}

              {/* Las 3 tablas de abajo son un acordeón: sólo una se expande a la
                  vez, para que cuando el usuario la abre ocupe todo el alto
                  disponible en vez de competir por espacio con las otras dos
                  (que quedan colapsadas mostrando sólo su encabezado-resumen). */}

              {/* Stock ACTUAL del catálogo completo de insumos — independiente de si
                  hay o no lotes activos en el Plan Maestro pidiéndolos. Existe
                  aparte de "Necesidad de Insumos" de abajo porque esa tabla sólo
                  lista lo que algún lote activo necesita: con la cola vacía queda
                  vacía también, aunque el stock sí esté cargado. */}
              <div className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow duration-300 ${panelInsumosAbierto === 'stock' ? 'border-amber-200 shadow-md' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setPanelInsumosAbierto('stock')}
                  aria-expanded={panelInsumosAbierto === 'stock'}
                  className="prod-press flex w-full flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 p-4 text-left transition-colors hover:bg-amber-50/40 sm:gap-4 sm:p-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <Package size={16} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-800">Stock de Insumos</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {stockInsumos.length} insumos del catálogo{stockInsumosVacio ? ' — todavía no hay ningún inventario cargado.' : '.'}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-gray-400 transition-transform duration-300 ${panelInsumosAbierto === 'stock' ? 'rotate-180 text-amber-600' : ''}`}
                  />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${panelInsumosAbierto === 'stock' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    {/* overflow-x-auto (en vez de que la tabla se achique para caber en
                        pantalla) es a propósito: en celular, comprimir 4 columnas de
                        insumos las vuelve ilegibles. Con min-width la tabla mantiene
                        columnas de ancho usable y el usuario hace scroll horizontal —
                        mismo patrón en las 3 tablas de esta sección. */}
                    <div className="max-h-[65vh] overflow-auto">
                      <table className="w-full min-w-[560px] border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                          <tr>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Insumo</th>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Categoría</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Disponible</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Valorizado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                          {stockInsumosFiltrado.length === 0 && (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                              {stockInsumos.length === 0
                                ? 'No hay insumos cargados en el catálogo todavía.'
                                : `Sin resultados para "${busquedaInsumo}".`}
                            </td></tr>
                          )}
                          {stockInsumosFiltrado.map(row => {
                            const cat = CATEGORIA_INSUMO[row.categoria] ?? CATEGORIA_INSUMO.otros
                            return (
                              <tr key={row.insumo} className="prod-hover-row transition-colors hover:bg-gray-50">
                                <td className="px-6 py-2.5 font-semibold text-gray-800">{row.insumo}</td>
                                <td className="px-6 py-2.5">
                                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${cat.badge}`}>{cat.label}</span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-2.5 text-right tabular-nums text-gray-700">
                                  {row.disponible != null ? fCantidadInsumo(row.disponible, row.unidadBase) : <span className="text-gray-300">Sin dato</span>}
                                </td>
                                <td className="whitespace-nowrap px-6 py-2.5 text-right tabular-nums text-gray-400">
                                  {row.valorizado != null ? `$${fNum(row.valorizado)}` : <span title="Sin precio o sin stock cargado">—</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* MRP neto simple: la necesidad sale del FORECAST del modelo, no
                  de lo que ya esté en cola — a diferencia de "Necesidad de
                  Insumos" de abajo, que sólo mira los lotes activos del Plan
                  Maestro. Complementarias, no reemplazan una a la otra. */}
              {mrpInsumos.productosSinForecast.length > 0 && (
                <div className="flex shrink-0 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-bold">
                      {mrpInsumos.productosSinForecast.length} {mrpInsumos.productosSinForecast.length === 1 ? 'producto con receta' : 'productos con receta'} sin forecast
                    </p>
                    <p className="mt-1 text-amber-700">
                      No se pudo proyectar su demanda (sin historial de venta suficiente todavía): {mrpInsumos.productosSinForecast.join(', ')}.
                      No están sumados en el MRP de abajo.
                    </p>
                  </div>
                </div>
              )}

              <div className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow duration-300 ${panelInsumosAbierto === 'mrp' ? 'border-blue-200 shadow-md' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setPanelInsumosAbierto('mrp')}
                  aria-expanded={panelInsumosAbierto === 'mrp'}
                  className="prod-press flex w-full flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 p-4 text-left transition-colors hover:bg-blue-50/40 sm:gap-4 sm:p-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Sigma size={16} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-800">MRP — Compra sugerida de insumos</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {mrpInsumos.conNecesidad} insumos a comprar, según la demanda proyectada por el modelo hasta
                        el {mrpInsumos.hastaISO.slice(8, 10)}/{mrpInsumos.hastaISO.slice(5, 7)} —
                        no depende de que haya lotes ya planificados.
                      </p>
                      {/* Total valorizado del horizonte: la cifra de presupuesto.
                          Mientras falten precios se dice cuántos insumos quedaron
                          fuera, para no leer un total parcial como si fuera completo. */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {mrpInsumos.costoTotal > 0 ? (
                          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-sm font-bold text-blue-800">
                            Presupuesto {mrpHorizonteDias} días: ${fNum(mrpInsumos.costoTotal)}
                          </span>
                        ) : (
                          <span className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                            Sin valorizar — falta cargar precios de insumos
                          </span>
                        )}
                        {mrpInsumos.sinPrecio > 0 && mrpInsumos.costoTotal > 0 && (
                          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                            Parcial: {mrpInsumos.sinPrecio} sin precio
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {/* stopPropagation: el encabezado completo es el botón que abre
                        y cierra el panel; sin esto, elegir horizonte lo colapsaría. */}
                    <div
                      className="flex overflow-hidden rounded-lg border border-gray-300"
                      onClick={e => e.stopPropagation()}
                    >
                      {([30, 60, 90] as const).map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setMrpHorizonteDias(d)}
                          className={`prod-press px-2.5 py-1.5 text-xs font-bold transition-colors ${
                            mrpHorizonteDias === d ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                    <ChevronDown
                      size={20}
                      className={`shrink-0 text-gray-400 transition-transform duration-300 ${panelInsumosAbierto === 'mrp' ? 'rotate-180 text-blue-600' : ''}`}
                    />
                  </div>
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${panelInsumosAbierto === 'mrp' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="max-h-[65vh] overflow-auto">
                      <table className="w-full min-w-[900px] border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                          <tr>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Insumo</th>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Categoría</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Necesidad Bruta</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Disponible</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold text-blue-700">Compra Sugerida</th>
                            <th className="whitespace-nowrap px-6 py-3 text-right font-bold">Costo Estimado</th>
                            <th className="whitespace-nowrap px-6 py-3 font-bold">Productos que lo piden</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                          {mrpFiltrado.length === 0 && (
                            <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                              {mrpInsumos.filas.length === 0
                                ? 'Ningún producto con receta tiene demanda proyectada positiva en el horizonte.'
                                : `Sin resultados para "${busquedaInsumo}".`}
                            </td></tr>
                          )}
                          {mrpFiltrado.map(row => {
                            const cat = CATEGORIA_INSUMO[row.categoria] ?? CATEGORIA_INSUMO.otros
                            return (
                              <tr key={row.insumo} className="prod-hover-row transition-colors hover:bg-gray-50">
                                <td className="whitespace-nowrap px-6 py-3 font-semibold text-gray-800">{row.insumo}</td>
                                <td className="px-6 py-3">
                                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${cat.badge}`}>{cat.label}</span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-600">{fCantidadInsumo(row.necesidadBruta, row.unidadBase)}</td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-500">
                                  {row.disponible != null ? fCantidadInsumo(row.disponible, row.unidadBase) : <span className="text-gray-300">Sin dato</span>}
                                </td>
                                <td className={`whitespace-nowrap px-6 py-3 text-right font-bold tabular-nums text-blue-900 ${row.necesidadNeta > 0 ? 'bg-blue-50' : ''}`}>
                                  {row.necesidadNeta > 0 ? fCantidadInsumo(row.necesidadNeta, row.unidadBase) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-400">
                                  {row.costoCompra != null ? `$${fNum(row.costoCompra)}` : <span title="Sin precio cargado todavía">—</span>}
                                </td>
                                <td className="px-6 py-3 text-xs text-gray-500">
                                  {row.productos.map(p => p.producto).join(', ')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow duration-300 ${panelInsumosAbierto === 'necesidad' ? 'border-amber-200 shadow-md' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setPanelInsumosAbierto('necesidad')}
                  aria-expanded={panelInsumosAbierto === 'necesidad'}
                  className="prod-press flex w-full flex-col gap-3 border-b border-gray-100 bg-gray-50/50 p-4 text-left transition-colors hover:bg-amber-50/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-800">Necesidad de Insumos — Plan Maestro</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {necesidadInsumos.length} insumos, escalados desde {planProduccion.filter(l => l.estado === 'planificado' || l.estado === 'en_curso').length} lotes activos de la cola.
                      {' '}El disponible sale del último inventario de insumos cargado{stockInsumosVacio ? ' — todavía no hay ninguno.' : '.'}
                    </p>
                  </div>
                  {/* En un flex-col (mobile), este bloque hereda ancho completo por
                      stretch — el buscador se estira con flex-1 y el chevron queda
                      pegado a la derecha, sin desbordar la fila. En sm:+ vuelve a fila. */}
                  <div className="flex items-center gap-3">
                    {panelInsumosAbierto === 'necesidad' && (
                      <div className="relative flex-1 sm:flex-none" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={busquedaInsumo}
                          onChange={e => setBusquedaInsumo(e.target.value)}
                          placeholder="Buscar insumo o categoría..."
                          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 sm:w-64"
                        />
                        <svg className="absolute left-3 top-3 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    )}
                    <ChevronDown
                      size={20}
                      className={`ml-auto shrink-0 text-gray-400 transition-transform duration-300 sm:ml-0 ${panelInsumosAbierto === 'necesidad' ? 'rotate-180 text-amber-600' : ''}`}
                    />
                  </div>
                </button>

                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${panelInsumosAbierto === 'necesidad' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="max-h-[65vh] overflow-auto">
                      <table className="w-full min-w-[900px] border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                          <tr>
                            <th className="whitespace-nowrap px-6 py-4 font-bold">Insumo</th>
                            <th className="whitespace-nowrap px-6 py-4 font-bold">Categoría</th>
                            <th className="whitespace-nowrap px-6 py-4 text-right font-bold">Necesidad Bruta</th>
                            <th className="whitespace-nowrap px-6 py-4 text-right font-bold">Disponible</th>
                            <th className="whitespace-nowrap px-6 py-4 text-right font-bold text-amber-700">Necesidad Neta</th>
                            <th className="whitespace-nowrap px-6 py-4 text-right font-bold">Costo Estimado</th>
                            <th className="whitespace-nowrap px-6 py-4 font-bold">Lotes que lo usan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                          {insumosFiltrados.length === 0 && (
                            <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                              {necesidadInsumos.length === 0
                                ? 'No hay lotes activos en el Plan Maestro que necesiten insumos ahora mismo.'
                                : `Sin resultados para "${busquedaInsumo}".`}
                            </td></tr>
                          )}
                          {insumosFiltrados.map(row => {
                            const cat = CATEGORIA_INSUMO[row.categoria] ?? CATEGORIA_INSUMO.otros
                            const lotesResumen = [...new Map(row.lotes.map(l => [l.producto, l])).values()]
                            return (
                              <tr key={row.insumo} className="prod-hover-row transition-colors hover:bg-gray-50">
                                <td className="whitespace-nowrap px-6 py-3 font-semibold text-gray-800">{row.insumo}</td>
                                <td className="px-6 py-3">
                                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${cat.badge}`}>{cat.label}</span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-600">{fCantidadInsumo(row.necesidadBruta, row.unidadBase)}</td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-500">
                                  {row.disponible != null ? fCantidadInsumo(row.disponible, row.unidadBase) : <span className="text-gray-300">Sin dato</span>}
                                </td>
                                <td className={`whitespace-nowrap px-6 py-3 text-right font-bold tabular-nums text-gray-900 ${row.necesidadNeta > 0 ? 'bg-amber-50' : ''}`}>
                                  {row.necesidadNeta > 0 ? fCantidadInsumo(row.necesidadNeta, row.unidadBase) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums text-gray-400">
                                  {row.costoNecesidad != null ? `$${fNum(row.costoNecesidad)}` : <span title="Sin precio cargado todavía">—</span>}
                                </td>
                                <td className="px-6 py-3 text-xs text-gray-500">
                                  {lotesResumen.map(l => l.producto).join(', ')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ VISTA 6: PRESUPUESTO ══════════ */}
          {activeTab === 'presupuesto' && (
            <div className="prod-enter flex flex-col gap-6 xl:h-full xl:flex-row">
              <PreguntaDeLaVista
                pregunta="¿Cuánto vamos a gastar en insumos?"
                detalle="El gasto proyectado mes a mes contra el forecast completo. Es la mirada gruesa; la orden de compra concreta, cocción por cocción, está en Qué comprar."
              />


              <div className="flex flex-[3] flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
                <div className="mb-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-800">Gasto Proyectado en Insumos Productivos</h3>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Cuánto hay que <strong>comprar</strong> los próximos {PRESUPUESTO_MESES} meses: demanda proyectada por el
                    modelo, bajada a insumos por receta y valorizada al último precio de compra. Lo que ya está en bodega se
                    descuenta primero, así que esto es compra, no consumo.
                  </p>
                  {presupuestoInsumos.sinPrecio > 0 && (
                    <p className="mt-2 inline-flex rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                      Presupuesto parcial: hasta {presupuestoInsumos.sinPrecio} insumos por mes quedaron fuera por no tener precio cargado.
                    </p>
                  )}
                </div>

                {presupuestoInsumos.total === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
                    <div>
                      <p className="font-semibold text-gray-700">Todavía no hay presupuesto que mostrar.</p>
                      <p className="mt-1">
                        Falta cargar el precio de los insumos. Sube el informe de insumos con la columna
                        &quot;Último precio de compra&quot; y esta pantalla se llena sola.
                      </p>
                    </div>
                  </div>
                ) : (
                <div className="relative min-h-[360px] w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={presupuestoInsumos.filas} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="etiqueta" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dx={-6} tickFormatter={(val: number) => `$${fNum(Math.round(val / 1000))}k`} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value, name) => [`$${Number(value).toLocaleString('es-CL')}`, name]}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#374151' }} />

                      <Bar dataKey="cerveza" name="Insumos Cerveza" stackId="a" fill={COLORS.darkGreen} />
                      <Bar dataKey="kombucha" name="Insumos Kombucha" stackId="a" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-6 xl:max-w-sm">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                    Compra de insumos · {PRESUPUESTO_MESES} meses
                  </h3>
                  <div className="mb-1 text-sm text-gray-500">Total a comprar</div>
                  <div className="mb-6 text-4xl font-black text-gray-900">
                    {presupuestoInsumos.total > 0 ? `$${fNum(presupuestoInsumos.total)}` : <span className="text-2xl text-gray-300">Sin valorizar</span>}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div>
                        <div className="text-sm font-bold text-gray-800">Cerveza Artesanal</div>
                        <div className="text-xs text-gray-500">Malta, lúpulo, levadura, etc.</div>
                      </div>
                      <div className="font-bold text-gray-900">${fNum(presupuestoInsumos.totalCerveza)}</div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                      <div>
                        <div className="text-sm font-bold text-gray-800">Kombucha</div>
                        <div className="text-xs text-gray-500">Té, frutas, azúcar, etc.</div>
                      </div>
                      <div className="font-bold text-amber-900">${fNum(presupuestoInsumos.totalKombucha)}</div>
                    </div>
                  </div>

                  {presupuestoInsumos.filas.length > 0 && (
                    <div className="mt-5 flex flex-col gap-2 border-t border-gray-100 pt-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Mes a mes</p>
                      {presupuestoInsumos.filas.map(f => (
                        <div key={f.mes} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-gray-600">{f.etiqueta}</span>
                          <span className="font-bold tabular-nums text-gray-800">${fNum(f.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contraste contra el gasto real de los últimos 13 meses de
                    facturas del ERP: si el presupuesto calculado se aleja mucho
                    de esta cifra, el problema está en los precios o en las
                    recetas, no en el presupuesto. */}
                <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
                  <div className="flex items-center gap-2 font-bold text-green-800">
                    <CircleDollarSign size={20} />
                    Control contra el gasto real
                  </div>
                  <p className="text-sm leading-relaxed text-green-700">
                    Según las facturas del ERP, el gasto real en insumos productivos (cervecería, kombuchería y CO₂)
                    promedia <strong>$11,2 millones al mes</strong>.
                    {presupuestoInsumos.total > 0 && (
                      <> Este presupuesto proyecta <strong>${fNum(Math.round(presupuestoInsumos.total / Math.max(presupuestoInsumos.filas.length, 1)))} por mes</strong> — si la diferencia es grande, revisar precios y recetas antes de usarlo.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Configuración del Gantt: días en tanque, litraje habitual y color
              por producto. Vive fuera de los bloques por tab porque el Gantt
              la abre desde "Cuándo cocinar" pero el panel es global. */}
          <ConfigProductosGantt
            abierto={configAbierta}
            config={configGantt}
            onCerrar={() => setConfigAbierta(false)}
            onGuardado={fila => setConfigGantt(c => c.map(x => x.producto === fila.producto ? fila : x))}
          />

          {/* "Agregar producto" desde el Gantt: mismo lote que el formulario
              de Plan Maestro (agregarLote), sin fermentador — entra a "sin
              asignar" y de ahí se arrastra a su tanque. Vive fuera de los
              bloques por tab por la misma razón que ConfigProductosGantt. */}
          <ModalAgregarProducto
            abierto={agregarProductoAbierto}
            config={configGantt}
            guardando={guardandoPlan}
            error={errorPlan}
            onGuardar={datos => void agregarLote(datos)}
            onCerrar={() => setAgregarProductoAbierto(false)}
          />

          {/* Editor de fecha para un lote 'en_tanque' — detectado en el ERP,
              sin lote de plan detrás. Se abre con un clic sobre el bloque. */}
          {editarTanqueAbierto && (
            <PopoverEditarTanque
              datos={editarTanqueAbierto}
              tieneAjuste={ajustesTanque.some(a => a.tanque === editarTanqueAbierto.tanque && a.codigoLote === editarTanqueAbierto.codigoLote)}
              guardando={guardandoAjusteTanque}
              error={errorAjusteTanque}
              onGuardar={guardarAjusteTanque}
              onRestablecer={restablecerAjusteTanque}
              onCerrar={() => setEditarTanqueAbierto(null)}
            />
          )}

          {/* Popup de confirmación de una alarma/necesidad — se puede abrir
              desde el Plan Maestro o desde Stock de Seguridad, así que vive
              fuera de los bloques por tab (si quedara dentro de uno, no
              renderizaría al abrirlo desde el otro). */}
          {sugerenciaModal && (
            <ModalConfirmarLoteGrupo
              grupo={sugerenciaModal}
              guardando={guardandoPlan}
              recetaInsumos={recetaInsumos}
              onCancelar={() => setSugerenciaModal(null)}
              onConfirmar={({ litrosPlanificados, fechaPlanificada, necesidadCubrir, cubreHasta, motivo }) => agregarLote({
                producto: sugerenciaModal.producto,
                categoria: sugerenciaModal.categoria,
                litrosPlanificados,
                fechaPlanificada,
                origen: 'sugerido',
                motivo,
                necesidadCubrir,
                cubreHasta,
              })}
            />
          )}

          {/* Fantasma del arrastre: sigue al puntero mientras se mueve una
              cocción o una sugerencia. Con el drag nativo lo dibujaba el
              navegador (una captura pálida del elemento); con Pointer Events
              hay que pintarlo, y de paso queda mucho más informativo — dice
              qué se está moviendo y si el día bajo el cursor lo acepta.
              `pointer-events-none` es obligatorio: sin eso, el propio
              fantasma sería el elemento que `elementFromPoint` encuentra bajo
              el dedo y nunca se detectaría la celda de destino. */}
          {arrastre && typeof document !== 'undefined' && createPortal(
            <div
              // `prod-root`: el portal sale del árbol del módulo y sin esta
              // clase el reset global deja el padding del fantasma en 0 (ver
              // el comentario largo en PopoverCoccion.tsx).
              className="prod-root pointer-events-none fixed z-[10000] -translate-x-1/2 -translate-y-[130%]"
              style={{ left: arrastre.x, top: arrastre.y }}
            >
              <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold shadow-xl ring-1 ${
                arrastre.destino
                  ? 'bg-[#0F3D2E] text-white ring-white/20'
                  : 'bg-white text-gray-500 ring-gray-200'
              }`}>
                <Move size={12} className="shrink-0" />
                <span className="max-w-[170px] truncate">{arrastre.carga.producto}</span>
                <span className={arrastre.destino ? 'text-white/60' : 'text-gray-400'}>
                  {fNum(arrastre.carga.litros)} L
                </span>
              </div>
              {arrastre.destino && (
                <p className="mt-1 text-center text-[10px] font-bold text-[#0F3D2E]">
                  {new Date(arrastre.destino.fecha + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                  {arrastre.destino.fermentador ? ` · ${arrastre.destino.fermentador}` : ''}
                </p>
              )}
            </div>,
            document.body,
          )}
        </div>
      </main>
    </div>
  )
}
