import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DespachosClient from './DespachosClient'

export const dynamic = 'force-dynamic'

export default async function DespachosPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: vehiculos } = await supabase
    .from('vehiculos')
    .select('id, nombre, tipo, patente, estado, km_actual')
    .order('nombre')

  return <DespachosClient user={user} vehiculos={vehiculos ?? []} />
}
