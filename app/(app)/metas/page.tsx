import { createClient } from '@/lib/supabase/server'
import { VENDEDORES } from '@/lib/types'
import MetasClient from './MetasClient'

export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const supabase = await createClient()

  const { data: periodo } = await supabase
    .from('periodos')
    .select('*')
    .eq('activo', true)
    .single()

  const { data: metas } = await supabase
    .from('metas')
    .select('*')
    .eq('periodo_id', periodo?.id ?? 0)
    .order('tipo')
    .order('categoria_negocio')

  const { data: ventas } = await supabase
    .from('ventas')
    .select('vendedor_actual, litros, categoria_negocio, fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .gte('fecha_pedido', periodo?.fecha_inicio ?? '2026-04-24')
    .lte('fecha_pedido', periodo?.fecha_fin ?? '2026-05-23')

  // Última fecha con ventas (para saber el "hoy")
  const { data: ultimaFecha } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .order('fecha_pedido', { ascending: false })
    .limit(1)
    .single()

  const fechaHoy = ultimaFecha?.fecha_pedido ?? new Date().toISOString().split('T')[0]

  // Litros acumulados por vendedor + categoría
  const acumulado: Record<string, Record<string, number>> = {}
  const acumuladoHoy: Record<string, Record<string, number>> = {}

  for (const v of ventas ?? []) {
    const vend = v.vendedor_actual
    const cat = v.categoria_negocio && v.categoria_negocio !== '-' ? v.categoria_negocio : 'Otros'
    if (!acumulado[vend]) acumulado[vend] = {}
    if (!acumulado[vend][cat]) acumulado[vend][cat] = 0
    acumulado[vend][cat] += v.litros ?? 0
    if (!acumulado[vend]['Total']) acumulado[vend]['Total'] = 0
    acumulado[vend]['Total'] += v.litros ?? 0

    if (v.fecha_pedido.startsWith(fechaHoy.split('T')[0])) {
      if (!acumuladoHoy[vend]) acumuladoHoy[vend] = {}
      if (!acumuladoHoy[vend][cat]) acumuladoHoy[vend][cat] = 0
      acumuladoHoy[vend][cat] += v.litros ?? 0
      if (!acumuladoHoy[vend]['Total']) acumuladoHoy[vend]['Total'] = 0
      acumuladoHoy[vend]['Total'] += v.litros ?? 0
    }
  }

  return (
    <MetasClient
      metas={metas ?? []}
      acumulado={acumulado}
      acumuladoHoy={acumuladoHoy}
      periodo={periodo}
      vendedores={VENDEDORES as unknown as string[]}
    />
  )
}
