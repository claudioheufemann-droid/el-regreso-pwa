import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VENDEDORES_SCOPE, CLIENTES_EXCLUIR } from '@/lib/types'

const TODOS_VENDEDORES = [...VENDEDORES_SCOPE] as const
import {
  getDiasHabiles,
  getDiasHabilesTranscurridos,
  getMetaEsperadaAFecha,
  calcularCumplimiento,
  getEstadoSemaforo,
  getMensajePredictivo,
  type AnalyticsVendedor,
  type AnalyticsCanal,
} from '@/lib/metas-engine'

export const dynamic = 'force-dynamic'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VentaAPI {
  vendedor_actual: string
  categoria_negocio: string | null
  litros: number | null
  total_sin_impuesto: number | null
  nombre_fantasia: string | null
  fecha_pedido: string | null
  categoria_producto: string | null
  producto: string | null
  envase: string | null
}

/** Retorna litros por unidad según el texto del envase. */
function litrosPorUnidad(envase: string | null): number | null {
  if (!envase) return null
  const s = envase.toLowerCase()
  const cc = s.match(/(\d+(?:[.,]\d+)?)\s*cc/)
  if (cc) return parseFloat(cc[1].replace(',', '.')) / 1000
  const li = s.match(/(\d+(?:[.,]\d+)?)\s*l\b/)
  if (li) return parseFloat(li[1].replace(',', '.'))
  return null
}

export interface ClienteProducto { nombre: string; litros: number; canal: string | null }
export interface ProductoItem { nombre: string; litros: number; clientes: ClienteProducto[] }
export interface ProductoCategoria { categoria: string; total: number; productos: ProductoItem[] }

