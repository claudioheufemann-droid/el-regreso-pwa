import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { vendedorCanonico, nombresErpDe } from '@/lib/types'
import BarrilesClientesClient from './BarrilesClientesClient'

// Barriles actualmente fuera con clientes (sin devolver). Igual patrón que
// /ventas/deudores: cada vendedor ve sólo su cartera, admin ve todo.
export default async function BarrilesClientesPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  // Service-role a propósito — ver lib/supabase/admin.ts.
  const supabase = createAdminClient()
  const esAdmin = user.isAdmin

  const vendedoresScope = esAdmin ? null : (user.vendedoresErp.length ? user.vendedoresErp : ['__none__'])

  let query = supabase.from('barriles_clientes').select('*').order('fecha_entrega', { ascending: true })
  if (vendedoresScope) query = query.in('vendedor', vendedoresScope)

  const { data: barriles } = await query

  return <BarrilesClientesClient initialBarriles={barriles ?? []} isAdmin={esAdmin} />
}
