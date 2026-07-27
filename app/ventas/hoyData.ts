import { createClient } from '@/lib/supabase/server'
import { vendedorCanonico } from '@/lib/types'
import { RANGOS, type RangoKey, type KpisRango, type VendedorRango,
         type PuntoSerie, type DatosRango, type PeriodoOpcion, type EnvaseRango, type EntregasRango,
         type AlertaInsight, type HoyData } from './hoyTypes'

/**
 * Datos de la vista principal de Ventas. Sólo servidor.
 *
 * PERÍODOS DE VENTA: el negocio no mide por mes calendario sino del **24 de un
 * mes al 23 del siguiente** (tabla `periodos`, ej. "Agosto 2026" = 24-jul →
 * 23-ago). La pestaña "Período" usa eso, y el selector permite mirar períodos
 * anteriores; la comparación de cada período es contra el período 24→23 previo,
 * no contra "los 30 días de antes".
 *
 * Todo se precalcula acá para que cambiar de pestaña o de período en el cliente
 * sea instantáneo y no dispare consultas nuevas.
 *
 * Los tipos viven en ./hoyTypes para que el componente cliente pueda usarlos sin
 * arrastrar lib/supabase/server al bundle del navegador.
 */

export type { RangoKey, KpisRango, VendedorRango, PuntoSerie, DatosRango, PeriodoOpcion, EnvaseRango, EntregasRango, AlertaInsight, HoyData }

/** Cuántos períodos anteriores se ofrecen en el selector. */
const PERIODOS_VISIBLES = 4

/**
 * Valores de `ventas.vendedor_actual` que NO van en el ranking de vendedores.
 *
 * Dos motivos distintos:
 * - No son personas: consumo interno, cuentas de estado o ventas sin asignar.
 * - Son personas pero no vendedores de terreno (gerencia/administración): sus
 *   ventas puntuales distorsionan el ranking. Siguen contando en los totales
 *   del período y en el resto de las vistas; sólo se omiten de este ranking.
 */
const VENDEDORES_FUERA_RANKING = new Set([
  // no-persona
  'CERVECERÍA', 'CERVECERIA', 'Inactivo', 'No indica',
  'Incobrable', 'Incobrable 2024', 'Incobrable 2025',
  // no son vendedores de terreno
  'Mariel Lillo', 'Douglas Koenig', 'Rodrigo Solis',
  // bolsa histórica despersonalizada, no una persona: mezcla ventas viejas de
  // varios vendedores y compite con ellos en el ranking
  'Equipo Ventas', 'Vendedor 1',
])

const KPIS_CERO: KpisRango = {
  litros: 0, revenue: 0, clientes: 0, pedidos: 0,
  litrosCerveza: 0, litrosKombucha: 0, litrosOtros: 0,
}

const iso = (d: Date) => d.toISOString().split('T')[0]
const addDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapKpis(row: any): KpisRango {
  if (!row) return { ...KPIS_CERO }
  return {
    litros: Number(row.litros ?? 0),
    revenue: Number(row.revenue ?? 0),
    clientes: Number(row.clientes ?? 0),
    pedidos: Number(row.pedidos ?? 0),
    litrosCerveza: Number(row.litros_cerveza ?? 0),
    litrosKombucha: Number(row.litros_kombucha ?? 0),
    litrosOtros: Number(row.litros_otros ?? 0),
  }
}

/**
 * Ranking por vendedor con el nombre REAL del ERP (Transición 2, Yadro
 * Fabijancic, ...), no agrupado por región. Se omiten los que no son personas.
 *
 * Los alias por renombre se unifican con vendedorCanonico: si no, tras un
 * renombre la misma cartera sale dos veces (las ventas anteriores quedan bajo
 * el nombre viejo, que el ERP ya no reporta). Ej: 'Javier Badilla' suma a
 * 'Transición 2'.
 */
