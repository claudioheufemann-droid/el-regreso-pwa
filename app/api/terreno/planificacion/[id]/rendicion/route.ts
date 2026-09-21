import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

// GET /api/terreno/planificacion/[id]/rendicion
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: rendicion } = await supabase.from('plan_rendiciones_terreno').select('*').eq('plan_id', id).maybeSingle()
  if (!rendicion) return NextResponse.json(null)

  const { data: items, error } = await supabase.from('plan_rendicion_items_terreno').select('*').eq('rendicion_id', rendicion.id).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rendicion, items })
}

// POST /api/terreno/planificacion/[id]/rendicion — el vendedor abre (si no existe) y
// envía su rendición a revisión. Se puede volver a enviar tras una observación.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: plan } = await supabase.from('planes_semanales_terreno').select('vendedor_id, estado_plan').eq('id', id).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
  if (plan.vendedor_id !== user.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (plan.estado_plan !== 'aprobado') return NextResponse.json({ error: 'Sólo se rinde un plan aprobado' }, { status: 400 })

  const { data: existente } = await supabase.from('plan_rendiciones_terreno').select('*').eq('plan_id', id).maybeSingle()
  let rendicionId = existente?.id
  if (!existente) {
    const { data: creada, error } = await supabase.from('plan_rendiciones_terreno').insert({ plan_id: id }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rendicionId = creada.id
  } else if (!['pendiente', 'observada'].includes(existente.estado)) {
    return NextResponse.json({ error: `La rendición ya está en estado "${existente.estado}"` }, { status: 400 })
  }

  const { data: rendicion, error } = await supabase
    .from('plan_rendiciones_terreno')
    .update({ estado: 'enviada', enviada_at: new Date().toISOString() })
    .eq('id', rendicionId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('terreno_auditoria').insert({
    entidad: 'plan_rendicion_terreno', entidad_id: rendicionId!, accion: 'rendicion_enviada', admin_id: user.id,
    datos_nuevos: { plan_id: id },
  })
  await supabase
    .from('planes_semanales_terreno')
    .update({ rendicion_estado: 'enviada' })
    .eq('id', id)

  return NextResponse.json(rendicion)
}

// PATCH /api/terreno/planificacion/[id]/rendicion — revisión de gestión (aprobar/
// observar/liquidar). No borra nada; sólo cambia estado + comentario.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: actor } = await supabase
    .from('users')
    .select('puede_pagar_planificacion_terreno, puede_aprobar_planificacion_terreno')
    .eq('id', user.id).maybeSingle()
  if (!actor?.puede_pagar_planificacion_terreno && !actor?.puede_aprobar_planificacion_terreno) {
    return NextResponse.json({ error: 'No tienes permiso para revisar rendiciones' }, { status: 403 })
  }

  const body = await req.json() as { estado: 'observada' | 'aprobada' | 'liquidada'; comentario_revision?: string }
  if (!['observada', 'aprobada', 'liquidada'].includes(body.estado)) {
    return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
  }

  const { data: rendicion, error } = await supabase
    .from('plan_rendiciones_terreno')
    .update({ estado: body.estado, comentario_revision: body.comentario_revision ?? null, revisada_por: user.id, revisada_at: new Date().toISOString() })
    .eq('plan_id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('planes_semanales_terreno').update({ rendicion_estado: body.estado }).eq('id', id)
  await supabase.from('terreno_auditoria').insert({
    entidad: 'plan_rendicion_terreno', entidad_id: rendicion.id, accion: `rendicion_${body.estado}`, admin_id: user.id,
    motivo: body.comentario_revision ?? null,
  })

  const { data: plan } = await supabase.from('planes_semanales_terreno').select('vendedor_id, semana_lunes').eq('id', id).maybeSingle()
  if (plan) {
    await sendPushToUser(plan.vendedor_id, {
      title: body.estado === 'observada' ? 'Tu rendición tiene observaciones' : 'Tu rendición fue revisada',
      body: body.comentario_revision ?? `Semana ${plan.semana_lunes} · ${body.estado}`,
      url: `/terreno/planificacion?semana=${plan.semana_lunes}`,
      tag: `rendicion_${body.estado}`,
    })
  }

  return NextResponse.json(rendicion)
}
