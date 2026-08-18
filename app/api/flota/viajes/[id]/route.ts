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

  const { data: viaje } = await supabase.from('viajes_flota').select('conductor_id, vehiculo_id, estado').eq('id', id).single()
  if (!viaje) return NextResponse.json({ error: 'Viaje no encontrado' }, { status: 404 })

  const puedeBorrar = profile.is_admin || viaje.conductor_id === profile.id
  if (!puedeBorrar) {
    return NextResponse.json({ error: 'Solo un administrador o quien creó el viaje puede eliminarlo' }, { status: 403 })
  }

  // Un despacho armado con el flujo unificado queda vinculado a este viaje
  // (despachos.viaje_flota_id) — sin desvincular primero, borrar el viaje
  // falla por la FK y el despacho/sus paradas/entregas quedan intactos igual.
  await supabase.from('despachos').update({ viaje_flota_id: null }).eq('viaje_flota_id', id)

  const { data: deleted, error } = await supabase.from('viajes_flota').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'El viaje no se pudo eliminar (permisos de base de datos)' }, { status: 403 })
  }

  // Si el viaje borrado era el que tenía "en uso" al vehículo, y no quedó
  // ningún otro viaje en curso para ese vehículo, lo libera — de lo
  // contrario el vehículo queda atascado en "en uso" sin ningún viaje al
  // que volver para terminarlo.
  if (viaje.estado === 'en_curso' && viaje.vehiculo_id) {
    const { data: otroEnCurso } = await supabase
      .from('viajes_flota')
      .select('id')
      .eq('vehiculo_id', viaje.vehiculo_id)
      .eq('estado', 'en_curso')
      .limit(1)
      .maybeSingle()
    if (!otroEnCurso) {
      await supabase.from('vehiculos').update({ estado: 'disponible' }).eq('id', viaje.vehiculo_id)
    }
  }

  return NextResponse.json({ ok: true })
}
