import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CheckInClient from './CheckinClient'

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

  // Antes acá se traía TODA la tabla `clientes` (~600 filas) sólo para
  // autocompletar destinos al armar una ruta de despacho — la búsqueda de
  // cliente ahora es en vivo contra Supabase (ver CheckinClient), mismo
  // patrón que ya usa Nueva Visita/Ruta/Cotizaciones.

  return (
    <CheckInClient
      user={user}
      vehiculos={vehiculos ?? []}
      rutasHoy={rutas ?? []}
    />
  )
}
