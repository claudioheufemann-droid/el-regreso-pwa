import { createClient } from '@/lib/supabase/server'
import { VENDEDORES, CLIENTES_EXCLUIR } from '@/lib/types'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

function contarLatas(litros: number, envase: string | null): number {
  if (!envase) return 0
  if (envase.includes('473')) return Math.round(litros / 0.473)
  if (envase.includes('354')) return Math.round(litros / 0.354)
  return 0
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: ultimaFecha } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .order('fecha_pedido', { ascending: false })
    .limit(1)
    .single()

  const fechaHoy = ultimaFecha?.fecha_pedido ?? new Date().toISOString().split('T')[0]

  const { data: ventasHoy } = await supabase
    .from('ventas')
    .select('vendedor_actual, nombre_fantasia, litros, total_sin_impuesto, categoria_negocio, categoria_producto, producto, envase')
    .in('vendedor_actual', VENDEDORES)
    .eq('fecha_pedido', fechaHoy)

  const { data: periodo } = await supabase
    .from('periodos')
    .select('*')
    .eq('activo', true)
    .single()

  const { data: ventasPeriodo } = await supabase
    .from('ventas')
    .select('vendedor_actual, litros, total_sin_impuesto, categoria_negocio, fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .gte('fecha_pedido', periodo?.fecha_inicio ?? '2026-04-24')
    .lte('fecha_pedido', periodo?.fecha_fin ?? '2026-05-23')

  const resumen = VENDEDORES.map(vendedor => {
    const vHoy = (ventasHoy ?? []).filter(v => v.vendedor_actual === vendedor)
    const vPeriodo = (ventasPeriodo ?? []).filter(v => v.vendedor_actual === vendedor)

    const litrosHoy = vHoy.reduce((s, v) => s + (v.litros ?? 0), 0)
    const ventaHoy = vHoy.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)
    const litrosPeriodo = vPeriodo.reduce((s, v) => s + (v.litros ?? 0), 0)
    const ventaPeriodo = vPeriodo.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)

    // Latas cerveza y kombucha del día
    const latasCervezaHoy = vHoy
      .filter(v => v.envase?.includes('Lata') && v.categoria_producto?.includes('Cerveza'))
      .reduce((s, v) => s + contarLatas(v.litros ?? 0, v.envase), 0)

    const latasKombuchaHoy = vHoy
      .filter(v => v.envase?.includes('Lata') && v.categoria_producto?.includes('Kombucha'))
      .reduce((s, v) => s + contarLatas(v.litros ?? 0, v.envase), 0)

    // Clientes con detalle de productos
    const clientesMap = new Map<string, { producto: string; envase: string | null; litros: number }[]>()
    for (const v of vHoy) {
      const nombre = v.nombre_fantasia
      if (!nombre || CLIENTES_EXCLUIR.some(ex => nombre.includes(ex))) continue
      if (!clientesMap.has(nombre)) clientesMap.set(nombre, [])
      if (v.producto) {
        clientesMap.get(nombre)!.push({
          producto: v.producto,
          envase: v.envase ?? null,
          litros: v.litros ?? 0,
        })
      }
    }

    const clientesHoy = Array.from(clientesMap.entries()).map(([nombre, productos]) => ({
      nombre,
      productos,
    }))

    return { vendedor, litrosHoy, ventaHoy, litrosPeriodo, ventaPeriodo, clientesHoy, latasCervezaHoy, latasKombuchaHoy }
  })

  return (
    <DashboardClient
      resumen={resumen}
      fechaHoy={fechaHoy}
      periodo={periodo}
    />
  )
}
