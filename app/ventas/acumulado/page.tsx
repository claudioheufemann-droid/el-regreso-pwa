import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES, CLIENTES_EXCLUIR } from '@/lib/types'
import AcumuladoClient from './AcumuladoClient'

export const dynamic = 'force-dynamic'

// ── Tipos exportados ────────────────────────────────────────────────────────
export interface KpiData {
  litros: number;        litrosAnterior: number
  venta: number;         ventaAnterior: number
  ticketPromedio: number; ticketPromedioAnterior: number
  clientesActivos: number; clientesActivosAnterior: number
  categoriaLider: string; categoriaLiderPct: number; categoriaLiderPctAnterior: number
}

export interface EvoDia {
  fecha: string
  [key: string]: number | string
}

export interface CatRow {
  litros: number; venta: number; litrosAnterior: number
}

export interface TopCliente {
  nombre: string; categoria: string; litros: number; litrosAnterior: number
}

export interface MixItem { categoria: string; litros: number }

export interface InsightItem { texto: string; tipo: 'positive' | 'negative' | 'warning' | 'info' }

export interface AlertaItem {
  titulo: string; subtexto: string
  tipo: 'danger' | 'warning' | 'info' | 'success'; hace: string
}

export interface DivVend {
  categorias: Record<string, number>; score: number; descripcion: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function excluido(nombre: string | null) {
  return !nombre || CLIENTES_EXCLUIR.some(ex => nombre.includes(ex))
}

function prevPeriod(fechaInicio: string) {
  const [y, m] = fechaInicio.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  const inicio = `${py}-${String(pm).padStart(2, '0')}-01`
  const fin = new Date(y, m - 1, 0).toISOString().split('T')[0]
  return { inicio, fin }
}

function catLitros(ventas: { categoria_negocio: string | null; litros: number }[]) {
  const m: Record<string, number> = {}
  for (const v of ventas) {
    const cat = (v.categoria_negocio && v.categoria_negocio !== '-') ? v.categoria_negocio : 'Otros'
    m[cat] = (m[cat] ?? 0) + (v.litros ?? 0)
  }
  return m
}

function hhi(cats: Record<string, number>): number {
  const total = Object.values(cats).reduce((s, v) => s + v, 0)
  if (!total) return 1
  return Object.values(cats).reduce((s, v) => s + (v / total) ** 2, 0)
}

function divScore(cats: Record<string, number>) {
  const h = hhi(cats)
  const score = Math.round(Math.max(0, Math.min(100, (1 - h) * 130)))
  const top = Math.max(...Object.values(cats)) / (Object.values(cats).reduce((s, v) => s + v, 0) || 1)
  const desc = top > 0.5 ? `Dependencia alta en ${Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0]}`
             : top > 0.35 ? 'Diversificación moderada'
             : 'Diversificación saludable'
  return { score, descripcion: desc }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function AcumuladoPage() {
  const supabase = await createClient()
  const appUser  = await getServerUser()

  const vendedoresScope = appUser?.isAdmin ? VENDEDORES : VENDEDORES.filter(v => v === appUser?.nombre)
  const scope = vendedoresScope.length ? vendedoresScope : ['__none__']

  // Período activo
  const { data: periodo } = await supabase.from('periodos').select('*').eq('activo', true).single()
  const fechaInicio = periodo?.fecha_inicio ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const fechaFin    = periodo?.fecha_fin    ?? new Date().toISOString().split('T')[0]

  // Período anterior
  const prev = prevPeriod(fechaInicio)

  // Ventas período actual y anterior + metas — en paralelo
  const [{ data: ventasRaw }, { data: ventasPrevRaw }, { data: metasData }, { data: riesgoRaw }] = await Promise.all([
    supabase.from('ventas')
      .select('vendedor_actual,litros,total_sin_impuesto,categoria_negocio,categoria_producto,fecha_pedido,nombre_fantasia,pedido')
      .in('vendedor_actual', scope)
      .gte('fecha_pedido', fechaInicio)
      .lte('fecha_pedido', fechaFin),

    supabase.from('ventas')
      .select('vendedor_actual,litros,total_sin_impuesto,categoria_negocio,categoria_producto,fecha_pedido,nombre_fantasia')
      .in('vendedor_actual', scope)
      .gte('fecha_pedido', prev.inicio)
      .lte('fecha_pedido', prev.fin),

    supabase.from('metas')
      .select('vendedor,meta_litros,tipo')
      .eq('periodo_id', periodo?.id ?? -1)
      .eq('tipo', 'mensual'),

    supabase.rpc('get_pending_call_alerts', { p_vendedor: null, p_nivel_minimo: 'critico' }),
  ])

  const ventas     = (ventasRaw    ?? []).filter(v => !excluido(v.nombre_fantasia))
  const ventasPrev = (ventasPrevRaw ?? []).filter(v => !excluido(v.nombre_fantasia))

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalLitros     = ventas.reduce((s, v) => s + (v.litros ?? 0), 0)
  const totalVenta      = ventas.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)
  const totalLitrosPrev = ventasPrev.reduce((s, v) => s + (v.litros ?? 0), 0)
  const totalVentaPrev  = ventasPrev.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)

