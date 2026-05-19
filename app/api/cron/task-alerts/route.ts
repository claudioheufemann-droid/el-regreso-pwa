import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import webpush from 'web-push'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

// Vercel Cron: cada día a las 11:00 UTC (08:00 Chile UTC-3)
export const runtime = 'nodejs'

// ── Helpers de fecha ──────────────────────────────────────

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
  return `${d}/${m}/${y}`
}

function diffDays(isoA: string, isoB: string): number {
  const [ay, am, ad] = isoA.split('-').map(Number)
  const [by, bm, bd] = isoB.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// ── Push helper (sin cookies — apto para cron) ────────────

type PushSub = { endpoint: string; p256dh: string; auth: string; user_id: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendPushToUsers(
  supabase: any,
  userIds: string[],
  payload: { title: string; body: string; url?: string; tag?: string; requireInteraction?: boolean }
) {
  if (!userIds.length) return
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@elregresobeer.com', pub, priv)
  }
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

// ── Templates de mensajes ─────────────────────────────────

const MSG = {
  // T-3 días: cortesía
  courtesy: (titulo: string, plazo: string) => ({
    title: '📅 Plazo en 3 días',
    body: `"${titulo}" vence el ${fmtDate(plazo)}. Buen momento para avanzar.`,
    tag: `courtesy-${titulo}`,
    requireInteraction: false,
  }),

  // T-24h: advertencia
  warning: (titulo: string) => ({
    title: '⚠️ Vence mañana',
    body: `"${titulo}" vence mañana. ¡Asegúrate de completarla a tiempo!`,
    tag: `warning-${titulo}`,
    requireInteraction: true,
  }),

  // Día T a las 08:00: enfoque
  focus: (count: number, titulos: string[]) => ({
    title: `🎯 ${count} tarea${count > 1 ? 's' : ''} para hoy`,
    body: count === 1
      ? `"${titulos[0]}" vence hoy. ¡A completarla!`
      : `${titulos.slice(0, 2).map(t => `"${t}"`).join(', ')}${count > 2 ? ` y ${count - 2} más` : ''} vencen hoy.`,
    tag: 'daily-focus',
    requireInteraction: false,
  }),
}

// Template HTML para email de incumplimiento
function buildOverdueEmailHtml(userName: string, tasks: { titulo: string; area: string; plazo: string }[]): string {
  const taskRows = tasks.map(t => `
    <div style="padding:10px 14px;border-left:3px solid #FF6B6B;background:rgba(255,107,107,0.04);border-radius:0 8px 8px 0;margin-bottom:8px">
      <div style="font-size:13px;font-weight:600;color:#F0EAD6;margin-bottom:2px">${t.titulo}</div>
      <div style="font-size:10px;color:#6B6460">${t.area} · Venció el ${fmtDate(t.plazo)}</div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
<div style="max-width:540px;margin:40px auto;padding:0 20px">

  <div style="border-bottom:1px solid rgba(255,107,107,0.3);padding-bottom:20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;background:#FF4444;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;color:#fff">!</div>
    <div>
      <div style="color:#FF6B6B;font-weight:900;font-size:14px;letter-spacing:1px">ALERTA DE INCUMPLIMIENTO</div>
      <div style="color:#4A4540;font-size:10px">El Regreso Control · Notificación automática</div>
    </div>
  </div>

  <p style="font-size:15px;font-weight:700;color:#F0EAD6;margin-bottom:6px">Hola, ${userName.split(' ')[0]}.</p>
  <p style="font-size:13px;color:#8A8076;margin-bottom:20px">
    La${tasks.length > 1 ? 's' : ''} siguiente${tasks.length > 1 ? 's' : ''} tarea${tasks.length > 1 ? 's' : ''} venció${tasks.length > 1 ? 'ron' : ''} ayer sin ser completada${tasks.length > 1 ? 's' : ''}.
    Es necesario registrar su estado o escalar la situación.
  </p>

  <div style="margin-bottom:22px">${taskRows}</div>

  <a href="https://el-regreso-web.vercel.app" style="display:block;padding:14px;text-align:center;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.3);border-radius:10px;color:#FF6B6B;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:24px">
    → Actualizar estado en El Regreso Control
  </a>

  <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
    <p style="font-size:10px;color:#3A3530">Alerta automática de incumplimiento · Cervecería El Regreso</p>
  </div>
</div>
</body>
</html>`
}

// ── Tipos ─────────────────────────────────────────────────

type TaskRow = {
  id: string
  titulo: string
  area: string
  plazo: string
  estado: string
  created_at: string
  responsable_id: string
  responsable_ids: string[] | null
}

type UserRow = {
  id: string
  nombre: string
  email: string
  is_admin: boolean
}

// ── Handler principal ─────────────────────────────────────

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  const today = new Date()
  const todayStr  = toDateStr(today)
  const tomorrowStr = toDateStr(addDays(today, 1))
  const in3DaysStr  = toDateStr(addDays(today, 3))
  const yesterdayStr = toDateStr(addDays(today, -1))

  // Cargar tareas activas
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, titulo, area, plazo, estado, created_at, responsable_id, responsable_ids')
    .not('estado', 'in', '("Completada","Rechazada")')

  // Cargar usuarios
  const { data: users } = await supabase
    .from('users')
    .select('id, nombre, email, is_admin')

  if (!tasks || !users) return NextResponse.json({ error: 'No data' }, { status: 500 })

  const usersMap = Object.fromEntries((users as UserRow[]).map(u => [u.id, u]))
  const admins = (users as UserRow[]).filter(u => u.is_admin)

  const stats = { courtesy: 0, warning: 0, focus: 0, overdue_emails: 0 }

  // ── Helper: obtener IDs responsables de una tarea ──────
  function getResponsibleIds(t: TaskRow): string[] {
    return [t.responsable_id, ...(t.responsable_ids ?? [])].filter(Boolean)
  }

  // ── 1. T-3 DÍAS: Notificación de Cortesía ─────────────
  // Regla tareas cortas: solo si la tarea fue creada ≥3 días antes del plazo
  const courtesyTasks = (tasks as TaskRow[]).filter(t => {
    if (t.plazo !== in3DaysStr) return false
    const createdStr = t.created_at.slice(0, 10)
    return diffDays(createdStr, t.plazo) >= 3
  })

  for (const task of courtesyTasks) {
    const ids = getResponsibleIds(task)
    await sendPushToUsers(supabase, ids, MSG.courtesy(task.titulo, task.plazo))
    stats.courtesy++
  }

  // ── 2. T-24H: Notificación de Advertencia ─────────────
  const warningTasks = (tasks as TaskRow[]).filter(t => t.plazo === tomorrowStr)

  for (const task of warningTasks) {
    const ids = getResponsibleIds(task)
    await sendPushToUsers(supabase, ids, MSG.warning(task.titulo))
    stats.warning++
  }

  // ── 3. DÍA T 08:00: Notificación de Enfoque ──────────
  // Agrupa por usuario las tareas que vencen hoy
  const todayTasks = (tasks as TaskRow[]).filter(t => t.plazo === todayStr)

  const byUser: Record<string, TaskRow[]> = {}
  for (const task of todayTasks) {
    for (const uid of getResponsibleIds(task)) {
      if (!byUser[uid]) byUser[uid] = []
      byUser[uid].push(task)
    }
  }

  for (const [uid, userTasks] of Object.entries(byUser)) {
    await sendPushToUsers(supabase, [uid], MSG.focus(userTasks.length, userTasks.map(t => t.titulo)))
    stats.focus++
  }

  // ── 4. T+1: Notificación de Incumplimiento (Email) ────
  // Tareas con plazo = ayer que siguen sin completar
  const overdueTasks = (tasks as TaskRow[]).filter(t => t.plazo === yesterdayStr)

  if (overdueTasks.length > 0) {
    // Agrupar por usuario responsable
    const overdueByUser: Record<string, TaskRow[]> = {}
    for (const task of overdueTasks) {
      for (const uid of getResponsibleIds(task)) {
        if (!overdueByUser[uid]) overdueByUser[uid] = []
        overdueByUser[uid].push(task)
      }
    }

    // Email al responsable
    for (const [uid, userTasks] of Object.entries(overdueByUser)) {
      const user = usersMap[uid]
      if (!user?.email) continue
      const html = buildOverdueEmailHtml(user.nombre, userTasks)
      await resend.emails.send({
        from: `El Regreso Control <${from}>`,
        to: [user.email],
        subject: `🔴 ${userTasks.length} tarea${userTasks.length > 1 ? 's' : ''} vencida${userTasks.length > 1 ? 's' : ''} sin completar`,
        html,
      })
      stats.overdue_emails++
    }

    // Email a admins con resumen de todo lo vencido
    if (admins.length > 0) {
      const adminHtml = buildOverdueEmailHtml('Equipo Directivo', overdueTasks)
      await resend.emails.send({
        from: `El Regreso Control <${from}>`,
        to: admins.map(a => a.email).filter(Boolean),
        subject: `🔴 Alerta: ${overdueTasks.length} tarea${overdueTasks.length > 1 ? 's' : ''} vencida${overdueTasks.length > 1 ? 's' : ''} ayer`,
        html: adminHtml,
      })
    }
  }

  return NextResponse.json({ ok: true, date: todayStr, stats })
}
