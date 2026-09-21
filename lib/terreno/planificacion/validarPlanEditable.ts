import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const ESTADOS_PLAN_EDITABLES = ['borrador', 'devuelto']

/**
 * Confirma que `userId` es dueño del plan y que está en un estado editable
 * (borrador/devuelto). RLS ya impide tocar el plan de otro vendedor; esto agrega la
 * regla de ESTADO, que la política de RLS no puede expresar sin duplicar toda esta
 * lógica en SQL — se valida acá, en la API, una sola vez por endpoint.
 */
export async function validarPlanEditable(supabase: SupabaseClient, planId: string, userId: string) {
  const { data: plan } = await supabase
    .from('planes_semanales_terreno')
    .select('id, vendedor_id, estado_plan')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { error: NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 }) }
  if (plan.vendedor_id !== userId) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  if (!ESTADOS_PLAN_EDITABLES.includes(plan.estado_plan)) {
    return { error: NextResponse.json({ error: `El plan está en estado "${plan.estado_plan}" y no se puede editar` }, { status: 400 }) }
  }
  return { plan }
}
