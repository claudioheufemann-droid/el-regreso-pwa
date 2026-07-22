import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
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

// Cliente con service key para el borrado en sí — la policy RLS de 'visitas_terreno'
// no tiene DELETE para no-admins, así que el cliente anon rechazaría el borrado
// igual aunque el chequeo de abajo pase; se usa solo tras verificar is_admin.
function getAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) return null
  return createSupabaseClient(SUPABASE_URL, key)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('is_admin').eq('email', user.email!).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Solo un administrador puede eliminar visitas del historial' }, { status: 403 })

  const adminSupabase = getAdminSupabase()
  const deleteClient = adminSupabase ?? supabase
  const { data: deleted, error } = await deleteClient.from('visitas_terreno').delete().eq('id', id).select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'La visita no se pudo eliminar (permisos de base de datos)' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
