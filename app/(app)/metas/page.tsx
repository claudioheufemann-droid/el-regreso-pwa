import { createClient } from '@/lib/supabase/server'
import { VENDEDORES } from '@/lib/types'
import MetasClient from './MetasClient'
import type { AnalyticsVendedor } from '@/lib/metas-engine'

export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const supabase = await createClient()

  // Última fecha con ventas (para saber el "hoy")
  const { data: ultimaFecha } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .order('fecha_pedido', { ascending: false })
    .limit(1)
    .single()

  const fechaRef = ultimaFecha?.fecha_pedido ?? new Date().toISOString().split('T')[0]

  // Metas semanales activas para la fecha de referencia
  const { data: metasSemanales } = await supabase
    .from('metas')
    .select('*')
    .eq('tipo', 'semanal')
    .lte('fecha_inicio', fechaRef)
    .gte('fecha_fin', fechaRef)

  // Metas mensuales activas para la fecha de referencia
  const { data: metasMensuales } = await supabase
    .from('metas')
    .select('*')
    .eq('tipo', 'mensual')
    .lte('fecha_inicio', fechaRef)
    .gte('fecha_fin', fechaRef)

  // Período activo (facturación) para el header
  const { data: periodo } = await supabase
    .from('periodos')
    .select('*')
    .eq('activo', true)
    .single()

  // Ventas del mes calendario activo
  const mesInicio = metasMensuales?.[0]?.fecha_inicio ?? fechaRef.slice(0, 8) + '01'
  const mesFin = metasMensuales?.[0]?.fecha_fin ?? fechaRef

  // Ventas de la semana activa
  const semInicio = metasSemanales?.[0]?.fecha_inicio ?? fechaRef
  const semFin = metasSemanales?.[0]?.fecha_fin ?? fechaRef

  const [{ data: ventasMes }, { data: ventasSemana }] = await Promise.all([
    supabase
      .from('ventas')
      .select('vendedor_actual, litros, categoria_negocio, fecha_pedido')
      .in('vendedor_actual', VENDEDORES)
      .gte('fecha_pedido', mesInicio)
      .lte('fecha_pedido', fechaRef),
    supabase
      .from('ventas')
      .select('vendedor_actual, litros, categoria_negocio, fecha_pedido')
      .in('vendedor_actual', VENDEDORES)
      .gte('fecha_pedido', semInicio)
      .lte('fecha_pedido', fechaRef),
  ])

  // Pasar datos al cliente para que calcule analytics
  return (
    <MetasClient
      metasSemanales={metasSemanales ?? []}
      metasMensuales={metasMensuales ?? []}
      ventasMes={ventasMes ?? []}
      ventasSemana={ventasSemana ?? []}
      fechaRef={fechaRef}
      mesInicio={mesInicio}
      mesFin={mesFin}
      semanaInicio={semInicio}
      semanaFin={semFin}
      periodo={periodo}
      vendedores={VENDEDORES as unknown as string[]}
    />
  )
}
