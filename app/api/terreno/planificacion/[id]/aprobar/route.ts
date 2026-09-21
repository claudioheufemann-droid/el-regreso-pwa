import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requiereAutorizacionPrevia, incrementoAutorizado } from '@/lib/terreno/planificacion/validarUmbrales'
import { sendPushToUser } from '@/lib/push'

interface ObservacionInput {
  plan_dia_id?: string
  tipo_partida?: 'km' | 'peaje' | 'comida' | 'alojamiento' | 'parada'
  comentario: string
}

interface AprobarBody {
  decision: 'aprobado' | 'rechazado' | 'devuelto'
  comentario?: string
  monto_aprobado_km?: number
  monto_aprobado_peajes?: number
  monto_aprobado_comidas?: number
  observaciones?: ObservacionInput[]
}

// POST /api/terreno/planificacion/[id]/aprobar — decisión de gerencia sobre la versión
// actual del plan. El trigger de DB ya impide que un vendedor apruebe su propio plan;
// acá se valida el permiso de rol, el umbral de $250.000 (estricto, >) y que el monto
// aprobado no crezca sin autorización previa respecto de una aprobación anterior del
// mismo plan (cambios posteriores con impacto económico).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: actor } = await supabase.from('users').select('puede_aprobar_planificacion_terreno').eq('id', user.id).maybeSingle()
  if (!actor?.puede_aprobar_planificacion_terreno) {
    return NextResponse.json({ error: 'No tienes permiso para aprobar planificación de terreno' }, { status: 403 })
  }

  const body = await req.json() as AprobarBody
  if (!['aprobado', 'rechazado', 'devuelto'].includes(body.decision)) {
    return NextResponse.json({ error: 'decision inválida' }, { status: 400 })
  }

  const { data: plan } = await supabase.from('planes_semanales_terreno').select('*').eq('id', id).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
  if (!['enviado', 'en_revision'].includes(plan.estado_plan)) {
    return NextResponse.json({ error: `El plan está en estado "${plan.estado_plan}", no hay nada que decidir` }, { status: 400 })
  }

  const { data: version } = await supabase
    .from('plan_versiones_terreno')
    .select('*')
    .eq('plan_id', id)
    .eq('numero_version', plan.version_actual)
    .single()
  if (!version) return NextResponse.json({ error: 'No se encontró el snapshot de la versión enviada' }, { status: 500 })

  const snapshotPolitica = version.snapshot.politica_gastos as { id: string; umbral_autorizacion_previa_clp: number }

  if (body.decision !== 'aprobado') {
    const { error: decisionError } = await supabase.from('plan_aprobaciones_terreno').insert({
      plan_id: id,
      version_evaluada: plan.version_actual,
      decision: body.decision,
      actor_id: user.id,
      comentario: body.comentario ?? null,
    }).select('id').single()
    if (decisionError) {
      const status = decisionError.message.includes('propio plan') ? 403 : 500
      return NextResponse.json({ error: decisionError.message }, { status })
    }

    if (body.observaciones?.length) {
      const { data: aprobacionRow } = await supabase
        .from('plan_aprobaciones_terreno')
        .select('id').eq('plan_id', id).eq('version_evaluada', plan.version_actual)
        .order('created_at', { ascending: false }).limit(1).single()
      await supabase.from('plan_observaciones_terreno').insert(
        body.observaciones.map(o => ({ aprobacion_id: aprobacionRow!.id, plan_dia_id: o.plan_dia_id ?? null, tipo_partida: o.tipo_partida ?? null, comentario: o.comentario })),
      )
    }

    const { data: planActualizado, error } = await supabase
      .from('planes_semanales_terreno')
      .update({ estado_plan: body.decision === 'rechazado' ? 'rechazado' : 'devuelto' })
      .eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('terreno_auditoria').insert({
      entidad: 'plan_semanal_terreno', entidad_id: id, accion: `plan_${body.decision}`, admin_id: user.id,
      motivo: body.comentario ?? null, datos_nuevos: { version: plan.version_actual },
    })

    await sendPushToUser(plan.vendedor_id, {
      title: body.decision === 'rechazado' ? 'Tu plan semanal fue rechazado' : 'Tu plan semanal fue devuelto',
      body: body.comentario ?? `Semana ${plan.semana_lunes}`,
      url: `/terreno/planificacion?semana=${plan.semana_lunes}`,
      tag: `plan_${body.decision}`,
    })

    return NextResponse.json(planActualizado)
  }

  // decision === 'aprobado'
  const montoKm = body.monto_aprobado_km ?? plan.monto_solicitado_km ?? 0
  const montoPeajes = body.monto_aprobado_peajes ?? plan.monto_solicitado_peajes ?? 0
  const montoComidas = body.monto_aprobado_comidas ?? plan.monto_solicitado_comidas ?? 0
  const montoTotal = montoKm + montoPeajes + montoComidas

  const { data: aprobacionPrevia } = await supabase
    .from('plan_aprobaciones_terreno')
    .select('monto_aprobado_total')
    .eq('plan_id', id).eq('decision', 'aprobado')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (aprobacionPrevia) {
    const { data: autorizacionesAprobadas } = await supabase
      .from('plan_autorizaciones_previas_terreno')
      .select('monto_clp').eq('plan_id', id).eq('estado', 'aprobada')
    const sumaAutorizaciones = (autorizacionesAprobadas ?? []).reduce((s, a) => s + a.monto_clp, 0)
    const chequeo = incrementoAutorizado(aprobacionPrevia.monto_aprobado_total ?? 0, montoTotal, sumaAutorizaciones)
    if (!chequeo.autorizado) {
      return NextResponse.json({
        error: `El monto aprobado no puede crecer $${chequeo.incrementoClp.toLocaleString('es-CL')} sin una autorización previa que lo cubra`,
      }, { status: 400 })
    }
  }

  if (requiereAutorizacionPrevia(montoTotal, snapshotPolitica.umbral_autorizacion_previa_clp)) {
    // La aprobación de gerencia sobre un monto que supera el umbral ES la autorización
    // previa escrita: se deja aprobada acá mismo, atribuida y con fecha, en vez de exigir
    // un paso separado redundante cuando el aprobador ya es quien tiene esa potestad.
    await supabase
      .from('plan_autorizaciones_previas_terreno')
      .update({ estado: 'aprobada', autorizado_por: user.id, decidido_at: new Date().toISOString() })
      .eq('plan_id', id).eq('estado', 'pendiente')

    const { data: quedaPendiente } = await supabase
      .from('plan_autorizaciones_previas_terreno')
      .select('id').eq('plan_id', id).eq('estado', 'aprobada').limit(1).maybeSingle()
    if (!quedaPendiente) {
      await supabase.from('plan_autorizaciones_previas_terreno').insert({
        plan_id: id, monto_clp: montoTotal,
        motivo: `Autorización previa implícita en la aprobación del plan (total $${montoTotal.toLocaleString('es-CL')} supera el umbral)`,
        solicitado_por: user.id, autorizado_por: user.id, estado: 'aprobada', decidido_at: new Date().toISOString(),
      })
    }
  }

  const { error: decisionError } = await supabase.from('plan_aprobaciones_terreno').insert({
    plan_id: id,
    version_evaluada: plan.version_actual,
    decision: 'aprobado',
    actor_id: user.id,
    monto_aprobado_km: montoKm,
    monto_aprobado_peajes: montoPeajes,
    monto_aprobado_comidas: montoComidas,
    monto_aprobado_total: montoTotal,
    comentario: body.comentario ?? null,
  })
  if (decisionError) {
    const status = decisionError.message.includes('propio plan') ? 403 : 500
    return NextResponse.json({ error: decisionError.message }, { status })
  }

  const { data: planActualizado, error } = await supabase
    .from('planes_semanales_terreno')
    .update({
      estado_plan: 'aprobado',
      politica_gastos_id: snapshotPolitica.id,
      monto_aprobado_km: montoKm,
      monto_aprobado_peajes: montoPeajes,
      monto_aprobado_comidas: montoComidas,
      monto_aprobado_total: montoTotal,
    })
    .eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('terreno_auditoria').insert({
    entidad: 'plan_semanal_terreno', entidad_id: id, accion: 'plan_aprobado', admin_id: user.id,
    motivo: body.comentario ?? null, datos_nuevos: { version: plan.version_actual, monto_aprobado_total: montoTotal },
  })

  await sendPushToUser(plan.vendedor_id, {
    title: 'Tu plan semanal fue aprobado',
    body: `Semana ${plan.semana_lunes} · $${montoTotal.toLocaleString('es-CL')} aprobados`,
    url: `/terreno/planificacion?semana=${plan.semana_lunes}`,
    tag: 'plan_aprobado',
  })

  return NextResponse.json(planActualizado)
}
