import { createAdminClient } from '@/lib/supabase/admin'
import { vendedorCanonico } from '@/lib/types'
import { maquilaVencidaDe, type FilaVenta } from '@/lib/cobranza'
import CobranzaClient from './CobranzaClient'

// Vista de Cobranza dentro de Administración y Finanzas — el guard de
// isAdmin ya lo aplica app/administracion/layout.tsx a toda la sub-ruta.
//
// Antes esta plata sólo se veía en /ventas/deudores (pensada para el
// vendedor viendo su propia cartera en el celular). Acá es la MISMA fuente
// de datos y la MISMA reconstrucción de facturas (lib/cobranza.ts) — sin
// scope de cartera, porque quien entra a Administración ya es admin — pero
// con un dashboard pensado para escritorio: gráfico de antigüedad de la
// deuda y desglose por cartera antes de la tabla, no después.
//
// /ventas/deudores se deja intacto a propósito: sigue siendo el acceso
// desde el celular (vendedores con su cartera, y Claudio con la vista
// completa cuando no está frente a un computador — Administración no tiene
// navegación inferior móvil).
export const dynamic = 'force-dynamic'

export default async function CobranzaPage() {
  const supabase = createAdminClient()

  const [{ data: deudores }, { data: clientesRows }] = await Promise.all([
    supabase.from('deudores').select('*').order('deuda_vencida', { ascending: false }),
    supabase.from('clientes').select('vendedor'),
  ])

  const maquilaPorCliente = await calcularMaquila(supabase, deudores ?? [])

  const clientesPorVendedor: Record<string, number> = {}
  for (const c of clientesRows ?? []) {
    const key = vendedorCanonico(c.vendedor) || '__sin_vendedor__'
    clientesPorVendedor[key] = (clientesPorVendedor[key] ?? 0) + 1
  }

  return (
    <CobranzaClient
      initialDeudores={deudores ?? []}
      clientesPorVendedor={clientesPorVendedor}
      maquilaPorCliente={maquilaPorCliente}
    />
  )
}

type DeudorRow = { nombre_fantasia: string; deuda_vencida: number | null }

/** { nombre_fantasia → plata vencida que es maquila }. Mismo cálculo que
 *  app/ventas/deudores/page.tsx — ver ese archivo para el porqué. */
async function calcularMaquila(
  supabase: ReturnType<typeof createAdminClient>,
  deudores: DeudorRow[],
): Promise<Record<string, number>> {
  const conDeuda = deudores.filter(d => (Number(d.deuda_vencida) || 0) > 0)
  if (conDeuda.length === 0) return {}

  const { data: filasMaquila } = await supabase
    .from('ventas')
    .select('nombre_fantasia')
    .or('producto.ilike.%maquila%,producto.ilike.%latas finales%')
    .in('nombre_fantasia', conDeuda.map(d => d.nombre_fantasia))

  const clientes = [...new Set((filasMaquila ?? []).map(f => f.nombre_fantasia as string))]
  if (clientes.length === 0) return {}

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
