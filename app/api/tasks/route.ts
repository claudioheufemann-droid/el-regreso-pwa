import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToAllAdmins, sendPushToUser } from '@/lib/push'

const ADMIN_REVIEW_EMAIL = process.env.ADMIN_REVIEW_EMAIL ?? ''

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

function buildReviewEmailHtml(task: {
  titulo: string; descripcion?: string; area: string; plazo: string
  responsable_nombre: string; foto_antes_url?: string; foto_despues_url?: string; resumen_cierre?: string
}): string {
  const plazoDate = new Date(task.plazo)
  const fechaStr = `${plazoDate.getDate()}/${plazoDate.getMonth() + 1}/${plazoDate.getFullYear()}`
  const hasPhotos = task.foto_antes_url || task.foto_despues_url

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:540px;margin:40px auto;padding:0 20px">

    <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:28px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:#D4AF37;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#080808">RC</div>
      <div>
        <div style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">EL REGRESO CONTROL</div>
        <div style="color:#4A4540;font-size:10px;letter-spacing:1.5px">SISTEMA OPERATIVO EJECUTIVO</div>
      </div>
    </div>

    <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:10px;padding:14px 18px;margin-bottom:24px">
      <div style="font-size:11px;color:#D4AF37;font-weight:700;letter-spacing:1.5px;margin-bottom:4px">★ TAREA LISTA PARA REVISIÓN</div>
      <div style="font-size:12px;color:#8A8076">Requiere tu aprobación, Claudio.</div>
    </div>

    <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:20px;font-weight:800;color:#F0EAD6;margin-bottom:8px">${task.titulo}</div>
      <div style="font-size:10px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">${task.area}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 12px">
          <div style="font-size:9px;color:#6B6460;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px">Responsable</div>
          <div style="font-size:13px;font-weight:600;color:#E8DFC8">${task.responsable_nombre}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 12px">
          <div style="font-size:9px;color:#6B6460;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px">Plazo</div>
          <div style="font-size:13px;font-weight:600;color:#E8DFC8">${fechaStr}</div>
        </div>
      </div>

      ${task.descripcion ? `<div style="font-size:13px;color:#8A8076;line-height:1.6;margin-bottom:12px">${task.descripcion}</div>` : ''}

      ${task.resumen_cierre ? `
      <div style="background:rgba(74,122,58,0.08);border:1px solid rgba(74,122,58,0.2);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:9px;color:#4A7A3A;letter-spacing:1.2px;margin-bottom:6px">RESUMEN DE CIERRE</div>
        <div style="font-size:13px;color:#C8DFC8">${task.resumen_cierre}</div>
      </div>` : ''}
    </div>

    ${hasPhotos ? `
    <div style="margin-bottom:20px">
      <div style="font-size:10px;color:#D4AF37;letter-spacing:1.5px;font-weight:700;margin-bottom:12px">EVIDENCIA FOTOGRÁFICA</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${task.foto_antes_url ? `
        <div>
          <img src="${task.foto_antes_url}" alt="Antes" style="width:100%;border-radius:8px;display:block;height:160px;object-fit:cover">
          <div style="background:#141414;padding:6px 8px;border-radius:0 0 8px 8px;font-size:9px;color:#5B8AA8;letter-spacing:1px">ANTES</div>
        </div>` : ''}
        ${task.foto_despues_url ? `
        <div>
          <img src="${task.foto_despues_url}" alt="Después" style="width:100%;border-radius:8px;display:block;height:160px;object-fit:cover">
          <div style="background:#141414;padding:6px 8px;border-radius:0 0 8px 8px;font-size:9px;color:#4A7A3A;letter-spacing:1px">DESPUÉS</div>
        </div>` : ''}
      </div>
    </div>` : ''}

    <a href="https://el-regreso-web.vercel.app" style="display:block;width:100%;padding:14px;text-align:center;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.35);border-radius:10px;color:#D4AF37;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:24px">
      → Abrir App para Aprobar o Rechazar
    </a>

    <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
      <p style="font-size:10px;color:#3A3530">Cervecería El Regreso · Sistema Operativo Ejecutivo</p>
    </div>
  </div>
</body>
</html>`
}

async function notifyClaudio(task: {
  id: string; titulo: string; descripcion?: string; area: string; plazo: string
  responsable?: { nombre: string } | null
  foto_antes_url?: string; foto_despues_url?: string; resumen_cierre?: string
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  try {
    const resend = new Resend(resendKey)
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

    await resend.emails.send({
      from: `El Regreso Control <${fromEmail}>`,
      to: [ADMIN_REVIEW_EMAIL].filter(Boolean),
      subject: `★ Por Aprobar: ${task.titulo}`,
      html: buildReviewEmailHtml({
        titulo: task.titulo,
        descripcion: task.descripcion,
        area: task.area,
        plazo: task.plazo,
        responsable_nombre: task.responsable?.nombre ?? 'Sin responsable',
        foto_antes_url: task.foto_antes_url,
        foto_despues_url: task.foto_despues_url,
        resumen_cierre: task.resumen_cierre,
      }),
    })
  } catch (e) {
    console.error('Error enviando email de revisión:', e)
  }
}

export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('tasks')
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email), responsable_ids')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabase()
  const { id, ...updates } = await req.json()

  // Obtener estado anterior
  const { data: before } = await supabase.from('tasks').select('estado, started_at').eq('id', id).single()

  // Capturar timestamp de inicio cuando pasa a 'En Proceso' por primera vez
  if (updates.estado === 'En Proceso' && before?.estado === 'Asignada' && !before?.started_at) {
    updates.started_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar a admins si la tarea acaba de pasar a "Por Aprobar"
  if (updates.estado === 'Por Aprobar' && before?.estado !== 'Por Aprobar') {
    notifyClaudio(data).catch(() => {})
    sendPushToAllAdmins({
      title: '⭐ Tarea lista para aprobar',
      body: data.titulo,
      url: '/',
      tag: `review-${data.id}`,
      requireInteraction: true,
    }).catch(() => {})
  }

  // Notificar al responsable si su tarea fue aprobada o rechazada
  if ((updates.estado === 'Completada' || updates.estado === 'Rechazada') &&
      before?.estado === 'Por Aprobar' && data.responsable_id) {
    const isApproved = updates.estado === 'Completada'
    sendPushToUser(data.responsable_id, {
      title: isApproved ? '✅ Tarea aprobada' : '❌ Tarea rechazada',
      body: data.titulo,
      url: '/',
      tag: `status-${data.id}`,
    }).catch(() => {})
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('is_admin').eq('email', user.email!).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { id } = await req.json()
  const { error } = await supabase.from('tasks').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