  const pedidos     = new Set(ventas.filter(v => (v as { pedido?: string }).pedido).map(v => (v as { pedido?: string }).pedido)).size || 1
  const pedidosPrev = new Set(ventasPrev.filter(v => (v as { pedido?: string }).pedido).map(v => (v as { pedido?: string }).pedido)).size || 1

  const clientesActivos     = new Set(ventas.map(v => v.nombre_fantasia).filter(Boolean)).size
  const clientesActivosPrev = new Set(ventasPrev.map(v => v.nombre_fantasia).filter(Boolean)).size

  const ticketPromedio     = totalVenta / pedidos
  const ticketPromedioAnterior = totalVentaPrev / pedidosPrev

  const catActual = catLitros(ventas)
  const catAnterior = catLitros(ventasPrev)
  const catLiderEntry = Object.entries(catActual).sort((a, b) => b[1] - a[1])[0] ?? ['—', 0]
  const categoriaLiderPct = totalLitros > 0 ? Math.round((catLiderEntry[1] / totalLitros) * 100) : 0
  const catLiderPrevLitros = catAnterior[catLiderEntry[0]] ?? 0
  const categoriaLiderPctAnterior = totalLitrosPrev > 0 ? Math.round((catLiderPrevLitros / totalLitrosPrev) * 100) : 0

  const kpis: KpiData = {
    litros: totalLitros, litrosAnterior: totalLitrosPrev,
    venta: totalVenta, ventaAnterior: totalVentaPrev,
    ticketPromedio, ticketPromedioAnterior,
    clientesActivos, clientesActivosAnterior: clientesActivosPrev,
    categoriaLider: catLiderEntry[0],
    categoriaLiderPct,
    categoriaLiderPctAnterior,
  }

