import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES } from '@/lib/types'
import MisionesClient from './MisionesClient'

export const dynamic = 'force-dynamic'

/** Devuelve el lunes de la semana de la fecha dada (YYYY-MM-DD) */
function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export interface Mision {
  nombre_fantasia: string
  vendedor_actual: string
  dias_sin_compra: number
  ciclo_promedio_dias: number
  alert_level: string
  score: number
  segmento: string
  siguiente_compra_estimada: string | null
  porcentaje_ciclo_vencido: number
  completado: boolean
  semana: string
}

export default async function MisionesPage() {
  const supabase = await createClient()
  const appUser = await getServerUser()

  const semana = getMondayOfWeek(new Date())

  const p_vendedor = appUser?.isAdmin ? null : (appUser?.nombre ?? null)

  // Misiones activas: clientes que deben ser contactados
  const { data: alertsRaw } = await supabase.rpc('get_pending_call_alerts', {
    p_vendedor,
    p_nivel_minimo: 'proximo',
  })

  // Contactos ya realizados esta semana
  const vendedoresScope = p_vendedor ? [p_vendedor] : VENDEDORES
  const { data: completados } = await supabase
    .from('contactos_realizados')
    .select('vendedor, nombre_fantasia')
    .eq('semana', semana)
    .in('vendedor', vendedoresScope)

  const completadosSet = new Set(
    (completados ?? []).map(c => `${c.vendedor}|||${c.nombre_fantasia}`)
  )

  const misiones: Mision[] = (alertsRaw ?? []).map((r: Omit<Mision, 'completado' | 'semana'>) => ({
    nombre_fantasia: r.nombre_fantasia,
    vendedor_actual: r.vendedor_actual,
    dias_sin_compra: r.dias_sin_compra,
    ciclo_promedio_dias: r.ciclo_promedio_dias,
    alert_level: r.alert_level,
    score: r.score,
    segmento: r.segmento,
    siguiente_compra_estimada: r.siguiente_compra_estimada ?? null,
    porcentaje_ciclo_vencido: r.porcentaje_ciclo_vencido ?? 0,
    completado: completadosSet.has(`${r.vendedor_actual}|||${r.nombre_fantasia}`),
    semana,
  }))

  return (
    <MisionesClient
      misiones={misiones}
      semana={semana}
      isAdmin={appUser?.isAdmin ?? false}
      vendedorActual={appUser?.nombre ?? null}
    />
  )
}
