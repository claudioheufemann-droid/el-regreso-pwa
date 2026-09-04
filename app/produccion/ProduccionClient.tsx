'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea,
  ResponsiveContainer, ComposedChart, Line, Area,
} from 'recharts'
import {
  LayoutDashboard, TrendingUp, Package, CalendarDays, ShoppingCart,
  CircleDollarSign, Bell, Plus, AlertTriangle, Calendar as CalendarIcon,
  TrendingDown, Beaker, Settings, Home, ChevronDown, Filter, Info, Sigma,
} from 'lucide-react'
import type { SerieForecast, CalidadItem, StockItem, AvanceMes, StockSeguridadItem } from './page'
import { ENVASE_LABEL, type EnvaseBucket } from '@/lib/produccion/reglas'

/* ────────────────────────────────────────────────────────────────────────
   Paleta corporativa. Tailwind cubre el resto; estos tres colores van
   inline porque no existen como tokens del tema.
   ──────────────────────────────────────────────────────────────────────── */
const COLORS = {
  darkGreen: '#0F3D2E',
  lightGreen: '#1A5441',
  amber: '#E5A922',
  lightAmber: '#FDE68A',
  kombucha: '#B45309',
  gray: '#9CA3AF',
}

/* ────────────────────────────────────────────────────────────────────────
   DATOS DE DEMOSTRACIÓN
   Estas tres secciones (cocciones, insumos/MRP, presupuesto) NO tienen
   respaldo en la base todavía: no existen tablas de recetas, insumos ni
   plan de cocción. Se dejan como maqueta para validar el diseño, y van
   marcadas en pantalla con el badge <BadgeDemo/> para que nadie tome una
   decisión de compra con estos números. Reemplazar por datos reales
   cuando existan las tablas.
   ──────────────────────────────────────────────────────────────────────── */
const DEMO_budgetData = [
  { month: 'Ene', cerveza: 45000, kombucha: 20000, tendencia: 65000 },
  { month: 'Feb', cerveza: 48000, kombucha: 22000, tendencia: 70000 },
  { month: 'Mar', cerveza: 35000, kombucha: 18000, tendencia: 53000 },
  { month: 'Abr', cerveza: 34000, kombucha: 19000, tendencia: 53000 },
  { month: 'May', cerveza: 36000, kombucha: 20000, tendencia: 56000 },
  { month: 'Jun', cerveza: 35000, kombucha: 21000, tendencia: 56000 },
  { month: 'Jul', cerveza: 32000, kombucha: 17000, tendencia: 49000 },
  { month: 'Ago', cerveza: 33000, kombucha: 18000, tendencia: 51000 },
  { month: 'Sep', cerveza: 40000, kombucha: 22000, tendencia: 62000 },
  { month: 'Oct', cerveza: 42000, kombucha: 24000, tendencia: 66000 },
  { month: 'Nov', cerveza: 47000, kombucha: 26000, tendencia: 73000 },
  { month: 'Dic', cerveza: 55000, kombucha: 30000, tendencia: 85000 },
]

const DEMO_insumosData = [
  { id: 1, insumo: 'Malta Pale Ale', categoria: 'Malta', stock: 420, consumo: 850, necesidad: 430, leadTime: 15, fechaPedido: '15/11/2026', estado: 'critico' },
  { id: 2, insumo: 'Lúpulo Citra', categoria: 'Lúpulo', stock: 15, consumo: 45, necesidad: 30, leadTime: 20, fechaPedido: '10/11/2026', estado: 'bajo' },
  { id: 3, insumo: 'Levadura US-05', categoria: 'Levadura', stock: 12, consumo: 10, necesidad: 0, leadTime: 7, fechaPedido: '-', estado: 'ok' },
  { id: 4, insumo: 'Té Negro (Orgánico)', categoria: 'Kombucha Base', stock: 45, consumo: 40, necesidad: 0, leadTime: 10, fechaPedido: '-', estado: 'ok' },
  { id: 5, insumo: 'Jengibre Fresco', categoria: 'Adjuntos', stock: 8, consumo: 30, necesidad: 22, leadTime: 3, fechaPedido: '27/11/2026', estado: 'bajo' },
  { id: 6, insumo: 'Lúpulo Mosaic', categoria: 'Lúpulo', stock: 5, consumo: 25, necesidad: 20, leadTime: 20, fechaPedido: '05/11/2026', estado: 'critico' },
  { id: 7, insumo: 'Latas 473ml', categoria: 'Empaque', stock: 1500, consumo: 5000, necesidad: 3500, leadTime: 30, fechaPedido: '01/11/2026', estado: 'critico' },
]

