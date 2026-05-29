import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES, CLIENTES_EXCLUIR } from '@/lib/types'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

function contarLatas(litros: number, envase: string | null): number {
  if (!envase) return 0
  if (envase.includes('473')) return Math.round(litros / 0.473)
  if (envase.includes('354')) return Math.round(litros / 0.354)
  return 0
}

export interface EvolutionDay {
  fecha: string
  [key: string]: number | string
}

export interface ProductRank {
  producto: string
  litros: number
  categoria: string
}

export interface ProductBuyer {
  nombre: string
  litros: number
  localidad: string | null
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  const params = await searchParams
  const fechaParam = params?.fecha ?? null

  const supabase = await createClient()
  const appUser = await getServerUser()

  const vendedoresScope = appUser?.isAdmin
    ? VENDEDORES
    : VENDEDORES.filter(v => v === appUser?.nombre)

  const scope = vendedoresScope.length ? vendedoresScope : ['__none__']

  // Fecha más reciente disponible
  const { data: ultimaFecha } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', scope)
    .order('fecha_pedido', { ascending: false })
    .limit(1)
    .single()

  const ultimaFechaStr = ultimaFecha?.fecha_pedido ?? new Date().toISOString().split('T')[0]

  const { data: periodo } = await supabase
    .from('periodos')
    .select('*')
    .eq('activo', true)
    .single()

  // Fechas disponibles: últimas 90 días con ventas (para el selector)
  const { data: fechasRows } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', scope)
    .order('fecha_pedido', { ascending: false })
    .limit(5000)

  const fechasDisponibles = [
    ...new Set((fechasRows ?? []).map(f => f.fecha_pedido)),
  ].sort().reverse()

  // Usar fecha del param si existe y es válida, sino la última disponible
  const fechaHoy =
    fechaParam && fechasDisponibles.includes(fechaParam)
      ? fechaParam
      : ultimaFechaStr

  // Ventas del día seleccionado (ahora incluye localidad)
  const { data: ventasHoy } = await supabase
    .from('ventas')
    .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, categoria_negocio, categoria_producto, producto, envase, localidad')
    .in('vendedor_actual', scope)
    .eq('fecha_pedido', fechaHoy)

  const { data: ventasPeriodo } = await supabase
    .from('ventas')
    .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, categoria_negocio, fecha_pedido, categoria_producto')
    .in('vendedor_actual', scope)
    .gte('fecha_pedido', periodo?.fecha_inicio ?? '2026-04-24')
    .lte('fecha_pedido', periodo?.fecha_fin ?? '2026-05-23')

  // Metas
  const { data: metasData } = await supabase
    .from('metas')
    .select('vendedor, meta_litros')
    .eq('periodo_id', periodo?.id ?? -1)
    .eq('tipo', 'mensual')

  const metasPorVendedor: Record<string, number> = {}
  for (const m of metasData ?? []) {
    metasPorVendedor[m.vendedor] = (metasPorVendedor[m.vendedor] ?? 0) + m.meta_litros
  }

