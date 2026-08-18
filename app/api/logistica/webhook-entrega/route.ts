import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendWhatsAppImage, sendWhatsAppTemplate } from '@/lib/whatsapp'

export const runtime = 'nodejs'

interface EntregaRecord {
  id: string
  parada_id: string
  foto_entrega_url: string
  estado: string
}

// POST /api/logistica/webhook-entrega
// Disparado por el trigger fn_notificar_entrega (pg_net) al insertar una entrega 'entregado'.
// Envía la foto al cliente (plantilla, si ya está aprobada) y al vendedor de la región (mensaje libre).
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.LOGISTICA_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { record } = await req.json() as { record: EntregaRecord }
  if (!record?.parada_id || !record.foto_entrega_url) {
    return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  const { data: parada } = await supabase
    .from('despacho_paradas')
    .select(`*,
      despacho:despachos(region),
      cliente:clientes(nombre_fantasia, telefono),
      cliente_terreno:clientes_terreno(nombre_fantasia, telefono)
    `)
    .eq('id', record.parada_id)
    .single()

  if (!parada) return NextResponse.json({ error: 'Parada no encontrada' }, { status: 404 })

  const clienteNombre = parada.cliente?.nombre_fantasia ?? parada.cliente_terreno?.nombre_fantasia ?? 'cliente'
  const clienteTelefono = parada.cliente?.telefono ?? parada.cliente_terreno?.telefono ?? null
  const region = (parada.despacho as { region?: string } | null)?.region ?? null

  const { data: vendedor } = region
    ? await supabase.from('users').select('telefono, nombre').eq('region', region).eq('rol', 'Vendedor').not('telefono', 'is', null).limit(1).maybeSingle()
    : { data: null }

  const templateName = process.env.WHATSAPP_TEMPLATE_ENTREGA_CONFIRMADA

  const resultados: Record<string, unknown> = {}

  // ── Cliente ──
  if (clienteTelefono) {
    resultados.cliente = templateName
      ? await sendWhatsAppTemplate(clienteTelefono, templateName, record.foto_entrega_url, clienteNombre)
      : await sendWhatsAppImage(clienteTelefono, record.foto_entrega_url, `¡Hola ${clienteNombre}! Tu pedido fue entregado con éxito. Gracias por confiar en El Regreso 🍺`)
    // Sin plantilla aprobada, este envío solo funciona si el cliente escribió primero en las últimas 24h.
  } else {
    resultados.cliente = { ok: false, error: 'Cliente sin teléfono registrado' }
  }

  // ── Vendedor de la región ──
  if (vendedor?.telefono) {
    resultados.vendedor = await sendWhatsAppImage(
      vendedor.telefono,
      record.foto_entrega_url,
      `📦 Pedido entregado: ${clienteNombre}. Tu venta se completó en terreno.`
    )
  } else {
    resultados.vendedor = { ok: false, error: 'Sin vendedor con teléfono para esa región' }
  }

  await supabase.from('entregas').update({ webhook_enviado_at: new Date().toISOString() }).eq('id', record.id)

  return NextResponse.json({ ok: true, resultados })
}
