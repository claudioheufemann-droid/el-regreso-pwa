import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'
import { vendedorCanonico } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ventas/detalle?tipo=productos|clientes&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Drill-down de las tarjetas del dashboard de Ventas. Va aparte de la carga de
 * la página porque son listas largas que sólo se piden al tocar la tarjeta.
 *
 * El scope geográfico se resuelve en el servidor a partir de la región del
 * usuario: el cliente no puede pedir datos fuera de lo que le corresponde.
 */
export async function GET(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo')
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''

  if (tipo !== 'productos' && tipo !== 'clientes')
    return NextResponse.json({ error: 'tipo debe ser productos o clientes' }, { status: 400 })

  const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!esFecha(desde) || !esFecha(hasta))
    return NextResponse.json({ error: 'desde/hasta deben ser YYYY-MM-DD' }, { status: 400 })
  if (desde > hasta)
    return NextResponse.json({ error: 'desde no puede ser posterior a hasta' }, { status: 400 })

  const scopeRegion = user.isAdmin ? null : (user.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const p_provincias = provincias.length ? provincias : null

  const supabase = await createClient()
  const fn = tipo === 'productos' ? 'ventas_detalle_productos' : 'ventas_detalle_clientes'
  const { data, error } = await supabase.rpc(fn, { p_ini: desde, p_fin: hasta, p_provincias })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as Record<string, unknown>[]

  if (tipo === 'productos') {
    return NextResponse.json(filas.map(r => ({
      producto: String(r.producto ?? ''),
      envase: String(r.envase ?? ''),
      categoria: String(r.categoria ?? ''),
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      pedidos: Number(r.pedidos ?? 0),
      clientes: Number(r.clientes ?? 0),
    })))
  }

  return NextResponse.json(filas.map(r => ({
    cliente: String(r.cliente ?? ''),
    // Mismo criterio que el ranking: nombre vigente si el ERP renombró
    vendedor: vendedorCanonico(String(r.vendedor ?? '')),
    localidad: r.localidad ? String(r.localidad) : null,
    litros: Number(r.litros ?? 0),
    revenue: Number(r.revenue ?? 0),
    pedidos: Number(r.pedidos ?? 0),
    ultimaCompra: r.ultima_compra ? String(r.ultima_compra) : null,
  })))
}
