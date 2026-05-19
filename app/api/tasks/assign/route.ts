import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToUsers } from '@/lib/push'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    }
  )
}

function buildIcs(task: { titulo: string; descripcion: string; plazo: string; area: string }): string {
  const now = new Date()
  const [year, month, day] = task.plazo.split('-').map(Number)
  const plazo = new Date(Date.UTC(year, month - 1, day, 9, 0, 0))
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const end = new Date(plazo.getTime() + 60 * 60 * 1000)
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//El Regreso Control//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:task-${Date.now()}-${Math.random().toString(36).slice(2)}@elregresobeer.com`,
    `DTSTAMP:${fmt(now)}`,
    `DTSTART:${fmt(plazo)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(task.titulo)}`,
    `DESCRIPTION:Area: ${esc(task.area)}\\n\\n${esc(task.descripcion || 'Sin descripcion')}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Recordatorio: ${esc(task.titulo)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function buildEmailHtml(
  task: { titulo: string; descripcion: string; area: string; plazo: string },
  responsableNombre: string,
  otrosNombres: string[]
): string {
  const [y, m, d] = task.plazo.split('-').map(Number)
  const fechaStr = `${d}/${m}/${y}`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0A0A0A;color:#F4EEDF;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:520px;margin:40px auto;padding:0 20px">
    <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;background:#D4AF37;border-radius:4px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;color:#0A0A0A">RC</div>
        <span style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">EL REGRESO CONTROL</span>
      </div>
    </div>

    <p style="font-size:13px;color:#3A3530;margin-bottom:6px">Hola <strong style="color:#F4EEDF">${responsableNombre}</strong>,</p>
    <p style="font-size:13px;color:#3A3530;margin-bottom:24px">Se te ha asignado una nueva tarea:</p>

    <div style="background:#0E0E0E;border:1px solid rgba(212,175,55,0.2);border-radius:6px;padding:20px;margin-bottom:20px">
      <div style="font-size:18px;font-weight:800;color:#F4EEDF;margin-bottom:8px">${task.titulo}</div>
      <div style="font-size:10px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">${task.area}</div>
      ${task.descripcion ? `<p style="font-size:13px;color:#3A3530;line-height:1.6;margin-bottom:12px">${task.descripcion}</p>` : ''}
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,68,68,0.06);border:1px solid rgba(255,68,68,0.15);border-radius:3px">
        <span style="font-size:11px;color:#FF6666">⏰ Plazo:</span>
        <span style="font-size:11px;font-weight:700;color:#F4EEDF">${fechaStr}</span>
      </div>
      ${otrosNombres.length > 0 ? `
      <div style="margin-top:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:3px">
        <span style="font-size:10px;color:#5A5450">También asignado a: </span>
        <span style="font-size:10px;color:#8A8076">${otrosNombres.join(', ')}</span>
      </div>` : ''}
    </div>

    <p style="font-size:11px;color:#2A2522;margin-bottom:4px">El archivo adjunto <strong style="color:#3A3530">tarea.ics</strong> agrega esta tarea automáticamente a tu calendario.</p>

    <div style="border-top:1px solid rgba(255,255,255,0.05);margin-top:32px;padding-top:16px">
      <p style="font-size:10px;color:#2A2522">Cervecería El Regreso · Sistema Operativo Ejecutivo</p>
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { titulo, descripcion, area, sub_area, responsable_id, responsable_ids, plazo, prioridad_maxima, evidencia_url } = body

  // responsable_ids puede venir como array; si no, usar responsable_id como único
  const allIds: string[] = responsable_ids?.length > 0 ? responsable_ids : [responsable_id]
  const primaryId = allIds[0]

  const supabase = await getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Obtener todos los responsables
  const { data: responsables, error: userErr } = await supabase
    .from('users')
    .select('id, nombre, iniciales, rol, area, email')
    .in('id', allIds)

  if (userErr || !responsables || responsables.length === 0)
    return NextResponse.json({ error: 'Usuarios no encontrados' }, { status: 404 })

  const primary = responsables.find(r => r.id === primaryId) ?? responsables[0]

  // Guardar tarea en DB
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .insert({
      titulo, descripcion, area, sub_area,
      responsable_id: primaryId,
      responsable_ids: allIds,
      plazo,
      prioridad_maxima: prioridad_maxima ?? false,
      estado: 'Asignada',
      contador_retrasos: 0,
      creado_por: user.id,
      ...(evidencia_url ? { evidencia_url } : {}),
    })
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email)')
    .single()

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })

  // Notificación push a todos los responsables
  sendPushToUsers(allIds, {
    title: '📋 Nueva tarea asignada',
    body: titulo,
    url: '/',
    tag: `task-assigned-${task.id}`,
  }).catch(() => {})

  // Enviar email + .ics a TODOS los responsables
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      const resend = new Resend(resendKey)
      const icsContent = buildIcs({ titulo, descripcion: descripcion ?? '', plazo, area })
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

      // Email individual a cada responsable
      await Promise.allSettled(responsables.map(r => {
        const otros = responsables.filter(x => x.id !== r.id).map(x => x.nombre)
        return resend.emails.send({
          from: `El Regreso Control <${fromEmail}>`,
          to: [r.email],
          subject: `Nueva tarea asignada: ${titulo}`,
          html: buildEmailHtml({ titulo, descripcion: descripcion ?? '', area, plazo }, r.nombre, otros),
          attachments: [{
            filename: 'tarea.ics',
            content: Buffer.from(icsContent).toString('base64'),
          }],
        })
      }))
    } catch (emailErr) {
      console.error('Email error:', emailErr)
    }
  }

  return NextResponse.json({ ...task, responsable_ids: allIds, responsables }, { status: 201 })
}
