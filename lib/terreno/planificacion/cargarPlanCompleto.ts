import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { politicaVigente, politicaPorId } from './politicaVigente'
import { calcularPresupuestoSemana } from './calcularPresupuestoSemana'
import type { DiaPresupuesto, PoliticaGastos, ResultadoSemana } from './types'

export interface PlanSemanalRow {
  id: string
  vendedor_id: string
  semana_lunes: string
  estado_plan: string
  version_actual: number
  politica_gastos_id: string | null
  fecha_limite_presentacion: string
  presentado_at: string | null
  monto_solicitado_km: number | null
  monto_solicitado_peajes: number | null
  monto_solicitado_comidas: number | null
  monto_solicitado_total: number | null
  monto_aprobado_km: number | null
  monto_aprobado_peajes: number | null
  monto_aprobado_comidas: number | null
  monto_aprobado_total: number | null
  monto_alojamiento_estimado: number | null
  fondo_estado: string
  rendicion_estado: string
}

export interface PlanDiaRow {
  id: string
  plan_id: string
  fecha: string
  jornada_tipo: string
  pernocta: boolean
  hotel_estimado_clp: number | null
  origen: string | null
  origen_lat: number | null
  origen_lng: number | null
  destino: string | null
  destino_lat: number | null
  destino_lng: number | null
  regreso_mismo_dia: boolean
  peajes_estimados_clp: number
  desayuno_incluido_alojamiento: boolean
  requiere_revision_comidas: boolean
}

export interface PlanParadaRow {
  id: string
  plan_dia_id: string
  cliente_id: number | null
  cliente_terreno_id: string | null
  orden: number
  objetivo_visita: string | null
  estado_calculo_ruta: string
  distancia_estimada_m: number | null
  visita_id: string | null
}

export interface PlanCompleto {
  plan: PlanSemanalRow
  dias: PlanDiaRow[]
  paradas: PlanParadaRow[]
  politica: PoliticaGastos | null
  presupuesto: ResultadoSemana | null
}

/**
 * Carga un plan con todo lo necesario para mostrarlo o para calcular su presupuesto en
 * vivo. Un solo lugar para esta lógica — la usan tanto el endpoint GET /[id] como la
 * página server-side de Planificación, para no mantener dos copias del mismo join.
 */
export async function cargarPlanCompleto(supabase: SupabaseClient, planId: string): Promise<PlanCompleto | null> {
  const { data: plan } = await supabase.from('planes_semanales_terreno').select('*').eq('id', planId).maybeSingle()
  if (!plan) return null

  const { data: dias } = await supabase.from('plan_dias_terreno').select('*').eq('plan_id', planId).order('fecha', { ascending: true })
  const diaIds = (dias ?? []).map(d => d.id)

  const { data: paradas } = diaIds.length
    ? await supabase.from('plan_paradas_terreno').select('*').in('plan_dia_id', diaIds).order('orden', { ascending: true })
    : { data: [] }

  const { data: rutasVigentes } = diaIds.length
    ? await supabase.from('plan_ruta_calculos_terreno').select('plan_dia_id, distancia_total_m').in('plan_dia_id', diaIds).eq('vigente', true)
    : { data: [] }
  const kmPorDia = new Map((rutasVigentes ?? []).map(r => [r.plan_dia_id, r.distancia_total_m as number]))

  const paradasPorDia = new Map<string, number>()
  for (const p of paradas ?? []) paradasPorDia.set(p.plan_dia_id, (paradasPorDia.get(p.plan_dia_id) ?? 0) + 1)

  const politica = plan.politica_gastos_id
    ? await politicaPorId(supabase, plan.politica_gastos_id)
    : await politicaVigente(supabase, plan.semana_lunes)

  let presupuesto: ResultadoSemana | null = null
  if (politica && dias?.length) {
    const diasCalculo: DiaPresupuesto[] = dias.map(d => ({
      id: d.id, fecha: d.fecha, pernocta: d.pernocta, regreso_mismo_dia: d.regreso_mismo_dia,
      desayuno_incluido_alojamiento: d.desayuno_incluido_alojamiento, hotel_estimado_clp: d.hotel_estimado_clp,
      peajes_estimados_clp: d.peajes_estimados_clp, km_pagable_m: kmPorDia.get(d.id) ?? null,
      requiere_revision_comidas: d.requiere_revision_comidas, cantidad_paradas: paradasPorDia.get(d.id) ?? 0,
    }))
    presupuesto = calcularPresupuestoSemana(diasCalculo, politica)
  }

  return {
    plan: plan as PlanSemanalRow,
    dias: (dias ?? []) as PlanDiaRow[],
    paradas: (paradas ?? []) as PlanParadaRow[],
    politica,
    presupuesto,
  }
}
