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

  // Paginación: Supabase devuelve máx 1000 filas. Un mes con muchas SKUs supera ese límite.
  async function fetchVentas(fechaIni: string, fechaFin: string) {
    const cols = 'vendedor_actual, litros, categoria_negocio, fecha_pedido, categoria_producto, producto'
    const rows: { vendedor_actual: string; litros: number; categoria_negocio: string | null; fecha_pedido: string; categoria_producto: string | null; producto: string | null }[] = []
    let offset = 0
    const PAGE = 1000
    while (true) {
      const { data } = await supabase.from('ventas').select(cols)
        .in('vendedor_actual', VENDEDORES)
        .gte('fecha_pedido', fechaIni).lte('fecha_pedido', fechaFin)
        .order('fecha_pedido', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
      offset += PAGE
    }
    return rows
  }

  const [ventasMes, ventasSemana, { data: usersData }] = await Promise.all([
    fetchVentas(mesInicio, fechaRef),
    fetchVentas(semInicio, fechaRef),
    supabase.from('users').select('nombre, avatar_url').in('nombre', ['Javier B.', 'Carlos U.']),
  ])

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
