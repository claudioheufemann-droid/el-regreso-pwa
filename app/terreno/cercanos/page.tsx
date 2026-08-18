import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CercanosClient from './CercanosClient'

export const dynamic = 'force-dynamic'

export default async function CercanosPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  // RLS ya filtra por región del vendedor automáticamente (admin ve todos).
  const { data: clientesGeo } = await supabase
    .from('clientes')
    .select('nombre_fantasia, categoria, localidad, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  const clientesConGps = (clientesGeo ?? []).map(c => ({
    nombre: c.nombre_fantasia as string,
    categoria: c.categoria as string | null,
    localidad: c.localidad as string | null,
    lat: Number(c.lat), lng: Number(c.lng),
  }))

  return <CercanosClient clientes={clientesConGps} />
}
