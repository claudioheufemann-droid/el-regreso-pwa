import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sugerirVinculosDelPlan } from '@/lib/terreno/planificacion/sugerirVentaVisita'

// GET /api/terreno/planificacion/[id]/vinculos-venta — vínculos venta↔visita existentes
// (sugeridos y confirmados) de las visitas ejecutadas de este plan.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: dias } = await supabase.from('plan_dias_terreno').select('id').eq('plan_id', id)
  const diaIds = (dias ?? []).map(d => d.id)
  const { data: paradas } = diaIds.length
    ? await supabase.from('plan_paradas_terreno').select('visita_id').in('plan_dia_id', diaIds).not('visita_id', 'is', null)
    : { data: [] }
  const visitaIds = (paradas ?? []).map(p => p.visita_id).filter((v): v is string => !!v)
  if (visitaIds.length === 0) return NextResponse.json([])

  const { data, error } = await supabase
    .from('plan_venta_visita_links_terreno')
    .select('*')
    .in('visita_id', visitaIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/terreno/planificacion/[id]/vinculos-venta — genera sugerencias (no confirma
// nada) para las visitas con resultado comercial de este plan que aún no tienen vínculo.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: actor } = await supabase.from('users').select('is_admin, puede_aprobar_planificacion_terreno').eq('id', user.id).maybeSingle()
  if (!actor?.is_admin && !actor?.puede_aprobar_planificacion_terreno) {
    return NextResponse.json({ error: 'No tienes permiso para generar sugerencias de venta' }, { status: 403 })
  }

  const sugerencias = await sugerirVinculosDelPlan(supabase, id)

  const { data: insertadas, error } = sugerencias.length
    ? await supabase
        .from('plan_venta_visita_links_terreno')
        .upsert(
          sugerencias.map(s => ({
            visita_id: s.visitaId, venta_id: s.ventaId, tipo_vinculo: 'sugerido',
            score_heuristica: s.scoreHeuristica, criterio: s.criterio,
          })),
          { onConflict: 'venta_id', ignoreDuplicates: true },
        )
        .select('*')
    : { data: [], error: null }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ generadas: sugerencias.length, insertadas: insertadas?.length ?? 0, sugerencias: insertadas })
}