  // Evolution: agrupar por fecha_pedido y vendedor
  const evolucionMap = new Map<string, Record<string, number>>()
  for (const v of ventasPeriodo ?? []) {
    if (CLIENTES_EXCLUIR.some(ex => (v.nombre_fantasia ?? '').includes(ex))) continue
    const fecha = v.fecha_pedido
    if (!evolucionMap.has(fecha)) evolucionMap.set(fecha, {})
    const dayMap = evolucionMap.get(fecha)!
    dayMap[v.vendedor_actual] = (dayMap[v.vendedor_actual] ?? 0) + (v.litros ?? 0)
  }
  const evolution: EvolutionDay[] = Array.from(evolucionMap.entries())
    .map(([fecha, vals]) => ({ fecha, ...vals }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // Product ranking top 5
  const prodMap = new Map<string, { litros: number; categoria: string }>()
  for (const v of ventasHoy ?? []) {
    if (CLIENTES_EXCLUIR.some(ex => (v.nombre_fantasia ?? '').includes(ex))) continue
    if (!v.producto) continue
    const existing = prodMap.get(v.producto)
    prodMap.set(v.producto, {
      litros: (existing?.litros ?? 0) + (v.litros ?? 0),
      categoria: v.categoria_producto ?? existing?.categoria ?? '',
    })
  }
  const productRanking: ProductRank[] = Array.from(prodMap.entries())
    .map(([producto, { litros, categoria }]) => ({ producto, litros, categoria }))
    .sort((a, b) => b.litros - a.litros)
    .slice(0, 5)

  // Product detail: quién compró cada producto (agrupado por cliente)
  const productDetailMap: Record<string, ProductBuyer[]> = {}
  for (const v of ventasHoy ?? []) {
    if (CLIENTES_EXCLUIR.some(ex => (v.nombre_fantasia ?? '').includes(ex))) continue
    if (!v.producto || !v.nombre_fantasia) continue
    if (!productDetailMap[v.producto]) productDetailMap[v.producto] = []
    const existing = productDetailMap[v.producto].find(d => d.nombre === v.nombre_fantasia)
    if (existing) {
      existing.litros += v.litros ?? 0
    } else {
      productDetailMap[v.producto].push({
        nombre: v.nombre_fantasia,
        litros: v.litros ?? 0,
        localidad: v.localidad ?? null,
      })
    }
  }
  for (const key of Object.keys(productDetailMap)) {
    productDetailMap[key].sort((a, b) => b.litros - a.litros)
  }

  // Resumen por vendedor
  const resumen = vendedoresScope.map(vendedor => {
    const vHoy = (ventasHoy ?? []).filter(v => v.vendedor_actual === vendedor)
    const vPeriodo = (ventasPeriodo ?? []).filter(v => v.vendedor_actual === vendedor)

    const vHoyFiltrado = vHoy.filter(v => !CLIENTES_EXCLUIR.some(ex => (v.nombre_fantasia ?? '').includes(ex)))
    const vPeriodoFiltrado = vPeriodo.filter(v => !CLIENTES_EXCLUIR.some(ex => (v.nombre_fantasia ?? '').includes(ex)))

    const litrosHoy = vHoyFiltrado.reduce((s, v) => s + (v.litros ?? 0), 0)
    const ventaHoy = vHoyFiltrado.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)
    const litrosPeriodo = vPeriodoFiltrado.reduce((s, v) => s + (v.litros ?? 0), 0)
    const ventaPeriodo = vPeriodoFiltrado.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)

    const latasCervezaHoy = vHoyFiltrado
      .filter(v => v.envase?.includes('Lata') && v.categoria_producto?.includes('Cerveza'))
      .reduce((s, v) => s + contarLatas(v.litros ?? 0, v.envase), 0)

    const latasKombuchaHoy = vHoyFiltrado
      .filter(v => v.envase?.includes('Lata') && v.categoria_producto?.includes('Kombucha'))
      .reduce((s, v) => s + contarLatas(v.litros ?? 0, v.envase), 0)

    const litrosCerveza = vHoyFiltrado
      .filter(v => v.categoria_producto?.toLowerCase().includes('cerveza'))
      .reduce((s, v) => s + (v.litros ?? 0), 0)

    const litrosKombucha = vHoyFiltrado
      .filter(v => v.categoria_producto?.toLowerCase().includes('kombucha'))
      .reduce((s, v) => s + (v.litros ?? 0), 0)

    const clientesHoySet = new Set<string>()
    const clientesPeriodoSet = new Set<string>()
    for (const v of vHoyFiltrado) { if (v.nombre_fantasia) clientesHoySet.add(v.nombre_fantasia) }
    for (const v of vPeriodoFiltrado) { if (v.nombre_fantasia) clientesPeriodoSet.add(v.nombre_fantasia) }

    const clientesHoyCount = clientesHoySet.size
    const clientesPeriodoCount = clientesPeriodoSet.size
    const dropSize = clientesHoyCount > 0 ? ventaHoy / clientesHoyCount : 0
    const metaLitros = metasPorVendedor[vendedor] ?? 0

    const clientesMap = new Map<string, { producto: string; envase: string | null; litros: number }[]>()
    for (const v of vHoyFiltrado) {
      const nombre = v.nombre_fantasia
      if (!nombre) continue
      if (!clientesMap.has(nombre)) clientesMap.set(nombre, [])
      if (v.producto) {
        clientesMap.get(nombre)!.push({ producto: v.producto, envase: v.envase ?? null, litros: v.litros ?? 0 })
      }
    }

    const clientesHoy = Array.from(clientesMap.entries()).map(([nombre, productos]) => ({ nombre, productos }))

    return {
      vendedor,
      litrosHoy,
      ventaHoy,
      litrosPeriodo,
      ventaPeriodo,
      clientesHoy,
      clientesHoyCount,
      clientesPeriodoCount,
      latasCervezaHoy,
      latasKombuchaHoy,
      litrosCerveza,
      litrosKombucha,
      dropSize,
      metaLitros,
    }
  })

  // Plan semanal: incluye proximo + vencido + critico (para popup lunes y card de riesgo)
  const p_vendedor = appUser?.isAdmin ? null : (appUser?.nombre ?? null)
  const { data: planRaw } = await supabase
    .rpc('get_pending_call_alerts', {
      p_vendedor,
      p_nivel_minimo: 'proximo',
    })

  type ClientePlan = {
    nombre_fantasia: string
    vendedor_actual: string
    dias_sin_compra: number
    ciclo_promedio_dias: number
    alert_level: string
    score: number
    segmento: string
    siguiente_compra_estimada: string | null
  }

  const planSemana: ClientePlan[] = (planRaw ?? []).map((r: ClientePlan) => ({
    nombre_fantasia: r.nombre_fantasia,
    vendedor_actual: r.vendedor_actual,
    dias_sin_compra: r.dias_sin_compra,
    ciclo_promedio_dias: r.ciclo_promedio_dias,
    alert_level: r.alert_level,
    score: r.score,
    segmento: r.segmento,
    siguiente_compra_estimada: r.siguiente_compra_estimada ?? null,
  }))

  const riesgoClientes = planSemana.filter(c =>
    c.alert_level === 'critico' || c.alert_level === 'vencido'
  )

  return (
    <DashboardClient
      resumen={resumen}
      fechaHoy={fechaHoy}
      fechasDisponibles={fechasDisponibles}
      periodo={periodo}
      evolution={evolution}
      productRanking={productRanking}
      productDetail={productDetailMap}
      vendedoresScope={vendedoresScope as string[]}
      riesgoClientes={riesgoClientes}
      planSemana={planSemana}
    />
  )
}
