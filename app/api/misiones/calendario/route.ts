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

  const pedidos = (data ?? []) as { nombre_fantasia: string }[]

  // Adjuntar cliente_id (clientes.id) para poder enlazar al perfil desde el calendario
  const nombres = [...new Set(pedidos.map(p => p.nombre_fantasia).filter(Boolean))]
  const idMap = new Map<string, number>()
  if (nombres.length) {
    const { data: cli } = await supabase
      .from('clientes')
      .select('id, nombre_fantasia')
      .in('nombre_fantasia', nombres)
    for (const c of cli ?? []) {
      if (c.nombre_fantasia) idMap.set(c.nombre_fantasia, c.id)
    }
  }

  const conId = pedidos.map(p => ({ ...p, cliente_id: idMap.get(p.nombre_fantasia) ?? null }))
  return NextResponse.json({ pedidos: conId })
}
