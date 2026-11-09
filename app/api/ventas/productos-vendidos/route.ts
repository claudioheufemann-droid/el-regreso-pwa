import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'
import { VENDEDORES_AREA_VENTAS_ERP } from '@/lib/types'
import { ENTREGA_CONFIABLE_DESDE } from '@/app/ventas/hoyData'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ventas/productos-vendidos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Alimenta el explorador "Productos vendidos" de /ventas (por semana o por
 * período 24→23). Devuelve el rango agregado a cliente × vendedor × producto
 * × envase; los filtros (región, vendedor, producto, buscador) se aplican en
 * el navegador sin volver a consultar.
 *
 * Criterio de fecha: entrega, salvo rangos que terminan antes de que el ERP
 * informara entregas (mismo corte que el resto del dashboard). El scope
 * geográfico sale de la región del usuario, nunca del navegador.
 */
export async function GET(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!esFecha(desde) || !esFecha(hasta))
    return NextResponse.json({ error: 'desde/hasta deben ser YYYY-MM-DD' }, { status: 400 })
  if (desde > hasta)
    return NextResponse.json({ error: 'desde no puede ser posterior a hasta' }, { status: 400 })

  const provincias = provinciasDeRegion(user.isAdmin ? null : (user.region ?? null))
  const porEntrega = hasta >= ENTREGA_CONFIABLE_DESDE

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('ventas_productos_vendidos', {
    p_ini: desde,
    p_fin: hasta,
    p_provincias: provincias.length ? provincias : null,
    p_por_entrega: porEntrega,
    p_vendedores: VENDEDORES_AREA_VENTAS_ERP,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = ((data ?? []) as Record<string, unknown>[]).map(r => ({
    cliente: String(r.cliente ?? ''),
    vendedor: String(r.vendedor ?? ''),
    provincia: r.provincia ? String(r.provincia) : null,
    localidad: r.localidad ? String(r.localidad) : null,
    producto: String(r.producto ?? ''),
    envase: String(r.envase ?? ''),
    categoria: String(r.categoria ?? 'Otros'),
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    unidades: Number(r.unidades ?? 0),
    pedidos: Number(r.pedidos ?? 0),
    ultimaCompra: r.ultima_compra ? String(r.ultima_compra) : null,
  }))
  return NextResponse.json({ porEntrega, filas })
}
