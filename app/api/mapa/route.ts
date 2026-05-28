import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)

  const fecha = searchParams.get('fecha') // YYYY-MM-DD
  const vendedor = searchParams.get('vendedor') // 'all' | 'Javier Badilla' | 'Carlos Urrejola'
  const fechaFin = searchParams.get('fechaFin') // opcional para rango

  // Construir query de ventas
  let query = supabase
    .from('ventas')
    .select('nombre_fantasia, vendedor_actual, categoria_negocio, localidad, producto, envase, litros, total_sin_impuesto, fecha_pedido, pedido')

  if (fecha) {
    if (fechaFin) {
      query = query.gte('fecha_pedido', fecha).lte('fecha_pedido', fechaFin)
    } else {
      query = query.eq('fecha_pedido', fecha)
    }
  }

  if (vendedor && vendedor !== 'all') {
    query = query.eq('vendedor_actual', vendedor)
  }

  const { data: ventas, error: ventasError } = await query

  if (ventasError) {
    return NextResponse.json({ error: ventasError.message }, { status: 500 })
  }

  if (!ventas || ventas.length === 0) {
    return NextResponse.json([])
  }

  // Obtener coordenadas de clientes
  const nombresUnicos = [...new Set(ventas.map(v => v.nombre_fantasia).filter(Boolean))]

  const { data: clientes } = await supabase
    .from('clientes')
    .select('nombre_fantasia, lat, lng, categoria, localidad_entrega, localidad, telefono, email, contacto')
    .in('nombre_fantasia', nombresUnicos)

  const coordsMap = new Map<string, { lat: number; lng: number; categoria: string; localidad: string; telefono: string | null; email: string | null; contacto: string | null }>()
  for (const c of (clientes ?? [])) {
    if (c.lat && c.lng) {
      coordsMap.set(c.nombre_fantasia, {
        lat: c.lat,
        lng: c.lng,
        categoria: c.categoria ?? '',
        localidad: c.localidad_entrega ?? c.localidad ?? '',
        telefono: c.telefono ?? null,
        email: c.email ?? null,
        contacto: c.contacto ?? null,
      })
    }
  }

  // Agrupar ventas por cliente
  const grupoMap = new Map<string, {
    nombre_fantasia: string
    vendedor_actual: string
    categoria_negocio: string | null
    localidad: string
    lat: number
    lng: number
    litros_total: number
    total_sin_impuesto: number
    pedidos: Set<string>
    productos: { producto: string; envase: string | null; litros: number }[]
    telefono: string | null
    email: string | null
    contacto: string | null
  }>()

  for (const v of ventas) {
    if (!v.nombre_fantasia) continue
    const coords = coordsMap.get(v.nombre_fantasia)
    if (!coords) continue

    const key = v.nombre_fantasia
    if (!grupoMap.has(key)) {
      grupoMap.set(key, {
        nombre_fantasia: v.nombre_fantasia,
        vendedor_actual: v.vendedor_actual,
        categoria_negocio: v.categoria_negocio,
        localidad: coords.localidad || v.localidad || '',
        lat: coords.lat,
        lng: coords.lng,
        litros_total: 0,
        total_sin_impuesto: 0,
        pedidos: new Set(),
        productos: [],
        telefono: coords.telefono,
        email: coords.email,
        contacto: coords.contacto,
      })
    }

    const grupo = grupoMap.get(key)!
    grupo.litros_total += v.litros ?? 0
    grupo.total_sin_impuesto += v.total_sin_impuesto ?? 0
    if (v.pedido) grupo.pedidos.add(v.pedido)
    if (v.producto) {
      grupo.productos.push({
        producto: v.producto,
        envase: v.envase,
        litros: v.litros ?? 0,
      })
    }
  }

  const resultado = [...grupoMap.values()].map(g => ({
    nombre_fantasia: g.nombre_fantasia,
    vendedor_actual: g.vendedor_actual,
    categoria_negocio: g.categoria_negocio,
    localidad: g.localidad,
    lat: g.lat,
    lng: g.lng,
    litros_total: Math.round(g.litros_total * 10) / 10,
    total_sin_impuesto: Math.round(g.total_sin_impuesto),
    pedidos_count: g.pedidos.size,
    productos: g.productos,
    telefono: g.telefono,
    email: g.email,
    contacto: g.contacto,
  }))

  return NextResponse.json(resultado)
}
