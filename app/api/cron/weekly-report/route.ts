import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

// Vercel Cron: cada lunes a las 09:00 UTC (06:00 Chile)
export const runtime = 'nodejs'

function weekRange() {
  const now = new Date()
  const day = now.getDay()
  // Semana pasada: lunes anterior
  const diffToLastMon = day === 0 ? -13 : -(day - 1) - 7
  const lastMon = new Date(now)
  lastMon.setDate(now.getDate() + diffToLastMon)
  lastMon.setHours(0, 0, 0, 0)
  const lastSun = new Date(lastMon)
  lastSun.setDate(lastMon.getDate() + 6)
  lastSun.setHours(23, 59, 59, 999)
  return { lastMon, lastSun }
}

function fmt(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

export async function GET(req: Request) {
  // Proteger ruta con header secreto
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  const { lastMon, lastSun } = weekRange()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, responsable:users(nombre, area)')
    .order('created_at', { ascending: false })

  if (!tasks) return NextResponse.json({ error: 'No tasks' }, { status: 500 })

  const weekTasks = tasks.filter(t => {
    const plazo = new Date(t.plazo)
    return plazo >= lastMon && plazo <= lastSun
  })

  const completadas = weekTasks.filter(t => t.estado === 'Completada')
  const atrasadas = weekTasks.filter(t => t.estado === 'Atrasada')
  const pendientes = weekTasks.filter(t => !['Completada', 'Atrasada', 'Rechazada'].includes(t.estado))
  const porAprobar = tasks.filter(t => t.estado === 'Por Aprobar')

  // Rendimiento por persona
  const porPersona: Record<string, { nombre: string; completadas: number; atrasadas: number; total: number }> = {}
  weekTasks.forEach(t => {
    const nombre = (t.responsable as { nombre: string } | null)?.nombre ?? 'Desconocido'
    if (!porPersona[nombre]) porPersona[nombre] = { nombre, completadas: 0, atrasadas: 0, total: 0 }
    porPersona[nombre].total++
    if (t.estado === 'Completada') porPersona[nombre].completadas++
    if (t.estado === 'Atrasada') porPersona[nombre].atrasadas++
  })

  const personaRows = Object.values(porPersona).sort((a, b) => b.completadas - a.completadas)

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
<div style="max-width:580px;margin:40px auto;padding:0 20px">

  <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:28px;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;background:#D4AF37;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#080808">RC</div>
    <div>
      <div style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">REPORTE SEMANAL</div>
      <div style="color:#4A4540;font-size:10px">${fmt(lastMon)} — ${fmt(lastSun)}</div>
    </div>
  </div>

  <!-- Resumen general -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:28px">
    ${[
      { label: 'Total semana', value: weekTasks.length, color: '#E8DFC8' },
      { label: 'Completadas', value: completadas.length, color: '#4A9A3A' },
      { label: 'Atrasadas', value: atrasadas.length, color: '#FF6B6B' },
      { label: 'Por Aprobar', value: porAprobar.length, color: '#D4AF37' },
    ].map(s => `
      <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 10px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:${s.color};line-height:1">${s.value}</div>
        <div style="font-size:9px;color:#6B6460;letter-spacing:1.2px;margin-top:4px;text-transform:uppercase">${s.label}</div>
      </div>`).join('')}
  </div>

  <!-- Por aprobar -->
  ${porAprobar.length > 0 ? `
  <div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:16px;margin-bottom:20px">
    <div style="font-size:11px;color:#D4AF37;font-weight:700;letter-spacing:1.5px;margin-bottom:12px">★ ESPERANDO TU APROBACIÓN (${porAprobar.length})</div>
    ${porAprobar.map(t => `
      <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;color:#F0EAD6;font-weight:600">${t.titulo}</div>
          <div style="font-size:10px;color:#6B6460">${(t.responsable as { nombre: string } | null)?.nombre ?? ''} · ${t.area}</div>
        </div>
      </div>`).join('')}
  </div>` : ''}

  <!-- Rendimiento por persona -->
  <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:20px">
    <div style="font-size:11px;color:#8A8076;font-weight:700;letter-spacing:1.5px;margin-bottom:14px">RENDIMIENTO POR PERSONA</div>
    ${personaRows.length === 0 ? '<div style="font-size:12px;color:#4A4540">Sin tareas esta semana</div>' :
      personaRows.map(p => {
        const pct = p.total > 0 ? Math.round((p.completadas / p.total) * 100) : 0
        const color = pct >= 80 ? '#4A9A3A' : pct >= 50 ? '#D4AF37' : '#FF6B6B'
        return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:13px;color:#E8DFC8;font-weight:600">${p.nombre}</span>
          <span style="font-size:12px;font-weight:700;color:${color}">${pct}% (${p.completadas}/${p.total})</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
        </div>
        ${p.atrasadas > 0 ? `<div style="font-size:10px;color:#FF6B6B;margin-top:3px">${p.atrasadas} tarea${p.atrasadas > 1 ? 's' : ''} atrasada${p.atrasadas > 1 ? 's' : ''}</div>` : ''}
      </div>`}).join('')}
  </div>

  <!-- Atrasadas -->
  ${atrasadas.length > 0 ? `
  <div style="background:rgba(255,68,68,0.05);border:1px solid rgba(255,68,68,0.15);border-radius:12px;padding:16px;margin-bottom:20px">
    <div style="font-size:11px;color:#FF6B6B;font-weight:700;letter-spacing:1.5px;margin-bottom:12px">⚠ ATRASADAS (${atrasadas.length})</div>
    ${atrasadas.map(t => `
      <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="font-size:13px;color:#F0EAD6;font-weight:600">${t.titulo}</div>
        <div style="font-size:10px;color:#6B6460">${(t.responsable as { nombre: string } | null)?.nombre ?? ''} · Plazo: ${fmt(new Date(t.plazo))}</div>
      </div>`).join('')}
  </div>` : ''}

  <!-- Pendientes -->
  ${pendientes.length > 0 ? `
  <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:24px">
    <div style="font-size:11px;color:#8A8076;font-weight:700;letter-spacing:1.5px;margin-bottom:12px">EN CURSO (${pendientes.length})</div>
    ${pendientes.map(t => `
      <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between">
        <div>
          <div style="font-size:13px;color:#F0EAD6;font-weight:600">${t.titulo}</div>
          <div style="font-size:10px;color:#6B6460">${(t.responsable as { nombre: string } | null)?.nombre ?? ''}</div>
        </div>
        <div style="font-size:10px;color:#6B6460;white-space:nowrap;padding-left:8px">${t.estado}</div>
      </div>`).join('')}
  </div>` : ''}

  <a href="https://el-regreso-web.vercel.app" style="display:block;width:100%;padding:14px;text-align:center;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;color:#D4AF37;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:24px">
    → Abrir El Regreso Control
  </a>

  <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
    <p style="font-size:10px;color:#3A3530">Reporte automático generado cada lunes · Cervecería El Regreso</p>
  </div>
</div>
</body>
</html>`

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })

  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  // Enviar a todos los admins
  const { data: admins } = await supabase.from('users').select('email').eq('is_admin', true)
  const adminEmails = admins?.map(a => a.email).filter(Boolean) ?? []

  await resend.emails.send({
    from: `El Regreso Control <${from}>`,
    to: adminEmails,
    subject: `📊 Reporte Semanal ${fmt(lastMon)} — ${fmt(lastSun)}`,
    html,
  })

  return NextResponse.json({ ok: true, sent_to: adminEmails, tasks_week: weekTasks.length })
}
