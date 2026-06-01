import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()

  // Verificar que es admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('email', user.email!)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // Obtener usuarios públicos
  const { data: users, error } = await supabase
    .from('users')
    .select('id, auth_id, nombre, iniciales, email, rol, area, macro_area, is_admin, telefono, avatar_url, created_at')
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
