import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarPlanEditable } from '@/lib/terreno/planificacion/validarPlanEditable'

// PATCH /api/terreno/planificacion/[id]/dias/[diaId]/paradas/[paradaId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; diaId: string; paradaId: string }> }) {
  const { id, diaId, paradaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error: errResp } = await validarPlanEditable(supabase, id, user.id)
  if (errResp) return errResp

  const body = await req.json()
  delete body.plan_dia_id
  delete body.id
  delete body.visita_id // se llena sólo al ejecutar (nueva-visita), no editable a mano

  // orden y coordenadas de cliente afectan la ruta => invalidar cache si cambian.
  const cambiaRuta = 'orden' in body || 'cliente_id' in body || 'cliente_terreno_id' in body
  if (cambiaRuta) {
    body.estado_calculo_ruta = 'pendiente_de_calculo'
    body.distancia_estimada_m = null
  }

  const { data: parada, error } = await supabase
    .from('plan_paradas_terreno')
    .update(body)
    .eq('id', paradaId)
    .eq('plan_dia_id', diaId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (cambiaRuta) await supabase.from('plan_ruta_calculos_terreno').update({ vigente: false }).eq('plan_dia_id', diaId)

  return NextResponse.json(parada)
}

// DELETE /api/terreno/planificacion/[id]/dias/[diaId]/paradas/[paradaId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; diaId: string; paradaId: string }> }) {
  const { id, diaId, paradaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error: errResp } = await validarPlanEditable(supabase, id, user.id)
  if (errResp) return errResp

  const { error } = await supabase.from('plan_paradas_terreno').delete().eq('id', paradaId).eq('plan_dia_id', diaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await supabase.from('plan_ruta_calculos_terreno').update({ vigente: false }).eq('plan_dia_id', diaId)

  return NextResponse.json({ ok: true })
}
