import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

interface OtifRow { fecha: string; region: string; total_pedidos: number; pedidos_otif: number; otif_pct: number | null }
interface EfectRow { fecha: string; region: string; completados: number; rechazados: number; devueltos: number; efectividad_pct: number | null }

// GET /api/logistica/kpis?desde=2026-07-01&hasta=2026-07-31&region=Los+Ríos
export async function GET(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const desde = req.nextUrl.searchParams.get('desde')
  const hasta = req.nextUrl.searchParams.get('hasta')
  const region = req.nextUrl.searchParams.get('region')

  let otifQuery = supabase.from('vw_kpi_otif').select('*')
  let efectQuery = supabase.from('vw_kpi_efectividad').select('*')

  if (desde) { otifQuery = otifQuery.gte('fecha', desde); efectQuery = efectQuery.gte('fecha', desde) }
  if (hasta) { otifQuery = otifQuery.lte('fecha', hasta); efectQuery = efectQuery.lte('fecha', hasta) }
  if (region) { otifQuery = otifQuery.eq('region', region); efectQuery = efectQuery.eq('region', region) }

  const [{ data: otifRows, error: otifErr }, { data: efectRows, error: efectErr }] = await Promise.all([
    otifQuery.order('fecha', { ascending: true }),
    efectQuery.order('fecha', { ascending: true }),
  ])

  if (otifErr) return NextResponse.json({ error: otifErr.message }, { status: 500 })
  if (efectErr) return NextResponse.json({ error: efectErr.message }, { status: 500 })

  const otif = (otifRows ?? []) as OtifRow[]
  const efect = (efectRows ?? []) as EfectRow[]

  const totalPedidos = otif.reduce((s, r) => s + r.total_pedidos, 0)
  const totalOtif = otif.reduce((s, r) => s + r.pedidos_otif, 0)
  const totalCompletados = efect.reduce((s, r) => s + r.completados, 0)
  const totalRechazados = efect.reduce((s, r) => s + r.rechazados, 0)
  const totalDevueltos = efect.reduce((s, r) => s + r.devueltos, 0)
  const totalIntentos = totalCompletados + totalRechazados + totalDevueltos

  // Serie diaria combinada, para el sparkline
  const porFecha = new Map<string, { fecha: string; otif_pct: number; efectividad_pct: number }>()
  for (const r of otif) {
    porFecha.set(r.fecha, { fecha: r.fecha, otif_pct: r.otif_pct ?? 0, efectividad_pct: 0 })
  }
  for (const r of efect) {
    const existing = porFecha.get(r.fecha)
    if (existing) existing.efectividad_pct = r.efectividad_pct ?? 0
    else porFecha.set(r.fecha, { fecha: r.fecha, otif_pct: 0, efectividad_pct: r.efectividad_pct ?? 0 })
  }

  return NextResponse.json({
    resumen: {
      total_pedidos: totalPedidos,
      pedidos_otif: totalOtif,
      otif_pct: totalPedidos ? Math.round((totalOtif / totalPedidos) * 1000) / 10 : null,
      completados: totalCompletados,
      rechazados: totalRechazados,
      devueltos: totalDevueltos,
      efectividad_pct: totalIntentos ? Math.round((totalCompletados / totalIntentos) * 1000) / 10 : null,
    },
    serie: [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  })
}
