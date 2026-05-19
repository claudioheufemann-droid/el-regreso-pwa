import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VENDEDORES, CLIENTES_EXCLUIR } from '@/lib/types'
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

  // Fecha de referencia: parámetro o la última fecha con ventas
  let fechaRef: Date

  const fechaParam = searchParams.get('fecha')
  if (fechaParam) {
    fechaRef = new Date(fechaParam + 'T12:00:00')
  } else {
    const { data: ultima } = await supabase
      .from('ventas')
      .select('fecha_pedido')
      .in('vendedor_actual', VENDEDORES)
      .order('fecha_pedido', { ascending: false })
      .limit(1)
      .single()
    fechaRef = ultima?.fecha_pedido
      ? new Date(ultima.fecha_pedido + 'T12:00:00')
      : new Date()
  }

  const fechaStr = fechaRef.toISOString().split('T')[0]

  // ── Metas activas ────────────────────────────────────────────────────────────

  const { data: metasSemanales } = await supabase
    .from('metas')
    .select('*')
    .eq('tipo', 'semanal')
    .lte('fecha_inicio', fechaStr)
    .gte('fecha_fin', fechaStr)

  const { data: metasMensuales } = await supabase
    .from('metas')
    .select('*')
    .eq('tipo', 'mensual')
    .lte('fecha_inicio', fechaStr)
    .gte('fecha_fin', fechaStr)

  if (!metasSemanales?.length && !metasMensuales?.length) {
    return NextResponse.json({ analytics: [], fecha: fechaStr, sinMetas: true })
  }

  // ── Rangos de consulta ───────────────────────────────────────────────────────

  const semanaActiva = metasSemanales?.[0]
    ? { inicio: metasSemanales[0].fecha_inicio, fin: metasSemanales[0].fecha_fin }
    : null

  const mesActivo = metasMensuales?.[0]
    ? { inicio: metasMensuales[0].fecha_inicio, fin: metasMensuales[0].fecha_fin }
    : null

  const clientes_ex = CLIENTES_EXCLUIR
  const selectFields = 'vendedor_actual, categoria_negocio, litros, nombre_fantasia, fecha_pedido, categoria_producto, producto'

  const [{ data: ventasMes }, { data: ventasSemana }, { data: ventasDia }] = await Promise.all([
    mesActivo
      ? supabase
          .from('ventas')
          .select(selectFields)
          .in('vendedor_actual', VENDEDORES)
          .gte('fecha_pedido', mesActivo.inicio)
          .lte('fecha_pedido', fechaStr)
          .not('nombre_fantasia', 'in', `(${clientes_ex.map(c => `"${c}"`).join(',')})`)
      : Promise.resolve({ data: [] as VentaAPI[] }),
    semanaActiva
      ? supabase
          .from('ventas')
          .select(selectFields)
          .in('vendedor_actual', VENDEDORES)
          .gte('fecha_pedido', semanaActiva.inicio)
          .lte('fecha_pedido', fechaStr)
          .not('nombre_fantasia', 'in', `(${clientes_ex.map(c => `"${c}"`).join(',')})`)
      : Promise.resolve({ data: [] as VentaAPI[] }),
    supabase
      .from('ventas')
      .select(selectFields)
      .in('vendedor_actual', VENDEDORES)
      .eq('fecha_pedido', fechaStr)
      .not('nombre_fantasia', 'in', `(${clientes_ex.map(c => `"${c}"`).join(',')})`),
  ])

  const vMesArr = (ventasMes ?? []) as VentaAPI[]
  const vSemArr = (ventasSemana ?? []) as VentaAPI[]
  const vDiaArr = (ventasDia ?? []) as VentaAPI[]

  // ── Productos a nivel equipo ─────────────────────────────────────────────────

  const productosMes     = computeProductos(vMesArr)
  const productosSemana  = computeProductos(vSemArr)
  const productosDia     = computeProductos(vDiaArr)

  // ── Analytics por vendedor ───────────────────────────────────────────────────

  const analytics: AnalyticsVendedor[] = VENDEDORES.map(vendedor => {
    const mSem = (metasSemanales ?? []).filter(m => m.vendedor === vendedor)
    const mMes = (metasMensuales ?? []).filter(m => m.vendedor === vendedor)

    const metaSemanalTotal = mSem.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
    const metaMensualTotal = mMes.reduce((s, m) => s + (m.meta_litros ?? 0), 0)

    const vMes = vMesArr.filter(v => v.vendedor_actual === vendedor)
    const vSem = vSemArr.filter(v => v.vendedor_actual === vendedor)

    const realizadoMes    = vMes.reduce((s, v) => s + (v.litros ?? 0), 0)
    const realizadoSemana = vSem.reduce((s, v) => s + (v.litros ?? 0), 0)

    const dhMes = mesActivo
      ? getDiasHabiles(new Date(mesActivo.inicio), new Date(mesActivo.fin + 'T23:59:59'))
      : []
    const dhSem = semanaActiva
      ? getDiasHabiles(new Date(semanaActiva.inicio), new Date(semanaActiva.fin + 'T23:59:59'))
      : []

    const diasHabilesMes     = dhMes.length
    const diasHabilesSemana  = dhSem.length
    const diasTranscurridosMes    = getDiasHabilesTranscurridos(dhMes, fechaRef)
    const diasTranscurridosSemana = getDiasHabilesTranscurridos(dhSem, fechaRef)
    const diasRestantesMes    = diasHabilesMes - diasTranscurridosMes
    const diasRestantesSemana = diasHabilesSemana - diasTranscurridosSemana

    const metaEsperadaMes    = getMetaEsperadaAFecha(metaMensualTotal, dhMes, fechaRef)
    const metaEsperadaSemana = getMetaEsperadaAFecha(metaSemanalTotal, dhSem, fechaRef)

    const faltanteMes    = Math.max(0, metaMensualTotal - realizadoMes)
    const faltanteSemana = Math.max(0, metaSemanalTotal - realizadoSemana)

    const semaforoMes    = getEstadoSemaforo(realizadoMes,    metaEsperadaMes)
    const semaforoSemana = getEstadoSemaforo(realizadoSemana, metaEsperadaSemana)

    const promedioNecesarioDiarioMes    = diasRestantesMes    > 0 ? faltanteMes    / diasRestantesMes    : 0
    const promedioNecesarioDiarioSemana = diasRestantesSemana > 0 ? faltanteSemana / diasRestantesSemana : 0

    const mensajeMes    = getMensajePredictivo(faltanteMes,    diasRestantesMes)
    const mensajeSemana = getMensajePredictivo(faltanteSemana, diasRestantesSemana)

    const semNum = mSem[0]?.semana_numero ?? 0
    const semanaLabel = semanaActiva
      ? `S${semNum} · ${semanaActiva.inicio.slice(8)} – ${semanaActiva.fin.slice(8)} ${mesActivo?.inicio.slice(5, 7) === '05' ? 'May' : mesActivo?.inicio.slice(5, 7) === '06' ? 'Jun' : 'Jul'}`
      : ''

    const allCanales = [...new Set([
      ...mMes.map(m => m.categoria_negocio),
      ...mSem.map(m => m.categoria_negocio),
    ])]

    const porCanal: AnalyticsCanal[] = allCanales.map(canal => {
      const metaMes = mMes.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
      const metaSem = mSem.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
      const realMes  = vMes.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
      const realSem  = vSem.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
      const metaEspMes = getMetaEsperadaAFecha(metaMes, dhMes, fechaRef)
      const metaEspSem = getMetaEsperadaAFecha(metaSem, dhSem, fechaRef)
      return {
        canal,
        metaMensual: metaMes, metaSemanal: metaSem,
        realizadoMes: realMes, realizadoSemana: realSem,
        metaEsperadaMes: metaEspMes, metaEsperadaSemana: metaEspSem,
        pctMes: calcularCumplimiento(realMes, metaMes),
        pctSemana: calcularCumplimiento(realSem, metaSem),
        semaforoMes: getEstadoSemaforo(realMes, metaEspMes),
        semaforoSemana: getEstadoSemaforo(realSem, metaEspSem),
      }
    }).sort((a, b) => b.metaMensual - a.metaMensual)

    const vDia       = vDiaArr.filter(v => v.vendedor_actual === vendedor)
    const realizadoHoy = vDia.reduce((s, v) => s + (v.litros ?? 0), 0)
    const porCanalHoy  = allCanales.map(canal => ({
      canal,
      realHoy: vDia.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0),
    }))

    const ventasDiariasRaw = vMes
      .filter(v => v.fecha_pedido)
      .map(v => ({ fecha: v.fecha_pedido as string, litros: v.litros ?? 0 }))

    return {
      vendedor,
      fecha: fechaStr,
      metaMensual: metaMensualTotal,
      realizadoMes,
      metaEsperadaMes,
      pctCumplimientoMes: calcularCumplimiento(realizadoMes, metaMensualTotal),
      semaforoMes,
      diasHabilesMes, diasTranscurridosMes, diasRestantesMes,
      faltanteMes, promedioNecesarioDiarioMes, mensajeMes,
      semanaLabel,
      metaSemanal: metaSemanalTotal,
      realizadoSemana,
      metaEsperadaSemana,
      pctCumplimientoSemana: calcularCumplimiento(realizadoSemana, metaSemanalTotal),
      semaforoSemana,
      diasHabilesSemana, diasTranscurridosSemana, diasRestantesSemana,
      faltanteSemana, promedioNecesarioDiarioSemana, mensajeSemana,
      porCanal,
      realizadoHoy,
      porCanalHoy,
      ventasDiariasRaw,
    }
  })

  return NextResponse.json({
    analytics,
    fecha: fechaStr,
    sinMetas: false,
    productosMes,
    productosSemana,
    productosDia,
  })
}
