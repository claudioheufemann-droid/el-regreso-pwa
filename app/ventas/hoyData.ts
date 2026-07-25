import { createClient } from '@/lib/supabase/server'
import { VENDEDORES_SCOPE, VENDEDOR_DISPLAY } from '@/lib/types'
import { RANGOS, type RangoKey, type KpisRango, type VendedorRango,
         type PuntoSerie, type DatosRango, type AlertaInsight, type HoyData } from './hoyTypes'

/**
 * Datos de la vista principal de Ventas (pestaña "Hoy"). Sólo servidor.
 *
 * Los 5 rangos (Hoy / 7D / 30D / Mes / Año) se precalculan acá, junto con su
 * período de comparación, para que cambiar de pestaña en el cliente sea
 * instantáneo y no dispare consultas nuevas.
 *
 * Los tipos viven en ./hoyTypes para que el componente cliente pueda usarlos
 * sin arrastrar lib/supabase/server al bundle del navegador.
 */

export type { RangoKey, KpisRango, VendedorRango, PuntoSerie, DatosRango, AlertaInsight, HoyData }

const KPIS_CERO: KpisRango = {
  litros: 0, revenue: 0, clientes: 0, pedidos: 0,
  litrosCerveza: 0, litrosKombucha: 0, litrosOtros: 0,
}

const iso = (d: Date) => d.toISOString().split('T')[0]
const addDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** Rango de cada pestaña + su período anterior de igual largo, para el "vs". */
function calcularRangos(hoy: Date, periodo: { inicio: string; fin: string } | null) {
  const def = (desde: Date, hasta: Date) => {
    const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1)
    const prevHasta = addDias(desde, -1)
    const prevDesde = addDias(prevHasta, -(dias - 1))
    return { desde: iso(desde), hasta: iso(hasta), prevDesde: iso(prevDesde), prevHasta: iso(prevHasta) }
  }

  // "Mes" = período de venta activo (24→23), que es como mide el negocio; si no
  // hay período configurado, cae al mes calendario.
  const mes = periodo
    ? (() => {
        const ini = new Date(periodo.inicio + 'T12:00:00')
        const fin = new Date(periodo.fin + 'T12:00:00')
        const dias = Math.round((fin.getTime() - ini.getTime()) / 86400000) + 1
        const prevFin = addDias(ini, -1)
        const prevIni = addDias(prevFin, -(dias - 1))
        return { desde: periodo.inicio, hasta: periodo.fin, prevDesde: iso(prevIni), prevHasta: iso(prevFin) }
      })()
    : def(new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy)

  const anioIni = new Date(hoy.getFullYear(), 0, 1)
  return {
    hoy:  def(hoy, hoy),
    '7d': def(addDias(hoy, -6), hoy),
    '30d': def(addDias(hoy, -29), hoy),
    mes,
    anio: {
      desde: iso(anioIni), hasta: iso(hoy),
      prevDesde: iso(new Date(hoy.getFullYear() - 1, 0, 1)),
      prevHasta: iso(new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate())),
    },
  } as Record<RangoKey, { desde: string; hasta: string; prevDesde: string; prevHasta: string }>
}

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

