import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { vendedorCanonico } from '@/lib/types'
import { maquilaVencidaDe, type FilaVenta } from '@/lib/cobranza'
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

  // Maquila (co-packing a terceros): el ERP la factura al mismo cliente, así
  // que entra en `deuda_vencida`, pero no es cobranza del área comercial y hay
  // que descontarla de los totales por cartera. Se calcula acá y no en el
  // cliente porque los KPIs tienen que salir correctos sin desplegar ninguna
  // tarjeta. Barato: sólo 3 clientes de los 171 tienen maquila.
  const maquilaPorCliente = await calcularMaquila(supabase, deudores ?? [])

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
      maquilaPorCliente={maquilaPorCliente}
    />
  )
}

type DeudorRow = { nombre_fantasia: string; deuda_vencida: number | null }

/** { nombre_fantasia → plata vencida que es maquila }. Sólo los que tienen. */
async function calcularMaquila(
  supabase: ReturnType<typeof createAdminClient>,
  deudores: DeudorRow[],
): Promise<Record<string, number>> {
  const conDeuda = deudores.filter(d => (Number(d.deuda_vencida) || 0) > 0)
  if (conDeuda.length === 0) return {}

  // Paso 1: qué deudores tienen alguna venta de maquila.
  const { data: filasMaquila } = await supabase
    .from('ventas')
    .select('nombre_fantasia')
    .or('producto.ilike.%maquila%,producto.ilike.%latas finales%')
    .in('nombre_fantasia', conDeuda.map(d => d.nombre_fantasia))

  const clientes = [...new Set((filasMaquila ?? []).map(f => f.nombre_fantasia as string))]
  if (clientes.length === 0) return {}

  // Paso 2: reconstruir sólo esos, para saber cuáles de sus facturas de
  // maquila siguen impagas (no basta con sumarlas todas: muchas ya se pagaron).
  const { data: ventas } = await supabase
    .from('ventas')
    .select('nombre_fantasia, pedido, fecha_pedido, producto, envase, categoria_producto, litros, total_sin_impuesto')
    .in('nombre_fantasia', clientes)

  const porCliente = new Map<string, FilaVenta[]>()
  for (const v of (ventas ?? []) as (FilaVenta & { nombre_fantasia: string })[]) {
    const arr = porCliente.get(v.nombre_fantasia)
    if (arr) arr.push(v)
    else porCliente.set(v.nombre_fantasia, [v])
  }

  const out: Record<string, number> = {}
  for (const d of conDeuda) {
    if (!porCliente.has(d.nombre_fantasia)) continue
    const monto = maquilaVencidaDe(
      d as Parameters<typeof maquilaVencidaDe>[0],
      porCliente.get(d.nombre_fantasia) ?? [],
    )
    if (monto > 0) out[d.nombre_fantasia] = monto
  }
  return out
}
