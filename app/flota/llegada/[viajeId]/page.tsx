import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LlegadaClient from './LlegadaClient'

export const dynamic = 'force-dynamic'

export default async function LlegadaPage({ params }: { params: Promise<{ viajeId: string }> }) {
  const { viajeId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: viaje } = await supabase
    .from('viajes_flota')
    .select('id, vehiculo_id, tipo, motivo, destino_declarado, llegada_confirmada_at, km_inicio, iniciado_at, vehiculos(nombre, patente)')
    .eq('id', viajeId)
    .eq('estado', 'en_curso')
    .single()

  if (!viaje || viaje.tipo !== 'tramite') redirect('/flota')

  return <LlegadaClient viaje={viaje as any} user={user} />
}
