import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getServerUser } from '@/lib/auth'

// Lista de vendedores para el selector de "Ver como vendedor" (Configuración).
// Service-role a propósito: mismo motivo que resolverImpersonacion() en
// lib/auth.ts — `users` exige sesión autenticada real vía RLS, y en el modo
// demo actual no la hay. Ya está gateado por esAdminReal.
export async function GET() {
  const user = await getServerUser()
  if (!user?.esAdminReal) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })

  const admin = createSupabaseClient(url, key)
  const { data, error } = await admin
    .from('users')
    .select('id, nombre, region')
    .eq('is_admin', false)
    .not('region', 'is', null)
    .order('region')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
