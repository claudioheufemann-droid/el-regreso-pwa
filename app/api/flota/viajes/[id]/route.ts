import { NextRequest, NextResponse } from 'next/server'
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

// DELETE /api/flota/viajes/[id] — puede borrar un admin, o el conductor que hizo el viaje.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, is_admin').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: viaje } = await supabase.from('viajes_flota').select('conductor_id').eq('id', id).single()
  if (!viaje) return NextResponse.json({ error: 'Viaje no encontrado' }, { status: 404 })

  const puedeBorrar = profile.is_admin || viaje.conductor_id === profile.id
  if (!puedeBorrar) {
    return NextResponse.json({ error: 'Solo un administrador o quien creó el viaje puede eliminarlo' }, { status: 403 })
  }

  const { data: deleted, error } = await supabase.from('viajes_flota').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'El viaje no se pudo eliminar (permisos de base de datos)' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
