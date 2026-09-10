import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { getServerUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vendedor/lista-identificacion
 *
 * Vendedores que tienen PIN configurado para /identificarse — ver
 * app/identificarse/IdentificarseClient.tsx. Sólo devuelve id + nombre, nunca
 * el PIN. Deliberadamente distinta de /api/admin/vendedores-lista (esa exige
 * esAdminReal y lista a TODOS los vendedores con región, no sólo a quienes
 * tienen PIN).
 *
 * Era pública mientras el login estuvo desactivado (2026-08-26 a 2026-09-10),
 * porque entonces nadie tenía sesión. Restaurado el login exige sesión: si no,
 * publica la nómina de vendedores a cualquiera que sepa la URL.
 */
export async function GET() {
  if (!await getServerUser()) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const key = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !key) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })

  const admin = createSbClient(SUPABASE_URL, key)
  const { data, error } = await admin
    .from('users')
    .select('id, nombre')
    .eq('is_admin', false)
    .not('pin_identificacion', 'is', null)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
