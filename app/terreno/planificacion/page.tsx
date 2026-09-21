import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { semanaLunes, semanaSiguienteLunes, fechaLimitePresentacion } from '@/lib/terreno/planificacion/semana'
import { hoySantiagoISO } from '@/lib/terreno/tiempoChile'
import { cargarPlanCompleto } from '@/lib/terreno/planificacion/cargarPlanCompleto'
import PlanificacionClient from './PlanificacionClient'

export const dynamic = 'force-dynamic'

// GET /terreno/planificacion?semana=YYYY-MM-DD — "Mi semana". Sin parámetro: la semana
// siguiente (la que se presenta el viernes). El plan de esa semana se crea acá mismo si
// todavía no existe (mismo comportamiento que POST /api/terreno/planificacion), así el
// cliente siempre recibe un plan real para editar, nunca un estado "sin plan" ambiguo.
export default async function PlanificacionPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { semana: semanaParam } = await searchParams
  const semana = semanaParam && semanaParam === semanaLunes(semanaParam)
    ? semanaParam
    : semanaSiguienteLunes(hoySantiagoISO())

  const supabase = await createClient()

  let { data: plan } = await supabase
    .from('planes_semanales_terreno')
    .select('id')
    .eq('vendedor_id', user.id)
    .eq('semana_lunes', semana)
    .maybeSingle()

  if (!plan) {
    const { data: creado, error } = await supabase
      .from('planes_semanales_terreno')
      .insert({
        vendedor_id: user.id,
        created_by: user.id,
        semana_lunes: semana,
        fecha_limite_presentacion: fechaLimitePresentacion(semana),
      })
      .select('id')
      .single()
    if (error) throw new Error(`No se pudo crear el plan de la semana: ${error.message}`)
    plan = creado
  }

  const completo = await cargarPlanCompleto(supabase, plan!.id)
  if (!completo) redirect('/terreno')

  return <PlanificacionClient inicial={completo} semanaActual={semana} />
}
