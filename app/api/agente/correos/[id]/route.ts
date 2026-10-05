import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarEmailGmail } from '@/lib/email-gmail'
import { LIMITES_CORREO, htmlCorreo } from '@/lib/agente/correos'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agente/correos/[id]  { accion: 'enviar' | 'descartar', asunto?, cuerpo? }
 *
 * El ÚNICO lugar donde sale un correo del Asistente de datos: lo dispara una
 * persona (admin) desde la tarjeta del borrador, nunca el modelo. Puede venir
 * con el asunto y el cuerpo editados. La dirección del destinatario se lee acá
 * de `users` (no del borrador ni del navegador) y el estado pasa por
 * 'enviando' con una actualización condicional, así un doble clic no manda
 * dos veces. Ver lib/agente/correos.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null) as { accion?: unknown; asunto?: unknown; cuerpo?: unknown } | null
  const accion = body?.accion
  if (accion !== 'enviar' && accion !== 'descartar') return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: borrador } = await admin.from('agente_correos')
    .select('id, creado_por, destinatario_id, destinatario_nombre, asunto, cuerpo, estado')
    .eq('id', id).maybeSingle()
  // Sólo quien lo pidió al asistente puede enviarlo o descartarlo.
  if (!borrador || borrador.creado_por !== user.id) return NextResponse.json({ error: 'Borrador no encontrado.' }, { status: 404 })
  if (borrador.estado !== 'pendiente' && borrador.estado !== 'error') {
    return NextResponse.json({ error: `Este correo ya está ${borrador.estado}.` }, { status: 409 })
  }

  if (accion === 'descartar') {
    await admin.from('agente_correos').update({ estado: 'descartado' }).eq('id', id).in('estado', ['pendiente', 'error'])
    return NextResponse.json({ ok: true, estado: 'descartado' })
  }

  const asunto = (typeof body?.asunto === 'string' ? body.asunto : borrador.asunto).trim().slice(0, LIMITES_CORREO.asunto)
  const cuerpo = (typeof body?.cuerpo === 'string' ? body.cuerpo : borrador.cuerpo).trim().slice(0, LIMITES_CORREO.cuerpo)
  if (!asunto || !cuerpo) return NextResponse.json({ error: 'El asunto y el mensaje no pueden quedar vacíos.' }, { status: 400 })

  // Reserva el envío: si otra pestaña o un doble clic ya lo tomó, no hay fila que actualizar.
  const { data: reservado } = await admin.from('agente_correos')
    .update({ estado: 'enviando', asunto, cuerpo, error: null })
    .eq('id', id).in('estado', ['pendiente', 'error'])
    .select('id').maybeSingle()
  if (!reservado) return NextResponse.json({ error: 'Este correo ya se está enviando.' }, { status: 409 })

  const { data: destinatario } = await admin.from('users').select('email, nombre').eq('id', borrador.destinatario_id).maybeSingle()
  const email = destinatario?.email?.trim()
  if (!email) {
    await admin.from('agente_correos').update({ estado: 'error', error: 'El vendedor no tiene correo registrado.' }).eq('id', id)
    return NextResponse.json({ error: `${borrador.destinatario_nombre} no tiene correo registrado en la app.` }, { status: 422 })
  }

  const r = await enviarEmailGmail({ toEmail: email, subject: asunto, html: htmlCorreo(cuerpo, user.nombre), replyTo: user.email || undefined })
  if (r.error) {
    await admin.from('agente_correos').update({ estado: 'error', error: String(r.error).slice(0, 300) }).eq('id', id)
    return NextResponse.json({ error: 'No se pudo enviar el correo. Puedes reintentar.' }, { status: 502 })
  }

  const enviadoAt = new Date().toISOString()
  await admin.from('agente_correos').update({ estado: 'enviado', enviado_por: user.id, enviado_at: enviadoAt }).eq('id', id)
  return NextResponse.json({ ok: true, estado: 'enviado', enviado_at: enviadoAt })
}
