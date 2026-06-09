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

  let pedidos = (data ?? []) as { nombre_fantasia: string }[]

  const nombres = [...new Set(pedidos.map(p => p.nombre_fantasia).filter(Boolean))]

  // Filtrar CLIENTES INACTIVOS (>90 días sin comprar) — solo activos en el calendario.
  // La vista aún puede marcarlos "activo" si no se corrió la migración de 90 días,
  // así que filtramos por dias_sin_compra en vivo desde client_scores.
  if (nombres.length) {
    const { data: scores } = await supabase
      .from('client_scores')
      .select('nombre_fantasia, dias_sin_compra')
      .in('nombre_fantasia', nombres)
    const inactivos = new Set(
      (scores ?? []).filter(s => (s.dias_sin_compra ?? 0) > 90).map(s => s.nombre_fantasia)
    )
    if (inactivos.size) pedidos = pedidos.filter(p => !inactivos.has(p.nombre_fantasia))
  }

  // Adjuntar cliente_id (clientes.id) para enlazar al perfil desde el calendario
  const nombresAct = [...new Set(pedidos.map(p => p.nombre_fantasia).filter(Boolean))]
  const idMap = new Map<string, number>()
  if (nombresAct.length) {
    const { data: cli } = await supabase
      .from('clientes')
      .select('id, nombre_fantasia')
      .in('nombre_fantasia', nombresAct)
    for (const c of cli ?? []) {
      if (c.nombre_fantasia) idMap.set(c.nombre_fantasia, c.id)
    }
  }

  const conId = pedidos.map(p => ({ ...p, cliente_id: idMap.get(p.nombre_fantasia) ?? null }))
  return NextResponse.json({ pedidos: conId })
}
