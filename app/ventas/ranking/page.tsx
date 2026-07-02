import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import RankingClient from './RankingClient'

export const dynamic = 'force-dynamic'

export interface RankingRow {
  region: string
  vendedor: string
  litros: number
  revenue: number
  pedidos: number
  visitas: number
  visitas_con_venta: number
  meta: number
  pct_meta: number
  strike_rate: number | null
  drop_size: number | null
}

/** Lunes y domingo de la semana actual (ISO) */
function semanaActual(): { ini: string; fin: string } {
  const d = new Date()
  const day = d.getDay()
  const lunes = new Date(d); lunes.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
  return { ini: lunes.toISOString().split('T')[0], fin: domingo.toISOString().split('T')[0] }
}

export default async function RankingPage() {
  const supabase = await createClient()
  const appUser  = await getServerUser()

  // Período mensual activo
  const { data: periodo } = await supabase
    .from('periodos').select('nombre, fecha_inicio, fecha_fin').eq('activo', true).maybeSingle()
  const mesIni = periodo?.fecha_inicio ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const mesFin = periodo?.fecha_fin    ?? new Date().toISOString().split('T')[0]
  const sem = semanaActual()

  // RPC SECURITY DEFINER → KPIs agregados de todas las regiones (sin datos crudos)
  const [{ data: rankingMes }, { data: rankingSemana }] = await Promise.all([
    supabase.rpc('ranking_regiones', { p_ini: mesIni, p_fin: mesFin }),
    supabase.rpc('ranking_regiones', { p_ini: sem.ini, p_fin: sem.fin }),
  ])

  return (
    <RankingClient
      rankingMes={(rankingMes ?? []) as RankingRow[]}
      rankingSemana={(rankingSemana ?? []) as RankingRow[]}
      miRegion={appUser?.region ?? null}
      isAdmin={appUser?.isAdmin ?? false}
      periodoNombre={periodo?.nombre ?? 'Mes actual'}
    />
  )
}
