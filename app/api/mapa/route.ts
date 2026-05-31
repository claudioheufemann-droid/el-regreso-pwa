import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)

  const fecha = searchParams.get('fecha')      // YYYY-MM-DD
  const vendedor = searchParams.get('vendedor') // 'all' | nombre
  const fechaFin = searchParams.get('fechaFin') // opcional rango
  const incluirSinCompra = searchParams.get('sinCompra') === '1' // capa zonas blancas

  // ── Ventas del período ───────────────────────────────────
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

  // ── Scores de clientes (para salud / días sin compra) ───
  const [{ data: ventas, error: ventasError }, { data: scores }] = await Promise.all([
    query,
    supabase
      .from('client_scores')
      .select('nombre, dias_sin_compra, segmento, score, alerta_nivel, ultima_compra, vendedor_actual')
  ])

  if (ventasError) {
    return NextResponse.json({ error: ventasError.message }, { status: 500 })
  }

  // ── Mapa de scores por cliente ───────────────────────────
  const scoresMap = new Map<string, {
    dias_sin_compra: number | null
    segmento: string | null
    score: number | null
    alerta_nivel: string | null
    ultima_compra: string | null
    vendedor_score: string | null
  }>()
  for (const s of (scores ?? [])) {
    scoresMap.set(s.nombre, {
      dias_sin_compra: s.dias_sin_compra,
      segmento: s.segmento,
      score: s.score,
      alerta_nivel: s.alerta_nivel,
      ultima_compra: s.ultima_compra,
      vendedor_score: s.vendedor_actual,
    })
  }

  // ── Todos los clientes con coordenadas ──────────────────
  const { data: todosClientes } = await supabase
    .from('clientes')
    .select('nombre_fantasia, lat, lng, categoria, localidad_entrega, localidad, telefono, email, contacto')

  const clientesMap = new Map<string, {
    lat: number; lng: number; categoria: string; localidad: string
    telefono: string | null; email: string | null; contacto: string | null
    vendedor_actual: string | null
  }>()
  for (const c of (todosClientes ?? [])) {
    if (c.lat && c.lng) {
      clientesMap.set(c.nombre_fantasia, {
        lat: c.lat,
        lng: c.lng,
        categoria: c.categoria ?? '',
        localidad: c.localidad_entrega ?? c.localidad ?? '',
        telefono: c.telefono ?? null,
        email: c.email ?? null,
        contacto: c.contacto ?? null,
        vendedor_actual: null, // se obtiene de ventas o client_scores
      })
    }
  }

  // ── Agrupar ventas por cliente ───────────────────────────
  type GrupoVenta = {
    nombre_fantasia: string
    vendedor_actual: string
    categoria_negocio: string | null
    localidad: string
    lat: number; lng: number
    litros_total: number
    total_sin_impuesto: number
    pedidos: Set<string>
    productos: { producto: string; envase: string | null; litros: number }[]
    telefono: string | null; email: string | null; contacto: string | null
    dias_sin_compra: number | null
    segmento: string | null
    score: number | null
    alerta_nivel: string | null
    ultima_compra: string | null
  }

  const grupoMap = new Map<string, GrupoVenta>()

  for (const v of (ventas ?? [])) {
    if (!v.nombre_fantasia) continue
    const coords = clientesMap.get(v.nombre_fantasia)
    if (!coords) continue

    const sc = scoresMap.get(v.nombre_fantasia)
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
        dias_sin_compra: sc?.dias_sin_compra ?? null,
        segmento: sc?.segmento ?? null,
        score: sc?.score ?? null,
        alerta_nivel: sc?.alerta_nivel ?? null,
        ultima_compra: sc?.ultima_compra ?? null,
      })
    }

    const grupo = grupoMap.get(key)!
    grupo.litros_total += v.litros ?? 0
    grupo.total_sin_impuesto += v.total_sin_impuesto ?? 0
    if (v.pedido) grupo.pedidos.add(v.pedido)
    if (v.producto) grupo.productos.push({ producto: v.producto, envase: v.envase, litros: v.litros ?? 0 })
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
    dias_sin_compra: g.dias_sin_compra,
    segmento: g.segmento,
    score: g.score,
    alerta_nivel: g.alerta_nivel,
    ultima_compra: g.ultima_compra,
    sin_compra: false,
  }))

  // ── Capa "Zonas Blancas": clientes SIN ventas en período ─
  if (incluirSinCompra) {
    const conVentas = new Set(resultado.map(r => r.nombre_fantasia))
    const vendedorFilter = vendedor && vendedor !== 'all' ? vendedor : null

    for (const [nombre, coords] of clientesMap) {
      if (conVentas.has(nombre)) continue
      const sc = scoresMap.get(nombre)
      const vendedorCliente = sc?.vendedor_score ?? ''
      if (vendedorFilter && vendedorCliente !== vendedorFilter) continue

      resultado.push({
        nombre_fantasia: nombre,
        vendedor_actual: vendedorCliente,
        categoria_negocio: coords.categoria,
        localidad: coords.localidad,
        lat: coords.lat,
        lng: coords.lng,
        litros_total: 0,
        total_sin_impuesto: 0,
        pedidos_count: 0,
        productos: [],
        telefono: coords.telefono,
        email: coords.email,
        contacto: coords.contacto,
        dias_sin_compra: sc?.dias_sin_compra ?? null,
        segmento: sc?.segmento ?? null,
        score: sc?.score ?? null,
        alerta_nivel: sc?.alerta_nivel ?? null,
        ultima_compra: sc?.ultima_compra ?? null,
        sin_compra: true,
      })
    }
  }

  return NextResponse.json(resultado)
}
