import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PoliticaGastos } from './types'

/**
 * Política de gastos vigente para una fecha dada. Nunca hardcodear tarifas/montos en la
 * app — todo se lee de acá. Una semana ya aprobada NO vuelve a llamar esto: usa la
 * política congelada en planes_semanales_terreno.politica_gastos_id.
 */
export async function politicaVigente(
  supabase: SupabaseClient,
  fechaISO: string,
): Promise<PoliticaGastos | null> {
  const { data, error } = await supabase
    .from('politicas_gastos_terreno')
    .select('*')
    .eq('activa', true)
    .lte('vigente_desde', fechaISO)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${fechaISO}`)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la política de gastos vigente: ${error.message}`)
  return data as PoliticaGastos | null
}

export async function politicaPorId(
  supabase: SupabaseClient,
  id: string,
): Promise<PoliticaGastos | null> {
  const { data, error } = await supabase
    .from('politicas_gastos_terreno')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la política de gastos: ${error.message}`)
  return data as PoliticaGastos | null
}
