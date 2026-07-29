import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HistorialClient from './HistorialClient'

export const dynamic = 'force-dynamic'

export default async function HistorialPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const { data: rawViajes } = await supabase
    .from('viajes_flota')
    .select('id, tipo, estado, motivo, km_inicio, km_fin, km_teoricos, iniciado_at, completado_at, destino_declarado, vehiculo_id, conductor_id, repartos_terminados, operador_logistico, ciudad_destino, foto_guia_envio, foto_odometro_inicio, foto_360_frente_inicio, foto_360_izquierdo_inicio, foto_360_derecho_inicio, foto_360_atras_inicio, foto_combustible_inicio, foto_odometro_fin, foto_360_frente_fin, foto_360_izquierdo_fin, foto_360_derecho_fin, foto_360_atras_fin, foto_combustible_fin, foto_boleta_combustible')
    .order('iniciado_at', { ascending: false })
    .limit(200)

  const viajes = rawViajes ?? []

  // Fetch vehiculos y conductores únicos
  const vehiculoIds = [...new Set(viajes.map(v => v.vehiculo_id).filter(Boolean))]
  const conductorIds = [...new Set(viajes.map(v => v.conductor_id).filter(Boolean))]

  const [{ data: vehiculos }, { data: conductores }] = await Promise.all([
    vehiculoIds.length
      ? supabase.from('vehiculos').select('id, nombre, patente').in('id', vehiculoIds)
      : Promise.resolve({ data: [] }),
    conductorIds.length
      ? supabase.from('users').select('id, nombre').in('id', conductorIds)
      : Promise.resolve({ data: [] }),
  ])

  const vMap = Object.fromEntries((vehiculos ?? []).map(v => [v.id, v]))
  const cMap = Object.fromEntries((conductores ?? []).map(c => [c.id, c]))

  const viajesEnriquecidos = viajes.map(v => ({
    ...v,
    vehiculo: vMap[v.vehiculo_id] ?? null,
    conductor: cMap[v.conductor_id] ?? null,
  }))

  return <HistorialClient user={user} viajes={viajesEnriquecidos} />
}
