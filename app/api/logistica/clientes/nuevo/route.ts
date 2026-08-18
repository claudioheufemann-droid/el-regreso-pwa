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

// POST /api/logistica/clientes/nuevo — creación ágil de cliente en ruta
// (mismo patrón que "Cliente Nuevo" en Nueva Visita, pero para logística).
export async function POST(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { nombre_fantasia, direccion, telefono, canal } = await req.json()
  if (!nombre_fantasia?.trim() || !direccion?.trim()) {
    return NextResponse.json({ error: 'Nombre y dirección son obligatorios' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clientes_terreno')
    .insert({
      nombre_fantasia: nombre_fantasia.trim(), direccion: direccion.trim(),
      telefono: telefono?.trim() || null, canal: canal?.trim() || null,
      creado_por: profile.id,
    })
    .select('id, nombre_fantasia, direccion, telefono')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
