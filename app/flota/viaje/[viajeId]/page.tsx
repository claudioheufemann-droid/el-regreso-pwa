import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import ViajeDetailClient from './ViajeDetailClient'

export const dynamic = 'force-dynamic'

export default async function ViajeDetailPage({ params }: { params: Promise<{ viajeId: string }> }) {
  const { viajeId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: viaje } = await supabase
    .from('viajes_flota')
    .select('id, tipo, motivo, km_inicio, km_teoricos, km_fin, iniciado_at, destino_declarado, conductor_id, vehiculo_id, estado, repartos_terminados, foto_odometro_inicio, foto_360_frente_inicio, foto_360_izquierdo_inicio, foto_360_derecho_inicio, foto_360_atras_inicio, foto_combustible_inicio, foto_odometro_fin, foto_360_frente_fin, foto_360_izquierdo_fin, foto_360_derecho_fin, foto_360_atras_fin, foto_combustible_fin, foto_boleta_combustible')
    .eq('id', viajeId)
    .single()

  if (!viaje) notFound()

  const { data: vehiculo } = await supabase
    .from('vehiculos')
    .select('nombre, tipo, patente, modelo, color, combustible, km_actual')
    .eq('id', viaje.vehiculo_id)
    .single()

  let conductor: { nombre: string } | null = null
  if (viaje.conductor_id) {
    const { data } = await supabase.from('users').select('nombre').eq('id', viaje.conductor_id).single()
    conductor = data
  }

  return (
    <ViajeDetailClient
      user={user}
      viaje={{ ...viaje, conductor, vehiculo: vehiculo ?? { nombre: 'Vehículo', tipo: '', patente: null, modelo: null, color: null, combustible: null, km_actual: 0 } }}
    />
  )
}
