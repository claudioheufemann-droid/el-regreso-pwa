import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/admin/jornadas — lista todas las jornadas de ruta (cualquier vendedor) para auditoría
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('is_admin').eq('email', user.email!).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data: jornadas, error } = await supabase
    .from('jornadas_terreno')
    .select('*, vendedor:users!jornadas_terreno_vendedor_id_fkey(nombre, iniciales)')
    .order('iniciada_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(jornadas)
}
