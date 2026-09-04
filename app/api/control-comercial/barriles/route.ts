import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import { periodoActual, periodoPorAncla } from '@/lib/control-comercial/periodos'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const anio = Number(searchParams.get('anio')) || undefined
  const mes = Number(searchParams.get('mes')) || undefined
  const periodo = anio && mes ? periodoPorAncla(anio, mes) : periodoActual()

  const supabase = await createClient()
  const [estadoRes, topRes, recuperadosRes, equipoRes, territoriosRes] = await Promise.all([
    supabase.rpc('fn_barriles_estado'),
    supabase.rpc('fn_barriles_top_clientes', { p_limit: 10 }),
    supabase.rpc('fn_barriles_recuperados', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_equipo_resumen', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.from('territorios_responsables').select('territorio, responsable').is('vigente_hasta', null),
  ])

  if (estadoRes.error) return NextResponse.json({ error: estadoRes.error.message }, { status: 500 })

  // "Responsables con más barriles críticos": no hay una tabla que ligue barril→persona,
  // pero sí territorio→responsable vigente, y fn_equipo_resumen ya reparte los barriles
  // por territorio. Se agrega por responsable para no repetir a alguien con 2 territorios.
  interface FilaEquipoBarriles { territorio: string; barriles_criticos: number; barriles_total: number }
  const responsablePorTerritorio = new Map((territoriosRes.data ?? []).map(t => [t.territorio, t.responsable]))
  const acumulado = new Map<string, { responsable: string; criticos: number; total: number }>()
  for (const f of (equipoRes.data ?? []) as FilaEquipoBarriles[]) {
    if (f.territorio === 'Sin territorio asignado') continue
    const responsable = responsablePorTerritorio.get(f.territorio)
    if (!responsable) continue
    const cur = acumulado.get(responsable) ?? { responsable, criticos: 0, total: 0 }
    cur.criticos += Number(f.barriles_criticos)
    cur.total += Number(f.barriles_total)
    acumulado.set(responsable, cur)
  }

  return NextResponse.json({
    periodo: { nombre: periodo.nombre, inicio: periodo.inicio, fin: periodo.fin },
    estado: estadoRes.data?.[0] ?? null,
    topClientes: topRes.data ?? [],
    recuperados: recuperadosRes.data?.[0] ?? null,
    porResponsable: [...acumulado.values()].filter(r => r.criticos > 0).sort((a, b) => b.criticos - a.criticos),
    porTerritorio: ((equipoRes.data ?? []) as FilaEquipoBarriles[])
      .filter(f => f.territorio !== 'Sin territorio asignado' && f.barriles_total > 0)
      .map(f => ({ territorio: f.territorio, criticos: Number(f.barriles_criticos), total: Number(f.barriles_total) }))
      .sort((a, b) => b.criticos - a.criticos),
  })
}
