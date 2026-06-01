import { createClient } from '@/lib/supabase/server'
import { VENDEDORES } from '@/lib/types'
import { getVentasRango } from '@/lib/ventasCache'
import MetasClient from './MetasClient'

export const revalidate = 120

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

  // Ventas cacheadas (compartidas entre usuarios). Metas siempre usa todos los vendedores.
  const [ventasMesRaw, ventasSemanaRaw, { data: usersData }] = await Promise.all([
    getVentasRango(mesInicio, fechaRef),
    getVentasRango(semInicio, fechaRef),
    supabase.from('users').select('nombre, avatar_url').in('nombre', ['Javier B.', 'Carlos U.']),
  ])
  // Coerción de litros (cache lo expone como number|null)
  const ventasMes    = ventasMesRaw.map(v => ({ ...v, litros: v.litros ?? 0 }))
  const ventasSemana = ventasSemanaRaw.map(v => ({ ...v, litros: v.litros ?? 0 }))

  // Mapa nombre_completo → avatar_url para los vendedores
  // El nombre en ventas es "Javier Badilla" / "Carlos Urrejola" pero en users es "Javier B." / "Carlos U."
  const vendedorAvatars: Record<string, string | null> = {
    'Javier Badilla': usersData?.find(u => u.nombre === 'Javier B.')?.avatar_url ?? null,
    'Carlos Urrejola': usersData?.find(u => u.nombre === 'Carlos U.')?.avatar_url ?? null,
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
