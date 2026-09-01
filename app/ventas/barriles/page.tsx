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

  // El campo `barriles_clientes.vendedor` es el que traía ESA fila del
  // informe del ERP el día que se prestó el barril — puede quedar
  // desactualizado (ej. "Inactivo", o el vendedor anterior de ese cliente).
  // El scope correcto es la cartera REAL de hoy: qué vendedor tiene asignado
  // cada cliente en `clientes.vendedor` — mismo criterio ya usado en
  // /ventas/clientes y /ventas/deudores (nombresErpDe expande los alias
  // históricos: "Los Rios"/"Los Lagos"/nombres viejos del ERP).
  let nombresClientesScope: string[] | null = null
  if (!esAdmin) {
    const miVendedorCanonico = user.vendedoresErp.length ? vendedorCanonico(user.vendedoresErp[0]) : '__sin_vendedor__'
    const { data: misClientes } = await supabase
      .from('clientes')
      .select('nombre_fantasia')
      .in('vendedor', nombresErpDe(miVendedorCanonico))
    nombresClientesScope = (misClientes ?? []).map(c => c.nombre_fantasia as string).filter(Boolean)
  }

  let query = supabase.from('barriles_clientes').select('*').order('fecha_entrega', { ascending: true })
  if (nombresClientesScope) query = query.in('nombre_fantasia', nombresClientesScope.length ? nombresClientesScope : ['__none__'])

  const { data: barrilesRaw } = await query

  // El "vendedor" y la "localidad" que se MUESTRAN en la tarjeta también se
  // corrigen con el dato vigente de `clientes` (no el de la fila del informe
  // de barriles), para no mostrarle a un vendedor un cliente etiquetado con
  // el nombre de otra persona o de "Inactivo".
  const nombresParaEnriquecer = [...new Set((barrilesRaw ?? []).map(b => b.nombre_fantasia))]
  const { data: clientesInfo } = nombresParaEnriquecer.length
    ? await supabase.from('clientes').select('nombre_fantasia, vendedor, localidad, localidad_entrega').in('nombre_fantasia', nombresParaEnriquecer)
    : { data: [] as { nombre_fantasia: string; vendedor: string | null; localidad: string | null; localidad_entrega: string | null }[] }

  const infoPorCliente = new Map((clientesInfo ?? []).map(c => [c.nombre_fantasia, c]))
  const barriles = (barrilesRaw ?? []).map(b => {
    const info = infoPorCliente.get(b.nombre_fantasia)
    return info ? { ...b, vendedor: info.vendedor, localidad: info.localidad, localidad_entrega: info.localidad_entrega } : b
  })

  return <BarrilesClientesClient initialBarriles={barriles} isAdmin={esAdmin} />
}