function computeProductos(ventas: VentaAPI[]): ProductoCategoria[] {
  type ProdEntry = { total: number; clientes: Map<string, { litros: number; canal: string | null }> }
  const map = new Map<string, Map<string, ProdEntry>>()
  for (const v of ventas) {
    if (!v.litros) continue
    const cat  = v.categoria_producto?.trim() || 'Sin categoría'
    const prod = v.producto?.trim()           || 'Sin nombre'
    const cli  = v.nombre_fantasia?.trim()    || 'Sin nombre'
    const canal = v.categoria_negocio ?? null
    if (!map.has(cat)) map.set(cat, new Map())
    const pm = map.get(cat)!
    if (!pm.has(prod)) pm.set(prod, { total: 0, clientes: new Map() })
    const entry = pm.get(prod)!
    entry.total += v.litros
    if (!entry.clientes.has(cli)) entry.clientes.set(cli, { litros: 0, canal })
    entry.clientes.get(cli)!.litros += v.litros
  }
  return [...map.entries()]
    .map(([categoria, pm]) => ({
      categoria,
      total: [...pm.values()].reduce((s, e) => s + e.total, 0),
      productos: [...pm.entries()]
        .map(([nombre, entry]) => ({
          nombre,
          litros: entry.total,
          clientes: [...entry.clientes.entries()]
            .map(([nombre, d]) => ({ nombre, litros: d.litros, canal: d.canal }))
            .sort((a, b) => b.litros - a.litros),
        }))
        .sort((a, b) => b.litros - a.litros),
    }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)

  const todayStr = new Date().toISOString().split('T')[0]

  // ── Determinar rango ─────────────────────────────────────────────────────────
  // Modo nuevo: inicio + fin explícitos
  // Modo legacy: fecha → deriva el período mensual activo para esa fecha
  const inicioParam = searchParams.get('inicio')
  const finParam    = searchParams.get('fin')

  let rangeInicio: string
  let rangeFin: string

  if (inicioParam && finParam) {
    rangeInicio = inicioParam
    rangeFin    = finParam
  } else {
    const fechaParam = searchParams.get('fecha')
    let fechaRef: string

    if (fechaParam) {
      fechaRef = fechaParam
    } else {
      const { data: ultima } = await supabase
        .from('ventas')
        .select('fecha_pedido')
        .in('vendedor_actual', TODOS_VENDEDORES)
        .order('fecha_pedido', { ascending: false })
        .limit(1)
        .single()
      fechaRef = ultima?.fecha_pedido ?? todayStr
    }

    // Intentar derivar período mensual activo
    const { data: metaMes } = await supabase
      .from('metas')
      .select('fecha_inicio, fecha_fin')
      .eq('tipo', 'mensual')
      .lte('fecha_inicio', fechaRef)
      .gte('fecha_fin', fechaRef)
      .limit(1)
      .single()

    rangeInicio = metaMes?.fecha_inicio ?? fechaRef.slice(0, 8) + '01'
    rangeFin    = metaMes?.fecha_fin    ?? fechaRef
  }

  // Ventas solo hasta hoy (no futuro)
  const efectiveFin = rangeFin < todayStr ? rangeFin : todayStr
  const fechaFinDate = new Date(efectiveFin + 'T12:00:00')

  // ── Metas que se superponen con el rango ─────────────────────────────────────
  const { data: todasMetas } = await supabase
    .from('metas')
    .select('*')
    .lte('fecha_inicio', rangeFin)
    .gte('fecha_fin', rangeInicio)

  if (!todasMetas?.length) {
    return NextResponse.json({ analytics: [], sinMetas: true, rangeInicio, rangeFin })
  }

  // ── Ventas en el rango ───────────────────────────────────────────────────────
  const selectFields = 'vendedor_actual, categoria_negocio, litros, total_sin_impuesto, nombre_fantasia, fecha_pedido, categoria_producto, producto, envase'

  async function fetchVentasPaginado(fechaIni: string, fechaFin: string): Promise<VentaAPI[]> {
    const rows: VentaAPI[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase.from('ventas').select(selectFields)
        .in('vendedor_actual', TODOS_VENDEDORES)
        .gte('fecha_pedido', fechaIni).lte('fecha_pedido', fechaFin)
        .order('fecha_pedido', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (!data || data.length === 0) break
      rows.push(...(data as VentaAPI[]))
      if (data.length < PAGE) break
      offset += PAGE
    }
    return rows.filter(v =>
      !CLIENTES_EXCLUIR.some(ex => (v.nombre_fantasia ?? '').toLowerCase().includes(ex.toLowerCase()))
    )
  }

  const ventas = await fetchVentasPaginado(rangeInicio, efectiveFin)

  // ── Días hábiles del rango ───────────────────────────────────────────────────
  const dh = getDiasHabiles(new Date(rangeInicio), new Date(rangeFin + 'T23:59:59'))
  const dhTrans = getDiasHabilesTranscurridos(dh, fechaFinDate)

  // ── Productos a nivel equipo ─────────────────────────────────────────────────
  const productosPeriodo = computeProductos(ventas)

  // ── Analytics por vendedor ───────────────────────────────────────────────────
  // Consolidar todos los vendedores DB bajo 'Vendedor 1' (token canónico)
  const analytics: AnalyticsVendedor[] = VENDEDORES.map(vendedor => {
    const metaTotal = todasMetas.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
    const realizado = ventas.reduce((s, v) => s + (v.litros ?? 0), 0)
    const mV = todasMetas

    const diasHabiles       = dh.length
    const diasTranscurridos = dhTrans
    const diasRestantes     = diasHabiles - diasTranscurridos

    const esperado  = getMetaEsperadaAFecha(metaTotal, dh, fechaFinDate)
    const faltante  = Math.max(0, metaTotal - realizado)
    const semaforo  = getEstadoSemaforo(realizado, esperado)
    const promNec   = diasRestantes > 0 ? faltante / diasRestantes : 0
    const mensaje   = getMensajePredictivo(faltante, diasRestantes)

    const allCanales = [...new Set(mV.map(m => m.categoria_negocio))]
    const vV = ventas

    const porCanal: AnalyticsCanal[] = allCanales.map(canal => {
      const metaCanal = mV.filter(m => m.categoria_negocio === canal).reduce((s, m) => s + (m.meta_litros ?? 0), 0)
      const realCanal = vV.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
      const espCanal  = getMetaEsperadaAFecha(metaCanal, dh, fechaFinDate)
      return {
        canal,
        metaMensual: metaCanal, metaSemanal: metaCanal,
        realizadoMes: realCanal, realizadoSemana: realCanal,
        metaEsperadaMes: espCanal, metaEsperadaSemana: espCanal,
        pctMes: calcularCumplimiento(realCanal, metaCanal),
        pctSemana: calcularCumplimiento(realCanal, metaCanal),
        semaforoMes: getEstadoSemaforo(realCanal, espCanal),
        semaforoSemana: getEstadoSemaforo(realCanal, espCanal),
      }
    }).sort((a, b) => b.metaMensual - a.metaMensual)

    const ventasDiariasRaw = vV
      .filter(v => v.fecha_pedido)
      .map(v => ({ fecha: v.fecha_pedido as string, litros: v.litros ?? 0 }))

    return {
      vendedor,
      fecha: efectiveFin,
      metaMensual: metaTotal, realizadoMes: realizado,
      metaEsperadaMes: esperado,
      pctCumplimientoMes: calcularCumplimiento(realizado, metaTotal),
      semaforoMes: semaforo,
      diasHabilesMes: diasHabiles, diasTranscurridosMes: diasTranscurridos, diasRestantesMes: diasRestantes,
      faltanteMes: faltante, promedioNecesarioDiarioMes: promNec, mensajeMes: mensaje,
      semanaLabel: `${rangeInicio} – ${rangeFin}`,
      metaSemanal: metaTotal, realizadoSemana: realizado,
      metaEsperadaSemana: esperado,
      pctCumplimientoSemana: calcularCumplimiento(realizado, metaTotal),
      semaforoSemana: semaforo,
      diasHabilesSemana: diasHabiles, diasTranscurridosSemana: diasTranscurridos, diasRestantesSemana: diasRestantes,
      faltanteSemana: faltante, promedioNecesarioDiarioSemana: promNec, mensajeSemana: mensaje,
      porCanal,
      realizadoHoy: 0,
      porCanalHoy: [],
      ventasDiariasRaw,
    }
  })

  // ── Detalle por local (nombre_fantasia) ─────────────────────────────────────
  type ProdEntry = { categoria: string; envase: string | null; litros: number; monto: number; unidades: number | null }
  const clientesMap = new Map<string, {
    canal: string | null
    litros: number
    monto: number
    fechas: Set<string>
    prods: Map<string, ProdEntry>
  }>()

  for (const v of ventas) {
    const nombre = (v.nombre_fantasia ?? '').trim() || 'Sin nombre'
    if (!clientesMap.has(nombre)) {
      clientesMap.set(nombre, { canal: v.categoria_negocio ?? null, litros: 0, monto: 0, fechas: new Set(), prods: new Map() })
    }
    const e = clientesMap.get(nombre)!
    const litros = v.litros ?? 0
    const monto  = v.total_sin_impuesto ?? 0
    e.litros += litros
    e.monto  += monto
    if (v.fecha_pedido) e.fechas.add(v.fecha_pedido)

    // Clave: producto + envase para distinguir presentaciones
    const prod   = (v.producto ?? '').trim() || 'Sin nombre'
    const cat    = (v.categoria_producto ?? '').trim() || 'Sin categoría'
    const envase = (v.envase ?? '').trim() || null
    const key    = `${prod}||${envase ?? ''}`

    if (!e.prods.has(key)) e.prods.set(key, { categoria: cat, envase, litros: 0, monto: 0, unidades: null })
    const p = e.prods.get(key)!
    p.litros += litros
    p.monto  += monto

    // Calcular unidades acumulando
    const lpu = litrosPorUnidad(envase)
    if (lpu && lpu > 0) {
      p.unidades = Math.round(p.litros / lpu)
    }
  }

  const clientesDetalle = [...clientesMap.entries()]
    .map(([nombre, e]) => ({
      nombre,
      canal: e.canal,
      litros:  Math.round(e.litros * 10) / 10,
      monto:   Math.round(e.monto),
      pedidos: e.fechas.size,
      ultimoPedido: [...e.fechas].sort().at(-1) ?? '',
      productos: [...e.prods.entries()]
        .map(([key, { categoria, envase, litros, monto, unidades }]) => ({
          producto: key.split('||')[0],   // reconstruir desde la clave
          categoria, envase,
          litros:   Math.round(litros * 10) / 10,
          monto:    Math.round(monto),
          unidades,
        }))
        .sort((a, b) => b.monto - a.monto),
    }))
    .filter(c => c.litros > 0)
    .sort((a, b) => b.monto - a.monto)

  return NextResponse.json({
    analytics,
    rangeInicio,
    rangeFin,
    sinMetas: false,
    productosPeriodo,
    clientesDetalle,
    // Legacy compat
    productosMes: productosPeriodo,
    productosSemana: productosPeriodo,
    productosDia: [],
  })
}
