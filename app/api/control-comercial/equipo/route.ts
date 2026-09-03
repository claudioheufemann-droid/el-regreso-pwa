import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial, puedeVerCostosControlComercial } from '@/lib/control-comercial/permisos'
import { periodoActual, periodoPorAncla, comparacionAnioAnterior } from '@/lib/control-comercial/periodos'

export const dynamic = 'force-dynamic'

interface FilaEquipo {
  territorio: string; tipo: string; venta_clp: number; litros: number
  clientes_activos: number; clientes_nuevos: number; clientes_perdidos: number
  ambas_categorias: number; deuda_vencida: number; barriles_criticos: number; barriles_total: number
}

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const anio = Number(searchParams.get('anio')) || undefined
  const mes = Number(searchParams.get('mes')) || undefined
  const periodo = anio && mes ? periodoPorAncla(anio, mes) : periodoActual()
  const comparacion = comparacionAnioAnterior(periodo)

  const puedeVerMargen = puedeVerCostosControlComercial(user)

  const supabase = await createClient()
  const [actualRes, comparadoRes, periodoRowRes, territoriosRes, margenRpcRes] = await Promise.all([
    supabase.rpc('fn_equipo_resumen', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_equipo_resumen', { p_inicio: comparacion.comparado.inicio, p_fin: comparacion.comparado.fin }),
    supabase.from('periodos').select('id').eq('fecha_inicio', periodo.inicio).eq('fecha_fin', periodo.fin).maybeSingle(),
    supabase.from('territorios_responsables').select('territorio, responsable').is('vigente_hasta', null),
    puedeVerMargen
      ? supabase.rpc('fn_equipo_margen', { p_inicio: periodo.inicio, p_fin: periodo.fin })
      : Promise.resolve({ data: null, error: null }),
  ])

  if (actualRes.error) return NextResponse.json({ error: actualRes.error.message }, { status: 500 })

  let metas: { scope_value: string | null; valor_meta: number }[] = []
  if (periodoRowRes.data?.id) {
    const { data } = await supabase
      .from('metas_comerciales')
      .select('scope_value, valor_meta')
      .eq('periodo_id', periodoRowRes.data.id)
      .eq('scope_type', 'territorio')
      .eq('kpi_type', 'ventas_clp')
    metas = data ?? []
  }
  const metaPorTerritorio = new Map(metas.map(m => [m.scope_value, m.valor_meta]))
  const responsablePorTerritorio = new Map((territoriosRes.data ?? []).map(t => [t.territorio, t.responsable]))
  const comparadoPorTerritorio = new Map(((comparadoRes.data ?? []) as FilaEquipo[]).map(f => [f.territorio, f]))
  interface FilaMargen { territorio: string; venta_con_margen_conocido: number | null; venta_total: number; margen_clp: number | null }
  const margenPorTerritorio = new Map(((margenRpcRes.data ?? []) as FilaMargen[]).map(m => [m.territorio, m]))

  // Cuentas ERP sin territorio/responsable mapeado (bolsa histórica "Equipo Ventas",
  // "CERVECERÍA") — a pedido de Claudio no se muestran en Equipo ni en los reportes
  // que reutilizan este endpoint. No afecta los totales de compañía de Resumen/Ventas.
  const filas = ((actualRes.data ?? []) as FilaEquipo[]).filter(f => f.territorio !== 'Sin territorio asignado').map(f => {
    const comp = comparadoPorTerritorio.get(f.territorio)
    const meta = metaPorTerritorio.get(f.territorio) ?? null
    const margen = margenPorTerritorio.get(f.territorio) ?? null
    return {
      ...f,
      responsable: responsablePorTerritorio.get(f.territorio) ?? null,
      crecimientoYoyPct: comp && comp.venta_clp > 0 ? ((f.venta_clp - comp.venta_clp) / comp.venta_clp) * 100 : null,
      cumplimientoMetaPct: meta ? (f.venta_clp / meta) * 100 : null,
      retencionPct: f.clientes_activos > 0 ? ((f.clientes_activos - f.clientes_nuevos) / f.clientes_activos) * 100 : null,
      penetracionMulticategoriaPct: f.clientes_activos > 0 ? (f.ambas_categorias / f.clientes_activos) * 100 : null,
      margenClp: margen?.margen_clp ?? null,
      margenPct: margen && margen.margen_clp !== null && margen.venta_con_margen_conocido ? (margen.margen_clp / margen.venta_con_margen_conocido) * 100 : null,
      margenCoberturaPct: margen && margen.venta_total > 0 ? ((margen.venta_con_margen_conocido ?? 0) / margen.venta_total) * 100 : null,
    }
  }).sort((a, b) => b.venta_clp - a.venta_clp)

  return NextResponse.json({
    periodo: { nombre: periodo.nombre, inicio: periodo.inicio, fin: periodo.fin },
    filas,
    puedeVerMargen,
  })
}
