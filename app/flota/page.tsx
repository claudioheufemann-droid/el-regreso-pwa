import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FlotaHubClient from './FlotaHubClient'

export const dynamic = 'force-dynamic'

export default async function FlotaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: vehiculos } = await supabase
    .from('vehiculos')
    .select('*')
    .order('nombre')

  const { data: viajesActivos } = await supabase
    .from('viajes_flota')
    .select('id, vehiculo_id, tipo, motivo, km_inicio, iniciado_at, conductor_id, destino_declarado, llegada_confirmada_at')
    .eq('estado', 'en_curso')

  const conductorIds = [...new Set((viajesActivos ?? []).map(v => v.conductor_id).filter(Boolean))]
  let conductores: { id: string; nombre: string }[] = []
  if (conductorIds.length > 0) {
    const { data } = await supabase.from('users').select('id, nombre').in('id', conductorIds)
    conductores = data ?? []
  }

  return (
    <FlotaHubClient
      user={user}
      vehiculos={vehiculos ?? []}
      viajesActivos={viajesActivos ?? []}
      conductores={conductores}
    />
  )
}
