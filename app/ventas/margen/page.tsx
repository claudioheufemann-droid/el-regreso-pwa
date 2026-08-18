import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MargenClient from './MargenClient'

export const dynamic = 'force-dynamic'

export interface MargenRow {
  producto: string
  litros: number
  revenue: number
  margen_pct: number | null
  margen_clp: number | null
  ppl: number | null
}

export default async function MargenPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Análisis de margen es admin-only por RBAC (datos de costos sensibles).
  if (!user.isAdmin) redirect('/ventas')

  const supabase = await createClient()
  const { data } = await supabase.rpc('ventas_margen', { p_anio: null })

  return <MargenClient rows={(data ?? []) as MargenRow[]} />
}
