import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import NuevaCotizacionClient from './NuevaCotizacionClient'

export const dynamic = 'force-dynamic'

export interface ClienteParaCotizacion {
  id: number
  nombre_fantasia: string
  razon_social: string | null
  email: string | null
  telefono: string | null
}

export default async function NuevaCotizacionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase
    .from('clientes')
    .select('id, nombre_fantasia, razon_social, email, telefono')
    .not('nombre_fantasia', 'is', null)
    .order('nombre_fantasia')

  const clientes: ClienteParaCotizacion[] = (data ?? []).map(c => ({
    id: c.id,
    nombre_fantasia: c.nombre_fantasia,
    razon_social: c.razon_social ?? null,
    email: c.email ?? null,
    telefono: c.telefono ?? null,
  }))

  return <NuevaCotizacionClient user={user} clientes={clientes} />
}