const DEMO_calendario = [
  { dia: 1, cocciones: [] },
  { dia: 2, cocciones: [{ estilo: 'Doble IPA', tipo: 'cerveza', urgente: false }, { estilo: 'Kombucha Maqui', tipo: 'kombucha', urgente: false }] },
  { dia: 3, cocciones: [{ estilo: 'Doble IPA', tipo: 'cerveza', urgente: false }] },
  { dia: 4, cocciones: [{ estilo: 'Doble IPA', tipo: 'cerveza', urgente: false }] },
  { dia: 5, cocciones: [{ estilo: 'La Barra APA', tipo: 'cerveza', urgente: false }] },
  { dia: 6, cocciones: [{ estilo: 'Red IPA', tipo: 'cerveza', urgente: false }] },
  { dia: 7, cocciones: [] },
  { dia: 8, cocciones: [{ estilo: 'Kombucha Lemon', tipo: 'kombucha', urgente: false }] },
  { dia: 9, cocciones: [{ estilo: 'Kombucha Lemon', tipo: 'kombucha', urgente: false }] },
  { dia: 10, cocciones: [{ estilo: 'Kombucha Maqui', tipo: 'kombucha', urgente: false }] },
  { dia: 11, cocciones: [{ estilo: 'Imperial Stout', tipo: 'cerveza', urgente: false }, { estilo: 'Kombucha Detox', tipo: 'kombucha', urgente: false }] },
  { dia: 12, cocciones: [{ estilo: 'La Barra APA', tipo: 'cerveza', urgente: false }, { estilo: 'Mocho English', tipo: 'cerveza', urgente: false }] },
  { dia: 13, cocciones: [{ estilo: 'La Barra APA', tipo: 'cerveza', urgente: false }] },
  { dia: 14, cocciones: [] },
  { dia: 15, cocciones: [{ estilo: 'Doble IPA', tipo: 'cerveza', urgente: false }] },
  { dia: 16, cocciones: [{ estilo: 'Kombucha Berry Menta', tipo: 'kombucha', urgente: false }] },
  { dia: 17, cocciones: [{ estilo: 'ÁMBAR LAGER', tipo: 'cerveza', urgente: true, detalle: 'Tanque FV-4 | Vol: 1000L' }] },
  { dia: 18, cocciones: [{ estilo: 'ÁMBAR LAGER', tipo: 'cerveza', urgente: true }] },
  { dia: 19, cocciones: [{ estilo: 'Imperial Stout', tipo: 'cerveza', urgente: false }] },
  { dia: 20, cocciones: [{ estilo: 'Fisura', tipo: 'cerveza', urgente: false }] },
  { dia: 21, cocciones: [] },
  { dia: 22, cocciones: [{ estilo: 'Doble IPA', tipo: 'cerveza', urgente: false }] },
  { dia: 23, cocciones: [{ estilo: 'Imperial Stout', tipo: 'cerveza', urgente: false }] },
  { dia: 24, cocciones: [{ estilo: 'Arboretum', tipo: 'cerveza', urgente: false }] },
  { dia: 25, cocciones: [] },
  { dia: 26, cocciones: [] },
  { dia: 27, cocciones: [{ estilo: 'La Barra APA', tipo: 'cerveza', urgente: false }] },
  { dia: 28, cocciones: [] },
  { dia: 29, cocciones: [{ estilo: 'Aguas Blancas', tipo: 'cerveza', urgente: false }] },
  { dia: 30, cocciones: [{ estilo: 'Kombucha Natural', tipo: 'kombucha', urgente: false }] },
  { dia: 31, cocciones: [] },
]

/* ── Utilidades de formato ─────────────────────────────────────────────── */
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fNum = (n: number) => Math.round(n).toLocaleString('es-CL')

function etiquetaMes(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  return `${MESES_CORTOS[m - 1]} '${String(y).slice(2)}`
}
function indiceMes(iso: string) {
  return Number(iso.split('-')[1]) - 1
}

const navItems = [
  { id: 'resumen', icon: LayoutDashboard, label: 'Resumen General' },
  { id: 'forecasting', icon: TrendingUp, label: 'Forecasting' },
  { id: 'seguridad', icon: Package, label: 'Stock de Seguridad' },
  { id: 'plan', icon: CalendarDays, label: 'Plan Maestro' },
  { id: 'insumos', icon: ShoppingCart, label: 'Insumos y Compras' },
  { id: 'presupuesto', icon: CircleDollarSign, label: 'Presupuesto' },
] as const

