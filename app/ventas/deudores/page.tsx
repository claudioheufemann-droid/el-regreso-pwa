import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { vendedorCanonico, nombresErpDe } from '@/lib/types'
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

  // Total de clientes de la cartera (para el "26 de 165 clientes" del
  // resumen) — clientes.vendedor SÍ usa nombres históricos/alias ("Los
  // Rios" etc.), por eso acá hace falta expandir con nombresErpDe() y no
  // alcanza con vendedoresErp crudo como en la query de arriba.
  const miVendedorCanonico = user.vendedoresErp.length ? vendedorCanonico(user.vendedoresErp[0]) : '__sin_vendedor__'
  let clientesQuery = supabase.from('clientes').select('id', { count: 'exact', head: true })
  if (!esAdmin) clientesQuery = clientesQuery.in('vendedor', nombresErpDe(miVendedorCanonico))

  const [{ data: deudores }, { count: totalClientes }] = await Promise.all([query, clientesQuery])

  return <DeudoresVendedorClient initialDeudores={deudores ?? []} isAdmin={esAdmin} totalClientes={totalClientes ?? 0} />
}
