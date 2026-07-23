import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES, VENDEDORES_DB, VENDEDOR_DISPLAY, VENDEDORES_SCOPE, esClienteExcluido } from '@/lib/types'
import { provinciasDeRegion } from '@/lib/regiones'
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

  // Todos los nombres posibles en BD (históricos + canonical + display)
  const vendedoresScope: string[] = [...VENDEDORES_SCOPE]

  const scope = vendedoresScope.length ? vendedoresScope : ['__none__']

  // Lunes de esta semana (para misiones) — sin query
  const semanaLunes = (() => {
    const d = new Date(); const day = d.getDay()
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
    return d.toISOString().split('T')[0]
  })()
  const misionesScope = vendedoresScope.length ? vendedoresScope : ['__none__']

  // ── Scope geográfico del vendedor ────────────────────────────────────────
  // Las ventas están consolidadas (Javier/Carlos), así que el filtro por
  // NOMBRE no aplica. El scope del vendedor se hace por PROVINCIA (su región).
  // Admin: provinciasScope = null → las RPC no filtran (idéntico al actual).
  const scopeRegion = appUser?.isAdmin ? null : (appUser?.region ?? null)
  const provinciasArr = provinciasDeRegion(scopeRegion)
  const provinciasScope: string[] | null = provinciasArr.length ? provinciasArr : null
  const p_vendedor = null  // filtro por nombre deshabilitado (datos consolidados)
  const hace90 = new Date(); hace90.setDate(hace90.getDate() - 90)

  // Nombres de clientes de la región (para filtrar misiones/plan por nombre_fantasia)
  let regionClientes: Set<string> | null = null
  if (provinciasScope) {
    const { data: rc } = await supabase
      .from('clientes')
      .select('nombre_fantasia')
      .or(provinciasScope.map(p => `provincia.eq.${p},provincia_entrega.eq.${p}`).join(','))
    regionClientes = new Set((rc ?? []).map(c => c.nombre_fantasia as string).filter(Boolean))
  }

  // ── FASE A: queries independientes en paralelo ───────────
  const [
    { data: ultimaFecha },
    { data: ultimaSyncRow },
    { data: periodo },
    { data: fechasRows },
    { data: planRaw },
    { data: misionesRaw },
    { data: usersAvatars },
    { data: clientesIdRows },
  ] = await Promise.all([
    (provinciasScope
      ? supabase.from('ventas').select('fecha_pedido').in('provincia', provinciasScope)
      : supabase.from('ventas').select('fecha_pedido').in('vendedor_actual', scope)
    ).order('fecha_pedido', { ascending: false }).limit(1).maybeSingle(),
    // Última vez que el ERP sync (u carga manual) escribió filas — refleja
    // cuándo se actualizó la info, no la fecha de la venta en sí.
    supabase.from('ventas').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('periodos').select('*').eq('activo', true).maybeSingle(),
    (provinciasScope
      ? supabase.from('ventas').select('fecha_pedido').in('provincia', provinciasScope)
      : supabase.from('ventas').select('fecha_pedido').in('vendedor_actual', scope)
    ).gte('fecha_pedido', hace90.toISOString().split('T')[0]).order('fecha_pedido', { ascending: false }).limit(2000),
    supabase.rpc('get_pending_call_alerts', { p_vendedor, p_nivel_minimo: 'proximo' }),
    supabase.from('misiones').select('vendedor, alert_level, estado, score, segmento, nombre_fantasia, dias_sin_compra').eq('semana', semanaLunes).in('vendedor', misionesScope),
    supabase.from('users').select('nombre, avatar_url').in('nombre', ['Vendedor 1']),
    supabase.from('clientes').select('id, nombre_fantasia'),
  ])

  const clienteIdByName = new Map(
    (clientesIdRows ?? []).filter(c => c.nombre_fantasia).map(c => [c.nombre_fantasia as string, c.id as number])
  )

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

  type VentaPrevRow = { vendedor_actual: string; litros: number | null; nombre_fantasia: string | null }

  // ── FASE B: ventas del día (raw) + metas + AGREGACIONES en Postgres ─
  // La agregación del período (evolución + totales por vendedor) ahora la hace
  // Postgres vía RPC → transferimos ~60 filas en vez de miles.
  const [
    { data: ventasHoy },
    { data: metasData },
    aggDiariaRes,
    aggPeriodoRes,
    aggPrevRes,
  ] = await Promise.all([
    (provinciasScope
      ? supabase.from('ventas')
          .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, categoria_negocio, categoria_producto, producto, envase, localidad')
          .in('provincia', provinciasScope)
      : supabase.from('ventas')
          .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, categoria_negocio, categoria_producto, producto, envase, localidad')
          .in('vendedor_actual', scope)
    ).eq('fecha_pedido', fechaHoy),
    supabase.from('metas').select('vendedor, meta_litros').eq('periodo_id', periodo?.id ?? -1).eq('tipo', 'mensual'),
    supabase.rpc('ventas_agg_diaria',  { p_ini: fechaIni, p_fin: fechaFinPeriodo, p_vendedor, p_provincias: provinciasScope }),
    supabase.rpc('ventas_agg_periodo', { p_ini: fechaIni, p_fin: fechaFinPeriodo, p_vendedor, p_provincias: provinciasScope }),
    iniPrev
      ? supabase.rpc('ventas_agg_periodo', { p_ini: iniPrev, p_fin: finPrev, p_vendedor, p_provincias: provinciasScope })
      : Promise.resolve({ data: [], error: null }),
  ])

  const metasPorVendedor: Record<string, number> = {}
  for (const m of metasData ?? []) {
    metasPorVendedor[m.vendedor] = (metasPorVendedor[m.vendedor] ?? 0) + m.meta_litros
  }

  // Estructuras derivadas (se llenan por RPC o por fallback paginado)
  let evolution: EvolutionDay[] = []
  const periodoPorVendedor = new Map<string, { litros: number; revenue: number; clientes: number }>()
  const prevPorVendedor = new Map<string, number>()

  const aggOk = !aggDiariaRes.error && !aggPeriodoRes.error && !aggPrevRes.error

  if (aggOk) {
    // ── Ruta rápida: Postgres ya agregó ──
    const evoMap = new Map<string, Record<string, number>>()
    for (const r of (aggDiariaRes.data ?? []) as { fecha: string; vendedor: string; litros: number }[]) {
      if (!evoMap.has(r.fecha)) evoMap.set(r.fecha, {})
      evoMap.get(r.fecha)![r.vendedor] = Number(r.litros ?? 0)
    }
    evolution = Array.from(evoMap.entries())
      .map(([fecha, vals]) => ({ fecha, ...vals }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (const r of (aggPeriodoRes.data ?? []) as { vendedor: string; litros: number; revenue: number; clientes: number }[])
      periodoPorVendedor.set(r.vendedor, { litros: Number(r.litros ?? 0), revenue: Number(r.revenue ?? 0), clientes: Number(r.clientes ?? 0) })
    for (const r of (aggPrevRes.data ?? []) as { vendedor: string; litros: number }[])
      prevPorVendedor.set(r.vendedor, Number(r.litros ?? 0))
  } else {
    // ── Fallback: scans paginados (si la migración SQL aún no corre) ──
    type PeriodoRow = { vendedor_actual: string; nombre_fantasia: string | null; litros: number | null; total_sin_impuesto: number | null; fecha_pedido: string }
    const ventasPeriodo = await fetchPaginado<PeriodoRow>(offset =>
      supabase.from('ventas')
        .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, fecha_pedido')
        .in('vendedor_actual', scope)
        .gte('fecha_pedido', fechaIni).lte('fecha_pedido', fechaFinPeriodo)
        .order('fecha_pedido', { ascending: true }).range(offset, offset + 999)
    )
    const evoMap = new Map<string, Record<string, number>>()
    const cliSet = new Map<string, Set<string>>()
    for (const v of ventasPeriodo) {
      if (esClienteExcluido(v.nombre_fantasia)) continue
      if (!evoMap.has(v.fecha_pedido)) evoMap.set(v.fecha_pedido, {})
      const d = evoMap.get(v.fecha_pedido)!
      d[v.vendedor_actual] = (d[v.vendedor_actual] ?? 0) + (v.litros ?? 0)
      const cur = periodoPorVendedor.get(v.vendedor_actual) ?? { litros: 0, revenue: 0, clientes: 0 }
      cur.litros += v.litros ?? 0; cur.revenue += v.total_sin_impuesto ?? 0
      periodoPorVendedor.set(v.vendedor_actual, cur)
      if (v.nombre_fantasia) {
        if (!cliSet.has(v.vendedor_actual)) cliSet.set(v.vendedor_actual, new Set())
        cliSet.get(v.vendedor_actual)!.add(v.nombre_fantasia)
      }
    }
    for (const [vend, set] of cliSet) { const c = periodoPorVendedor.get(vend); if (c) c.clientes = set.size }
    evolution = Array.from(evoMap.entries()).map(([fecha, vals]) => ({ fecha, ...vals })).sort((a, b) => a.fecha.localeCompare(b.fecha))

    if (iniPrev) {
      const rowsPrev = await fetchPaginado<VentaPrevRow>(offset =>
        supabase.from('ventas').select('vendedor_actual, litros, nombre_fantasia')
          .in('vendedor_actual', scope).gte('fecha_pedido', iniPrev).lte('fecha_pedido', finPrev)
          .range(offset, offset + 999)
      )
      for (const v of rowsPrev) {
        if (esClienteExcluido(v.nombre_fantasia)) continue
        prevPorVendedor.set(v.vendedor_actual, (prevPorVendedor.get(v.vendedor_actual) ?? 0) + (v.litros ?? 0))
      }
    }
  }

  // Consolidar series de evolución: nombres históricos (Javier/Carlos) → un solo vendedor
  evolution = evolution.map(day => {
    const { fecha, ...vals } = day
    const merged: Record<string, number> = {}
    for (const [vend, litros] of Object.entries(vals)) {
      const key = VENDEDOR_DISPLAY[vend] ?? vend
      merged[key] = (merged[key] ?? 0) + (litros as number)
    }
    return { fecha, ...merged } as EvolutionDay
  })

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

  // Resumen por vendedor (crudo, una entrada por nombre histórico en BD)
  const resumenRaw = vendedoresScope.map(vendedor => {
    const vHoy = (ventasHoy ?? []).filter(v => v.vendedor_actual === vendedor)
    const vHoyFiltrado = vHoy.filter(v => !esClienteExcluido(v.nombre_fantasia))

    const litrosHoy = vHoyFiltrado.reduce((s, v) => s + (v.litros ?? 0), 0)
    const ventaHoy = vHoyFiltrado.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)

    // Período: agregado en Postgres (o fallback)
    const periodoAgg = periodoPorVendedor.get(vendedor) ?? { litros: 0, revenue: 0, clientes: 0 }
    const litrosPeriodo = periodoAgg.litros
    const ventaPeriodo = periodoAgg.revenue

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
    for (const v of vHoyFiltrado) { if (v.nombre_fantasia) clientesHoySet.add(v.nombre_fantasia) }

    const clientesHoyCount = clientesHoySet.size
    const clientesPeriodoCount = periodoAgg.clientes
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

  // Consolidar entradas por vendedor de DISPLAY: los nombres históricos de la BD
  // (Javier Badilla, Carlos Urrejola, …) se fusionan en un solo vendedor visible.
  const resumen = Array.from(
    resumenRaw.reduce((acc, r) => {
      const key = VENDEDOR_DISPLAY[r.vendedor] ?? r.vendedor
      const prev = acc.get(key)
      if (!prev) { acc.set(key, { ...r, vendedor: key }); return acc }
      // Sumar métricas numéricas
      prev.litrosHoy            += r.litrosHoy
      prev.ventaHoy             += r.ventaHoy
      prev.litrosPeriodo        += r.litrosPeriodo
      prev.ventaPeriodo         += r.ventaPeriodo
      prev.latasCervezaHoy      += r.latasCervezaHoy
      prev.latasKombuchaHoy     += r.latasKombuchaHoy
      prev.litrosCerveza        += r.litrosCerveza
      prev.litrosKombucha       += r.litrosKombucha
      prev.clientesPeriodoCount += r.clientesPeriodoCount
      prev.metaLitros           += r.metaLitros
      // Unir clientes del día por nombre (evita duplicar el mismo local)
      const map = new Map(prev.clientesHoy.map(c => [c.nombre, c]))
      for (const c of r.clientesHoy) if (!map.has(c.nombre)) map.set(c.nombre, c)
      prev.clientesHoy      = Array.from(map.values())
      prev.clientesHoyCount = prev.clientesHoy.length
      prev.dropSize         = prev.clientesHoyCount > 0 ? prev.ventaHoy / prev.clientesHoyCount : 0
      return acc
    }, new Map<string, (typeof resumenRaw)[number]>()).values()
  )

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
    cliente_id: number | null
  }

  const planSemana: ClientePlan[] = (planRaw ?? [])
    .filter((r: ClientePlan) => !regionClientes || regionClientes.has(r.nombre_fantasia))
    .map((r: ClientePlan) => ({
      nombre_fantasia: r.nombre_fantasia,
      vendedor_actual: r.vendedor_actual,
      dias_sin_compra: r.dias_sin_compra,
      ciclo_promedio_dias: r.ciclo_promedio_dias,
      alert_level: r.alert_level,
      score: r.score,
      segmento: r.segmento,
      siguiente_compra_estimada: r.siguiente_compra_estimada ?? null,
      cliente_id: clienteIdByName.get(r.nombre_fantasia) ?? null,
    }))

  const riesgoClientes = planSemana.filter(c =>
    c.alert_level === 'critico' || c.alert_level === 'vencido'
  )

  // Resumen de misiones (misionesRaw ya cargado en FASE A)
  type MisionResumen = {
    vendedor: string; alert_level: string; estado: string
    score: number; segmento: string; nombre_fantasia: string; dias_sin_compra: number
  }
  const misionesResumen: MisionResumen[] = (misionesRaw ?? [])
    .filter((m: MisionResumen) => !regionClientes || regionClientes.has(m.nombre_fantasia))

  // Litros mes anterior para comparación (prevPorVendedor ya calculado en FASE B)
  let litrosMesAnteriorTotal = 0
  const litrosMesAnteriorPorVendedor: Record<string, number> = {}
  for (const [vend, litros] of prevPorVendedor) {
    litrosMesAnteriorTotal += litros
    litrosMesAnteriorPorVendedor[vend] = litros
  }

  const vendedorAvatars: Record<string, string | null> = { 'Vendedor 1': null }

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
      ultimaSync={ultimaSyncRow?.created_at ?? null}
    />
  )
}
