import { createClient } from '@/lib/supabase/server'
import { VENDEDORES, VENDEDORES_SCOPE } from '@/lib/types'
import { getVentasRango } from '@/lib/ventasCache'
import MetasClient from './MetasClient'

export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const supabase = await createClient()

  const { data: ultimaFecha } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', VENDEDORES_SCOPE as unknown as string[])
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
    supabase.from('metas').select('semana_numero, fecha_inicio, fecha_fin').eq('tipo', 'semanal').order('fecha_inicio'),
    supabase.from('metas').select('fecha_inicio, fecha_fin').eq('tipo', 'mensual').order('fecha_inicio'),
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

  const SCOPE = VENDEDORES_SCOPE as unknown as string[]
  const [ventasMesRaw, ventasSemanaRaw] = await Promise.all([
    getVentasRango(mesInicio, fechaRef),
    getVentasRango(semInicio, fechaRef),
  ])
  const ventasMes    = ventasMesRaw
    .filter(v => SCOPE.includes(v.vendedor_actual))
    .map(v => ({ ...v, litros: v.litros ?? 0 }))
  const ventasSemana = ventasSemanaRaw
    .filter(v => SCOPE.includes(v.vendedor_actual))
    .map(v => ({ ...v, litros: v.litros ?? 0 }))

  // Sin avatar individual — consolidado bajo Vendedor 1 (token canónico)
  const vendedorAvatars: Record<string, string | null> = {
    'Vendedor 1': null,
  }

  return (
    <MetasClient
      metasSemanales={metasSemanales ?? []}
      metasMensuales={metasMensuales ?? []}
      ventasMes={ventasMes}
      ventasSemana={ventasSemana}
      fechaRef={fechaRef}
      mesInicio={mesInicio}
      mesFin={mesFin}
      semanaInicio={semInicio}
      semanaFin={semFin}
      periodo={periodo}
      vendedores={VENDEDORES as unknown as string[]}
      periodosSemanas={periodosSemanas}
      periodosMeses={periodosMeses}
      vendedorAvatars={vendedorAvatars}
    />
  )
}