type TabId = (typeof navItems)[number]['id']

/** Agrupación del menú: primero entender la demanda, después decidir qué
 *  producir y comprar. Una lista plana de seis ítems no comunicaba ese orden. */
const GRUPOS_NAV: { titulo: string; items: TabId[] }[] = [
  { titulo: 'Demanda', items: ['resumen', 'forecasting'] },
  { titulo: 'Planificación', items: ['seguridad', 'plan'] },
  { titulo: 'Abastecimiento', items: ['insumos', 'presupuesto'] },
]

/** Secciones que todavía son maqueta (ver DATOS DE DEMOSTRACIÓN arriba). Se
 *  marcan en el propio menú para que nadie entre esperando datos reales. */
const DEMO_TABS = new Set<TabId>(['plan', 'insumos', 'presupuesto'])


/* ── Chip de confiabilidad, según el desvío (MAPE) del backtest ────────── */
function ChipConfiabilidad({ mape }: { mape: number | null }) {
  if (mape == null) return <span className="text-xs text-gray-300">—</span>
  const color = mape < 15 ? 'emerald' : mape < 30 ? 'amber' : 'red'
  const clases = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }[color]
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${clases}`}>{mape.toFixed(0)}%</span>
}

/* ── Badge para todo lo que todavía es maqueta ─────────────────────────── */
function BadgeDemo({ children = 'Datos de demostración' }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
      <Info size={12} />
      {children}
    </span>
  )
}

export default function ProduccionClient({
  series, calidad, stock, stockSeguridad, ultimaCorrida, avanceMes, nombreUsuario, inicialesUsuario,
}: {
  series: SerieForecast[]
  calidad: CalidadItem[]
  stock: StockItem[]
  stockSeguridad: StockSeguridadItem[]
  ultimaCorrida: string | null
  avanceMes: AvanceMes
  nombreUsuario: string
  inicialesUsuario: string
}) {
  const [activeTab, setActiveTab] = useState<TabId>('resumen')
  const [serieId, setSerieId] = useState<string>(series[0]?.id ?? '')
  const [avisoCoccion, setAvisoCoccion] = useState(false)
  const [busquedaInsumo, setBusquedaInsumo] = useState('')
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
  const [nivelSeguridad, setNivelSeguridad] = useState<'producto' | 'producto_envase'>('producto')
  const mesSeguridadActivo = mesSeguridad && mesesSeguridad.includes(mesSeguridad)
    ? mesSeguridad
    : mesesSeguridad[0] ?? ''

  const serieGeneral = series.find(s => s.nivel === 'general') ?? null
  const serieActual = series.find(s => s.id === serieId) ?? serieGeneral

  // Ritmo del mes en curso: si vendimos X en D días, a ese ritmo el mes
  // completo cierra en X/D*diasEnMes — la forma más simple de responder
  // "¿vamos a cumplir lo proyectado?" sin esperar a que termine el mes.
  const mtdLitros = serieActual?.litrosMesEnCurso ?? 0
  const ritmoProyectado = avanceMes.diaActual > 0 ? (mtdLitros / avanceMes.diaActual) * avanceMes.diasEnMes : 0

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
      .filter(s => s.mes === mesSeguridadActivo && s.nivel === nivelSeguridad)
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
      .sort((a, b) => {
        const peso = { critico: 0, sin_dato: 1, bajo: 2, ok: 3 }
        if (peso[a.estado] !== peso[b.estado]) return peso[a.estado] - peso[b.estado]
        return a.producto.localeCompare(b.producto) || (a.envase ?? '').localeCompare(b.envase ?? '')
      })
  }, [stockSeguridad, mesSeguridadActivo, nivelSeguridad])

  /* ── Contadores del menú ───────────────────────────────────────────────
     Sólo los que se pueden calcular de verdad: advertencias del modelo y
     productos en o bajo su punto de reorden. Las secciones de maqueta no
     llevan número — inventar uno ahí sería peor que no mostrarlo. */
  const alertasPorTab = useMemo<Partial<Record<TabId, number>>>(() => ({
    forecasting: advertencias.length,
    seguridad: filasStockSeguridad.filter(f => f.estado === 'critico' || f.estado === 'bajo').length,
  }), [advertencias.length, filasStockSeguridad])

  const insumosFiltrados = DEMO_insumosData.filter(i =>
    i.insumo.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
    i.categoria.toLowerCase().includes(busquedaInsumo.toLowerCase())
  )

  const tituloActual = navItems.find(i => i.id === activeTab)?.label ?? ''

  return (
    // prod-root: excluye a este módulo del reset global `* { padding: 0 }` de
    // globals.css, que anulaba todas las utilidades de spacing de Tailwind.
    // Ver el comentario extenso en app/globals.css.
    <div className="prod-root flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-100 font-sans text-gray-800 lg:flex-row">

      {/* ══ BARRA LATERAL (escritorio) ══ */}
      <aside
        className="hidden w-64 shrink-0 flex-col justify-between lg:flex"
        style={{
          // Degradado sutil en vez de un plano: da profundidad sin introducir
          // un color nuevo — es el mismo verde corporativo, apenas más oscuro
          // abajo, así el bloque del usuario se asienta visualmente.
          backgroundImage: `linear-gradient(180deg, ${COLORS.darkGreen} 0%, #0B2E22 100%)`,
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center gap-3 px-5 py-6 text-white">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(229,169,34,0.14)', border: '1px solid rgba(229,169,34,0.3)' }}
            >
              <Beaker size={20} style={{ color: COLORS.amber }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black leading-tight tracking-tight">EL REGRESO</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Beer &amp; Kombucha</p>
            </div>
          </div>

          {/* Los ítems se agrupan por para qué sirven: primero entender la
              demanda, después decidir qué producir y comprar. Antes era una
              lista plana de seis y no se leía ningún orden. */}
          <nav className="flex flex-col gap-6 px-3 pb-4">
            {GRUPOS_NAV.map(grupo => (
              <div key={grupo.titulo} className="flex flex-col gap-1">
                <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">
                  {grupo.titulo}
                </p>
                {grupo.items.map(id => {
                  const item = navItems.find(n => n.id === id)!
                  const activo = activeTab === id
                  const alertas = alertasPorTab[id] ?? 0
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      aria-current={activo ? 'page' : undefined}
                      className={`group relative flex items-center gap-3 rounded-lg py-2.5 pl-4 pr-3 text-left text-sm transition-all ${
                        activo ? 'font-bold text-white' : 'font-medium text-white/60 hover:bg-white/5 hover:text-white'
                      }`}
                      style={{ backgroundColor: activo ? COLORS.lightGreen : 'transparent' }}
                    >
                      {/* Marca dorada del ítem activo: el cambio de fondo solo
                          era poco contraste sobre el verde. */}
                      <span
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full transition-opacity"
                        style={{ backgroundColor: COLORS.amber, opacity: activo ? 1 : 0 }}
                      />
                      <item.icon size={18} className="shrink-0" style={{ color: activo ? COLORS.amber : undefined }} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {alertas > 0 && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums"
                          style={{ backgroundColor: 'rgba(239,68,68,0.18)', color: '#FCA5A5' }}
                          title={`${alertas} ${alertas === 1 ? 'punto' : 'puntos'} que requieren atención`}
                        >
                          {alertas}
                        </span>
                      )}
                      {DEMO_TABS.has(id) && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide"
                          style={{ backgroundColor: 'rgba(229,169,34,0.16)', color: COLORS.amber }}
                          title="Sección de maqueta: todavía sin datos reales"
                        >
                          demo
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Estado del modelo: dato operativo que antes sólo vivía en la barra
            superior, donde competía con el título de la sección. */}
        <div className="shrink-0 px-3 pb-3">
          <div className="mb-2 rounded-lg px-4 py-3" style={{ backgroundColor: 'rgba(0,0,0,0.22)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Último cálculo</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: ultimaCorrida ? '#34D399' : COLORS.gray }}
              />
              <span className="truncate text-xs font-semibold text-white/80">
                {ultimaCorrida ? ultimaCorrida.slice(0, 10) : 'Sin corrida'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg p-3 text-white" style={{ backgroundColor: 'rgba(0,0,0,0.22)' }}>
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
                style={{ backgroundColor: COLORS.amber, color: COLORS.darkGreen }}
              >
                {inicialesUsuario || '··'}
              </div>
              <div className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm font-semibold">{nombreUsuario}</span>
                <span className="text-[11px] text-white/40">Producción</span>
              </div>
            </div>
            <Link href="/" aria-label="Volver al inicio" className="shrink-0 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white">
              <Home size={15} />
            </Link>
          </div>
        </div>
      </aside>

      {/* ══ ÁREA PRINCIPAL ══ */}
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-gray-100">

        {/* ── Barra superior ── */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 lg:h-16 lg:px-8 lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Volver al inicio" className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden">
              <Home size={18} />
            </Link>
            <h2 className="truncate text-base font-bold text-gray-800 lg:text-xl">{tituloActual}</h2>
          </div>

          <div className="flex shrink-0 items-center gap-3 lg:gap-6">
            <div className="hidden items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 xl:flex">
              <CalendarIcon size={16} />
              <span>{ultimaCorrida ? `Modelo: ${ultimaCorrida.slice(0, 10)}` : 'Sin corrida'}</span>
              <ChevronDown size={14} />
            </div>

            <div className="relative cursor-pointer" title={`${advertencias.length} advertencias del modelo`}>
              <Bell size={20} className="text-gray-600" />
              {advertencias.length > 0 && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
              )}
            </div>

            <button
              onClick={() => setAvisoCoccion(v => !v)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white shadow-sm transition-transform hover:scale-105 lg:px-4"
              style={{ backgroundColor: COLORS.amber }}
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Nueva Cocción</span>
            </button>
          </div>
        </header>

        {avisoCoccion && (
          <div className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 lg:px-8">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>
              El plan de cocciones todavía no está conectado — no existe una tabla de cocciones en la base.
              Cuando exista, este botón crea el registro desde acá.
            </span>
            <button onClick={() => setAvisoCoccion(false)} className="ml-auto shrink-0 font-bold hover:underline">Cerrar</button>
          </div>
        )}

        {/* ── Tabs (móvil) ── */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2 lg:hidden">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                activeTab === item.id ? 'text-white' : 'bg-gray-100 text-gray-600'
              }`}
              style={{ backgroundColor: activeTab === item.id ? COLORS.darkGreen : undefined }}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>

        {/* ── Contenido ── */}
        <div className="flex-1 overflow-auto p-4 lg:p-8">

          {/* ══════════ VISTA 1: RESUMEN GENERAL ══════════ */}
          {activeTab === 'resumen' && (
            <div className="flex flex-col gap-6">

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

                <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 text-sm font-medium text-gray-500">
                    <span className="flex items-center gap-2">
                      <Beaker size={18} style={{ color: COLORS.darkGreen }} />
                      Capacidad Planta
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-3xl font-bold text-gray-900">78%</span>
                    <span className="mb-1 rounded-md bg-green-100 px-2 py-1 text-xs font-bold text-green-600">Operativa</span>
                  </div>
                  <BadgeDemo>Demo</BadgeDemo>
                </div>
              </div>

              {/* Calendario + Alertas */}
              <div className="flex flex-col gap-6 xl:h-[600px] xl:flex-row">

                {/* Calendario */}
                <div className="flex flex-[3] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 px-4 py-4 lg:px-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-bold text-gray-800">Cronograma de Cocciones</h3>
                      <BadgeDemo />
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium shadow-sm">Mes</button>
                      <button className="rounded px-3 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100">Semana</button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-4">
                    <div className="grid min-w-[620px] grid-cols-7 gap-2">
                      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(dia => (
                        <div key={dia} className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-gray-400">
                          {dia}
                        </div>
                      ))}

                      {DEMO_calendario.map(dia => (
                        <div
                          key={dia.dia}
                          className="relative flex min-h-[80px] flex-col gap-1 rounded-md border border-gray-100 bg-gray-50/30 p-1.5 transition-colors hover:bg-gray-50"
                        >
                          <span className="absolute right-2 top-1.5 text-xs font-medium text-gray-400">{dia.dia}</span>
                          <div className="mt-4 flex flex-col gap-1">
                            {dia.cocciones.map((coccion, cIdx) => (
                              <div
                                key={cIdx}
                                className={`group relative cursor-pointer truncate rounded-sm px-1.5 py-1 text-[10px] font-bold ${
                                  coccion.urgente
                                    ? 'border-[1.5px] border-red-500 bg-red-50 text-red-700 shadow-sm'
                                    : coccion.tipo === 'kombucha'
                                      ? 'text-white'
                                      : 'text-white'
                                }`}
                                style={
                                  coccion.urgente
                                    ? undefined
                                    : { backgroundColor: coccion.tipo === 'kombucha' ? COLORS.kombucha : COLORS.lightGreen }
                                }
                              >
                                {coccion.estilo}
                                {coccion.urgente && (
                                  <div className="absolute -top-12 left-0 z-10 hidden w-40 flex-col rounded bg-gray-900 p-2 text-xs font-normal text-white shadow-xl group-hover:flex">
                                    <span className="font-bold text-red-400">URGENTE · Reorden</span>
                                    <span>{('detalle' in coccion && coccion.detalle) || 'Requiere acción'}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

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
            <div className="flex min-h-full flex-col gap-6">

              {/* Filtros */}
              <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label htmlFor="serie" className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Línea de Producto / Envase
                  </label>
                  <div className="relative">
                    <select
                      id="serie"
                      value={serieActual?.id ?? ''}
                      onChange={e => setSerieId(e.target.value)}
                      className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {series.some(s => s.nivel === 'general') && (
                        <optgroup label="Consolidado">
                          {series.filter(s => s.nivel === 'general').map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {series.some(s => s.nivel === 'producto') && (
                        <optgroup label="Por producto">
                          {series.filter(s => s.nivel === 'producto').map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {series.some(s => s.nivel === 'envase') && (
                        <optgroup label="Por envase">
                          {series.filter(s => s.nivel === 'envase').map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {series.some(s => s.nivel === 'producto_envase') && (
                        <optgroup label="Por producto y envase">
                          {series.filter(s => s.nivel === 'producto_envase').map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-2.5 text-gray-400" />
                  </div>
                </div>

                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Historial disponible</label>
                  <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">
                    <Filter size={16} className="text-gray-400" />
                    {serieActual?.mesesHistorial != null
                      ? `${serieActual.mesesHistorial} meses de ventas reales`
                      : `${chartData.filter(d => d.ventaReal != null).length} meses de ventas reales`}
                  </div>
                </div>
              </div>

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
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Vendido este mes</p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-gray-900">{fNum(mtdLitros)} L</p>
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
                                <p className="mb-1.5 font-bold text-gray-700">{label}</p>
                                {visibles.map(entrada => {
                                  const valor = entrada.value
                                  const texto = Array.isArray(valor)
                                    ? `${fNum(Number(valor[0]))} – ${fNum(Number(valor[1]))} L`
                                    : `${fNum(Number(valor))} L`
                                  return (
                                    <p key={String(entrada.dataKey)} style={{ color: entrada.color }} className="font-semibold">
                                      {entrada.name}: {texto}
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
                        <th className="px-6 py-3 text-center font-bold">Confiabilidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filasTablaDetalle.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Sin combinaciones para este filtro.</td></tr>
                      )}
                      {filasTablaDetalle.map(({ serie, proximo }, i) => {
                        const productoRepetido = i > 0 && filasTablaDetalle[i - 1].serie.producto === serie.producto
                        return (
                          <tr key={serie.id} className="transition-colors hover:bg-gray-50">
                            <td className="px-6 py-2.5 font-semibold text-gray-800">
                              {productoRepetido ? <span className="text-gray-300">″</span> : serie.producto}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{ENVASE_LABEL[(serie.envaseBucket ?? 'otros') as EnvaseBucket] ?? serie.envaseBucket}</td>
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
                              <ChipConfiabilidad mape={serie.mape} />
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
            <div className="flex flex-col gap-6">

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

              {/* Tabla de stock de seguridad */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
                  <div>
                    <h3 className="font-bold text-gray-800">Stock de Seguridad y Punto de Reorden</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {filasStockSeguridad.length} {nivelSeguridad === 'producto' ? 'productos' : 'combinaciones producto × formato'} · comparado contra el inventario actual del ERP.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Nivel</span>
                      <div className="flex overflow-hidden rounded-md border border-gray-200">
                        {([
                          { id: 'producto' as const, label: 'Producto' },
                          { id: 'producto_envase' as const, label: 'Por formato' },
                        ]).map(op => (
                          <button
                            key={op.id}
                            onClick={() => setNivelSeguridad(op.id)}
                            className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                              nivelSeguridad === op.id ? 'bg-[#0F3D2E] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {op.label}
                          </button>
                        ))}
                      </div>
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
                        {nivelSeguridad === 'producto_envase' && <th className="px-4 py-3 font-bold">Formato</th>}
                        <th className="px-4 py-3 font-bold">Categoría</th>
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
                      {filasStockSeguridad.length === 0 && (
                        <tr><td colSpan={nivelSeguridad === 'producto_envase' ? 11 : 10} className="px-6 py-10 text-center text-gray-400">Sin datos para este mes.</td></tr>
                      )}
                      {filasStockSeguridad.map(f => (
                        <tr key={`${f.producto}::${f.envase ?? ''}`} className="transition-colors hover:bg-gray-50">
                          {/* flex+gap para separar el chip, NO ml-2: el reset
                              global `* { margin:0; padding:0 }` de globals.css
                              gana sobre las utilidades de margin/padding de
                              Tailwind (van en @layer, el reset no), así que
                              ml-* y px-* quedan en 0. gap sí funciona. */}
                          <td className="px-6 py-3 font-semibold text-gray-800">
                            <span className="inline-flex items-center gap-2">
                            {f.producto}
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
                          {nivelSeguridad === 'producto_envase' && (
                            <td className="px-4 py-3 text-gray-600">{f.envase ? (ENVASE_LABEL[f.envase as keyof typeof ENVASE_LABEL] ?? f.envase) : '—'}</td>
                          )}
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold capitalize ${
                              f.categoria === 'cerveza' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}>
                              {f.categoria}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3 text-center tabular-nums text-gray-600"
                            title={`Lead time ${f.leadTimeSemanas} sem. + revisión mensual ${f.periodoRevisionSemanas.toFixed(1)} sem.`}
                          >
                            {(f.leadTimeSemanas + f.periodoRevisionSemanas).toFixed(1)} sem.
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Inventario actual, como referencia */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-4">
                  <h3 className="font-bold text-gray-800">Inventario Actual</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Foto del último informe de stock del ERP · {stock.length} líneas de producto.
                  </p>
                </div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                      <tr>
                        <th className="px-6 py-4 font-bold">Producto</th>
                        <th className="px-6 py-4 font-bold">Categoría</th>
                        <th className="px-6 py-4 font-bold">Formato</th>
                        <th className="px-6 py-4 text-right font-bold">Cantidad</th>
                        <th className="px-6 py-4 text-right font-bold">Litros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {stock.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Sin informe de stock cargado.</td></tr>
                      )}
                      {stock.map((s, i) => (
                        <tr key={i} className="transition-colors hover:bg-gray-50">
                          <td className="px-6 py-3 font-semibold text-gray-800">{s.producto}</td>
                          <td className="px-6 py-3 text-gray-500">{s.categoria ?? '—'}</td>
                          <td className="px-6 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                              s.tipo === 'barril' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-600'
                            }`}>
                              {s.tipo === 'barril' ? 'Barril' : 'Envase'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right font-bold tabular-nums text-gray-900">{fNum(s.cantidad)}</td>
                          <td className="px-6 py-3 text-right tabular-nums text-gray-600">{s.litros != null ? `${fNum(s.litros)} L` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ VISTA 4: PLAN MAESTRO ══════════ */}
          {activeTab === 'plan' && (
            <div className="flex h-full items-center justify-center">
              <div className="flex max-w-md flex-col items-center gap-4 text-center text-gray-400">
                <Settings size={48} className="opacity-50" />
                <h3 className="text-xl font-medium text-gray-500">Módulo en construcción</h3>
                <p className="text-sm">
                  La asignación de capacidad finita (qué se cuece, en qué tanque y qué día) necesita una tabla de
                  cocciones y de fermentadores que todavía no existe en la base.
                </p>
                <button
                  onClick={() => setActiveTab('resumen')}
                  className="mt-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-300"
                >
                  Volver al Resumen
                </button>
              </div>
            </div>
          )}

          {/* ══════════ VISTA 5: INSUMOS Y COMPRAS (MRP) ══════════ */}
          {activeTab === 'insumos' && (
            <div className="flex h-full flex-col gap-6">
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-bold text-gray-800">Planificación de Requerimiento de Materiales (MRP)</h3>
                      <BadgeDemo />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      No hay tablas de recetas ni de insumos en la base todavía — esta vista es una maqueta del formato.
                    </p>
                  </div>
                  <div className="relative">
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
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-600 shadow-sm">
                      <tr>
                        <th className="px-6 py-4 font-bold">Insumo</th>
                        <th className="px-6 py-4 font-bold">Categoría</th>
                        <th className="px-6 py-4 text-right font-bold">Stock Actual</th>
                        <th className="px-6 py-4 text-right font-bold">Consumo Proyectado</th>
                        <th className="px-6 py-4 text-right font-bold text-amber-700">Necesidad Neta</th>
                        <th className="px-6 py-4 text-center font-bold">Lead Time (días)</th>
                        <th className="px-6 py-4 text-center font-bold text-green-700">Fecha Ideal Pedido</th>
                        <th className="px-6 py-4 text-center font-bold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {insumosFiltrados.length === 0 && (
                        <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">Sin resultados para “{busquedaInsumo}”.</td></tr>
                      )}
                      {insumosFiltrados.map(row => (
                        <tr key={row.id} className="transition-colors hover:bg-gray-50">
                          <td className="px-6 py-3 font-semibold text-gray-800">{row.insumo}</td>
                          <td className="px-6 py-3 text-gray-500">{row.categoria}</td>
                          <td className="px-6 py-3 text-right font-medium tabular-nums">
                            {fNum(row.stock)} <span className="text-xs text-gray-400">kg/un</span>
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums text-gray-600">
                            {fNum(row.consumo)} <span className="text-xs text-gray-400">kg/un</span>
                          </td>
                          <td className={`px-6 py-3 text-right font-bold tabular-nums text-gray-900 ${row.necesidad > 0 ? 'bg-amber-50' : ''}`}>
                            {row.necesidad > 0 ? <>{fNum(row.necesidad)} <span className="text-xs text-gray-400">kg/un</span></> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-6 py-3 text-center tabular-nums text-gray-500">{row.leadTime}</td>
                          <td className="px-6 py-3 text-center">
                            {row.fechaPedido !== '-' ? (
                              <div className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-gray-100 px-2 py-1 font-bold text-gray-800">
                                <CalendarIcon size={14} className="text-gray-500" />
                                {row.fechaPedido}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className={`inline-flex w-24 items-center justify-center rounded-full border px-2 py-1 text-xs font-bold ${
                              row.estado === 'critico' ? 'border-red-200 bg-red-50 text-red-600'
                                : row.estado === 'bajo' ? 'border-amber-200 bg-amber-50 text-amber-600'
                                  : 'border-green-200 bg-green-50 text-green-600'
                            }`}>
                              {row.estado === 'critico' ? 'CRÍTICO' : row.estado === 'bajo' ? 'BAJO' : 'OK'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ VISTA 6: PRESUPUESTO ══════════ */}
          {activeTab === 'presupuesto' && (
            <div className="flex flex-col gap-6 xl:h-full xl:flex-row">

              <div className="flex flex-[3] flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
                <div className="mb-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-800">Gasto Proyectado en Insumos Productivos</h3>
                    <BadgeDemo />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Presupuesto mensual separado por línea de negocio (Cerveza y Kombucha).
                  </p>
                </div>

                <div className="relative min-h-[360px] w-full flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={DEMO_budgetData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dx={-6} tickFormatter={(val: number) => `$${val / 1000}k`} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value, name) => [`$${Number(value).toLocaleString('es-CL')}`, name]}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#374151' }} />

                      <Bar dataKey="cerveza" name="Insumos Cerveza" stackId="a" fill={COLORS.darkGreen} />
                      <Bar dataKey="kombucha" name="Insumos Kombucha" stackId="a" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="tendencia" name="Tendencia Total" stroke={COLORS.gray} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-6 xl:max-w-sm">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">Resumen Gasto Anual</h3>
                  <div className="mb-1 text-sm text-gray-500">Total Proyectado (Insumos)</div>
                  <div className="mb-6 text-4xl font-black text-gray-900">$978.000</div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div>
                        <div className="text-sm font-bold text-gray-800">Cerveza Artesanal</div>
                        <div className="text-xs text-gray-500">Malta, lúpulo, levadura, etc.</div>
                      </div>
                      <div className="font-bold text-gray-900">$645.000</div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                      <div>
                        <div className="text-sm font-bold text-gray-800">Kombucha (La Ida)</div>
                        <div className="text-xs text-gray-500">Té, frutas, scoby, etc.</div>
                      </div>
                      <div className="font-bold text-amber-900">$333.000</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
                  <div className="flex items-center gap-2 font-bold text-green-800">
                    <CircleDollarSign size={20} />
                    Flujo de Caja Estimado
                  </div>
                  <p className="text-sm leading-relaxed text-green-700">
                    La cobranza esperada a 3 meses cubre el <strong>145%</strong> del gasto proyectado en insumos para
                    el mismo período, asumiendo un 70% de cartera sin deuda. Flujo neto positivo.
                  </p>
                  <BadgeDemo />
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
