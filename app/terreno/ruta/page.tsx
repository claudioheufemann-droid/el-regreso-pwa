import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RutaClient from './RutaClient'

export const dynamic = 'force-dynamic'

export default async function RutaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Clientes con coordenadas — solo estos sirven para optimizar ruta
  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('nombre_fantasia, categoria, localidad, direccion, telefono, lat, lng')
    .not('nombre_fantasia', 'is', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('nombre_fantasia')

  const clientes = (clientesRaw ?? [])
    .filter(c => c.lat != null && c.lng != null)
    .map(c => ({
      nombre: c.nombre_fantasia as string,
      categoria: c.categoria as string | null,
      localidad: c.localidad as string | null,
      direccion: c.direccion as string | null,
      telefono: c.telefono as string | null,
      lat: Number(c.lat),
      lng: Number(c.lng),
    }))

  return <RutaClient clientes={clientes} />
}
