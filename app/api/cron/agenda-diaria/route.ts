import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

export const runtime = 'nodejs'

// Vercel Hobby solo ejecuta crons una vez al día (no permite el intervalo de
// minutos que necesitaría un aviso "15 minutos antes" preciso por cada
// compromiso). Este cron corre una vez en la mañana y manda a cada vendedor
// el resumen completo de su agenda del día, ordenado por hora — el mejor
// aviso posible sin pasar a un plan Pro.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@elregresobeer.com', pub, priv)
  } else {
    console.error('agenda-diaria: faltan VAPID keys')
  }

  const inicioHoy = new Date()
  inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date()
  finHoy.setHours(23, 59, 59, 999)

  const { data: seguimientos } = await supabase
    .from('seguimientos')
    .select('vendedor_id, cliente_nombre, tipo_accion, fecha_hora_compromiso, nota')
    .eq('estado', 'pendiente')
    .gte('fecha_hora_compromiso', inicioHoy.toISOString())
    .lte('fecha_hora_compromiso', finHoy.toISOString())
    .order('fecha_hora_compromiso', { ascending: true })

  if (!seguimientos?.length) return NextResponse.json({ ok: true, enviados: 0 })

  const emojiTipo: Record<string, string> = { llamar: '📞', email: '✉️', whatsapp: '💬', visita: '🚗' }

  const porVendedor: Record<string, typeof seguimientos> = {}
  for (const s of seguimientos) {
    if (!porVendedor[s.vendedor_id]) porVendedor[s.vendedor_id] = []
    porVendedor[s.vendedor_id].push(s)
  }

  let enviados = 0
  for (const [vendedorId, items] of Object.entries(porVendedor)) {
    const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', vendedorId)
    if (!subs?.length) continue

    const lineas = items.slice(0, 5).map(s => {
      const hora = s.fecha_hora_compromiso
        ? new Date(s.fecha_hora_compromiso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        : '--:--'
      return `${hora} ${emojiTipo[s.tipo_accion] ?? ''} ${s.cliente_nombre}`
    }).join(' · ')

    const payload = {
      title: `📋 Tu agenda de hoy — ${items.length} compromiso${items.length > 1 ? 's' : ''}`,
      body: lineas + (items.length > 5 ? ` (y ${items.length - 5} más)` : ''),
      url: '/ventas/agenda',
      tag: `agenda-diaria-${vendedorId}`,
      requireInteraction: false,
    }

    await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        ).catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        })
      )
    )
    enviados++
  }

  return NextResponse.json({ ok: true, enviados, vendedores: Object.keys(porVendedor).length })
}
