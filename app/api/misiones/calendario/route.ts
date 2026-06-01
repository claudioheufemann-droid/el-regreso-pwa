import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// GET /api/misiones/calendario?vendedor=&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Devuelve los pedidos esperados (proyectados por ciclo) en el rango.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vendedorParam = searchParams.get('vendedor')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  // No-admins: forzar su propio scope
  const p_vendedor = user.isAdmin
    ? (vendedorParam && vendedorParam !== 'all' ? vendedorParam : null)
    : user.nombre

  const { data, error } = await supabase.rpc('get_calendario_pedidos', {
    p_vendedor,
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pedidos: data ?? [] })
}