  // ── Evolución diaria ──────────────────────────────────────────────────────
  const evoMap = new Map<string, Record<string, number>>()
  for (const v of ventas) {
    const f = v.fecha_pedido
    if (!evoMap.has(f)) evoMap.set(f, {})
    const d = evoMap.get(f)!
    d[v.vendedor_actual] = (d[v.vendedor_actual] ?? 0) + (v.litros ?? 0)
  }
  const evolucion: EvoDia[] = Array.from(evoMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, vals]) => ({ fecha, ...vals }))

  // Evolución anterior (total por día)
  const evoPrevMap = new Map<string, number>()
  for (const v of ventasPrev) {
    const f = v.fecha_pedido
    evoPrevMap.set(f, (evoPrevMap.get(f) ?? 0) + (v.litros ?? 0))
  }

  // ── Proyección ──────────────────────────────────────────────────────────
  const hoy = new Date()
  const diasTranscurridos = Math.max(1, Math.ceil((hoy.getTime() - new Date(fechaInicio).getTime()) / 86400000))
  const diasTotales = Math.ceil((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000) + 1
  const promedioDiario = totalLitros / diasTranscurridos
  const proyeccionFin  = promedioDiario * diasTotales

  const mejorDiaEntry = Array.from(evoMap.entries())
    .map(([fecha, vals]) => ({ fecha, total: Object.values(vals).reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total)[0]

  // ── Categorías por vendedor ───────────────────────────────────────────────
  const catPorVendedor: Record<string, Record<string, CatRow>> = {}
  for (const vend of vendedoresScope) {
    const vV = ventas.filter(v => v.vendedor_actual === vend)
    const vP = ventasPrev.filter(v => v.vendedor_actual === vend)
    const prevMap = catLitros(vP)
    catPorVendedor[vend] = {}
    for (const v of vV) {
      const cat = (v.categoria_negocio && v.categoria_negocio !== '-') ? v.categoria_negocio : 'Otros'
      if (!catPorVendedor[vend][cat]) catPorVendedor[vend][cat] = { litros: 0, venta: 0, litrosAnterior: prevMap[cat] ?? 0 }
      catPorVendedor[vend][cat].litros += v.litros ?? 0
      catPorVendedor[vend][cat].venta  += v.total_sin_impuesto ?? 0
    }
    // Asegurar litrosAnterior para cada categoría
    for (const cat of Object.keys(catPorVendedor[vend])) {
      catPorVendedor[vend][cat].litrosAnterior = prevMap[cat] ?? 0
    }
  }

  // ── Mix de estilos (categoria_producto) ──────────────────────────────────
  const mixMap: Record<string, number> = {}
  for (const v of ventas) {
    const cat = v.categoria_producto ?? 'Otros'
    mixMap[cat] = (mixMap[cat] ?? 0) + (v.litros ?? 0)
  }
  const mixEstilos: MixItem[] = Object.entries(mixMap)
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, litros]) => ({ categoria, litros }))

  // ── Top clientes ──────────────────────────────────────────────────────────
  const topMap: Record<string, { litros: number; venta: number; categoria: string }> = {}
  for (const v of ventas) {
    if (!v.nombre_fantasia) continue
    if (!topMap[v.nombre_fantasia]) topMap[v.nombre_fantasia] = { litros: 0, venta: 0, categoria: v.categoria_negocio ?? 'Otros' }
    topMap[v.nombre_fantasia].litros += v.litros ?? 0
    topMap[v.nombre_fantasia].venta  += v.total_sin_impuesto ?? 0
  }
  const prevClienteMap: Record<string, number> = {}
  for (const v of ventasPrev) {
    if (!v.nombre_fantasia) continue
    prevClienteMap[v.nombre_fantasia] = (prevClienteMap[v.nombre_fantasia] ?? 0) + (v.litros ?? 0)
  }
  const topClientes: TopCliente[] = Object.entries(topMap)
    .sort((a, b) => b[1].litros - a[1].litros)
    .slice(0, 8)
    .map(([nombre, d]) => ({ nombre, categoria: d.categoria, litros: d.litros, litrosAnterior: prevClienteMap[nombre] ?? 0 }))

  // ── Metas ─────────────────────────────────────────────────────────────────
  const metasPorVendedor: Record<string, number> = {}
  for (const m of metasData ?? []) {
    metasPorVendedor[m.vendedor] = (metasPorVendedor[m.vendedor] ?? 0) + m.meta_litros
  }
  const metaTotal = Object.values(metasPorVendedor).reduce((s, v) => s + v, 0)

  // ── Diversificación ───────────────────────────────────────────────────────
  const diversificacion: Record<string, DivVend> = {}
  for (const vend of vendedoresScope) {
    const cats: Record<string, number> = {}
    for (const v of ventas.filter(vv => vv.vendedor_actual === vend)) {
      const cat = (v.categoria_negocio && v.categoria_negocio !== '-') ? v.categoria_negocio : 'Otros'
      cats[cat] = (cats[cat] ?? 0) + (v.litros ?? 0)
    }
    const { score, descripcion } = divScore(cats)
    diversificacion[vend] = { categorias: cats, score, descripcion }
  }

  // ── Insights auto-generados ───────────────────────────────────────────────
  const insights: InsightItem[] = []

  // Categoría líder por vendedor
  for (const vend of vendedoresScope) {
    const total = Object.values(catPorVendedor[vend] ?? {}).reduce((s, c) => s + c.litros, 0)
    const top = Object.entries(catPorVendedor[vend] ?? {}).sort((a, b) => b[1].litros - a[1].litros)[0]
    if (top && total > 0) {
      const pct = Math.round((top[1].litros / total) * 100)
      insights.push({ texto: `${top[0]} representa el ${pct}% de las ventas de ${vend.split(' ')[0]}`, tipo: pct > 50 ? 'warning' : 'info' })
    }
  }

  // Categorías con mayor crecimiento
  const catCrecimiento = Object.entries(catActual)
    .filter(([cat]) => catAnterior[cat])
    .map(([cat, lit]) => ({ cat, delta: lit - (catAnterior[cat] ?? 0), pct: catAnterior[cat] ? Math.round(((lit - catAnterior[cat]) / catAnterior[cat]) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct)

  if (catCrecimiento[0]?.pct > 10) {
    insights.push({ texto: `${catCrecimiento[0].cat} creció +${catCrecimiento[0].pct}% en litros vs el período anterior`, tipo: 'positive' })
  }

  // Categorías en caída
  const catCaida = catCrecimiento.filter(c => c.pct < -10).sort((a, b) => a.pct - b.pct)
  if (catCaida[0]) {
    insights.push({ texto: `${catCaida[0].cat} cayó ${catCaida[0].pct}% vs el período anterior`, tipo: 'negative' })
  }

  // Comparación diversificación
  if (vendedoresScope.length >= 2) {
    const [v1, v2] = vendedoresScope
    const s1 = diversificacion[v1]?.score ?? 0
    const s2 = diversificacion[v2]?.score ?? 0
    const mejor = s1 > s2 ? v1 : v2
    if (Math.abs(s1 - s2) > 10) {
      insights.push({ texto: `${mejor.split(' ')[0]} tiene mejor diversificación de canales`, tipo: 'info' })
    }
  }

  // Ticket promedio por categoría
  const ticketPorCat: Record<string, { venta: number; pedidos: Set<string> }> = {}
  for (const v of ventas) {
    const cat = (v.categoria_negocio && v.categoria_negocio !== '-') ? v.categoria_negocio : 'Otros'
    if (!ticketPorCat[cat]) ticketPorCat[cat] = { venta: 0, pedidos: new Set() }
    ticketPorCat[cat].venta += v.total_sin_impuesto ?? 0
    if (v.pedido) ticketPorCat[cat].pedidos.add(v.pedido)
  }
  const ticketTop = Object.entries(ticketPorCat)
    .map(([cat, d]) => ({ cat, ticket: d.pedidos.size > 0 ? d.venta / d.pedidos.size : 0 }))
    .sort((a, b) => b.ticket - a.ticket)[0]
  if (ticketTop) {
    insights.push({ texto: `${ticketTop.cat} tiene el mayor ticket promedio: $${Math.round(ticketTop.ticket).toLocaleString('es-CL')}`, tipo: 'info' })
  }

  // ── Alertas ───────────────────────────────────────────────────────────────
  const alertas: AlertaItem[] = []

  // Clientes críticos sin comprar
  const riesgo = (riesgoRaw ?? []) as { nombre_fantasia: string; dias_sin_compra: number; segmento: string }[]
  for (const r of riesgo.slice(0, 2)) {
    alertas.push({
      titulo: `Cliente ${r.segmento} lleva ${r.dias_sin_compra} días sin compras`,
      subtexto: r.nombre_fantasia,
      tipo: 'danger',
      hace: '2h',
    })
  }

  // Caídas de categoría
  for (const c of catCaida.slice(0, 1)) {
    alertas.push({
      titulo: `Caída del ${Math.abs(c.pct)}% en ${c.cat}`,
      subtexto: 'Revisar estrategia comercial',
      tipo: 'warning',
      hace: 'hoy',
    })
  }

  // Meta cercana
  if (metaTotal > 0) {
    const pctMeta = Math.round((totalLitros / metaTotal) * 100)
    if (pctMeta >= 90) {
      alertas.push({
        titulo: `¡Meta al ${pctMeta}%!`,
        subtexto: `${Math.round(metaTotal - totalLitros)} L para completar la meta`,
        tipo: 'success',
        hace: 'hoy',
      })
    }
  }

  // Nombre del período anterior
  const [py, pm] = prev.inicio.split('-').map(Number)
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const periodoAnteriorNombre = `${meses[pm - 1]} ${py}`

  return (
    <AcumuladoClient
      periodo={periodo}
      periodoAnteriorNombre={periodoAnteriorNombre}
      kpis={kpis}
      evolucion={evolucion}
      promedioDiario={promedioDiario}
      proyeccionFin={proyeccionFin}
      diasTranscurridos={diasTranscurridos}
      diasTotales={diasTotales}
      mejorDia={mejorDiaEntry ?? null}
      catPorVendedor={catPorVendedor}
      mixEstilos={mixEstilos}
      topClientes={topClientes}
      metasPorVendedor={metasPorVendedor}
      metaTotal={metaTotal}
      diversificacion={diversificacion}
      insights={insights}
      alertas={alertas}
      vendedoresScope={vendedoresScope as string[]}
      isAdmin={appUser?.isAdmin ?? false}
    />
  )
}
