import { createClient } from '@/lib/supabase/server'
import { VENDEDORES } from '@/lib/types'
import AcumuladoClient from './AcumuladoClient'

export const dynamic = 'force-dynamic'

export default async function AcumuladoPage() {
  const supabase = await createClient()

  const { data: periodo } = await supabase
    .from('periodos')
    .select('*')
    .eq('activo', true)
    .single()

  const { data: ventas } = await supabase
    .from('ventas')
    .select('vendedor_actual, litros, total_sin_impuesto, categoria_negocio, categoria_producto, fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .gte('fecha_pedido', periodo?.fecha_inicio ?? '2026-04-24')
    .lte('fecha_pedido', periodo?.fecha_fin ?? '2026-05-23')

  // Agrupar por vendedor + categoría de negocio
  const resumen: Record<string, Record<string, { litros: number; venta: number }>> = {}

  for (const v of ventas ?? []) {
    const vend = v.vendedor_actual
    const cat = v.categoria_negocio && v.categoria_negocio !== '-' ? v.categoria_negocio : 'Otros'
    if (!resumen[vend]) resumen[vend] = {}
    if (!resumen[vend][cat]) resumen[vend][cat] = { litros: 0, venta: 0 }
    resumen[vend][cat].litros += v.litros ?? 0
    resumen[vend][cat].venta += v.total_sin_impuesto ?? 0
  }

  // Por fecha (últimos 14 días del período)
  const porFecha: Record<string, Record<string, number>> = {}
  for (const v of ventas ?? []) {
    const fecha = v.fecha_pedido.split('T')[0]
    const vend = v.vendedor_actual
    if (!porFecha[fecha]) porFecha[fecha] = {}
    if (!porFecha[fecha][vend]) porFecha[fecha][vend] = 0
    porFecha[fecha][vend] += v.litros ?? 0
  }

  return (
    <AcumuladoClient
      resumen={resumen}
      porFecha={porFecha}
      periodo={periodo}
      vendedores={VENDEDORES as unknown as string[]}
    />
  )
}
