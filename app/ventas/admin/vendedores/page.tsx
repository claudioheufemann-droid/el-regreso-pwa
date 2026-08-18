import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import VendedoresClient from './VendedoresClient'

export const dynamic = 'force-dynamic'

export interface VendedorRow {
  id: string
  nombre: string
  email: string
  region: string | null
}

export default async function VendedoresPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/ventas')

  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id, nombre, email, region')
    .eq('is_admin', false)
    .not('region', 'is', null)
    .order('region')
    .order('nombre')

  return <VendedoresClient vendedores={(data ?? []) as VendedorRow[]} />
}
