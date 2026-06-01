import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CheckInClient from './CheckInClient'

export const dynamic = 'force-dynamic'

export default async function CheckInPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: vehiculos } = await supabase
    .from('vehiculos')
    .select('id, nombre, tipo, patente, km_actual, estado, combustible')
    .order('nombre')

  const hoy = new Date().toISOString().split('T')[0]
  const { data: rutas } = await supabase
    .from('rutas_reparto')
    .select('id, nombre, vehiculo_id, km_teoricos, estado')
    .eq('fecha', hoy)
    .eq('estado', 'pendiente')

  // Clientes desde tabla maestra para autocompletar destinos
  const { data: clientes } = await supabase
    .from('clientes')
    .select('nombre_fantasia, direccion, localidad, ruta_despacho, lat, lng')
    .not('nombre_fantasia', 'is', null)
    .order('nombre_fantasia')

  return (
    <CheckInClient
      user={user}
      vehiculos={vehiculos ?? []}
      rutasHoy={rutas ?? []}
      clientes={clientes ?? []}
    />
  )
}
