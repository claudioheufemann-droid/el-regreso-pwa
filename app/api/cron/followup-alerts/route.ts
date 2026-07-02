import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

export const runtime = 'nodejs'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}/${m}`
}

type PushSub = { endpoint: string; p256dh: string; auth: string; user_id: string }

async function sendPushToVendors(
  supabase: any,
  vendorNames: string[],
  payload: { title: string; body: string; tag?: string; requireInteraction?: boolean }
) {
  if (!vendorNames.length) return

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@elregresobeer.com', pub, priv)
  }

  // Buscar IDs de usuarios que correspondan a estos vendedores
  const { data: users } = await supabase
    .from('usuarios')
    .select('id, nombre')
    .in('nombre', vendorNames)

  if (!users?.length) return

  const userIds = (users as { id: string; nombre: string }[]).map(u => u.id)
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds)

  if (!subs?.length) return

  await Promise.allSettled(
    (subs as PushSub[]).map(sub =>
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
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  const today = new Date()
  const todayStr = toDateStr(today)
  const tomorrowStr = toDateStr(addDays(today, 1))

  // Cargar follow-ups pendientes
  const { data: followups } = await supabase
    .from('followups')
    .select('id, cliente_nombre_fantasia, nota, fecha_recordatorio, vendedor, estado')
    .eq('estado', 'pendiente')

  if (!followups) return NextResponse.json({ error: 'No data' }, { status: 500 })

  const stats = { mañana: 0, hoy: 0 }

  // ── Mañana: notificación "Mañana caduca..." ────────────
  const mañana = (followups as any[])
    .filter(fu => fu.fecha_recordatorio === tomorrowStr)
    .reduce((acc: Record<string, any[]>, fu) => {
      const v = fu.vendedor || 'Sin asignar'
      if (!acc[v]) acc[v] = []
      acc[v].push(fu)
      return acc
    }, {})

  for (const [vendor, fus] of Object.entries(mañana)) {
    const count = (fus as any[]).length
    const clientes = (fus as any[]).map(f => f.cliente_nombre_fantasia).join(', ')
    await sendPushToVendors(supabase, [vendor], {
      title: `📅 ${count} recordatorio${count > 1 ? 's' : ''} mañana`,
      body: `${clientes}${count > 1 ? ` (y más)` : ''}`,
      tag: `followup-mañana-${vendor}`,
      requireInteraction: false,
    })
    stats.mañana += count
  }

  // ── Hoy: notificación "HOY caduca..." ────────────────
  const hoy = (followups as any[])
    .filter(fu => fu.fecha_recordatorio === todayStr)
    .reduce((acc: Record<string, any[]>, fu) => {
      const v = fu.vendedor || 'Sin asignar'
      if (!acc[v]) acc[v] = []
      acc[v].push(fu)
      return acc
    }, {})

  for (const [vendor, fus] of Object.entries(hoy)) {
    const count = (fus as any[]).length
    const clientes = (fus as any[]).map(f => f.cliente_nombre_fantasia).join(', ')
    await sendPushToVendors(supabase, [vendor], {
      title: `🔴 ${count} recordatorio${count > 1 ? 's' : ''} VENCE HOY`,
      body: `${clientes}${count > 1 ? ` (y más)` : ''}`,
      tag: `followup-hoy-${vendor}`,
      requireInteraction: true,
    })
    stats.hoy += count
  }

  return NextResponse.json({ ok: true, date: todayStr, stats })
}
