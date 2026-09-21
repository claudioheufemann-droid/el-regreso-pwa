import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Ventana de días (antes/después de completada_at) para sugerir una venta como posible resultado de una visita. Configurable acá, no fija en el código de cada llamador. */
const VENTANA_DIAS = 5

export interface SugerenciaVentaVisita {
  visitaId: string
  ventaId: number
  scoreHeuristica: number
  criterio: string
}

/**
 * Sugiere vínculos venta↔visita para las visitas con resultado comercial de un plan
 * (tiene_venta=true o resultado_visita='pedido_confirmado') que todavía no tienen ningún
 * vínculo. NUNCA confirma nada — sólo propone (tipo_vinculo='sugerido' al insertar). El
 * match es por mismo nombre de cliente + ventana de fechas; es una propuesta, no una
 * atribución: la prohibición explícita del prompt es asumir causalidad sólo por cercanía
 * de fecha, por eso esto no reemplaza la confirmación manual.
 */
export async function sugerirVinculosDelPlan(supabase: SupabaseClient, planId: string): Promise<SugerenciaVentaVisita[]> {
  // plan_paradas_terreno no tiene plan_id directo — se filtra por plan_dias_terreno.
  const { data: dias } = await supabase.from('plan_dias_terreno').select('id').eq('plan_id', planId)
  const diaIds = new Set((dias ?? []).map(d => d.id))
  const { data: paradasDelPlan } = diaIds.size
    ? await supabase.from('plan_paradas_terreno').select('visita_id').in('plan_dia_id', Array.from(diaIds)).not('visita_id', 'is', null)
    : { data: [] }
  const visitaIds = (paradasDelPlan ?? []).map(p => p.visita_id).filter((v): v is string => !!v)
  if (visitaIds.length === 0) return []

  const { data: visitas } = await supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, completada_at, tiene_venta, resultado_visita')
    .in('id', visitaIds)
    .or('tiene_venta.eq.true,resultado_visita.eq.pedido_confirmado')

  const { data: yaVinculadas } = await supabase.from('plan_venta_visita_links_terreno').select('visita_id')
  const visitasConVinculo = new Set((yaVinculadas ?? []).map(v => v.visita_id))

  const sugerencias: SugerenciaVentaVisita[] = []
  for (const visita of visitas ?? []) {
    if (visitasConVinculo.has(visita.id) || !visita.completada_at || !visita.cliente_nombre) continue

    const fecha = new Date(visita.completada_at)
    const desde = new Date(fecha.getTime() - VENTANA_DIAS * 86400000).toISOString().slice(0, 10)
    const hasta = new Date(fecha.getTime() + VENTANA_DIAS * 86400000).toISOString().slice(0, 10)

    const { data: ventasCandidatas } = await supabase
      .from('ventas')
      .select('id, fecha_pedido, total_sin_impuesto')
      .ilike('nombre_fantasia', visita.cliente_nombre)
      .gte('fecha_pedido', desde)
      .lte('fecha_pedido', hasta)
      .order('fecha_pedido', { ascending: true })
      .limit(5)

    for (const venta of ventasCandidatas ?? []) {
      const diasDif = Math.abs((new Date(venta.fecha_pedido).getTime() - fecha.getTime()) / 86400000)
      sugerencias.push({
        visitaId: visita.id,
        ventaId: venta.id,
        scoreHeuristica: Math.max(0, 1 - diasDif / VENTANA_DIAS),
        criterio: `mismo_nombre_cliente+ventana_${VENTANA_DIAS}d (Δ${diasDif.toFixed(1)}d)`,
      })
    }
  }
  return sugerencias
}
