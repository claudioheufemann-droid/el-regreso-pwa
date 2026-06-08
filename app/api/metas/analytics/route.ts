import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VENDEDORES, VENDEDORES_DB, CLIENTES_EXCLUIR } from '@/lib/types'
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
  nombre_fantasia: string | null
  fecha_pedido: string | null
  categoria_producto: string | null
  producto: string | null
}

export interface ProductoItem { nombre: string; litros: number }
export interface ProductoCategoria { categoria: string; total: number; productos: ProductoItem[] }

function computeProductos(ventas: VentaAPI[]): ProductoCategoria[] {
  const map = new Map<string, Map<string, number>>()
  for (const v of ventas) {
    const cat = v.categoria_producto?.trim() || 'Sin categoría'
    const prod = v.producto?.trim() || 'Sin nombre'
    if (!map.has(cat)) map.set(cat, new Map())
    const pm = map.get(cat)!
    pm.set(prod, (pm.get(prod) ?? 0) + (v.litros ?? 0))
  }
  return [...map.entries()]
    .map(([categoria, pm]) => ({
      categoria,
      total: [...pm.values()].reduce((s, l) => s + l, 0),
      productos: [...pm.entries()]
        .map(([nombre, litros]) => ({ nombre, litros }))
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
        .in('vendedor_actual', VENDEDORES_DB)
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
  const selectFields = 'vendedor_actual, categoria_negocio, litros, nombre_fantasia, fecha_pedido, categoria_producto, producto'

  async function fetchVentasPaginado(fechaIni: string, fechaFin: string): Promise<VentaAPI[]> {
    const rows: VentaAPI[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase.from('ventas').select(selectFields)
        .in('vendedor_actual', VENDEDORES_DB)
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
  // Consolidar todos los vendedores DB bajo 'Vendedor 1'
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

  return NextResponse.json({
    analytics,
    rangeInicio,
    rangeFin,
    sinMetas: false,
    productosPeriodo,
    // Legacy compat
    productosMes: productosPeriodo,
    productosSemana: productosPeriodo,
    productosDia: [],
  })
}