function armarVendedores(
  rows: Record<string, unknown>[] | null,
  prevRows: Record<string, unknown>[] | null,
  porEntregarRows: Record<string, unknown>[] | null,
): VendedorRango[] {
  const prev = new Map<string, number>()
  for (const r of prevRows ?? []) {
    const bruto = String(r.vendedor ?? '')
    if (VENDEDORES_FUERA_RANKING.has(bruto)) continue
    const n = vendedorCanonico(bruto)
    if (!n) continue
    prev.set(n, (prev.get(n) ?? 0) + Number(r.litros ?? 0))
  }
  // Por fecha de PEDIDO (no de entrega): lo que este vendedor cerró en el
  // período y todavía no se despachó. Población distinta a `litros`, que ya
  // sólo cuenta lo entregado — se muestra aparte, no se suma al ranking.
  const porEntregar = new Map<string, number>()
  for (const r of porEntregarRows ?? []) {
    const bruto = String(r.vendedor ?? '')
    if (VENDEDORES_FUERA_RANKING.has(bruto)) continue
    const n = vendedorCanonico(bruto)
    if (!n) continue
    porEntregar.set(n, (porEntregar.get(n) ?? 0) + Number(r.litros_por_entregar ?? 0))
  }
  const acc = new Map<string, VendedorRango>()
  for (const r of rows ?? []) {
    const bruto = String(r.vendedor ?? '')
    if (!bruto || VENDEDORES_FUERA_RANKING.has(bruto)) continue
    const n = vendedorCanonico(bruto)
    const cur = acc.get(n) ?? {
      vendedor: n, litros: 0, revenue: 0, clientes: 0,
      litrosPrev: prev.get(n) ?? 0, litrosPorEntregar: porEntregar.get(n) ?? 0,
    }
    cur.litros += Number(r.litros ?? 0)
    cur.revenue += Number(r.revenue ?? 0)
    // Nota: al unificar alias, `clientes` puede contar dos veces a un cliente
    // que compró bajo ambos nombres. Se usa sólo como referencia en la fila.
    cur.clientes += Number(r.clientes ?? 0)
    acc.set(n, cur)
  }
  // Quien vendió antes pero no ahora también aparece, para que se note la caída
  for (const [n, litrosPrev] of prev) {
    if (!acc.has(n) && litrosPrev > 0)
      acc.set(n, { vendedor: n, litros: 0, revenue: 0, clientes: 0, litrosPrev, litrosPorEntregar: porEntregar.get(n) ?? 0 })
  }
  // Quien sólo tiene pedidos pendientes (sin nada entregado aún) también debe
  // aparecer, si no su "por entregar" queda invisible en el ranking.
  for (const [n, litrosPend] of porEntregar) {
    if (!acc.has(n) && litrosPend > 0)
      acc.set(n, { vendedor: n, litros: 0, revenue: 0, clientes: 0, litrosPrev: prev.get(n) ?? 0, litrosPorEntregar: litrosPend })
  }
  return [...acc.values()].sort((a, b) => b.litros - a.litros)
}

