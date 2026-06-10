import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

export const runtime = 'nodejs'

// Vercel Cron: lunes a viernes 12:30 UTC (09:30 Chile)
// Se ejecuta el día ANTES de que venza el snooze → recordatorio anticipado

function initVapid() {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@elregresobeer.com',
      pub, priv,
    )
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  initVapid()

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  // Mañana en YYYY-MM-DD
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // Misiones pospuestas cuyo snooze vence mañana
  const { data: misionesRaw } = await supabase
    .from('misiones')
    .select('id, vendedor, nombre_fantasia, snooze_until')
    .eq('estado', 'pospuesto')
    .eq('snooze_until', tomorrowStr)

  if (!misionesRaw?.length) {
    return NextResponse.json({ ok: true, sent: 0, message: 'Sin recordatorios para mañana' })
  }

  // Agrupar por vendedor
  const porVendedor = new Map<string, { nombre_fantasia: string }[]>()
  for (const m of misionesRaw) {
    if (!porVendedor.has(m.vendedor)) porVendedor.set(m.vendedor, [])
    porVendedor.get(m.vendedor)!.push({ nombre_fantasia: m.nombre_fantasia })
  }

  // Obtener push subscriptions y mapa nombre → email
  const [{ data: allSubs }, { data: usersRaw }] = await Promise.all([
    supabase.from('push_subscriptions').select('endpoint, p256dh, auth, user_email'),
    supabase.from('users').select('email, nombre'),
  ])

  const vendedorEmailMap = new Map<string, string>()
  for (const u of (usersRaw ?? [])) {
    if (u.nombre && u.email) vendedorEmailMap.set(u.nombre, u.email)
  }

  let sent = 0

  for (const [vendedor, misiones] of porVendedor) {
    const email = vendedorEmailMap.get(vendedor)
    if (!email) continue

    const subs = (allSubs ?? []).filter(s => s.user_email === email)
    if (!subs.length) continue

    const n = misiones.length
    const nombres = misiones.map(m => m.nombre_fantasia).join(', ')
    const payload = JSON.stringify({
      title: `Recordatorio: ${n} cliente${n > 1 ? 's' : ''} para contactar mañana`,
      body: nombres.length > 90 ? nombres.slice(0, 87) + '…' : nombres,
      url: '/ventas/misiones',
      tag: 'snooze-reminder',
      requireInteraction: true,
    })

    await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ).catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then(() => {})
          }
        })
      )
    )
    sent += subs.length
  }

  return NextResponse.json({ ok: true, sent, misionesCount: misionesRaw.length, fecha: tomorrowStr })
}
