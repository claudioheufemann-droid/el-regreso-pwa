import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToAll } from '@/lib/push'
import { buildIcs } from '@/lib/ics'

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

function buildEmailHtml(
  task: { titulo: string; descripcion: string; area: string; plazo: string; horaLimite?: string | null },
  responsableNombre: string,
  otrosNombres: string[]
): string {
  // task.plazo puede venir como "YYYY-MM-DD" o timestamptz completo — ver nota en lib/ics.ts
  const dateMatch = task.plazo.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const [y, m, d] = dateMatch ? [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])] : [0, 0, 0]
  const fechaStr = task.horaLimite ? `${d}/${m}/${y} · ${task.horaLimite.slice(0, 5)}` : `${d}/${m}/${y}`

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

    <p style="font-size:13px;color:#A39C90;margin-bottom:6px">Hola <strong style="color:#F4EEDF">${responsableNombre}</strong>,</p>
    <p style="font-size:13px;color:#A39C90;margin-bottom:24px">Se te ha asignado una nueva tarea:</p>

    <div style="background:#0E0E0E;border:1px solid rgba(212,175,55,0.2);border-radius:6px;padding:20px;margin-bottom:20px">
      <div style="font-size:18px;font-weight:800;color:#F4EEDF;margin-bottom:8px">${task.titulo}</div>
      <div style="font-size:10px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">${task.area}</div>
      ${task.descripcion ? `<p style="font-size:13px;color:#A39C90;line-height:1.6;margin-bottom:12px">${task.descripcion}</p>` : ''}
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,68,68,0.06);border:1px solid rgba(255,68,68,0.15);border-radius:3px">
        <span style="font-size:11px;color:#FF6666">⏰ Plazo:</span>
        <span style="font-size:11px;font-weight:700;color:#F4EEDF">${fechaStr}</span>
      </div>
      ${otrosNombres.length > 0 ? `
      <div style="margin-top:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:3px">
        <span style="font-size:10px;color:#8A8276">También asignado a: </span>
        <span style="font-size:10px;color:#B5AEA2">${otrosNombres.join(', ')}</span>
      </div>` : ''}
    </div>

    <p style="font-size:11px;color:#6B6460;margin-bottom:4px">El archivo adjunto <strong style="color:#A39C90">tarea.ics</strong> agrega esta tarea automáticamente a tu calendario.</p>

    <div style="border-top:1px solid rgba(255,255,255,0.05);margin-top:32px;padding-top:16px">
      <p style="font-size:10px;color:#6B6460">Cervecería El Regreso · Sistema Operativo Ejecutivo</p>
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { titulo, descripcion, area, sub_area, responsable_id, responsable_ids, plazo, hora_limite, prioridad_maxima, evidencia_url } = body

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
      ...(hora_limite ? { hora_limite } : {}),
      prioridad_maxima: prioridad_maxima ?? false,
      estado: 'Asignada',
      contador_retrasos: 0,
      creado_por: user.id,
      ...(evidencia_url ? { evidencia_url } : {}),
    })
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email)')
    .single()

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 })

  // Notificación push a TODOS los usuarios de la app (no solo a los responsables) —
  // awaited para que no se corte a mitad en el entorno serverless de Vercel.
  // Solo llega a quien ya activó notificaciones en su celular (push_subscriptions);
  // si un responsable nunca lo activó, no hay error que loguear — simplemente no
  // hay ningún endpoint al que enviarle nada. El email de abajo es el respaldo que
  // sí le llega a cualquiera con email válido, sin necesitar activación previa.
  const responsableNombres = responsables.map(r => r.nombre).join(', ')
  await sendPushToAll({
    title: '📋 Nueva tarea creada',
    body: `${titulo} — Asignada a ${responsableNombres}`,
    taskId: task.id,
    tag: `task-assigned-${task.id}`,
    requireInteraction: true,
  }).catch(err => console.error('sendPushToAll falló para tasks/assign:', err))

  // Enviar email + .ics a TODOS los responsables
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.error('tasks/assign: RESEND_API_KEY no está configurada — no se envió ningún email de notificación')
  } else {
    try {
      const resend = new Resend(resendKey)
      const icsContent = buildIcs({ titulo, descripcion: descripcion ?? '', plazo, area, horaLimite: hora_limite })
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

      // Email individual a cada responsable. Promise.allSettled no basta para
      // detectar fallos: el SDK de Resend devuelve {data,error} en vez de
      // lanzar, así que un "settled/fulfilled" puede igual traer error adentro
      // y antes quedaba invisible — ahora se loguea cada caso explícitamente.
      const resultados = await Promise.allSettled(responsables.map(r => {
        const otros = responsables.filter(x => x.id !== r.id).map(x => x.nombre)
        return resend.emails.send({
          from: `El Regreso Control <${fromEmail}>`,
          to: [r.email],
          subject: `Nueva tarea asignada: ${titulo}`,
          html: buildEmailHtml({ titulo, descripcion: descripcion ?? '', area, plazo, horaLimite: hora_limite }, r.nombre, otros),
          attachments: [{
            filename: 'tarea.ics',
            content: Buffer.from(icsContent).toString('base64'),
          }],
        })
      }))

      resultados.forEach((r, i) => {
        const destinatario = responsables[i].email
        if (r.status === 'rejected') {
          console.error(`tasks/assign: email a ${destinatario} lanzó excepción:`, r.reason)
        } else if (r.value?.error) {
          console.error(`tasks/assign: Resend devolvió error para ${destinatario}:`, r.value.error)
        } else {
          console.log(`tasks/assign: email enviado a ${destinatario} (id: ${r.value?.data?.id})`)
        }
      })
    } catch (emailErr) {
      console.error('tasks/assign: error inesperado enviando emails:', emailErr)
    }
  }

  return NextResponse.json({ ...task, responsable_ids: allIds, responsables }, { status: 201 })
}
