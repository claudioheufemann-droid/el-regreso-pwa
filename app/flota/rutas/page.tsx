import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RutasClient from './RutasClient'

export const dynamic = 'force-dynamic'

export default async function RutasPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/flota')

  const supabase = await createClient()

  const { data: vehiculos } = await supabase
    .from('vehiculos')
    .select('id, nombre, tipo, patente')
    .order('nombre')

  const { data: rutas } = await supabase
    .from('rutas_reparto')
    .select('id, nombre, vehiculo_id, fecha, estado, km_teoricos, ruta_paradas(id, orden, cliente_nombre, direccion, lat, lng, completada)')
    .order('fecha', { ascending: false })
    .limit(30)

  return <RutasClient vehiculos={vehiculos ?? []} rutas={rutas ?? []} />
}
