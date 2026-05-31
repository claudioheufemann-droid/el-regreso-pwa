import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES, esClienteExcluido } from '@/lib/types'
import DashboardClient from './DashboardClient'

export const revalidate = 120

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

  // Lunes de esta semana (para misiones) — sin query
  const semanaLunes = (() => {
    const d = new Date(); const day = d.getDay()
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
    return d.toISOString().split('T')[0]
  })()
  const misionesScope = vendedoresScope.length ? vendedoresScope : ['__none__']
  const p_vendedor = appUser?.isAdmin ? null : (appUser?.nombre ?? null)
  const hace90 = new Date(); hace90.setDate(hace90.getDate() - 90)

  // ── FASE A: queries independientes en paralelo ───────────
  const [
    { data: ultimaFecha },
    { data: periodo },
    { data: fechasRows },
    { data: planRaw },
    { data: misionesRaw },
    { data: usersAvatars },
  ] = await Promise.all([
    supabase.from('ventas').select('fecha_pedido').in('vendedor_actual', scope).order('fecha_pedido', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('periodos').select('*').eq('activo', true).maybeSingle(),
    supabase.from('ventas').select('fecha_pedido').in('vendedor_actual', scope).gte('fecha_pedido', hace90.toISOString().split('T')[0]).order('fecha_pedido', { ascending: false }).limit(2000),
    supabase.rpc('get_pending_call_alerts', { p_vendedor, p_nivel_minimo: 'proximo' }),
    supabase.from('misiones').select('vendedor, alert_level, estado, score, segmento, nombre_fantasia, dias_sin_compra').eq('semana', semanaLunes).in('vendedor', misionesScope),
    supabase.from('users').select('nombre, avatar_url').in('nombre', ['Javier B.', 'Carlos U.']),
  ])

  const ultimaFechaStr = ultimaFecha?.fecha_pedido ?? new Date().toISOString().split('T')[0]

  const fechasDisponibles = [
    ...new Set((fechasRows ?? []).map(f => f.fecha_pedido)),
  ].sort().reverse()

  // Usar fecha del param si existe y es válida, sino la última disponible
  const fechaHoy =
    fechaParam && fechasDisponibles.includes(fechaParam)
      ? fechaParam
      : ultimaFechaStr

  const fechaIni = periodo?.fecha_inicio ?? '2026-04-24'
  const fechaFinPeriodo = periodo?.fecha_fin ?? '2026-05-23'

  // Helper: fetch paginado (PostgREST limita 1000 filas/request)
  async function fetchPaginado<T>(build: (offset: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
    const out: T[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data: page } = await build(offset)
      if (!page || page.length === 0) break
      out.push(...page)
      if (page.length < PAGE) break
      offset += PAGE
    }
    return out
  }

  // Fechas mes anterior (para comparación banner)
  let iniPrev = '', finPrev = ''
  if (periodo?.fecha_inicio) {
    const mesAnteriorFin = new Date(periodo.fecha_inicio)
    mesAnteriorFin.setDate(mesAnteriorFin.getDate() - 1)
    const mesAnteriorIni = new Date(mesAnteriorFin)
    mesAnteriorIni.setDate(1)
    iniPrev = mesAnteriorIni.toISOString().split('T')[0]
    finPrev = mesAnteriorFin.toISOString().split('T')[0]
  }

  type VentaPeriodoRow = {
    vendedor_actual: string; nombre_fantasia: string | null; litros: number | null
    total_sin_impuesto: number | null; categoria_negocio: string | null
    fecha_pedido: string; categoria_producto: string | null
  }
  type VentaPrevRow = { vendedor_actual: string; litros: number | null; nombre_fantasia: string | null }

  // ── FASE B: queries dependientes de fechaHoy/periodo en paralelo ─
  const [
    { data: ventasHoy },
    ventasPeriodo,
    { data: metasData },
    rowsPrev,
  ] = await Promise.all([
    supabase
      .from('ventas')
      .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, categoria_negocio, categoria_producto, producto, envase, localidad')
      .in('vendedor_actual', scope)
      .eq('fecha_pedido', fechaHoy),
    fetchPaginado<VentaPeriodoRow>(offset =>
      supabase
        .from('ventas')
        .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, categoria_negocio, fecha_pedido, categoria_producto')
        .in('vendedor_actual', scope)
        .gte('fecha_pedido', fechaIni)
        .lte('fecha_pedido', fechaFinPeriodo)
        .order('fecha_pedido', { ascending: true })
        .range(offset, offset + 999)
    ),
    supabase.from('metas').select('vendedor, meta_litros').eq('periodo_id', periodo?.id ?? -1).eq('tipo', 'mensual'),
    iniPrev
      ? fetchPaginado<VentaPrevRow>(offset =>
          supabase
            .from('ventas')
            .select('vendedor_actual, litros, nombre_fantasia')
            .in('vendedor_actual', scope)
            .gte('fecha_pedido', iniPrev)
            .lte('fecha_pedido', finPrev)
            .range(offset, offset + 999)
        )
      : Promise.resolve([] as VentaPrevRow[]),
  ])

  const metasPorVendedor: Record<string, number> = {}
  for (const m of metasData ?? []) {
    metasPorVendedor[m.vendedor] = (metasPorVendedor[m.vendedor] ?? 0) + m.meta_litros
  }

  // Evolution: agrupar por fecha_pedido y vendedor
  const evolucionMap = new Map<string, Record<string, number>>()
  for (const v of ventasPeriodo ?? []) {
    if (esClienteExcluido(v.nombre_fantasia)) continue
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
    if (esClienteExcluido(v.nombre_fantasia)) continue
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
    if (esClienteExcluido(v.nombre_fantasia)) continue
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

    const vHoyFiltrado = vHoy.filter(v => !esClienteExcluido(v.nombre_fantasia))
    const vPeriodoFiltrado = vPeriodo.filter(v => !esClienteExcluido(v.nombre_fantasia))

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

  // Plan semanal (planRaw ya cargado en FASE A)
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

  // Resumen de misiones (misionesRaw ya cargado en FASE A)
  type MisionResumen = {
    vendedor: string; alert_level: string; estado: string
    score: number; segmento: string; nombre_fantasia: string; dias_sin_compra: number
  }
  const misionesResumen: MisionResumen[] = misionesRaw ?? []

  // Litros mes anterior para comparación (rowsPrev ya cargado en FASE B)
  let litrosMesAnteriorTotal = 0
  const litrosMesAnteriorPorVendedor: Record<string, number> = {}
  for (const v of rowsPrev) {
    if (esClienteExcluido(v.nombre_fantasia)) continue
    litrosMesAnteriorTotal += v.litros ?? 0
    litrosMesAnteriorPorVendedor[v.vendedor_actual] = (litrosMesAnteriorPorVendedor[v.vendedor_actual] ?? 0) + (v.litros ?? 0)
  }

  // Avatares de vendedores (usersAvatars ya cargado en FASE A)
  const vendedorAvatars: Record<string, string | null> = {
    'Javier Badilla':  usersAvatars?.find(u => u.nombre === 'Javier B.')?.avatar_url  ?? null,
    'Carlos Urrejola': usersAvatars?.find(u => u.nombre === 'Carlos U.')?.avatar_url ?? null,
  }

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
      misionesResumen={misionesResumen}
      vendedorAvatars={vendedorAvatars}
      litrosMesAnterior={litrosMesAnteriorTotal}
      litrosMesAnteriorPorVendedor={litrosMesAnteriorPorVendedor}
    />
  )
}
