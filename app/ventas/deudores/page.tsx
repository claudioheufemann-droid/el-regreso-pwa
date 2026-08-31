import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DeudoresVendedorClient from './DeudoresVendedorClient'

// Apartado de Deudores dentro de Ventas (distinto de /ventas/admin/deudores,
// que además tiene la carga manual/estado de sync — sólo admin). Acá cada
// vendedor ve la deuda de SU cartera; el admin ve todo.
export default async function DeudoresVentasPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  // Service-role a propósito — ver lib/supabase/admin.ts. El scope de
  // cartera (vendedoresScope) lo aplica esta misma página, no RLS.
  const supabase = createAdminClient()
  const esAdmin = user.isAdmin

  // Mismo patrón que /ventas/misiones: comparar por vendedoresErp (nombres
  // con que este usuario aparece en el ERP), nunca por el nombre de login —
  // casi nunca calzan. Sin cartera propia → lista vacía, no "ve todo".
  const vendedoresScope = esAdmin ? null : (user.vendedoresErp.length ? user.vendedoresErp : ['__none__'])

  let query = supabase.from('deudores').select('*').order('deuda_vencida', { ascending: false })
  if (vendedoresScope) query = query.in('vendedor', vendedoresScope)

  const { data: deudores } = await query

  return <DeudoresVendedorClient initialDeudores={deudores ?? []} isAdmin={esAdmin} />
}
