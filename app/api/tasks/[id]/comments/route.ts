import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToUser } from '@/lib/push'
import { emailComentarioNuevo } from '@/lib/email'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} } },
  })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, nombre, iniciales').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { texto } = await req.json()
  if (!texto?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })

  const { data: comment, error } = await supabase
    .from('task_comments')
    .insert({ task_id: id, user_id: profile.id, user_nombre: profile.nombre, user_iniciales: profile.iniciales, texto: texto.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar push + email a TODOS los asignados a la tarea (no solo al
  // responsable principal — una tarea puede tener varios responsable_ids),
  // salvo a quien acaba de escribir el comentario.
  const { data: task } = await supabase
    .from('tasks')
    .select('responsable_id, responsable_ids, titulo, area')
    .eq('id', id)
    .single()

  if (task) {
    const idsCrudos = (task.responsable_ids?.length ? task.responsable_ids : [task.responsable_id]) as string[]
    const destinatarioIds = Array.from(new Set(idsCrudos.filter(Boolean))).filter(uid => uid !== profile.id)

    if (destinatarioIds.length > 0) {
      const { data: destinatarios } = await supabase
        .from('users')
        .select('id, nombre, email')
        .in('id', destinatarioIds)

      // Awaited: en el entorno serverless de Vercel la función puede cortarse
      // apenas se envía la respuesta si queda trabajo async pendiente sin esperar.
      await Promise.allSettled((destinatarios ?? []).flatMap(dest => [
        sendPushToUser(dest.id, {
          title: `💬 Nuevo comentario`,
          body: `${profile.nombre}: "${texto.trim().slice(0, 80)}"`,
          taskId: id,
          tag: `comment-${id}`,
        }).catch(err => console.error(`tasks/comments: push a ${dest.id} falló:`, err)),
        dest.email
          ? emailComentarioNuevo({
              toEmail: dest.email,
              toNombre: dest.nombre,
              taskTitulo: task.titulo,
              taskArea: task.area,
              autorNombre: profile.nombre,
              comentario: texto.trim().slice(0, 200),
            }).catch(err => console.error(`tasks/comments: email a ${dest.email} falló:`, err))
          : Promise.resolve(),
      ]))
    }
  }

  return NextResponse.json(comment, { status: 201 })
}
