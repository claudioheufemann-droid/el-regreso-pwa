import { createClient } from '@/lib/supabase/server'
import { vendedorCanonico } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { type RangoKey, type KpisRango, type VendedorRango,
         type PuntoSerie, type DatosRango, type PeriodoOpcion, type PeriodoLigero, type EnvaseRango, type EntregasRango,
         type OrigenEntregadoRango,
         type ConsumoInternoRango, type AlertaInsight, type HoyData } from './hoyTypes'

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

export type { RangoKey, KpisRango, VendedorRango, PuntoSerie, DatosRango, PeriodoOpcion, PeriodoLigero, EnvaseRango, EntregasRango, OrigenEntregadoRango, ConsumoInternoRango, AlertaInsight, HoyData }

/** Cuántos períodos anteriores se ofrecen en el selector. */
export const PERIODOS_VISIBLES = 4

/** Desde esta fecha `fecha_entrega` es confiable (ver nota extensa más abajo). */
export const ENTREGA_CONFIABLE_DESDE = '2026-05-24'
export const porEntregaPeriodo = (fechaFin: string) => fechaFin >= ENTREGA_CONFIABLE_DESDE

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
  revenueCerveza: 0, revenueKombucha: 0, revenueOtros: 0,
}

export const iso = (d: Date) => d.toISOString().split('T')[0]
export const addDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

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
    revenueCerveza: Number(row.revenue_cerveza ?? 0),
    revenueKombucha: Number(row.revenue_kombucha ?? 0),
    revenueOtros: Number(row.revenue_otros ?? 0),
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
  const porEntregar = new Map<string, { litros: number; revenue: number }>()
  for (const r of porEntregarRows ?? []) {
    const bruto = String(r.vendedor ?? '')
    if (VENDEDORES_FUERA_RANKING.has(bruto)) continue
    const n = vendedorCanonico(bruto)
    if (!n) continue
    const cur = porEntregar.get(n) ?? { litros: 0, revenue: 0 }
    cur.litros += Number(r.litros_por_entregar ?? 0)
    cur.revenue += Number(r.revenue_por_entregar ?? 0)
    porEntregar.set(n, cur)
  }
  const acc = new Map<string, VendedorRango>()
  for (const r of rows ?? []) {
    const bruto = String(r.vendedor ?? '')
    if (!bruto || VENDEDORES_FUERA_RANKING.has(bruto)) continue
    const n = vendedorCanonico(bruto)
    const cur = acc.get(n) ?? {
      vendedor: n, litros: 0, revenue: 0, clientes: 0,
      litrosPrev: prev.get(n) ?? 0,
      litrosPorEntregar: porEntregar.get(n)?.litros ?? 0,
      revenuePorEntregar: porEntregar.get(n)?.revenue ?? 0,
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
      acc.set(n, {
        vendedor: n, litros: 0, revenue: 0, clientes: 0, litrosPrev,
        litrosPorEntregar: porEntregar.get(n)?.litros ?? 0, revenuePorEntregar: porEntregar.get(n)?.revenue ?? 0,
      })
  }
  // Quien sólo tiene pedidos pendientes (sin nada entregado aún) también debe
  // aparecer, si no su "por entregar" queda invisible en el ranking.
  for (const [n, pend] of porEntregar) {
    if (!acc.has(n) && pend.litros > 0)
      acc.set(n, {
        vendedor: n, litros: 0, revenue: 0, clientes: 0, litrosPrev: prev.get(n) ?? 0,
        litrosPorEntregar: pend.litros, revenuePorEntregar: pend.revenue,
      })
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

const ORIGEN_ENTREGADO_CERO: OrigenEntregadoRango = {
  litrosTotal: 0, revenueTotal: 0, pedidosTotal: 0,
  litrosBacklog: 0, revenueBacklog: 0, pedidosBacklog: 0,
  litrosMismoPeriodo: 0, revenueMismoPeriodo: 0, pedidosMismoPeriodo: 0,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrigenEntregado(row: any): OrigenEntregadoRango {
  if (!row) return { ...ORIGEN_ENTREGADO_CERO }
  return {
    litrosTotal: Number(row.litros_total ?? 0),
    revenueTotal: Number(row.revenue_total ?? 0),
    pedidosTotal: Number(row.pedidos_total ?? 0),
    litrosBacklog: Number(row.litros_backlog ?? 0),
    revenueBacklog: Number(row.revenue_backlog ?? 0),
    pedidosBacklog: Number(row.pedidos_backlog ?? 0),
    litrosMismoPeriodo: Number(row.litros_mismo_periodo ?? 0),
    revenueMismoPeriodo: Number(row.revenue_mismo_periodo ?? 0),
    pedidosMismoPeriodo: Number(row.pedidos_mismo_periodo ?? 0),
  }
}

function mapConsumoInterno(rows: Record<string, unknown>[] | null): ConsumoInternoRango[] {
  return (rows ?? []).map(r => ({
    categoria: String(r.categoria ?? ''),
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    pedidos: Number(r.pedidos ?? 0),
  }))
}

/**
 * Unidades por envase del rango, con las del rango previo para comparar.
 *
 * Un formato que tenía volumen en el período previo y cae a CERO en el
 * actual (ej. "Barril Kombucha" deja de venderse) antes desaparecía sin
 * dejar rastro acá — solo se mapeaban las filas del período actual. Eso
 * hacía parecer "roto" el % de "Mix de productos" (que sí suma ese
 * volumen perdido en su categoría) contra esta tarjeta, que simplemente
 * no mostraba nada de ese formato. Se agrega explícito en 0 con -100%
 * para que la caída sea visible, no silenciosa.
 */
function armarEnvases(
  rows: Record<string, unknown>[] | null,
  prevRows: Record<string, unknown>[] | null,
): EnvaseRango[] {
  const prev = new Map<string, number>()
  for (const r of prevRows ?? []) prev.set(String(r.tipo), Number(r.unidades ?? 0))
  const tiposActuales = new Set((rows ?? []).map(r => String(r.tipo)))
  const desaparecidos: EnvaseRango[] = [...prev.entries()]
    .filter(([tipo, unidadesPrev]) => unidadesPrev > 0 && !tiposActuales.has(tipo))
    .map(([tipo, unidadesPrev]) => ({ tipo, unidades: 0, litros: 0, revenue: 0, unidadesPrev }))
  return [...(rows ?? []).map(r => ({
    tipo: String(r.tipo),
    unidades: Number(r.unidades ?? 0),
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    unidadesPrev: prev.get(String(r.tipo)) ?? 0,
  })), ...desaparecidos]
}

/**
 * Fechas + etiqueta de comparación de un rango relativo a hoy ('hoy'/'7d'/
 * '30d'/'anio'). Antes vivía inline dentro de `getHoyData`, calculada para
 * los 4 rangos SIEMPRE, aunque el usuario nunca cambiara de esa pestaña.
 * Ahora se calcula uno a la vez, sólo cuando el rango lazy-carga (ver
 * app/api/ventas/rango/route.ts).
 */
export function rangoRelativo(hoy: Date, key: Exclude<RangoKey, 'periodo' | 'custom'>) {
  const relDef = (desde: Date, hasta: Date, etiqueta: string) => {
    const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1)
    const prevHasta = addDias(desde, -1)
    const prevDesde = addDias(prevHasta, -(dias - 1))
    return { desde: iso(desde), hasta: iso(hasta), prevDesde: iso(prevDesde), prevHasta: iso(prevHasta), etiqueta, porEntrega: key !== 'anio' }
  }
  if (key === 'hoy') return relDef(hoy, hoy, 'vs ayer')
  if (key === '7d')  return relDef(addDias(hoy, -6), hoy, 'vs 7 días previos')
  if (key === '30d') return relDef(addDias(hoy, -29), hoy, 'vs 30 días previos')
  // anio
  const anioIni = new Date(hoy.getFullYear(), 0, 1)
  return {
    desde: iso(anioIni), hasta: iso(hoy),
    prevDesde: iso(new Date(hoy.getFullYear() - 1, 0, 1)),
    prevHasta: iso(new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate())),
    etiqueta: 'vs mismo período del año anterior',
    porEntrega: false,
  }
}

/**
 * Calcula UN rango completo (con su comparación) — las mismas 7 familias de
 * RPC y las mismas funciones de mapeo (`mapKpis`, `armarVendedores`, …) que
 * antes corrían para los ~14 rangos de una sola vez dentro de `getHoyData`.
 * Reutiliza esas funciones tal cual — no se reescribió ninguna regla de
 * negocio, sólo se aisló el cálculo de UN rango para poder pedirlo aparte.
 *
 * `previo` es null para un rango sin comparación (no debería pasar hoy, pero
 * queda cubierto: `armarVendedores`/`armarEnvases`/`mapKpis` ya aceptan null).
 */
export async function calcularUnRango(
  supabase: SupabaseClient,
  p_prov: string[] | null,
  actual: { desde: string; hasta: string; porEntrega: boolean },
  previo: { desde: string; hasta: string; porEntrega: boolean } | null,
  etiquetaComparacion: string,
): Promise<DatosRango> {
  const [
    kpisAct, kpisPrev,
    vendAct, vendPrev,
    envAct, envPrev,
    entAct, origenAct, porEntregarVendAct, consumoAct,
    serieRes,
  ] = await Promise.all([
    supabase.rpc('ventas_dashboard_kpis', { p_ini: actual.desde, p_fin: actual.hasta, p_provincias: p_prov, p_por_entrega: actual.porEntrega }),
    previo
      ? supabase.rpc('ventas_dashboard_kpis', { p_ini: previo.desde, p_fin: previo.hasta, p_provincias: p_prov, p_por_entrega: previo.porEntrega })
      : Promise.resolve({ data: null }),
    supabase.rpc('ventas_agg_periodo', { p_ini: actual.desde, p_fin: actual.hasta, p_vendedor: null, p_provincias: p_prov, p_por_entrega: actual.porEntrega }),
    previo
      ? supabase.rpc('ventas_agg_periodo', { p_ini: previo.desde, p_fin: previo.hasta, p_vendedor: null, p_provincias: p_prov, p_por_entrega: previo.porEntrega })
      : Promise.resolve({ data: null }),
    supabase.rpc('ventas_envases_periodo', { p_ini: actual.desde, p_fin: actual.hasta, p_provincias: p_prov, p_por_entrega: actual.porEntrega }),
    previo
      ? supabase.rpc('ventas_envases_periodo', { p_ini: previo.desde, p_fin: previo.hasta, p_provincias: p_prov, p_por_entrega: previo.porEntrega })
      : Promise.resolve({ data: null }),
    supabase.rpc('ventas_entregas_periodo', { p_ini: actual.desde, p_fin: actual.hasta, p_provincias: p_prov }),
    supabase.rpc('ventas_entregado_origen_periodo', { p_ini: actual.desde, p_fin: actual.hasta, p_provincias: p_prov, p_por_entrega: actual.porEntrega }),
    supabase.rpc('ventas_entregas_por_vendedor', { p_ini: actual.desde, p_fin: actual.hasta, p_provincias: p_prov }),
    supabase.rpc('ventas_consumo_interno_periodo', { p_ini: actual.desde, p_fin: actual.hasta, p_provincias: p_prov, p_por_entrega: actual.porEntrega }),
    // Serie acotada a este rango — antes se pedía una serie ANCHA compartida
    // (desde el 1-ene) y se recortaba en memoria; acá alcanza con pedir
    // exactamente la ventana que este rango necesita. Mismo criterio
    // (fecha_pedido, p_por_entrega=false) que usaba el recorte de la serie
    // ancha, así que el resultado es idéntico fila por fila.
    supabase.rpc('ventas_serie_diaria', { p_ini: actual.desde, p_fin: actual.hasta, p_provincias: p_prov, p_por_entrega: false }),
  ])

  const serie: PuntoSerie[] = ((serieRes.data ?? []) as Record<string, unknown>[]).map(r => ({
    fecha: String(r.fecha),
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    clientes: Number(r.clientes ?? 0),
    pedidos: Number(r.pedidos ?? 0),
  }))

  return {
    desde: actual.desde,
    hasta: actual.hasta,
    etiquetaComparacion,
    porEntrega: actual.porEntrega,
    actual: mapKpis((kpisAct.data as unknown[])?.[0]),
    previo: mapKpis((kpisPrev.data as unknown[])?.[0]),
    vendedores: armarVendedores(
      vendAct.data as Record<string, unknown>[] | null,
      vendPrev.data as Record<string, unknown>[] | null,
      porEntregarVendAct.data as Record<string, unknown>[] | null,
    ),
    envases: armarEnvases(envAct.data as Record<string, unknown>[] | null, envPrev.data as Record<string, unknown>[] | null),
    entregas: mapEntregas((entAct.data as unknown[])?.[0]),
    origenEntregado: mapOrigenEntregado((origenAct.data as unknown[])?.[0]),
    consumoInterno: mapConsumoInterno(consumoAct.data as Record<string, unknown>[] | null),
    serie,
  }
}

/**
 * Datos de la carga inicial de /ventas.
 *
 * Antes acá se calculaban DE UNA los ~14 rangos posibles (hoy/7d/30d/año +
 * 4 períodos 24→23 + el rango a mano) — 7 familias de RPC × 14 rangos, más
 * de 80 llamadas concurrentes en cada carga de la pantalla. Medido contra
 * el servidor real (no un script aislado): ese `Promise.all` por sí solo
 * tardaba 4-4.7 s, muy por encima de lo que tardaban las mismas llamadas en
 * paralelo puro (~2.5 s) — hay contención real (probablemente el pool de
 * conexiones de Supabase) al disparar un burst tan grande desde el mismo
 * proceso.
 *
 * Ahora la carga inicial calcula SÓLO el período activo (la pestaña que se
 * ve por defecto) + el rango a mano si el usuario navegó con uno. El resto
 * (Hoy/7D/30D/Año y los otros 3 períodos del selector) se calcula bajo
 * demanda cuando el usuario realmente cambia de pestaña, vía
 * GET /api/ventas/rango (mismas funciones puras de mapeo, mismas reglas de
 * negocio — ver `calcularUnRango` arriba). El cliente ya tenía un fallback
 * al período activo mientras algo no está cargado (`?? periodoActivoDatos`),
 * así que la pantalla nunca queda en blanco esperando.
 */
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
  const [{ data: periodosRaw }, { data: periodosTodosRaw }] = await Promise.all([
    supabase
      .from('periodos')
      .select('id, nombre, fecha_inicio, fecha_fin, activo')
      .lte('fecha_inicio', iso(hoy))
      .order('fecha_inicio', { ascending: false })
      .limit(PERIODOS_VISIBLES + 1),
    // Lista liviana de TODOS los períodos que existen (para el selector) — sin
    // los cálculos pesados de arriba. Elegir uno de acá fuera de la ventana
    // visible navega a /ventas?desde=&hasta= (ver aplicarRango en el cliente),
    // que sí calcula ese período completo en el servidor.
    supabase
      .from('periodos')
      .select('id, nombre, fecha_inicio, fecha_fin')
      .lte('fecha_inicio', iso(hoy))
      .order('fecha_inicio', { ascending: false }),
  ])

  const periodosLista = (periodosRaw ?? []) as {
    id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean
  }[]
  const periodosDisponibles: PeriodoLigero[] = ((periodosTodosRaw ?? []) as {
    id: number; nombre: string; fecha_inicio: string; fecha_fin: string
  }[]).map(p => ({ id: p.id, nombre: p.nombre, inicio: p.fecha_inicio, fin: p.fecha_fin }))

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

  // Pedido de Claudio: un pedido tomado en un período pero no entregado no
  // debe sumar venta/comisión NI perderse de vista al cerrar el período. Ver
  // supabase/migrations/pendientes_entrega_trasladan_al_periodo_vigente.sql.

  // El período ACTIVO (en curso) no se compara contra el período anterior
  // completo — eso hace ver una caída falsa cuando en realidad sólo llevamos
  // unos días. Se compara contra el mismo tramo de días ya transcurridos del
  // período anterior ("mismo día acumulado"). Sólo aplica al período activo:
  // los otros 3 del selector (cerrados) comparan completo contra completo, y
  // eso lo resuelve la ruta lazy sin necesitar esta lógica.
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

  const metasPorPeriodo = new Map<number, number>()
  const primerPeriodo = periodosLista[0] ?? null

  // ── Cálculo eager: sólo el período activo (+ el rango a mano si hay) ──────
  const [datosActivoRes, metasRes, scoresRes, syncRes, datosCustomRes] = await Promise.all([
    primerPeriodo
      ? calcularUnRango(
          supabase, p_prov,
          { desde: primerPeriodo.fecha_inicio, hasta: primerPeriodo.fecha_fin, porEntrega: porEntregaPeriodo(primerPeriodo.fecha_fin) },
          primerPeriodo.activo && truncadoDef
            ? { desde: truncadoDef.desde, hasta: truncadoDef.hasta, porEntrega: true }
            : periodosLista[1]
              ? { desde: periodosLista[1].fecha_inicio, hasta: periodosLista[1].fecha_fin, porEntrega: porEntregaPeriodo(periodosLista[1].fecha_fin) }
              : null,
          !periodosLista[1]
            ? 'sin período anterior'
            : (primerPeriodo.activo && truncadoDef) ? `vs mismos días de ${periodosLista[1].nombre}` : `vs ${periodosLista[1].nombre}`,
        )
      : Promise.resolve(null),
    supabase.from('metas').select('periodo_id, meta_litros').eq('tipo', 'mensual'),
    supabase.rpc('get_client_scores', { p_vendedor: null }),
    supabase.from('ventas').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    customDef
      ? calcularUnRango(
          supabase, p_prov,
          { desde: customDef.desde, hasta: customDef.hasta, porEntrega: porEntregaPeriodo(customDef.hasta) },
          { desde: customDef.prevDesde, hasta: customDef.prevHasta, porEntrega: porEntregaPeriodo(customDef.hasta) },
          customDef.etiqueta,
        )
      : Promise.resolve(null),
  ])

  for (const m of (metasRes.data ?? []) as { periodo_id: number; meta_litros: number }[]) {
    metasPorPeriodo.set(m.periodo_id, (metasPorPeriodo.get(m.periodo_id) ?? 0) + Number(m.meta_litros ?? 0))
  }

  // ── Períodos del selector: el activo con datos, el resto lazy (`datos: null`) ──
  const periodos: PeriodoOpcion[] = periodosLista
    .slice(0, PERIODOS_VISIBLES)
    .map((p, i) => ({
      id: p.id,
      nombre: p.nombre,
      inicio: p.fecha_inicio,
      fin: p.fecha_fin,
      activo: p.activo,
      metaLitros: metasPorPeriodo.get(p.id) ?? 0,
      datos: i === 0 ? datosActivoRes : null,
    }))

  // ── Alertas e insights ───────────────────────────────────────────────────
  const alertas: AlertaInsight[] = []

  // `get_client_scores` tarda ~3,7 s porque client_raw_metrics es una vista
  // sin materializar que reagrega las 51.000 filas de `ventas` en cada carga
  // (medido 2026-08-26; ver supabase/migrations/client_metrics_cache_materializado.sql).
  // Con statement_timeout de 3 s en el rol `anon` eso significa que hoy, con
  // el login desactivado, la consulta SIEMPRE se cancela.
  //
  // El `?? []` que había acá convertía ese fallo en silencio: sin scores no
  // se genera ninguna alerta, y la pantalla queda idéntica a "no hay nada que
  // avisar". Es la peor forma de fallar para una tira que existe justamente
  // para avisar. Ahora, si la consulta falla, se dice.
  const scoresFallo = !!scoresRes.error
  const scores = (scoresRes.data ?? []) as Record<string, unknown>[]

  if (scoresFallo) {
    alertas.push({
      tipo: 'alerta',
      titulo: 'No pudimos calcular las alertas de clientes',
      detalle: 'La consulta de scoring superó el tiempo límite. Esto no significa que no haya clientes en riesgo.',
      href: '/ventas/clientes',
    })
  }

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
  if (datosActivoRes) {
    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
    const pares: [string, number, number][] = [
      ['Kombucha', datosActivoRes.actual.litrosKombucha, datosActivoRes.previo.litrosKombucha],
      ['Cerveza', datosActivoRes.actual.litrosCerveza, datosActivoRes.previo.litrosCerveza],
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

  return {
    // Vacío: Hoy/7D/30D/Año se calculan bajo demanda (ver `/api/ventas/rango`).
    rangos: {},
    periodos,
    periodosDisponibles,
    custom: datosCustomRes,
    alertas,
    ultimaSync: (syncRes.data as { created_at?: string } | null)?.created_at ?? null,
    usuario,
  }
}
