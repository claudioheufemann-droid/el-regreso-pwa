import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { emailCotizacion } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * POST /api/cotizaciones/enviar-email
 * Envía por correo (Resend) la imagen ya generada y guardada en Storage
 * para una cotización existente. No genera nada nuevo — solo adjunta la
 * imagen que ya está en cotizaciones.imagen_url.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { cotizacionId } = await req.json().catch(() => ({ cotizacionId: null }))
  if (!cotizacionId) return NextResponse.json({ error: 'Falta cotizacionId' }, { status: 400 })

  const supabase = await createClient()
  const { data: cot, error: errFetch } = await supabase
    .from('cotizaciones')
    .select('id, numero, cliente_nombre, cliente_email, creado_por_nombre, imagen_url, estado')
    .eq('id', cotizacionId)
    .maybeSingle()

  if (errFetch || !cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  if (!cot.cliente_email) return NextResponse.json({ error: 'El cliente no tiene email registrado' }, { status: 400 })
  if (!cot.imagen_url) return NextResponse.json({ error: 'La cotización todavía no tiene imagen generada' }, { status: 400 })

  const imgRes = await fetch(cot.imagen_url)
  if (!imgRes.ok) return NextResponse.json({ error: 'No se pudo leer la imagen de la cotización' }, { status: 500 })
  const buffer = Buffer.from(await imgRes.arrayBuffer())

  const resultado = await emailCotizacion({
    toEmail: cot.cliente_email,
    clienteNombre: cot.cliente_nombre,
    numero: cot.numero,
    vendedorNombre: cot.creado_por_nombre,
    imagenBase64: buffer.toString('base64'),
  })

  if (resultado?.error) return NextResponse.json({ error: 'No se pudo enviar el correo' }, { status: 500 })

  await supabase.from('cotizaciones').update({
    estado: cot.estado === 'ganada' || cot.estado === 'perdida' ? cot.estado : 'enviada',
    enviado_email_at: new Date().toISOString(),
  }).eq('id', cotizacionId)

  return NextResponse.json({ ok: true })
}
