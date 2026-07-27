import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'
import { vendedorCanonico } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Misma clasificación que ventas_envases_periodo (SQL), para que el drill-down
 * de "Latas y barriles" filtre exactamente el mismo bucket que la tarjeta. */
function claseEnvase(envase: string): string {
  const e = envase.toLowerCase()
  if (e.includes('barril')) return 'Barril 30L'
  if (e.includes('354'))    return 'Lata 354 ml'
  if (e.includes('473'))    return 'Lata 473 ml'
  return 'Otros'
}

/**
 * GET /api/ventas/detalle?tipo=productos|clientes|envase&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * tipo=envase requiere &bucket=Barril%2030L|Lata%20354%20ml|Lata%20473%20ml|Otros
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
  const bucket = searchParams.get('bucket') ?? ''
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''

  if (tipo !== 'productos' && tipo !== 'clientes' && tipo !== 'envase')
    return NextResponse.json({ error: 'tipo debe ser productos, clientes o envase' }, { status: 400 })
  if (tipo === 'envase' && !bucket)
    return NextResponse.json({ error: 'envase requiere bucket' }, { status: 400 })

  const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!esFecha(desde) || !esFecha(hasta))
    return NextResponse.json({ error: 'desde/hasta deben ser YYYY-MM-DD' }, { status: 400 })
  if (desde > hasta)
    return NextResponse.json({ error: 'desde no puede ser posterior a hasta' }, { status: 400 })

  const scopeRegion = user.isAdmin ? null : (user.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const p_provincias = provincias.length ? provincias : null

  const supabase = await createClient()
  const fn = tipo === 'clientes' ? 'ventas_detalle_clientes' : 'ventas_detalle_productos'
  const { data, error } = await supabase.rpc(fn, { p_ini: desde, p_fin: hasta, p_provincias })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as Record<string, unknown>[]

  if (tipo === 'productos' || tipo === 'envase') {
    const productos = filas.map(r => ({
      producto: String(r.producto ?? ''),
      envase: String(r.envase ?? ''),
      categoria: String(r.categoria ?? ''),
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      pedidos: Number(r.pedidos ?? 0),
      clientes: Number(r.clientes ?? 0),
    }))
    // ventas_detalle_productos agrupa por (producto, envase, categoria): un
    // mismo producto puede salir en 354ml y 473ml como filas separadas, así
    // que sólo filtrar por bucket ya da el detalle correcto de esa tarjeta.
    return NextResponse.json(
      tipo === 'envase' ? productos.filter(p => claseEnvase(p.envase) === bucket) : productos
    )
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
