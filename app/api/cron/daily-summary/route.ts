import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

// Vercel Cron: cada día a las 12:00 UTC (09:00 Chile)
export const runtime = 'nodejs'

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}/${m}/${y}`
}

function diffDays(isoDate: string): number {
  const today = toLocalDateStr(new Date())
  const [ty, tm, td] = today.split('-').map(Number)
  const [py, pm, pd] = isoDate.split('-').map(Number)
  const t = Date.UTC(ty, tm - 1, td)
  const p = Date.UTC(py, pm - 1, pd)
  return Math.round((p - t) / 86400000)
}

type TaskRow = {
  id: string
  titulo: string
  area: string
  plazo: string
  estado: string
  prioridad_maxima: boolean
  responsable_id: string
  responsable_ids: string[]
}

type UserRow = {
  id: string
  nombre: string
  email: string
}

function buildDailyEmailHtml(user: UserRow, tasks: {
  atrasadas: TaskRow[]
  hoy: TaskRow[]
  proximas: TaskRow[]
}): string {
  const today = new Date()
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const dayStr = `${dayNames[today.getDay()]} ${today.getDate()} de ${monthNames[today.getMonth()]}`

  const total = tasks.atrasadas.length + tasks.hoy.length + tasks.proximas.length
  if (total === 0) return '' // no enviar si no tiene tareas

  const taskCard = (t: TaskRow, accentColor: string, label?: string) => `
    <div style="padding:10px 14px;border-left:3px solid ${accentColor};background:rgba(255,255,255,0.03);border-radius:0 8px 8px 0;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div style="font-size:13px;font-weight:600;color:#F0EAD6;margin-bottom:2px">${t.titulo}${t.prioridad_maxima ? ' ⚡' : ''}</div>
          <div style="font-size:10px;color:#5A5450">${t.area}</div>
        </div>
        ${label ? `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:${accentColor}20;color:${accentColor};white-space:nowrap;flex-shrink:0">${label}</span>` : ''}
      </div>
    </div>`

  const section = (title: string, color: string, items: TaskRow[], labelFn: (t: TaskRow) => string) =>
    items.length === 0 ? '' : `
    <div style="margin-bottom:22px">
      <div style="font-size:10px;color:${color};font-weight:700;letter-spacing:1.5px;margin-bottom:10px;text-transform:uppercase">${title} (${items.length})</div>
      ${items.map(t => taskCard(t, color, labelFn(t))).join('')}
    </div>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
<div style="max-width:540px;margin:40px auto;padding:0 20px">

  <!-- Header -->
  <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;background:#D4AF37;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#080808">RC</div>
    <div>
      <div style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">RESUMEN DIARIO</div>
      <div style="color:#4A4540;font-size:10px;text-transform:capitalize">${dayStr}</div>
    </div>
  </div>

  <!-- Saludo -->
  <p style="font-size:15px;font-weight:700;color:#F0EAD6;margin-bottom:6px">Hola, ${user.nombre.split(' ')[0]} 👋</p>
  <p style="font-size:13px;color:#5A5450;margin-bottom:24px">
    Tienes <strong style="color:#E8DFC8">${total} tarea${total !== 1 ? 's' : ''}</strong> que requieren tu atención hoy.
  </p>

  ${section('⚠ Atrasadas', '#FF6B6B', tasks.atrasadas, t => `Venció ${fmtDate(t.plazo)}`)}
  ${section('📌 Vencen Hoy', '#D4AF37', tasks.hoy, () => 'Hoy')}
  ${section('📅 Próximas', '#5B8AA8', tasks.proximas, t => {
    const d = diffDays(t.plazo)
    return d === 1 ? 'Mañana' : `En ${d} días`
  })}

  <!-- CTA -->
  <a href="https://el-regreso-web.vercel.app" style="display:block;padding:14px;text-align:center;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;color:#D4AF37;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:24px">
    → Ver mis tareas en El Regreso Control
  </a>

  <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
    <p style="font-size:10px;color:#3A3530">Resumen diario automático · Cervecería El Regreso</p>
  </div>
</div>
</body>
</html>`
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  const todayStr = toLocalDateStr(new Date())
  const in5DaysStr = toLocalDateStr(new Date(Date.now() + 5 * 86400000))

  // Obtener todas las tareas activas (no completadas ni rechazadas)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, titulo, area, plazo, estado, prioridad_maxima, responsable_id, responsable_ids')
    .not('estado', 'in', '("Completada","Rechazada")')

  // Obtener todos los usuarios con email
  const { data: users } = await supabase
    .from('users')
    .select('id, nombre, email')
    .not('email', 'is', null)

  if (!tasks || !users) return NextResponse.json({ error: 'No data' }, { status: 500 })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })

  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  const results: { user: string; sent: boolean; tasks: number }[] = []

  for (const user of users as UserRow[]) {
    if (!user.email) continue

    // Tareas donde este usuario es responsable (principal o adicional)
    const myTasks = (tasks as TaskRow[]).filter(t =>
      t.responsable_id === user.id ||
      (t.responsable_ids ?? []).includes(user.id)
    )

    const atrasadas = myTasks.filter(t => t.estado === 'Atrasada' || (t.plazo < todayStr && t.estado !== 'Por Aprobar'))
    const hoy = myTasks.filter(t => t.plazo === todayStr && !atrasadas.includes(t))
    const proximas = myTasks.filter(t => t.plazo > todayStr && t.plazo <= in5DaysStr)

    const total = atrasadas.length + hoy.length + proximas.length
    if (total === 0) {
      results.push({ user: user.nombre, sent: false, tasks: 0 })
      continue
    }

    const html = buildDailyEmailHtml(user, { atrasadas, hoy, proximas })
    if (!html) continue

    try {
      await resend.emails.send({
        from: `El Regreso Control <${from}>`,
        to: [user.email],
        subject: `📋 Tu resumen del día — ${atrasadas.length > 0 ? `⚠ ${atrasadas.length} atrasada${atrasadas.length > 1 ? 's' : ''}` : `${total} tarea${total > 1 ? 's' : ''} pendiente${total > 1 ? 's' : ''}`}`,
        html,
      })
      results.push({ user: user.nombre, sent: true, tasks: total })
    } catch (e) {
      console.error(`Error enviando a ${user.email}:`, e)
      results.push({ user: user.nombre, sent: false, tasks: total })
    }
  }

  return NextResponse.json({ ok: true, results })
}
