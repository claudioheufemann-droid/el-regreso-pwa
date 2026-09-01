import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { vendedorCanonico } from '@/lib/types'
import DeudoresVendedorClient from './DeudoresVendedorClient'

// Apartado de Deudores dentro de Ventas (distinto de /ventas/admin/deudores,
// que además tiene la carga manual/estado de sync — sólo admin). Acá cada
// vendedor ve la deuda de SU cartera; el admin ve la suma de las 4 carteras.
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

  // Denominador del "26 de 165 clientes": cartera total por vendedor. Se trae
  // la columna cruda y se agrupa por nombre canónico porque clientes.vendedor
  // usa nombres históricos/alias ("Los Lagos", el mail de Nicol, "Marion"…) —
  // agrupar acá evita que la misma cartera se cuente partida en dos.
  const [{ data: deudores }, { data: clientesRows }] = await Promise.all([
    query,
    supabase.from('clientes').select('vendedor'),
  ])

  const clientesPorVendedor: Record<string, number> = {}
  for (const c of clientesRows ?? []) {
    const key = vendedorCanonico(c.vendedor) || '__sin_vendedor__'
    clientesPorVendedor[key] = (clientesPorVendedor[key] ?? 0) + 1
  }

  const miVendedorCanonico = user.vendedoresErp.length ? vendedorCanonico(user.vendedoresErp[0]) : '__sin_vendedor__'

  return (
    <DeudoresVendedorClient
      initialDeudores={deudores ?? []}
      isAdmin={esAdmin}
      clientesPorVendedor={clientesPorVendedor}
      totalClientesPropios={clientesPorVendedor[miVendedorCanonico] ?? 0}
    />
  )
}
