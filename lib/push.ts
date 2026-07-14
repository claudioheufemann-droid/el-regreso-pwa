import webpush from 'web-push'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase/config'

function initVapid() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@elregresobeer.com',
      pub,
      priv
    )
  } else {
    console.error('Push: faltan variables VAPID en el entorno (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — no se puede enviar ninguna notificación push')
  }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  taskId?: string   // ← deep link directo a la tarea
  requireInteraction?: boolean
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  initVapid()
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)

    if (!subs?.length) return

    await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        ).catch(err => {
          // Si el endpoint ya no es válido (410/404), eliminarlo
          if (err.statusCode === 410 || err.statusCode === 404) {
            supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then(() => {})
          } else {
            console.error(`Push: fallo al enviar a user ${userId} (status ${err.statusCode ?? '?'}):`, err.body ?? err.message ?? err)
          }
        })
      )
    )
  } catch (e) {
    console.error('Push error:', e)
  }
}

export async function sendPushToEmail(email: string, payload: PushPayload) {
  initVapid()
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_email', email)

    if (!subs?.length) return

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
      )
    )
    results.forEach(r => { if (r.status === 'rejected') console.error(`Push: fallo al enviar a ${email}:`, r.reason) })
  } catch (e) {
    console.error('Push to email error:', e)
  }
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  await Promise.allSettled(userIds.map(id => sendPushToUser(id, payload)))
}

export async function sendPushToAllAdmins(payload: PushPayload) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    })
    const { data: admins } = await supabase.from('users').select('id').eq('is_admin', true)
    if (!admins?.length) return
    await Promise.allSettled(admins.map(a => sendPushToUser(a.id, payload)))
  } catch (e) {
    console.error('Push to admins error:', e)
  }
}

/** Envía a TODOS los usuarios con suscripción activa */
export async function sendPushToAll(payload: PushPayload) {
  initVapid()
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
    })
    const { data: subs } = await supabase.from('push_subscriptions').select('*')
    if (!subs?.length) return
    await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        ).catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then(() => {})
          } else {
            console.error(`Push: fallo al enviar a ${sub.user_email ?? sub.user_id} (status ${err.statusCode ?? '?'}):`, err.body ?? err.message ?? err)
          }
        })
      )
    )
  } catch (e) {
    console.error('Push to all error:', e)
  }
}
