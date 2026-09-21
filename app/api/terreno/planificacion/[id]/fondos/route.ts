import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

// GET /api/terreno/planificacion/[id]/fondos — historial de entregas/ajustes/devoluciones.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase.from('plan_fondos_terreno').select('*').eq('plan_id', id).order('entregado_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/terreno/planificacion/[id]/fondos — registra una entrega real de dinero
// (Mariel). Aprobar el plan NO marca como pagado: esta es la única fuente de verdad de
// "cuánto se entregó de verdad". Admite parciales y ajustes/devoluciones (montos
// negativos). Sin plan aprobado no se libera fondo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: actor } = await supabase.from('users').select('puede_pagar_planificacion_terreno').eq('id', user.id).maybeSingle()
  if (!actor?.puede_pagar_planificacion_terreno) {
    return NextResponse.json({ error: 'No tienes permiso para registrar fondos de planificación de terreno' }, { status: 403 })
  }

  const { data: plan } = await supabase.from('planes_semanales_terreno').select('*').eq('id', id).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
  if (plan.estado_plan !== 'aprobado') {
    return NextResponse.json({ error: 'Sin plan aprobado no se libera fondo' }, { status: 400 })
  }

  const body = await req.json() as {
    tipo?: 'fondo_semanal' | 'alojamiento' | 'ajuste' | 'devolucion'
    monto_entregado_clp: number
    metodo?: string
    referencia_pago?: string
    comprobante_url?: string
  }
  if (!body.monto_entregado_clp) return NextResponse.json({ error: 'monto_entregado_clp es obligatorio y distinto de cero' }, { status: 400 })

  const { data: fondo, error } = await supabase
    .from('plan_fondos_terreno')
    .insert({
      plan_id: id,
      tipo: body.tipo ?? 'fondo_semanal',
      monto_entregado_clp: body.monto_entregado_clp,
      metodo: body.metodo ?? null,
      referencia_pago: body.referencia_pago ?? null,
      comprobante_url: body.comprobante_url ?? null,
      entregado_por: user.id,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // fondo_estado sólo considera el fondo semanal (+ sus ajustes/devoluciones) — el
  // alojamiento se rastrea aparte y nunca se mezcla en este semáforo.
  const { data: movimientosFondo } = await supabase
    .from('plan_fondos_terreno')
    .select('monto_entregado_clp')
    .eq('plan_id', id)
    .in('tipo', ['fondo_semanal', 'ajuste', 'devolucion'])
  const totalEntregado = (movimientosFondo ?? []).reduce((s, m) => s + m.monto_entregado_clp, 0)
  const montoAprobado = plan.monto_aprobado_total ?? 0
  const fondoEstado = totalEntregado <= 0 ? 'no_entregado' : totalEntregado >= montoAprobado ? 'entregado' : 'parcial'

  await supabase.from('planes_semanales_terreno').update({ fondo_estado: fondoEstado }).eq('id', id)

  await supabase.from('terreno_auditoria').insert({
    entidad: 'plan_semanal_terreno', entidad_id: id, accion: 'fondo_registrado', admin_id: user.id,
    datos_nuevos: { tipo: fondo.tipo, monto: fondo.monto_entregado_clp, fondo_estado: fondoEstado },
  })

  await sendPushToUser(plan.vendedor_id, {
    title: 'Se registró un pago de tu plan semanal',
    body: `$${body.monto_entregado_clp.toLocaleString('es-CL')} · ${fondo.tipo}`,
    url: `/terreno/planificacion?semana=${plan.semana_lunes}`,
    tag: 'plan_fondo_registrado',
  })

  return NextResponse.json({ fondo, fondo_estado: fondoEstado }, { status: 201 })
}
