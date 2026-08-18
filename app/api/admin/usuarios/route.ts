import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('email', user.email!)
    .single()

  if (!profile?.is_admin) return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) }
  return { error: null }
}

export async function GET() {
  const supabase = await createClient()

  const { error: authError } = await requireAdmin(supabase)
  if (authError) return authError

  // Obtener usuarios públicos
  const { data: users, error } = await supabase
    .from('users')
    .select('id, auth_id, nombre, iniciales, email, rol, area, macro_area, is_admin, telefono, avatar_url, created_at, vehiculo_propio, vehiculo_tipo, rendimiento_kml, tarifa_reembolso_km')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Obtener last_sign_in_at de auth.users vía admin API
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 200 })

  // Combinar datos
  const combined = (users ?? []).map(u => {
    const authUser = authUsers?.users?.find(a => a.id === u.auth_id)
    return {
      ...u,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      email_confirmed: authUser?.email_confirmed_at != null,
    }
  })

  return NextResponse.json(combined)
}

// PATCH /api/admin/usuarios — actualiza el perfil de vehículo/reembolso de un vendedor
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()

  const { error: authError } = await requireAdmin(supabase)
  if (authError) return authError

  const body = await req.json() as {
    id: string
    vehiculo_propio?: boolean
    vehiculo_tipo?: string | null
    rendimiento_kml?: number | null
    tarifa_reembolso_km?: number | null
  }
  if (!body.id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 })

  const { data, error } = await supabase
    .from('users')
    .update({
      vehiculo_propio: body.vehiculo_propio,
      vehiculo_tipo: body.vehiculo_tipo ?? null,
      rendimiento_kml: body.rendimiento_kml ?? null,
      tarifa_reembolso_km: body.tarifa_reembolso_km ?? null,
    })
    .eq('id', body.id)
    .select('id, nombre, vehiculo_propio, vehiculo_tipo, rendimiento_kml, tarifa_reembolso_km')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
