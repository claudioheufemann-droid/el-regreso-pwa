import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

// PATCH /api/notificaciones/marcar-leidas
// Body opcional { id }: marca solo esa notificación (al tocarla en la lista).
// Sin body / body vacío: marca todas las pendientes (botón "Marcar todas").
// Antes se llamaba SIEMPRE completo apenas se abría la campanita, así que el
// contador de no leídas volvía a 0 sin que el usuario alcanzara a ver nada —
// eso hacía parecer que las notificaciones "no habían llegado".
export async function PATCH(req: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { id?: string } | null

  let query = supabase.from('notificaciones').update({ leida: true }).eq('leida', false)
  if (body?.id) query = query.eq('id', body.id)
  const { error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
