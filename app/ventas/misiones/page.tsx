import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES } from '@/lib/types'
import MisionesClient from './MisionesClient'

export const dynamic = 'force-dynamic'

function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}

export interface Mision {
  id: string
  vendedor: string
  nombre_fantasia: string
  semana: string
  alert_level: string
  score: number
  segmento: string
  dias_sin_compra: number
  ciclo_promedio_dias: number | null
  siguiente_compra_estimada: string | null
  estado: 'pendiente' | 'completada'
  completado_at: string | null
}

export default async function MisionesPage() {
  const supabase = await createClient()
  const appUser = await getServerUser()

  const semana = getMondayOfWeek(new Date())
  const vendedoresScope = appUser?.isAdmin ? VENDEDORES : [appUser?.nombre ?? '__none__']

  // Misiones de la semana actual para este vendedor (o todos si admin)
  const { data: misiones } = await supabase
    .from('misiones')
    .select('id,vendedor,nombre_fantasia,semana,alert_level,score,segmento,dias_sin_compra,ciclo_promedio_dias,siguiente_compra_estimada,estado,completado_at')
    .eq('semana', semana)
    .in('vendedor', vendedoresScope)
    .order('estado', { ascending: true })   // pendientes primero
    .order('alert_level', { ascending: true }) // critico < proximo < vencido

  return (
    <MisionesClient
      misiones={(misiones ?? []) as Mision[]}
      semana={semana}
      isAdmin={appUser?.isAdmin ?? false}
      vendedorActual={appUser?.nombre ?? null}
    />
  )
}