const ENTREGAS_CERO: EntregasRango = {
  litrosEntregados: 0, litrosPorEntregar: 0, litrosSinDato: 0, revenueEntregado: 0,
  revenuePorEntregar: 0, pedidosEntregados: 0, pedidosPorEntregar: 0,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEntregas(row: any): EntregasRango {
  if (!row) return { ...ENTREGAS_CERO }
  return {
    litrosEntregados: Number(row.litros_entregados ?? 0),
    litrosPorEntregar: Number(row.litros_por_entregar ?? 0),
    litrosSinDato: Number(row.litros_sin_dato ?? 0),
    revenueEntregado: Number(row.revenue_entregado ?? 0),
    revenuePorEntregar: Number(row.revenue_por_entregar ?? 0),
    pedidosEntregados: Number(row.pedidos_entregados ?? 0),
    pedidosPorEntregar: Number(row.pedidos_por_entregar ?? 0),
  }
}

/** Unidades por envase del rango, con las del rango previo para comparar. */
function armarEnvases(
  rows: Record<string, unknown>[] | null,
  prevRows: Record<string, unknown>[] | null,
): EnvaseRango[] {
  const prev = new Map<string, number>()
  for (const r of prevRows ?? []) prev.set(String(r.tipo), Number(r.unidades ?? 0))
  return (rows ?? []).map(r => ({
    tipo: String(r.tipo),
    unidades: Number(r.unidades ?? 0),
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    unidadesPrev: prev.get(String(r.tipo)) ?? 0,
  }))
}

export async function getHoyData(
  provinciasScope: string[] | null,
  usuario: { nombre: string; iniciales: string; avatarUrl: string | null } | null,
  /** Rango elegido a mano en la UI (?desde=&hasta=), ya validado */
  custom?: { desde: string; hasta: string } | null,
): Promise<HoyData> {
  const supabase = await createClient()
  const hoy = new Date()
  const p_prov = provinciasScope

  // ── Períodos de venta 24→23 ────────────────────────────────────────────────
  // Se piden uno más de los visibles: el más antiguo sólo sirve como base de
  // comparación del anteúltimo.
  const { data: periodosRaw } = await supabase
    .from('periodos')
    .select('id, nombre, fecha_inicio, fecha_fin, activo')
    .lte('fecha_inicio', iso(hoy))
    .order('fecha_inicio', { ascending: false })
    .limit(PERIODOS_VISIBLES + 1)

  const periodosLista = (periodosRaw ?? []) as {
    id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean
  }[]

  // ── Rangos relativos a hoy ────────────────────────────────────────────────
  const relDef = (desde: Date, hasta: Date, etiqueta: string) => {
    const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1)
    const prevHasta = addDias(desde, -1)
    const prevDesde = addDias(prevHasta, -(dias - 1))
    return { desde: iso(desde), hasta: iso(hasta), prevDesde: iso(prevDesde), prevHasta: iso(prevHasta), etiqueta }
  }
  const anioIni = new Date(hoy.getFullYear(), 0, 1)
  const relativos: Record<Exclude<RangoKey, 'periodo' | 'custom'>, ReturnType<typeof relDef>> = {
    hoy:  relDef(hoy, hoy, 'vs ayer'),
    '7d': relDef(addDias(hoy, -6), hoy, 'vs 7 días previos'),
    '30d': relDef(addDias(hoy, -29), hoy, 'vs 30 días previos'),
    anio: {
      desde: iso(anioIni), hasta: iso(hoy),
      prevDesde: iso(new Date(hoy.getFullYear() - 1, 0, 1)),
      prevHasta: iso(new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate())),
      etiqueta: 'vs mismo período del año anterior',
    },
  }

  // Rango elegido a mano: se compara contra el lapso previo de igual largo
  const customDef = custom
    ? (() => {
        const ini = new Date(custom.desde + 'T12:00:00')
        const fin = new Date(custom.hasta + 'T12:00:00')
        const dias = Math.max(1, Math.round((fin.getTime() - ini.getTime()) / 86400000) + 1)
        const prevHasta = addDias(ini, -1)
        const prevDesde = addDias(prevHasta, -(dias - 1))
        return {
          desde: custom.desde, hasta: custom.hasta,
          prevDesde: iso(prevDesde), prevHasta: iso(prevHasta),
          etiqueta: `vs ${dias} ${dias === 1 ? 'día' : 'días'} previos`,
        }
      })()
    : null

  // Cada rango a consultar: los relativos + cada período 24→23 + el custom.
  // Para los períodos, el "previo" es el período 24→23 anterior de la lista.
  const consultas: { desde: string; hasta: string }[] = [
    ...Object.values(relativos).flatMap(r => [{ desde: r.desde, hasta: r.hasta }, { desde: r.prevDesde, hasta: r.prevHasta }]),
    ...periodosLista.map(p => ({ desde: p.fecha_inicio, hasta: p.fecha_fin })),
    ...(customDef ? [{ desde: customDef.desde, hasta: customDef.hasta }, { desde: customDef.prevDesde, hasta: customDef.prevHasta }] : []),
  ]

  // El período ACTIVO (en curso) no se compara contra el período anterior
  // completo — eso hace ver una caída falsa cuando en realidad sólo llevamos
  // unos días. Se compara contra el mismo tramo de días ya transcurridos del
  // período anterior ("mismo día acumulado"). Los períodos ya cerrados siguen
  // comparándose completo contra completo (ambos terminaron, no hay sesgo).
  const idxActivo = periodosLista.findIndex(p => p.activo)
  const periodoActivo = idxActivo >= 0 ? periodosLista[idxActivo] : null
  const periodoAnteriorAlActivo = periodoActivo ? periodosLista[idxActivo + 1] : null
  const truncadoDef = (() => {
    if (!periodoActivo || !periodoAnteriorAlActivo) return null
    const inicioAct = new Date(periodoActivo.fecha_inicio + 'T12:00:00')
    const diasTranscurridos = Math.max(1, Math.round((hoy.getTime() - inicioAct.getTime()) / 86400000) + 1)
    const inicioAnt = new Date(periodoAnteriorAlActivo.fecha_inicio + 'T12:00:00')
    const finAntCompleto = new Date(periodoAnteriorAlActivo.fecha_fin + 'T12:00:00')
    const finTruncado = addDias(inicioAnt, diasTranscurridos - 1)
    return { desde: iso(inicioAnt), hasta: iso(finTruncado > finAntCompleto ? finAntCompleto : finTruncado) }
  })()
  const iTruncado = truncadoDef ? consultas.length : -1
  if (truncadoDef) consultas.push({ desde: truncadoDef.desde, hasta: truncadoDef.hasta })

  // La serie tiene que cubrir el más antiguo de todos los rangos pedidos (el
  // custom puede ser de años anteriores), si no los sparklines saldrían vacíos.
  const serieDesde = [
    iso(anioIni),
    ...(periodosLista.length ? [periodosLista[periodosLista.length - 1].fecha_inicio] : []),
    ...(customDef ? [customDef.prevDesde] : []),
  ].sort()[0]

  const [kpisAll, vendAll, envAll, entAll, porEntregarVendAll, serieRes, metasRes, scoresRes, syncRes] = await Promise.all([
    Promise.all(consultas.map(c => supabase.rpc('ventas_dashboard_kpis', { p_ini: c.desde, p_fin: c.hasta, p_provincias: p_prov }))),
    Promise.all(consultas.map(c => supabase.rpc('ventas_agg_periodo', { p_ini: c.desde, p_fin: c.hasta, p_vendedor: null, p_provincias: p_prov }))),
    Promise.all(consultas.map(c => supabase.rpc('ventas_envases_periodo', { p_ini: c.desde, p_fin: c.hasta, p_provincias: p_prov }))),
    Promise.all(consultas.map(c => supabase.rpc('ventas_entregas_periodo', { p_ini: c.desde, p_fin: c.hasta, p_provincias: p_prov }))),
    Promise.all(consultas.map(c => supabase.rpc('ventas_entregas_por_vendedor', { p_ini: c.desde, p_fin: c.hasta, p_provincias: p_prov }))),
    supabase.rpc('ventas_serie_diaria', { p_ini: serieDesde, p_fin: iso(hoy), p_provincias: p_prov }),
    supabase.from('metas').select('periodo_id, meta_litros').eq('tipo', 'mensual'),
    supabase.rpc('get_client_scores', { p_vendedor: null }),
    supabase.from('ventas').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const serieCompleta: PuntoSerie[] = ((serieRes.data ?? []) as Record<string, unknown>[]).map(r => ({
    fecha: String(r.fecha),
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    clientes: Number(r.clientes ?? 0),
    pedidos: Number(r.pedidos ?? 0),
  }))
  const recorte = (desde: string, hasta: string) => serieCompleta.filter(p => p.fecha >= desde && p.fecha <= hasta)

  const kpiEn = (i: number) => mapKpis((kpisAll[i].data as unknown[])?.[0])
  const vendEn = (i: number) => (vendAll[i].data as Record<string, unknown>[] | null)
  const envEn  = (i: number) => (envAll[i].data as Record<string, unknown>[] | null)
  const entEn  = (i: number) => mapEntregas((entAll[i].data as unknown[])?.[0])
  const porEntregarVendEn = (i: number) => (porEntregarVendAll[i].data as Record<string, unknown>[] | null)

  // ── Rangos relativos ──────────────────────────────────────────────────────
  const rangos = {} as Record<Exclude<RangoKey, 'periodo' | 'custom'>, DatosRango>
  const clavesRel = Object.keys(relativos) as Exclude<RangoKey, 'periodo' | 'custom'>[]
  clavesRel.forEach((k, idx) => {
    const r = relativos[k]
    const iAct = idx * 2, iPrev = idx * 2 + 1
    rangos[k] = {
      desde: r.desde,
      hasta: r.hasta,
      etiquetaComparacion: r.etiqueta,
      actual: kpiEn(iAct),
      previo: kpiEn(iPrev),
      vendedores: armarVendedores(vendEn(iAct), vendEn(iPrev), porEntregarVendEn(iAct)),
      envases: armarEnvases(envEn(iAct), envEn(iPrev)),
      entregas: entEn(iAct),
      serie: recorte(r.desde, r.hasta),
    }
  })

  // ── Períodos 24→23 ────────────────────────────────────────────────────────
  const offsetPeriodos = clavesRel.length * 2
  const metasPorPeriodo = new Map<number, number>()
  for (const m of (metasRes.data ?? []) as { periodo_id: number; meta_litros: number }[]) {
    metasPorPeriodo.set(m.periodo_id, (metasPorPeriodo.get(m.periodo_id) ?? 0) + Number(m.meta_litros ?? 0))
  }

  const periodos: PeriodoOpcion[] = periodosLista
    .slice(0, PERIODOS_VISIBLES)
    .map((p, i) => {
      const iAct = offsetPeriodos + i
      const iPrev = offsetPeriodos + i + 1   // el período 24→23 anterior
      const anterior = periodosLista[i + 1]
      // El período activo compara "mismo día acumulado" (iTruncado); los
      // períodos ya cerrados comparan completo contra completo (iPrev).
      const esActivo = p.activo && iTruncado >= 0
      const iComparar = esActivo ? iTruncado : iPrev
      return {
        id: p.id,
        nombre: p.nombre,
        inicio: p.fecha_inicio,
        fin: p.fecha_fin,
        activo: p.activo,
        metaLitros: metasPorPeriodo.get(p.id) ?? 0,
        datos: {
          desde: p.fecha_inicio,
          hasta: p.fecha_fin,
          etiquetaComparacion: !anterior
            ? 'sin período anterior'
            : esActivo ? `vs mismos días de ${anterior.nombre}` : `vs ${anterior.nombre}`,
          actual: kpiEn(iAct),
          previo: anterior ? kpiEn(iComparar) : { ...KPIS_CERO },
          vendedores: armarVendedores(vendEn(iAct), anterior ? vendEn(iComparar) : null, porEntregarVendEn(iAct)),
          envases: armarEnvases(envEn(iAct), anterior ? envEn(iComparar) : null),
          entregas: entEn(iAct),
          serie: recorte(p.fecha_inicio, p.fecha_fin),
        },
      }
    })

  // ── Alertas e insights ───────────────────────────────────────────────────
  const alertas: AlertaInsight[] = []
  const scores = (scoresRes.data ?? []) as Record<string, unknown>[]
  const sinComprar30 = scores.filter(s => Number(s.dias_sin_compra ?? 0) > 30).length
  if (sinComprar30 > 0) {
    alertas.push({
      tipo: 'alerta',
      titulo: `${sinComprar30} ${sinComprar30 === 1 ? 'cliente lleva' : 'clientes llevan'} más de 30 días sin comprar`,
      detalle: 'Revisar en Misiones',
      href: '/ventas/misiones',
    })
  }
  const enRiesgo = scores.filter(s => ['critico', 'vencido'].includes(String(s.alert_level ?? ''))).length
  if (enRiesgo > 0) {
    alertas.push({
      tipo: 'alerta',
      titulo: `${enRiesgo} ${enRiesgo === 1 ? 'cliente' : 'clientes'} en riesgo de quiebre de stock`,
      detalle: 'Contactar esta semana',
      href: '/ventas/clientes',
    })
  }
  // Variación de categorías en el período activo vs el período 24→23 anterior
  const pAct = periodos[0]
  if (pAct) {
    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
    const pares: [string, number, number][] = [
      ['Kombucha', pAct.datos.actual.litrosKombucha, pAct.datos.previo.litrosKombucha],
      ['Cerveza', pAct.datos.actual.litrosCerveza, pAct.datos.previo.litrosCerveza],
    ]
    for (const [nombre, act, prv] of pares) {
      const p = pct(act, prv)
      if (p !== null && Math.abs(p) >= 10) {
        alertas.push({
          tipo: 'insight',
          titulo: `${nombre} ${p > 0 ? 'crece' : 'cae'} un ${Math.abs(Math.round(p))}% en el período`,
          detalle: `${act.toFixed(1)} L vs ${prv.toFixed(1)} L del período anterior`,
        })
      }
    }
  }

  // El custom va al final de `consultas`, después de los períodos
  const iCustom = offsetPeriodos + periodosLista.length
  const datosCustom: DatosRango | null = customDef
    ? {
        desde: customDef.desde,
        hasta: customDef.hasta,
        etiquetaComparacion: customDef.etiqueta,
        actual: kpiEn(iCustom),
        previo: kpiEn(iCustom + 1),
        vendedores: armarVendedores(vendEn(iCustom), vendEn(iCustom + 1), porEntregarVendEn(iCustom)),
        envases: armarEnvases(envEn(iCustom), envEn(iCustom + 1)),
        entregas: entEn(iCustom),
        serie: recorte(customDef.desde, customDef.hasta),
      }
    : null

  return {
    rangos,
    periodos,
    custom: datosCustom,
    alertas,
    ultimaSync: (syncRes.data as { created_at?: string } | null)?.created_at ?? null,
    usuario,
  }
}