export async function getHoyData(
  provinciasScope: string[] | null,
  usuario: { nombre: string; iniciales: string; avatarUrl: string | null } | null,
): Promise<HoyData> {
  const supabase = await createClient()
  const hoy = new Date()

  const { data: periodoRow } = await supabase
    .from('periodos').select('id, nombre, fecha_inicio, fecha_fin').eq('activo', true).maybeSingle()

  const periodo = periodoRow
    ? { nombre: periodoRow.nombre as string, inicio: periodoRow.fecha_inicio as string, fin: periodoRow.fecha_fin as string }
    : null

  const defs = calcularRangos(hoy, periodo)
  const p_prov = provinciasScope

  // Una tanda de llamadas en paralelo: por cada rango, KPIs actuales + previos +
  // desglose por vendedor; y una sola serie diaria (el año) que alimenta todos
  // los sparklines recortándola en el cliente.
  const claves = RANGOS.map(r => r.key)
  const [kpisRes, prevRes, vendRes, vendPrevRes, serieRes, metasRes, scoresRes, syncRes] = await Promise.all([
    Promise.all(claves.map(k => supabase.rpc('ventas_dashboard_kpis', { p_ini: defs[k].desde, p_fin: defs[k].hasta, p_provincias: p_prov }))),
    Promise.all(claves.map(k => supabase.rpc('ventas_dashboard_kpis', { p_ini: defs[k].prevDesde, p_fin: defs[k].prevHasta, p_provincias: p_prov }))),
    Promise.all(claves.map(k => supabase.rpc('ventas_agg_periodo', { p_ini: defs[k].desde, p_fin: defs[k].hasta, p_vendedor: null, p_provincias: p_prov }))),
    Promise.all(claves.map(k => supabase.rpc('ventas_agg_periodo', { p_ini: defs[k].prevDesde, p_fin: defs[k].prevHasta, p_vendedor: null, p_provincias: p_prov }))),
    supabase.rpc('ventas_serie_diaria', { p_ini: defs.anio.desde, p_fin: defs.anio.hasta, p_provincias: p_prov }),
    supabase.from('metas').select('meta_litros').eq('periodo_id', periodoRow?.id ?? -1).eq('tipo', 'mensual'),
    supabase.rpc('get_client_scores', { p_vendedor: null }),
    supabase.from('ventas').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const serieAnual: PuntoSerie[] = ((serieRes.data ?? []) as Record<string, unknown>[]).map(r => ({
    fecha: String(r.fecha),
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    clientes: Number(r.clientes ?? 0),
    pedidos: Number(r.pedidos ?? 0),
  }))

  // Agrupa los nombres de BD en los grupos de display (Equipo Ventas, OnLine,
  // R. Metropolitana, ...) usando la misma fuente que el resto de la app.
  function agruparVendedores(
    rows: Record<string, unknown>[] | null,
    prevRows: Record<string, unknown>[] | null,
  ): VendedorRango[] {
    const prev = new Map<string, number>()
    for (const r of prevRows ?? []) {
      const g = VENDEDOR_DISPLAY[String(r.vendedor)] ?? String(r.vendedor)
      prev.set(g, (prev.get(g) ?? 0) + Number(r.litros ?? 0))
    }
    const acc = new Map<string, VendedorRango>()
    for (const r of rows ?? []) {
      const nombreBd = String(r.vendedor)
      // Sólo los vendedores conocidos; el resto (internos, "No indica") se omite
      if (!VENDEDORES_SCOPE.includes(nombreBd)) continue
      const g = VENDEDOR_DISPLAY[nombreBd] ?? nombreBd
      const cur = acc.get(g) ?? { vendedor: g, litros: 0, revenue: 0, clientes: 0, litrosPrev: prev.get(g) ?? 0 }
      cur.litros += Number(r.litros ?? 0)
      cur.revenue += Number(r.revenue ?? 0)
      cur.clientes += Number(r.clientes ?? 0)
      acc.set(g, cur)
    }
    // Los grupos sin ventas también se muestran (en 0), como en el mockup
    for (const g of new Set(Object.values(VENDEDOR_DISPLAY))) {
      if (!acc.has(g)) acc.set(g, { vendedor: g, litros: 0, revenue: 0, clientes: 0, litrosPrev: prev.get(g) ?? 0 })
    }
    return [...acc.values()].sort((a, b) => b.litros - a.litros)
  }

  const rangos = {} as Record<RangoKey, DatosRango>
  claves.forEach((k, i) => {
    const d = defs[k]
    rangos[k] = {
      desde: d.desde,
      hasta: d.hasta,
      actual: mapKpis((kpisRes[i].data as unknown[])?.[0]),
      previo: mapKpis((prevRes[i].data as unknown[])?.[0]),
      vendedores: agruparVendedores(
        vendRes[i].data as Record<string, unknown>[] | null,
        vendPrevRes[i].data as Record<string, unknown>[] | null,
      ),
      serie: serieAnual.filter(p => p.fecha >= d.desde && p.fecha <= d.hasta),
    }
  })

  const metaLitros = (metasRes.data ?? []).reduce((s, m) => s + Number((m as { meta_litros: number }).meta_litros ?? 0), 0)

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
  // Crecimiento por categoría en el rango de 30 días (el más representativo)
  const r30 = rangos['30d']
  const komb = r30.actual.litrosKombucha, kombPrev = r30.previo.litrosKombucha
  const cerv = r30.actual.litrosCerveza, cervPrev = r30.previo.litrosCerveza
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
  for (const [nombre, act, prv] of [['Kombucha', komb, kombPrev], ['Cerveza', cerv, cervPrev]] as [string, number, number][]) {
    const p = pct(act, prv)
    if (p !== null && Math.abs(p) >= 10) {
      alertas.push({
        tipo: 'insight',
        titulo: `${nombre} ${p > 0 ? 'crece' : 'cae'} un ${Math.abs(Math.round(p))}% en 30 días`,
        detalle: `${act.toFixed(1)} L vs ${prv.toFixed(1)} L del período anterior`,
      })
    }
  }

  return {
    rangos,
    periodo,
    metaLitros,
    alertas,
    ultimaSync: (syncRes.data as { created_at?: string } | null)?.created_at ?? null,
    usuario,
  }
}
