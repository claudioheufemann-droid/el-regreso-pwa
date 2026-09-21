import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarPlanEditable } from '@/lib/terreno/planificacion/validarPlanEditable'

// PATCH /api/terreno/planificacion/[id]/dias/[diaId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; diaId: string }> }) {
  const { id, diaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error: errResp } = await validarPlanEditable(supabase, id, user.id)
  if (errResp) return errResp

  const body = await req.json()
  delete body.plan_id
  delete body.id

  const { data: dia, error } = await supabase
    .from('plan_dias_terreno')
    .update(body)
    .eq('id', diaId)
    .eq('plan_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(dia)
}

// DELETE /api/terreno/planificacion/[id]/dias/[diaId] — también borra sus paradas (ON DELETE CASCADE).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; diaId: string }> }) {
  const { id, diaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error: errResp } = await validarPlanEditable(supabase, id, user.id)
  if (errResp) return errResp

  const { error } = await supabase.from('plan_dias_terreno').delete().eq('id', diaId).eq('plan_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
