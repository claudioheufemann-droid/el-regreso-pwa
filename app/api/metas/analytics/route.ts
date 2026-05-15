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

  // ── Obtener metas semanales y mensuales activas para la fecha dada ──────────

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

  // ── Determinar rangos de consulta ────────────────────────────────────────────

  // Semana activa (tomada de las metas semanales, primer resultado)
  const semanaActiva = metasSemanales?.[0]
    ? { inicio: metasSemanales[0].fecha_inicio, fin: metasSemanales[0].fecha_fin }
    : null

  // Mes activo (tomado de metas mensuales)
  const mesActivo = metasMensuales?.[0]
    ? { inicio: metasMensuales[0].fecha_inicio, fin: metasMensuales[0].fecha_fin }
    : null

  // ── Consultar ventas del período y la semana ─────────────────────────────────

  const clientes_ex = CLIENTES_EXCLUIR

  const [{ data: ventasMes }, { data: ventasSemana }] = await Promise.all([
    mesActivo
      ? supabase
          .from('ventas')
          .select('vendedor_actual, categoria_negocio, litros, nombre_fantasia')
          .in('vendedor_actual', VENDEDORES)
          .gte('fecha_pedido', mesActivo.inicio)
          .lte('fecha_pedido', fechaStr)
          .not('nombre_fantasia', 'in', `(${clientes_ex.map(c => `"${c}"`).join(',')})`)
      : Promise.resolve({ data: [] }),
    semanaActiva
      ? supabase
          .from('ventas')
          .select('vendedor_actual, categoria_negocio, litros, nombre_fantasia')
          .in('vendedor_actual', VENDEDORES)
          .gte('fecha_pedido', semanaActiva.inicio)
          .lte('fecha_pedido', fechaStr)
          .not('nombre_fantasia', 'in', `(${clientes_ex.map(c => `"${c}"`).join(',')})`)
      : Promise.resolve({ data: [] }),
  ])

  // ── Calcular analytics por vendedor ──────────────────────────────────────────

  const analytics: AnalyticsVendedor[] = VENDEDORES.map(vendedor => {
    // Metas del vendedor
    const mSem = (metasSemanales ?? []).filter(m => m.vendedor === vendedor)
    const mMes = (metasMensuales ?? []).filter(m => m.vendedor === vendedor)

    const metaSemanalTotal = mSem.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
    const metaMensualTotal = mMes.reduce((s, m) => s + (m.meta_litros ?? 0), 0)

    // Ventas del vendedor
    const vMes = (ventasMes ?? []).filter(v => v.vendedor_actual === vendedor)
    const vSem = (ventasSemana ?? []).filter(v => v.vendedor_actual === vendedor)

    const realizadoMes = vMes.reduce((s, v) => s + (v.litros ?? 0), 0)
    const realizadoSemana = vSem.reduce((s, v) => s + (v.litros ?? 0), 0)

    // Días hábiles
    const dhMes = mesActivo
      ? getDiasHabiles(new Date(mesActivo.inicio), new Date(mesActivo.fin + 'T23:59:59'))
      : []
    const dhSem = semanaActiva
      ? getDiasHabiles(new Date(semanaActiva.inicio), new Date(semanaActiva.fin + 'T23:59:59'))
      : []

    const diasHabilesMes = dhMes.length
    const diasHabilesSemana = dhSem.length
    const diasTranscurridosMes = getDiasHabilesTranscurridos(dhMes, fechaRef)
    const diasTranscurridosSemana = getDiasHabilesTranscurridos(dhSem, fechaRef)
    const diasRestantesMes = diasHabilesMes - diasTranscurridosMes
    const diasRestantesSemana = diasHabilesSemana - diasTranscurridosSemana

    // Meta esperada a la fecha
    const metaEsperadaMes = getMetaEsperadaAFecha(metaMensualTotal, dhMes, fechaRef)
    const metaEsperadaSemana = getMetaEsperadaAFecha(metaSemanalTotal, dhSem, fechaRef)

    // Faltante
    const faltanteMes = Math.max(0, metaMensualTotal - realizadoMes)
    const faltanteSemana = Math.max(0, metaSemanalTotal - realizadoSemana)

    // Semáforo
    const semaforoMes = getEstadoSemaforo(realizadoMes, metaEsperadaMes)
    const semaforoSemana = getEstadoSemaforo(realizadoSemana, metaEsperadaSemana)

    // Promedio diario necesario
    const promedioNecesarioDiarioMes = diasRestantesMes > 0 ? faltanteMes / diasRestantesMes : 0
    const promedioNecesarioDiarioSemana = diasRestantesSemana > 0 ? faltanteSemana / diasRestantesSemana : 0

    // Mensajes predictivos
    const mensajeMes = getMensajePredictivo(faltanteMes, diasRestantesMes)
    const mensajeSemana = getMensajePredictivo(faltanteSemana, diasRestantesSemana)

    // Semana label
    const semNum = mSem[0]?.semana_numero ?? 0
    const semanaLabel = semanaActiva
      ? `S${semNum} · ${semanaActiva.inicio.slice(8)} – ${semanaActiva.fin.slice(8)} ${mesActivo?.inicio.slice(5, 7) === '05' ? 'May' : mesActivo?.inicio.slice(5, 7) === '06' ? 'Jun' : 'Jul'}`
      : ''

    // Analytics por canal
    const allCanales = [...new Set([
      ...mMes.map(m => m.categoria_negocio),
      ...mSem.map(m => m.categoria_negocio),
    ])]

    const porCanal: AnalyticsCanal[] = allCanales.map(canal => {
      const metaMes = mMes.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
      const metaSem = mSem.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0

      const realMes = vMes
        .filter(v => v.categoria_negocio === canal)
        .reduce((s, v) => s + (v.litros ?? 0), 0)
      const realSem = vSem
        .filter(v => v.categoria_negocio === canal)
        .reduce((s, v) => s + (v.litros ?? 0), 0)

      const metaEspMes = getMetaEsperadaAFecha(metaMes, dhMes, fechaRef)
      const metaEspSem = getMetaEsperadaAFecha(metaSem, dhSem, fechaRef)

      return {
        canal,
        metaMensual: metaMes,
        metaSemanal: metaSem,
        realizadoMes: realMes,
        realizadoSemana: realSem,
        metaEsperadaMes: metaEspMes,
        metaEsperadaSemana: metaEspSem,
        pctMes: calcularCumplimiento(realMes, metaMes),
        pctSemana: calcularCumplimiento(realSem, metaSem),
        semaforoMes: getEstadoSemaforo(realMes, metaEspMes),
        semaforoSemana: getEstadoSemaforo(realSem, metaEspSem),
      }
    }).sort((a, b) => b.metaMensual - a.metaMensual)

    return {
      vendedor,
      fecha: fechaStr,
      metaMensual: metaMensualTotal,
      realizadoMes,
      metaEsperadaMes,
      pctCumplimientoMes: calcularCumplimiento(realizadoMes, metaMensualTotal),
      semaforoMes,
      diasHabilesMes,
      diasTranscurridosMes,
      diasRestantesMes,
      faltanteMes,
      promedioNecesarioDiarioMes,
      mensajeMes,
      semanaLabel,
      metaSemanal: metaSemanalTotal,
      realizadoSemana,
      metaEsperadaSemana,
      pctCumplimientoSemana: calcularCumplimiento(realizadoSemana, metaSemanalTotal),
      semaforoSemana,
      diasHabilesSemana,
      diasTranscurridosSemana,
      diasRestantesSemana,
      faltanteSemana,
      promedioNecesarioDiarioSemana,
      mensajeSemana,
      porCanal,
    }
  })

  return NextResponse.json({ analytics, fecha: fechaStr, sinMetas: false })
}
