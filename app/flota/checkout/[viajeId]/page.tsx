import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import CheckOutClient from './CheckOutClient'

export const dynamic = 'force-dynamic'

export default async function CheckOutPage({ params }: { params: Promise<{ viajeId: string }> }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const { viajeId } = await params
  const supabase = await createClient()

  const { data: viaje } = await supabase
    .from('viajes_flota')
    .select('*, vehiculos(nombre, patente, km_actual)')
    .eq('id', viajeId)
    .eq('estado', 'en_curso')
    .maybeSingle()

  if (!viaje) notFound()

  return <CheckOutClient user={user} viaje={viaje} />
}
