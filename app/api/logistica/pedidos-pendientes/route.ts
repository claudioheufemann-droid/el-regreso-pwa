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

// GET /api/logistica/pedidos-pendientes — visitas de terreno con venta, completadas, que aún no tienen despacho asignado
export async function GET(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: visitas, error } = await supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, cliente_terreno_id, total_pedido, completada_at, direccion_gps, lat, lng, items:visitas_terreno_items(cantidad)')
    .eq('estado', 'Completada')
    .eq('tiene_venta', true)
    .order('completada_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: yaAsignadas } = await supabase
    .from('despacho_paradas')
    .select('visita_terreno_id')
    .not('visita_terreno_id', 'is', null)

  const asignadasSet = new Set((yaAsignadas ?? []).map(p => p.visita_terreno_id))

  const pendientes = (visitas ?? [])
    .filter(v => !asignadasSet.has(v.id))
    .map(v => ({
      visita_terreno_id: v.id,
      cliente_nombre: v.cliente_nombre,
      cliente_terreno_id: v.cliente_terreno_id,
      total_pedido: v.total_pedido,
      cantidad_total: (v.items ?? []).reduce((s: number, it: { cantidad: number }) => s + (it.cantidad ?? 0), 0),
      completada_at: v.completada_at,
    }))

  return NextResponse.json(pendientes)
}
