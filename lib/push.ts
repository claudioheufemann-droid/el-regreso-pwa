import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './supabase/config'

/**
 * Cliente service-role, NO el de sesión/cookies.
 *
 * Bug real (2026-07-30): las funciones de este archivo antes armaban su
 * propio cliente con cookies() + SUPABASE_ANON_KEY en cada llamada. Eso
 * funciona cuando quien dispara el evento es un usuario logueado en el
 * navegador (ej. un chofer marcando una entrega), pero el sync de ventas
 * (cron de GitHub Actions → /api/upload-ventas) llama a sendPushToAllAdmins()
 * SIN sesión de usuario — sin cookies, el cliente queda con rol "anon", y la
 * política RLS de `users` exige 'authenticated' para leer admins. El SELECT
 * volvía vacío (sin lanzar error), así que "if (!admins?.length) return"
 * cortaba en silencio: cero notificaciones de "venta cargada" se crearon
 * NUNCA, sin ningún error en los logs que lo delatara.
 *
 * Estas funciones existen para avisarle a OTROS usuarios, no para actuar
 * como el usuario que dispara el evento — por eso van con service role
 * (bypass RLS) sin importar si quien las llama tiene sesión o no.
 */
function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('Push: falta SUPABASE_SERVICE_KEY en el entorno')
  return createClient(SUPABASE_URL, key)
}

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

// Misma resolución de URL destino que usa public/sw.js al hacer click en el
// push — así la campanita del hub navega exactamente al mismo lugar.
function resolverUrl(payload: PushPayload): string {
  if (payload.taskId) return `/gestion?task=${payload.taskId}`
  return payload.url || '/'
}

// Deja un registro persistente en `notificaciones` para cada destinatario,
// sin importar si el push en sí llega a entregarse (dispositivo offline,
// suscripción vencida, etc.) — la campanita del hub es la fuente de verdad
// de "qué me llegó", el push es solo el aviso en caliente.
async function registrarNotificaciones(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return
  try {
    const supabase = supabaseAdmin()
    const url = resolverUrl(payload)
    const unicos = Array.from(new Set(userIds))
    await supabase.from('notificaciones').insert(
      unicos.map(uid => ({ user_id: uid, titulo: payload.title, cuerpo: payload.body, url, tipo: payload.tag ?? null }))
    )
  } catch (e) {
    console.error('registrarNotificaciones error:', e)
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  initVapid()
  registrarNotificaciones([userId], payload)
  try {
    const supabase = supabaseAdmin()

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
    const supabase = supabaseAdmin()

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_email', email)

    if (!subs?.length) return

    const userIds = subs.map(s => s.user_id).filter((id): id is string => !!id)
    registrarNotificaciones(userIds, payload)

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
    const supabase = supabaseAdmin()
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
    const supabase = supabaseAdmin()
    const { data: subs } = await supabase.from('push_subscriptions').select('*')
    if (!subs?.length) return

    // Registro persistente por trabajador (no por suscripción — un mismo
    // usuario puede tener varios dispositivos y no queremos duplicar filas).
    const { data: todos } = await supabase.from('users').select('id')
    registrarNotificaciones((todos ?? []).map(u => u.id), payload)

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
