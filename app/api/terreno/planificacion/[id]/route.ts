import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cargarPlanCompleto } from '@/lib/terreno/planificacion/cargarPlanCompleto'

// GET /api/terreno/planificacion/[id] — detalle completo: cabecera + días + paradas +
// presupuesto calculado EN VIVO contra la política vigente (o la congelada, si el plan
// ya está aprobado). RLS ya filtra quién puede ver este plan.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const completo = await cargarPlanCompleto(supabase, id)
  if (!completo) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
  return NextResponse.json(completo)
}

// PATCH /api/terreno/planificacion/[id] — sólo transiciones simples permitidas acá
// (cancelar un borrador propio). Enviar/aprobar/fondos/rendición tienen su propio
// endpoint con sus propias reglas — no se mezclan en este PATCH genérico.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { estado_plan?: string }
  if (body.estado_plan !== 'cancelado') {
    return NextResponse.json({ error: 'Sólo se admite estado_plan="cancelado" en este endpoint' }, { status: 400 })
  }

  const { data: plan } = await supabase.from('planes_semanales_terreno').select('vendedor_id, estado_plan').eq('id', id).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
  if (plan.vendedor_id !== user.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!['borrador', 'devuelto'].includes(plan.estado_plan)) {
    return NextResponse.json({ error: `No se puede cancelar un plan en estado "${plan.estado_plan}"` }, { status: 400 })
  }

  const { data: actualizado, error } = await supabase
    .from('planes_semanales_terreno')
    .update({ estado_plan: 'cancelado' })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(actualizado)
}
