'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea,
  ResponsiveContainer, ComposedChart, Line, Area,
} from 'recharts'
import {
  LayoutDashboard, TrendingUp, Package, CalendarDays, ShoppingCart,
  CircleDollarSign, Bell, Plus, AlertTriangle, Calendar as CalendarIcon,
  TrendingDown, Beaker, Settings, Home, ChevronDown, Filter, Info,
} from 'lucide-react'
import type { SerieForecast, CalidadItem, StockItem, AvanceMes } from './page'
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
  series, calidad, stock, ultimaCorrida, avanceMes, nombreUsuario, inicialesUsuario,
}: {
  series: SerieForecast[]
  calidad: CalidadItem[]
  stock: StockItem[]
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

  const serieGeneral = series.find(s => s.nivel === 'general') ?? null
  const serieActual = series.find(s => s.id === serieId) ?? serieGeneral

  // Ritmo del mes en curso: si vendimos X en D días, a ese ritmo el mes
  // completo cierra en X/D*diasEnMes — la forma más simple de responder
  // "¿vamos a cumplir lo proyectado?" sin esperar a que termine el mes.
  const mtdLitros = serieActual?.litrosMesEnCurso ?? 0
  const ritmoProyectado = avanceMes.diaActual > 0 ? (mtdLitros / avanceMes.diaActual) * avanceMes.diasEnMes : 0

  /* ── Serie seleccionada → filas para Recharts ─────────────────────────
     La proyección arranca repitiendo el último mes real, para que las dos
     líneas queden pegadas en el gráfico en vez de mostrar un corte. El mes
     en curso (excluido del entrenamiento por estar incompleto) se agrega acá
     con lo vendido hasta hoy y el ritmo proyectado a fin de mes, para
     comparar contra la proyección del modelo en la misma columna. */
  const chartData = useMemo(() => {
    if (!serieActual) return []
    const puntos = [...serieActual.puntos].sort((a, b) => a.mes.localeCompare(b.mes))
    const idxCorte = puntos.findIndex(p => p.tipo === 'forecast')
    const filas = puntos.map((p, i) => {
      const esUltimoReal = idxCorte > 0 && i === idxCorte - 1
      const esMesEnCurso = p.mes === avanceMes.mes
      return {
        month: etiquetaMes(p.mes),
        mesIso: p.mes,
        ventaReal: p.tipo === 'historico' ? p.litros : null,
        ventaProyectada: p.tipo === 'forecast' || esUltimoReal ? p.litros : null,
        rango: p.litrosMin != null && p.litrosMax != null ? [p.litrosMin, p.litrosMax] : null,
        mtd: esMesEnCurso ? mtdLitros : null,
        ritmo: esMesEnCurso ? ritmoProyectado : null,
      }
    })
    // El mes en curso puede no venir en `puntos` (el modelo lo excluyó del
    // historial y todavía no corrió con él como forecast, ej. recién
    // empezó el mes) — si falta, se agrega igual para no perder el avance.
    if (!filas.some(f => f.mesIso === avanceMes.mes)) {
      filas.push({
        month: etiquetaMes(avanceMes.mes), mesIso: avanceMes.mes,
        ventaReal: null, ventaProyectada: null, rango: null,
        mtd: mtdLitros, ritmo: ritmoProyectado,
      })
      filas.sort((a, b) => a.mesIso.localeCompare(b.mesIso))
    }
    return filas
  }, [serieActual, avanceMes.mes, mtdLitros, ritmoProyectado])

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

  const insumosFiltrados = DEMO_insumosData.filter(i =>
    i.insumo.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
    i.categoria.toLowerCase().includes(busquedaInsumo.toLowerCase())
  )

  const tituloActual = navItems.find(i => i.id === activeTab)?.label ?? ''

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-100 font-sans text-gray-800 lg:flex-row">

      {/* ══ BARRA LATERAL (escritorio) ══ */}
      <aside
        className="hidden w-64 shrink-0 flex-col justify-between lg:flex"
        style={{ backgroundColor: COLORS.darkGreen }}
      >
        <div>
          <div className="flex items-center gap-3 p-6 text-white">
            <Beaker size={28} style={{ color: COLORS.amber }} />
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight">EL REGRESO</h1>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-300">Beer &amp; Kombucha</p>
            </div>
          </div>

          <nav className="mt-4 flex flex-col gap-1 px-3">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeTab === item.id ? 'text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
                style={{ backgroundColor: activeTab === item.id ? COLORS.lightGreen : 'transparent' }}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="m-3 flex items-center justify-between rounded-lg border-t border-white/10 bg-black/20 p-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-500 text-sm font-bold">
              {inicialesUsuario || '··'}
            </div>
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm font-semibold">{nombreUsuario}</span>
              <span className="text-xs text-gray-400">Producción</span>
            </div>
          </div>
          <Link href="/" aria-label="Volver al inicio" className="shrink-0 text-gray-400 transition-colors hover:text-white">
            <Home size={16} />
          </Link>
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
              {mtdLitros > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Llevamos vendido este mes</p>
                    <p className="text-2xl font-black text-gray-900">{fNum(mtdLitros)} L</p>
                    <p className="text-xs text-gray-500">día {avanceMes.diaActual} de {avanceMes.diasEnMes}</p>
                  </div>
                  <div className="text-gray-300">→</div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">A este ritmo, cerrarías con</p>
                    <p className="text-2xl font-black" style={{ color: COLORS.amber }}>{fNum(ritmoProyectado)} L</p>
                    <p className="text-xs text-gray-500">proyección lineal simple</p>
                  </div>
                  {(() => {
                    const objetivo = chartData.find(f => f.mesIso === avanceMes.mes)?.ventaProyectada
                    if (objetivo == null || objetivo === 0) return null
                    const pct = (ritmoProyectado / objetivo) * 100
                    const cumple = pct >= 95
                    return (
                      <>
                        <div className="text-gray-300">vs.</div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">El modelo proyectó</p>
                          <p className="text-2xl font-black" style={{ color: COLORS.darkGreen }}>{fNum(objetivo)} L</p>
                          <p className={`text-xs font-bold ${cumple ? 'text-green-600' : 'text-red-600'}`}>
                            {cumple ? '✓' : '⚠'} vas al {pct.toFixed(0)}% de lo proyectado
                          </p>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Gráfico */}
              <div className="flex min-h-[420px] flex-1 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">
                      Proyección de Demanda (Litros) vs. Venta Real
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {serieActual?.label ?? '—'} · el área ámbar marca la temporada alta (Dic–Feb).
                    </p>
                  </div>
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

                <div className="relative min-h-[320px] w-full flex-1">
                  {chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      Todavía no hay una corrida del modelo. Se genera automáticamente el día 2 de cada mes.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                          dataKey="month" axisLine={false} tickLine={false} minTickGap={24}
                          tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }} dy={10}
                        />
                        <YAxis
                          axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dx={-6}
                          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value, name) =>
                            Array.isArray(value)
                              ? [`${fNum(Number(value[0]))} – ${fNum(Number(value[1]))} L`, name]
                              : [`${fNum(Number(value))} L`, name]
                          }
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#374151' }} />

                        {tramosTemporadaAlta.map((t, i) => (
                          <ReferenceArea key={i} x1={t.x1} x2={t.x2} fill={COLORS.lightAmber} fillOpacity={0.4} />
                        ))}

                        <Area
                          dataKey="rango" name="Rango estimado" stroke="none"
                          fill={COLORS.darkGreen} fillOpacity={0.12} connectNulls
                        />
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
                        {/* Avance del mes en curso: un solo punto cada una —
                            lo vendido hasta hoy (relleno) y a qué ritmo
                            cerraría el mes (hueco), para comparar de un
                            vistazo contra la proyección verde del modelo. */}
                        <Line
                          type="monotone" dataKey="mtd" name="Vendido hasta hoy"
                          stroke={COLORS.amber} strokeWidth={0} connectNulls={false}
                          dot={{ r: 6, fill: COLORS.amber, strokeWidth: 2, stroke: '#fff' }}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone" dataKey="ritmo" name="Ritmo proyectado"
                          stroke={COLORS.gray} strokeWidth={0} connectNulls={false}
                          dot={{ r: 6, fill: '#fff', strokeWidth: 2, stroke: COLORS.gray }}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
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
              <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <Info size={18} className="mt-0.5 shrink-0" />
                <p>
                  El <strong>stock de seguridad y punto de reorden</strong> todavía no se calculan: es lo que va a producir
                  el pipeline de Python cuando se le agregue ese cálculo. Abajo está el inventario real de hoy,
                  que es el insumo que ese cálculo va a usar.
                </p>
              </div>

              <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-4">
                  <h3 className="font-bold text-gray-800">Inventario Actual</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Foto del último informe de stock del ERP · {stock.length} líneas de producto.
                  </p>
                </div>
                <div className="overflow-auto">
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
