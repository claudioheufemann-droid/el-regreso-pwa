import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToUser } from '@/lib/push'

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

  // Notificar push al responsable de la tarea (si no es quien comentó)
  const { data: task } = await supabase.from('tasks').select('responsable_id, titulo').eq('id', id).single()
  if (task && task.responsable_id !== profile.id) {
    sendPushToUser(task.responsable_id, {
      title: `💬 Nuevo comentario`,
      body: `${profile.nombre}: "${texto.trim().slice(0, 80)}"`,
      url: '/',
      tag: `comment-${id}`,
    }).catch(() => {})
  }

  return NextResponse.json(comment, { status: 201 })
}
