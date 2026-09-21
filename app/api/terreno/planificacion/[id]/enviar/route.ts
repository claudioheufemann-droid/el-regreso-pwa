import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { politicaVigente } from '@/lib/terreno/planificacion/politicaVigente'
import { calcularPresupuestoSemana } from '@/lib/terreno/planificacion/calcularPresupuestoSemana'
import { construirSnapshotPlan } from '@/lib/terreno/planificacion/snapshotPlan'
import { requiereAutorizacionPrevia } from '@/lib/terreno/planificacion/validarUmbrales'
import { esEntregaTardia } from '@/lib/terreno/planificacion/semana'
import { encolarCorreo } from '@/lib/terreno/planificacion/outbox'
import type { DiaPresupuesto } from '@/lib/terreno/planificacion/types'
import { sendPushToUsers } from '@/lib/push'

// POST /api/terreno/planificacion/[id]/enviar — envía (o reenvía tras devolución) el
// plan a aprobación: congela un snapshot inmutable, notifica a Claudio/Mariel (correo +
// push, ambos idempotentes) y, si el total supera el umbral de la política, deja
// registrada la necesidad de autorización previa para que el aprobador la vea.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: plan } = await supabase.from('planes_semanales_terreno').select('*').eq('id', id).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
  if (plan.vendedor_id !== user.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (!['borrador', 'devuelto'].includes(plan.estado_plan)) {
    return NextResponse.json({ error: `El plan está en estado "${plan.estado_plan}", no se puede enviar` }, { status: 400 })
  }

  const { data: dias } = await supabase.from('plan_dias_terreno').select('*').eq('plan_id', id).order('fecha', { ascending: true })
  if (!dias?.length) return NextResponse.json({ error: 'El plan no tiene días cargados' }, { status: 400 })

  const diaIds = dias.map(d => d.id)
  const { data: paradas } = await supabase.from('plan_paradas_terreno').select('*').in('plan_dia_id', diaIds).order('orden', { ascending: true })

  const { data: rutasVigentes } = await supabase
    .from('plan_ruta_calculos_terreno')
    .select('plan_dia_id, distancia_total_m')
    .in('plan_dia_id', diaIds)
    .eq('vigente', true)
  const kmPorDia = new Map((rutasVigentes ?? []).map(r => [r.plan_dia_id, r.distancia_total_m as number]))

  const politica = await politicaVigente(supabase, plan.semana_lunes)
  if (!politica) return NextResponse.json({ error: 'No hay política de gastos vigente para esta semana' }, { status: 500 })

  const paradasPorDia = new Map<string, number>()
  for (const p of paradas ?? []) paradasPorDia.set(p.plan_dia_id, (paradasPorDia.get(p.plan_dia_id) ?? 0) + 1)

  const diasCalculo: DiaPresupuesto[] = dias.map(d => ({
    id: d.id, fecha: d.fecha, pernocta: d.pernocta, regreso_mismo_dia: d.regreso_mismo_dia,
    desayuno_incluido_alojamiento: d.desayuno_incluido_alojamiento, hotel_estimado_clp: d.hotel_estimado_clp,
    peajes_estimados_clp: d.peajes_estimados_clp, km_pagable_m: kmPorDia.get(d.id) ?? null,
    requiere_revision_comidas: d.requiere_revision_comidas,
    cantidad_paradas: paradasPorDia.get(d.id) ?? 0,
  }))
  const presupuesto = calcularPresupuestoSemana(diasCalculo, politica)

  const nuevaVersion = plan.version_actual + 1
  const ahora = new Date().toISOString()
  const tardia = esEntregaTardia(ahora, plan.fecha_limite_presentacion)

  const snapshot = construirSnapshotPlan({ plan, politica, dias, paradas: paradas ?? [], presupuesto })

  const { error: versionError } = await supabase.from('plan_versiones_terreno').insert({
    plan_id: id,
    numero_version: nuevaVersion,
    snapshot: { ...snapshot, entrega_tardia: tardia, fecha_limite_presentacion: plan.fecha_limite_presentacion },
    motivo: plan.estado_plan === 'devuelto' ? 'Reenvío tras devolución' : 'Envío inicial',
    creado_por: user.id,
  })
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })

  const { data: planActualizado, error: updateError } = await supabase
    .from('planes_semanales_terreno')
    .update({
      estado_plan: 'enviado',
      version_actual: nuevaVersion,
      presentado_at: ahora,
      monto_solicitado_km: presupuesto.montoTotalKmClp,
      monto_solicitado_peajes: presupuesto.montoTotalPeajesClp,
      monto_solicitado_comidas: presupuesto.montoTotalComidasClp,
      monto_solicitado_total: presupuesto.montoTotalClp,
      monto_alojamiento_estimado: presupuesto.montoAlojamientoEstimadoClp,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Umbral > $250.000: se deja registrada la necesidad de autorización previa para que
  // el aprobador la vea al decidir — no bloquea el envío (la política exige que se
  // programe CON ANTICIPACIÓN, pero un vendedor que ya está sobre el umbral igual debe
  // poder pedir la autorización formalmente en vez de quedar sin ninguna vía).
  if (requiereAutorizacionPrevia(presupuesto.montoTotalClp, politica.umbral_autorizacion_previa_clp)) {
    const { data: yaExiste } = await supabase
      .from('plan_autorizaciones_previas_terreno')
      .select('id')
      .eq('plan_id', id)
      .eq('estado', 'pendiente')
      .maybeSingle()
    if (!yaExiste) {
      await supabase.from('plan_autorizaciones_previas_terreno').insert({
        plan_id: id,
        monto_clp: presupuesto.montoTotalClp,
        motivo: `Total solicitado ($${presupuesto.montoTotalClp.toLocaleString('es-CL')}) supera el umbral de autorización previa de la política v${politica.version} ($${politica.umbral_autorizacion_previa_clp.toLocaleString('es-CL')})`,
        solicitado_por: user.id,
      })
    }
  }

  await supabase.from('terreno_auditoria').insert({
    entidad: 'plan_semanal_terreno',
    entidad_id: id,
    accion: plan.estado_plan === 'devuelto' ? 'reenviado_a_aprobacion' : 'enviado_a_aprobacion',
    admin_id: user.id,
    motivo: tardia ? 'Entrega tardía (después del viernes límite)' : null,
    datos_nuevos: { version: nuevaVersion, monto_solicitado_total: presupuesto.montoTotalClp, tardia },
  })

  const { data: destinatarios } = await supabase
    .from('users')
    .select('id, email')
    .or('puede_aprobar_planificacion_terreno.eq.true,puede_pagar_planificacion_terreno.eq.true')

  // Una falla al encolar el correo (o al SUPABASE_SERVICE_KEY faltar en un entorno) NUNCA
  // debe perder la solicitud ya guardada — el plan ya quedó "enviado" arriba. Se loguea y
  // se sigue; el respaldo de notificación interna (push) se intenta aparte más abajo.
  const resultadosOutbox = await Promise.allSettled(
    (destinatarios ?? []).map(d =>
      encolarCorreo({
        tipoEvento: 'plan_enviado_a_aprobacion',
        entidadId: id,
        entidadVersion: nuevaVersion,
        destinatarioEmail: d.email,
        payload: {
          vendedorId: plan.vendedor_id,
          semanaLunes: plan.semana_lunes,
          version: nuevaVersion,
          montoSolicitadoTotal: presupuesto.montoTotalClp,
          montoAlojamientoEstimado: presupuesto.montoAlojamientoEstimadoClp,
          tardia,
          algunDiaPendienteDeCalculo: presupuesto.algunDiaPendienteDeCalculo,
        },
      }),
    ),
  )
  resultadosOutbox.forEach(r => { if (r.status === 'rejected') console.error('enviar a aprobación: no se pudo encolar un correo:', r.reason) })

  await sendPushToUsers((destinatarios ?? []).map(d => d.id), {
    title: 'Plan semanal por aprobar',
    body: `Semana ${plan.semana_lunes} · $${presupuesto.montoTotalClp.toLocaleString('es-CL')} solicitados`,
    url: `/terreno/admin/planificacion?semana=${plan.semana_lunes}&vendedor=${plan.vendedor_id}`,
    tag: 'plan_enviado_a_aprobacion',
  })

  return NextResponse.json({ plan: planActualizado, presupuesto, tardia })
}
