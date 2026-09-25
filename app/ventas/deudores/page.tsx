import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { vendedorCanonico } from '@/lib/types'
import { calcularMaquila, puedeVerDeudaGlobal } from '@/lib/deudaComercial'
import { barrilesFueraPorCartera } from '@/lib/barrilesFuera'
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
  // "Admin" de este módulo = ve las carteras de todos (ver puedeVerDeudaGlobal).
  const esAdmin = puedeVerDeudaGlobal(user)

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
  const [{ data: deudores }, { data: clientesRows }, barrilesFuera] = await Promise.all([
    query,
    supabase.from('clientes').select('vendedor'),
    barrilesFueraPorCartera(supabase),
  ])

  // Maquila (co-packing a terceros): el ERP la factura al mismo cliente, así
  // que entra en `deuda_vencida`, pero no es cobranza del área comercial y hay
  // que descontarla de los totales por cartera. Se calcula acá y no en el
  // cliente porque los KPIs tienen que salir correctos sin desplegar ninguna
  // tarjeta. Barato: sólo 3 clientes de los 171 tienen maquila.
  const { maquilaPorCliente, soloMaquila } = await calcularMaquila(supabase, deudores ?? [])

  // Clientes cuya ÚNICA venta registrada es maquila (co-packing, no cerveza ni
  // kombucha) se sacan enteros de Deudores: no son cobranza del área comercial
  // y su saldo/barriles sólo ensucian el número (pedido de Claudio, 2026-09-17,
  // a raíz de El Growler). El día que también compren cerveza/kombucha,
  // `soloMaquila` deja de incluirlos automáticamente.
  const deudoresComerciales = (deudores ?? []).filter(d => !soloMaquila.has(d.nombre_fantasia))

  const clientesPorVendedor: Record<string, number> = {}
  for (const c of clientesRows ?? []) {
    const key = vendedorCanonico(c.vendedor) || '__sin_vendedor__'
    clientesPorVendedor[key] = (clientesPorVendedor[key] ?? 0) + 1
  }

  const miVendedorCanonico = user.vendedoresErp.length ? vendedorCanonico(user.vendedoresErp[0]) : '__sin_vendedor__'

  return (
    <DeudoresVendedorClient
      initialDeudores={deudoresComerciales}
      isAdmin={esAdmin}
      clientesPorVendedor={clientesPorVendedor}
      totalClientesPropios={clientesPorVendedor[miVendedorCanonico] ?? 0}
      maquilaPorCliente={maquilaPorCliente}
      barrilesFuera={esAdmin ? barrilesFuera : {
        total: barrilesFuera.porCartera[miVendedorCanonico] ?? 0,
        porCartera: { [miVendedorCanonico]: barrilesFuera.porCartera[miVendedorCanonico] ?? 0 },
      }}
    />
  )
}
