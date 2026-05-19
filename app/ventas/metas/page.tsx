import { createClient } from '@/lib/supabase/server'
import { VENDEDORES } from '@/lib/types'
import MetasClient from './MetasClient'

export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const supabase = await createClient()

  const { data: ultimaFecha } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .order('fecha_pedido', { ascending: false })
    .limit(1)
    .single()

  const fechaRef = ultimaFecha?.fecha_pedido ?? new Date().toISOString().split('T')[0]

  const [
    { data: metasSemanales },
    { data: metasMensuales },
    { data: todasSemanasRaw },
    { data: todosMesesRaw },
    { data: periodo },
  ] = await Promise.all([
    supabase.from('metas').select('*').eq('tipo', 'semanal').lte('fecha_inicio', fechaRef).gte('fecha_fin', fechaRef),
    supabase.from('metas').select('*').eq('tipo', 'mensual').lte('fecha_inicio', fechaRef).gte('fecha_fin', fechaRef),
    supabase.from('metas').select('semana_numero, fecha_inicio, fecha_fin').eq('tipo', 'semanal').gte('fecha_inicio', '2026-05-01').lte('fecha_fin', '2026-07-31').order('fecha_inicio'),
    supabase.from('metas').select('fecha_inicio, fecha_fin').eq('tipo', 'mensual').gte('fecha_inicio', '2026-05-01').lte('fecha_fin', '2026-07-31').order('fecha_inicio'),
    supabase.from('periodos').select('*').eq('activo', true).single(),
  ])

  // Deduplica semanas y meses
  const seenSem = new Set<string>()
  const periodosSemanas = (todasSemanasRaw ?? []).filter(s => {
    if (seenSem.has(s.fecha_inicio)) return false
    seenSem.add(s.fecha_inicio)
    return true
  })

  const seenMes = new Set<string>()
  const periodosMeses = (todosMesesRaw ?? []).filter(m => {
    if (seenMes.has(m.fecha_inicio)) return false
    seenMes.add(m.fecha_inicio)
    return true
  })

  const mesInicio = metasMensuales?.[0]?.fecha_inicio ?? fechaRef.slice(0, 8) + '01'
  const mesFin    = metasMensuales?.[0]?.fecha_fin    ?? fechaRef
  const semInicio = metasSemanales?.[0]?.fecha_inicio  ?? fechaRef
  const semFin    = metasSemanales?.[0]?.fecha_fin     ?? fechaRef

  const [{ data: ventasMes }, { data: ventasSemana }] = await Promise.all([
    supabase.from('ventas').select('vendedor_actual, litros, categoria_negocio, fecha_pedido, categoria_producto, producto').in('vendedor_actual', VENDEDORES).gte('fecha_pedido', mesInicio).lte('fecha_pedido', fechaRef),
    supabase.from('ventas').select('vendedor_actual, litros, categoria_negocio, fecha_pedido, categoria_producto, producto').in('vendedor_actual', VENDEDORES).gte('fecha_pedido', semInicio).lte('fecha_pedido', fechaRef),
  ])

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
      periodosSemanas={periodosSemanas}
      periodosMeses={periodosMeses}
    />
  )
}
