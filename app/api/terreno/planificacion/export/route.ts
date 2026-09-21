import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { filaSegura } from '@/lib/terreno/planificacion/exportSanitize'

export const runtime = 'nodejs'

/**
 * GET /api/terreno/planificacion/export?semana=YYYY-MM-DD&vendedor_id=... — Excel de 7
 * hojas (punto 11 del prompt original). Server-side (no el patrón client-side de
 * ReportesClient.tsx): acá se mueven pagos y datos de todo el equipo, no el detalle de
 * un vendedor a la vez, y conviene no armar el archivo completo en el navegador.
 * Trae TODOS los registros del filtro, no una página — cada hoja es una consulta acotada
 * por semana (+ vendedor opcional), no por límite de UI.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: actor } = await supabase
    .from('users')
    .select('is_admin, puede_aprobar_planificacion_terreno, puede_pagar_planificacion_terreno')
    .eq('id', user.id).maybeSingle()
  if (!actor?.is_admin && !actor?.puede_aprobar_planificacion_terreno && !actor?.puede_pagar_planificacion_terreno) {
    return NextResponse.json({ error: 'No tienes permiso para exportar planificación de terreno' }, { status: 403 })
  }

  const semana = req.nextUrl.searchParams.get('semana')
  const vendedorId = req.nextUrl.searchParams.get('vendedor_id')
  if (!semana) return NextResponse.json({ error: 'semana (YYYY-MM-DD, lunes) es obligatorio' }, { status: 400 })

  let query = supabase.from('planes_semanales_terreno').select('*').eq('semana_lunes', semana)
  if (vendedorId) query = query.eq('vendedor_id', vendedorId)
  const { data: planes } = await query
  const planIds = (planes ?? []).map(p => p.id)

  if (planIds.length === 0) {
    return NextResponse.json({ error: `No hay planes para la semana ${semana}${vendedorId ? ' de ese vendedor' : ''}` }, { status: 404 })
  }

  const vendedorIds = Array.from(new Set((planes ?? []).map(p => p.vendedor_id)))
  const { data: vendedores } = await supabase.from('users').select('id, nombre').in('id', vendedorIds)
  const nombreVendedor = new Map((vendedores ?? []).map(v => [v.id, v.nombre as string]))

  const { data: dias } = await supabase.from('plan_dias_terreno').select('*').in('plan_id', planIds).order('fecha', { ascending: true })
  const diaIds = (dias ?? []).map(d => d.id)
  const planPorDia = new Map((dias ?? []).map(d => [d.id, d.plan_id as string]))

  const { data: paradas } = diaIds.length
    ? await supabase.from('plan_paradas_terreno').select('*').in('plan_dia_id', diaIds).order('orden', { ascending: true })
    : { data: [] }

  const { data: rutas } = diaIds.length
    ? await supabase.from('plan_ruta_calculos_terreno').select('plan_dia_id, distancia_total_m').in('plan_dia_id', diaIds).eq('vigente', true)
    : { data: [] }
  const kmPorDia = new Map((rutas ?? []).map(r => [r.plan_dia_id, r.distancia_total_m as number]))

  const visitaIds = (paradas ?? []).map(p => p.visita_id).filter((v): v is string => !!v)
  const { data: visitas } = visitaIds.length
    ? await supabase.from('visitas_terreno').select('*').in('id', visitaIds)
    : { data: [] }
  const visitaPorId = new Map((visitas ?? []).map(v => [v.id, v]))

  const { data: rendiciones } = await supabase.from('plan_rendiciones_terreno').select('*').in('plan_id', planIds)
  const rendicionIds = (rendiciones ?? []).map(r => r.id)
  const { data: rendicionItems } = rendicionIds.length
    ? await supabase.from('plan_rendicion_items_terreno').select('*').in('rendicion_id', rendicionIds)
    : { data: [] }
  const rendicionPorPlan = new Map((rendiciones ?? []).map(r => [r.plan_id as string, r]))

  const { data: fondos } = await supabase.from('plan_fondos_terreno').select('*').in('plan_id', planIds).order('entregado_at', { ascending: true })

  const { data: vinculos } = visitaIds.length
    ? await supabase.from('plan_venta_visita_links_terreno').select('*').in('visita_id', visitaIds)
    : { data: [] }
  const ventaIds = (vinculos ?? []).map(v => v.venta_id)
  const { data: ventas } = ventaIds.length
    ? await supabase.from('ventas').select('id, fecha_pedido, nombre_fantasia, total_sin_impuesto, numero_factura, entregado').in('id', ventaIds)
    : { data: [] }
  const ventaPorId = new Map((ventas ?? []).map(v => [v.id, v]))

  const { data: aprobaciones } = await supabase.from('plan_aprobaciones_terreno').select('*').in('plan_id', planIds).order('created_at', { ascending: true })
  const { data: versiones } = await supabase.from('plan_versiones_terreno').select('id, plan_id, numero_version, motivo, creado_por, created_at').in('plan_id', planIds).order('numero_version', { ascending: true })

  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  agregarHoja(XLSX, wb, 'Resumen vendedores', construirResumenVendedores({
    planes: planes ?? [], nombreVendedor, dias: dias ?? [], paradas: paradas ?? [], kmPorDia,
    visitaPorId, fondos: fondos ?? [], rendicionPorPlan, vinculos: vinculos ?? [],
  }))
  agregarHoja(XLSX, wb, 'Plan diario', construirPlanDiario({ dias: dias ?? [], paradas: paradas ?? [], kmPorDia, planes: planes ?? [], nombreVendedor }))
  agregarHoja(XLSX, wb, 'Visitas y resultados', construirVisitasResultados({ paradas: paradas ?? [], visitaPorId, planPorDia, planes: planes ?? [], nombreVendedor }))
  agregarHoja(XLSX, wb, 'Gastos y rendición', construirGastosRendicion({ rendiciones: rendiciones ?? [], rendicionItems: rendicionItems ?? [], planes: planes ?? [], nombreVendedor }))
  agregarHoja(XLSX, wb, 'Pagos al vendedor', construirPagos({ fondos: fondos ?? [], planes: planes ?? [], nombreVendedor }))
  agregarHoja(XLSX, wb, 'Ventas y cobros', construirVentasCobros({ vinculos: vinculos ?? [], ventaPorId, visitaPorId }))
  agregarHoja(XLSX, wb, 'Aprobaciones e historial', construirAprobaciones({ aprobaciones: aprobaciones ?? [], versiones: versiones ?? [], planes: planes ?? [], nombreVendedor }))

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const nombreArchivo = `planificacion_terreno_${semana}${vendedorId ? `_${vendedorId.slice(0, 8)}` : ''}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function agregarHoja(XLSX: any, wb: any, nombre: string, filas: Record<string, unknown>[]) {
  const hoja = XLSX.utils.json_to_sheet(filas.length ? filas.map(filaSegura) : [{ 'Sin datos': 'Sin registros para este filtro' }])
  hoja['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, hoja, nombre.slice(0, 31))
}

interface PlanRow {
  id: string; vendedor_id: string; semana_lunes: string; estado_plan: string
  monto_solicitado_total: number | null; monto_aprobado_km: number | null; monto_aprobado_total: number | null
  rendicion_estado: string
}
interface DiaRow { id: string; plan_id: string; fecha: string; jornada_tipo: string; peajes_estimados_clp: number }
interface ParadaRow {
  id: string; plan_dia_id: string; cliente_id: number | null; cliente_terreno_id: string | null
  orden: number; objetivo_visita: string | null; estado_calculo_ruta: string; visita_id: string | null
}
interface VisitaRow {
  id: string; estado: string; estado_presencia: string | null; resultado_visita: string | null
  motivo_sin_venta: string | null; proximo_paso: string | null; completada_at: string | null; cliente_nombre: string
}
interface FondoRow { id: string; plan_id: string; tipo: string; monto_entregado_clp: number; entregado_at: string; metodo: string | null; referencia_pago: string | null; comprobante_url: string | null }
interface RendicionRow { id: string; plan_id: string; estado: string }
interface RendicionItemRow { id: string; rendicion_id: string; tipo: string; monto_clp: number; comprobante_url: string | null; estado: string; comentario_observacion: string | null }
interface VinculoRow { visita_id: string; venta_id: number; tipo_vinculo: string; score_heuristica: number | null; criterio: string | null }
interface VentaRow { id: number; fecha_pedido: string; nombre_fantasia: string; total_sin_impuesto: number; numero_factura: string | null; entregado: boolean | null }
interface AprobacionRow { plan_id: string; version_evaluada: number; decision: string; monto_aprobado_total: number | null; comentario: string | null; created_at: string }
interface VersionRow { plan_id: string; numero_version: number; motivo: string | null; created_at: string }

function construirResumenVendedores(args: {
  planes: PlanRow[]; nombreVendedor: Map<string, string>; dias: DiaRow[]; paradas: ParadaRow[]
  kmPorDia: Map<string, number>; visitaPorId: Map<string, VisitaRow>; fondos: FondoRow[]; rendicionPorPlan: Map<string, RendicionRow>
  vinculos: VinculoRow[]
}) {
  return args.planes.map(p => {
    const diasDelPlan = args.dias.filter(d => d.plan_id === p.id)
    const diaIds = new Set(diasDelPlan.map(d => d.id))
    const paradasDelPlan = args.paradas.filter(pa => diaIds.has(pa.plan_dia_id))
    const planificadas = paradasDelPlan.length
    const realizadas = paradasDelPlan.filter(pa => pa.visita_id).length
    const kmAprobado = diasDelPlan.reduce((s, d) => s + (args.kmPorDia.get(d.id) ?? 0), 0) / 1000
    const fondosDelPlan = args.fondos.filter(f => f.plan_id === p.id)
    const entregado = fondosDelPlan.reduce((s, f) => s + f.monto_entregado_clp, 0)
    const conVenta = paradasDelPlan.filter(pa => pa.visita_id && args.vinculos.some(v => v.visita_id === pa.visita_id && v.tipo_vinculo === 'confirmado')).length

    return {
      Vendedor: args.nombreVendedor.get(p.vendedor_id) ?? p.vendedor_id,
      Semana: p.semana_lunes,
      Estado: p.estado_plan,
      'Visitas planificadas': planificadas,
      'Visitas realizadas': realizadas,
      'Cumplimiento %': planificadas > 0 ? Math.round((realizadas / planificadas) * 100) : null,
      'Km aprobados': p.monto_aprobado_km != null ? Math.round(kmAprobado) : null,
      'Monto solicitado': p.monto_solicitado_total,
      'Monto aprobado': p.monto_aprobado_total,
      'Monto entregado': entregado,
      'Estado rendición': args.rendicionPorPlan.get(p.id)?.estado ?? p.rendicion_estado,
      'Visitas con venta confirmada': conVenta,
      'Conversión %': realizadas > 0 ? Math.round((conVenta / realizadas) * 100) : null,
    }
  })
}

function construirPlanDiario(args: { dias: DiaRow[]; paradas: ParadaRow[]; kmPorDia: Map<string, number>; planes: PlanRow[]; nombreVendedor: Map<string, string> }) {
  const planPorId = new Map(args.planes.map(p => [p.id, p]))
  const filas: Record<string, unknown>[] = []
  for (const d of args.dias) {
    const plan = planPorId.get(d.plan_id)
    const paradasDia = args.paradas.filter(p => p.plan_dia_id === d.id)
    if (paradasDia.length === 0) {
      filas.push({
        'ID plan': d.plan_id, 'ID día': d.id, Vendedor: plan ? args.nombreVendedor.get(plan.vendedor_id) : '', Fecha: d.fecha,
        Actividad: d.jornada_tipo, Cliente: null, Objetivo: null, Orden: null,
        'Km del día': args.kmPorDia.get(d.id) != null ? (args.kmPorDia.get(d.id)! / 1000) : null,
        'Peajes CLP': d.peajes_estimados_clp, Estado: plan?.estado_plan,
      })
      continue
    }
    for (const p of paradasDia) {
      filas.push({
        'ID plan': d.plan_id, 'ID día': d.id, Vendedor: plan ? args.nombreVendedor.get(plan.vendedor_id) : '', Fecha: d.fecha,
        Actividad: d.jornada_tipo, 'ID parada': p.id, 'Cliente (id)': p.cliente_id ?? p.cliente_terreno_id,
        Objetivo: p.objetivo_visita, Orden: p.orden,
        'Km del día': args.kmPorDia.get(d.id) != null ? (args.kmPorDia.get(d.id)! / 1000) : null,
        'Peajes CLP': d.peajes_estimados_clp,
        'Estado ruta': p.estado_calculo_ruta, Estado: plan?.estado_plan,
      })
    }
  }
  return filas
}

function construirVisitasResultados(args: { paradas: ParadaRow[]; visitaPorId: Map<string, VisitaRow>; planPorDia: Map<string, string>; planes: PlanRow[]; nombreVendedor: Map<string, string> }) {
  const planPorId = new Map(args.planes.map(p => [p.id, p]))
  return args.paradas.map(p => {
    const planId = args.planPorDia.get(p.plan_dia_id)
    const plan = planId ? planPorId.get(planId) : null
    const visita = p.visita_id ? args.visitaPorId.get(p.visita_id) : null
    return {
      Vendedor: plan ? args.nombreVendedor.get(plan.vendedor_id) : '',
      'ID parada': p.id,
      Prevista: true,
      Realizada: !!visita,
      Estado: visita?.estado ?? 'no_realizada',
      'Estado presencia': visita?.estado_presencia ?? null,
      Resultado: visita?.resultado_visita ?? null,
      'Motivo sin venta': visita?.motivo_sin_venta ?? null,
      'Próximo paso': visita?.proximo_paso ?? null,
      'Fecha corte': visita?.completada_at ?? null,
    }
  })
}

function construirGastosRendicion(args: { rendiciones: RendicionRow[]; rendicionItems: RendicionItemRow[]; planes: PlanRow[]; nombreVendedor: Map<string, string> }) {
  const planPorId = new Map(args.planes.map(p => [p.id, p]))
  return args.rendicionItems.map(it => {
    const rendicion = args.rendiciones.find(r => r.id === it.rendicion_id)
    const plan = rendicion ? planPorId.get(rendicion.plan_id) : null
    return {
      Vendedor: plan ? args.nombreVendedor.get(plan.vendedor_id) : '',
      Semana: plan?.semana_lunes,
      Concepto: it.tipo,
      'Monto declarado': it.monto_clp,
      'Comprobante': it.comprobante_url ? 'Sí' : 'No',
      Estado: it.estado,
      Observación: it.comentario_observacion,
    }
  })
}

function construirPagos(args: { fondos: FondoRow[]; planes: PlanRow[]; nombreVendedor: Map<string, string> }) {
  const planPorId = new Map(args.planes.map(p => [p.id, p]))
  return args.fondos.map(f => {
    const plan = planPorId.get(f.plan_id)
    return {
      Vendedor: plan ? args.nombreVendedor.get(plan.vendedor_id) : '',
      Semana: plan?.semana_lunes,
      Tipo: f.tipo,
      Monto: f.monto_entregado_clp,
      Fecha: f.entregado_at,
      Método: f.metodo,
      Referencia: f.referencia_pago,
      Comprobante: f.comprobante_url ? 'Sí' : 'No',
    }
  })
}

function construirVentasCobros(args: { vinculos: VinculoRow[]; ventaPorId: Map<number, VentaRow>; visitaPorId: Map<string, VisitaRow> }) {
  return args.vinculos.map(v => {
    const venta = args.ventaPorId.get(v.venta_id)
    const visita = args.visitaPorId.get(v.visita_id)
    return {
      'ID venta': v.venta_id,
      'ID visita': v.visita_id,
      Cliente: venta?.nombre_fantasia ?? visita?.cliente_nombre,
      'Fecha venta': venta?.fecha_pedido,
      'Monto neto': venta?.total_sin_impuesto,
      'N° factura': venta?.numero_factura,
      Entregado: venta?.entregado,
      'Tipo de vínculo': v.tipo_vinculo,
      'Score heurística': v.score_heuristica,
      Criterio: v.criterio,
    }
  })
}

function construirAprobaciones(args: { aprobaciones: AprobacionRow[]; versiones: VersionRow[]; planes: PlanRow[]; nombreVendedor: Map<string, string> }) {
  const planPorId = new Map(args.planes.map(p => [p.id, p]))
  const filasAprobaciones = args.aprobaciones.map(a => {
    const plan = planPorId.get(a.plan_id)
    return {
      Vendedor: plan ? args.nombreVendedor.get(plan.vendedor_id) : '',
      Semana: plan?.semana_lunes,
      Tipo: 'decision',
      Versión: a.version_evaluada,
      Decisión: a.decision,
      Monto: a.monto_aprobado_total,
      Comentario: a.comentario,
      Fecha: a.created_at,
    }
  })
  const filasVersiones = args.versiones.map(v => {
    const plan = planPorId.get(v.plan_id)
    return {
      Vendedor: plan ? args.nombreVendedor.get(plan.vendedor_id) : '',
      Semana: plan?.semana_lunes,
      Tipo: 'version',
      Versión: v.numero_version,
      Decisión: v.motivo,
      Monto: null,
      Comentario: null,
      Fecha: v.created_at,
    }
  })
  return [...filasVersiones, ...filasAprobaciones].sort((a, b) => String(a.Fecha).localeCompare(String(b.Fecha)))
}
