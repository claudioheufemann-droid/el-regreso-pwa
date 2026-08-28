import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { getMacroKey } from '@/lib/gestion-types'
import { CATALOGO_INFO_DEFAULT } from '@/lib/catalogo-productos'

export const dynamic = 'force-dynamic'

const LIMITE_POR_GRUPO = 5

/**
 * GET /api/buscar-global?q=
 *
 * Buscador global (§Sprint 8) — clientes, pedidos, tareas, vehículos y
 * productos en una sola consulta. Mismo patrón que el resto de buscadores
 * en vivo de la app: `.ilike()` + `.limit()` por grupo, nunca la tabla
 * completa. Los productos no tocan Supabase — `CATALOGO_INFO_DEFAULT` ya
 * vive entero en memoria del servidor (~20 filas), filtrarlo ahí es más
 * barato que un roundtrip a la base.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ clientes: [], pedidos: [], tareas: [], vehiculos: [], productos: [] })

  const termino = q.replace(/[,()]/g, ' ').trim()
  const supabase = await createClient()

  const [{ data: clientesRaw }, { data: pedidosRaw }, { data: tareasRaw }, { data: vehiculosRaw }] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nombre_fantasia, localidad, categoria')
      .or(`nombre_fantasia.ilike.%${termino}%,localidad.ilike.%${termino}%`)
      .order('nombre_fantasia')
      .limit(LIMITE_POR_GRUPO),
    supabase
      .from('ventas')
      .select('nombre_fantasia, fecha_pedido, total_sin_impuesto, litros')
      .ilike('nombre_fantasia', `%${termino}%`)
      .order('fecha_pedido', { ascending: false })
      .limit(LIMITE_POR_GRUPO),
    supabase
      .from('tasks')
      .select('id, titulo, area, estado')
      .ilike('titulo', `%${termino}%`)
      .order('created_at', { ascending: false })
      .limit(LIMITE_POR_GRUPO),
    supabase
      .from('vehiculos')
      .select('id, nombre, patente')
      .or(`nombre.ilike.%${termino}%,patente.ilike.%${termino}%`)
      .limit(LIMITE_POR_GRUPO),
  ])

  const qLower = termino.toLowerCase()
  const productos = Object.entries(CATALOGO_INFO_DEFAULT)
    .filter(([nombre, info]) => nombre.toLowerCase().includes(qLower) || info.estilo.toLowerCase().includes(qLower))
    .slice(0, LIMITE_POR_GRUPO)
    .map(([nombre, info]) => ({ nombre, estilo: info.estilo }))

  // Los pedidos no traen el id numérico del cliente (ventas usa nombre_fantasia
  // como texto) — se resuelve acá con una consulta puntual por los pocos
  // nombres que aparecieron, para que cada resultado navegue a la ficha correcta
  // en vez de asumir que el cliente también salió en el grupo "Clientes".
  const nombresPedidos = [...new Set((pedidosRaw ?? []).map(p => p.nombre_fantasia).filter(Boolean))]
  const idsPorNombre = new Map<string, number>()
  if (nombresPedidos.length > 0) {
    const { data: clientesDePedidos } = await supabase
      .from('clientes')
      .select('id, nombre_fantasia')
      .in('nombre_fantasia', nombresPedidos)
    for (const c of clientesDePedidos ?? []) idsPorNombre.set(c.nombre_fantasia as string, c.id as number)
  }

  return NextResponse.json({
    clientes: (clientesRaw ?? []).map(c => ({
      id: c.id, nombre: c.nombre_fantasia, sub: [c.categoria, c.localidad].filter(Boolean).join(' · '),
    })),
    pedidos: (pedidosRaw ?? []).map(p => ({
      cliente: p.nombre_fantasia, clienteId: idsPorNombre.get(p.nombre_fantasia as string) ?? null,
      fecha: p.fecha_pedido, total: p.total_sin_impuesto, litros: p.litros,
    })),
    tareas: (tareasRaw ?? []).map(t => ({
      id: t.id, titulo: t.titulo, area: t.area, estado: t.estado, macroKey: getMacroKey(t.area),
    })),
    vehiculos: (vehiculosRaw ?? []).map(v => ({ id: v.id, nombre: v.nombre, patente: v.patente })),
    productos,
  })
}
