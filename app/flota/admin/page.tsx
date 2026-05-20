import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminFlotaClient from './AdminFlotaClient'

export const dynamic = 'force-dynamic'

export default async function AdminFlotaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/flota')

  const supabase = await createClient()

  const { data: viajes } = await supabase
    .from('viajes_flota')
    .select(`
      id, tipo, motivo, estado, km_inicio, km_fin, km_teoricos,
      litros_carga, monto_combustible, iniciado_at, completado_at,
      vehiculos(id, nombre, patente),
      conductor:users!conductor_id(id, nombre),
      rutas_reparto(id, nombre)
    `)
    .eq('estado', 'completado')
    .order('completado_at', { ascending: false })
    .limit(100)

  const { data: vehiculos } = await supabase
    .from('vehiculos')
    .select('id, nombre, tipo, patente, km_actual, estado')
    .order('nombre')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AdminFlotaClient viajes={(viajes ?? []) as any[]} vehiculos={vehiculos ?? []} />
}
