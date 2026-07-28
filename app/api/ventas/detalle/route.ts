import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'
import { vendedorCanonico, nombresErpDe } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Misma clasificación que ventas_envases_periodo (SQL), para que el drill-down
 * de "Latas y barriles" filtre exactamente el mismo bucket que la tarjeta.
 * El tamaño de la lata NO define la categoría -hay latas de cerveza de
 * 354ml y de kombucha de 473ml, y barriles de ambas- así que el bucket se
 * arma con tipo de envase × categoría real del producto, no con el ml. */
function claseEnvase(envase: string, categoria: string): string {
  const e = envase.toLowerCase()
  const esBarril = e.includes('barril')
  const esLata = e.includes('lata') || e.includes('354') || e.includes('473')
  if (esBarril && categoria === 'Cerveza')  return 'Barril Cerveza'
  if (esBarril && categoria === 'Kombucha') return 'Barril Kombucha'
  if (esLata && categoria === 'Cerveza')    return 'Lata Cerveza'
  if (esLata && categoria === 'Kombucha')   return 'Lata Kombucha'
  return 'Otros'
}

/**
 * GET /api/ventas/detalle?tipo=productos|clientes|envase|pedidos-origen|cliente-productos|clientes-vendedor|pedido-productos&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * tipo=envase   requiere &bucket=Barril%20Cerveza|Barril%20Kombucha|Lata%20Cerveza|Lata%20Kombucha|Otros
 * tipo=productos admite &categoria=Cerveza|Kombucha|Otros (opcional, filtra el mix)
 * tipo=pedidos-origen requiere &origen=backlog|mismo-periodo — de lo entregado
 *   en el rango, pedidos tomados antes del período vs dentro de él
 * tipo=cliente-productos requiere &cliente=<nombre_fantasia> — qué se le vendió
 * tipo=clientes-vendedor requiere &vendedor=<nombre vigente, ej "Los Ríos"> — qué locales le compraron
 * tipo=pedido-productos requiere &pedido=<número> — qué contiene ese pedido (no usa desde/hasta)
 * tipo=clientes-producto requiere &producto=&envase= — qué locales compraron ese producto
 * tipo=clientes-por-entregar — clientes con pedidos tomados en el rango aún sin despachar
 * tipo=pedidos-pendientes-cliente requiere &cliente= — sus pedidos pendientes de ese cliente
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
  const categoria = searchParams.get('categoria') ?? ''
  const origen = searchParams.get('origen') ?? ''
  const cliente = searchParams.get('cliente') ?? ''
  const vendedor = searchParams.get('vendedor') ?? ''
  const pedidoNum = searchParams.get('pedido') ?? ''
  const producto = searchParams.get('producto') ?? ''
  const envaseProducto = searchParams.get('envase') ?? ''
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  // Debe coincidir con el criterio de la tarjeta que abrió este detalle (ver
  // ventas_dashboard_kpis): "Año" usa fecha_pedido porque abarca meses sin
  // fecha_entrega confiable; el resto usa fecha_entrega. Default true porque
  // así es el criterio en casi todas las tarjetas.
  const porEntrega = searchParams.get('porEntrega') !== 'false'

  const tiposValidos = ['productos', 'clientes', 'envase', 'pedidos-origen', 'cliente-productos',
    'clientes-vendedor', 'pedido-productos', 'clientes-producto', 'clientes-por-entregar', 'pedidos-pendientes-cliente']
  if (!tipo || !tiposValidos.includes(tipo))
    return NextResponse.json({ error: `tipo debe ser uno de: ${tiposValidos.join(', ')}` }, { status: 400 })
  if (tipo === 'envase' && !bucket)
    return NextResponse.json({ error: 'envase requiere bucket' }, { status: 400 })
  if (tipo === 'pedidos-origen' && origen !== 'backlog' && origen !== 'mismo-periodo')
    return NextResponse.json({ error: 'pedidos-origen requiere origen=backlog|mismo-periodo' }, { status: 400 })
  if ((tipo === 'cliente-productos' || tipo === 'pedidos-pendientes-cliente') && !cliente)
    return NextResponse.json({ error: `${tipo} requiere cliente` }, { status: 400 })
  if (tipo === 'clientes-vendedor' && !vendedor)
    return NextResponse.json({ error: 'clientes-vendedor requiere vendedor' }, { status: 400 })
  if (tipo === 'pedido-productos' && !pedidoNum)
    return NextResponse.json({ error: 'pedido-productos requiere pedido' }, { status: 400 })
  if (tipo === 'clientes-producto' && (!producto || !envaseProducto))
    return NextResponse.json({ error: 'clientes-producto requiere producto y envase' }, { status: 400 })

  const scopeRegion = user.isAdmin ? null : (user.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const p_provincias = provincias.length ? provincias : null

  const supabase = await createClient()

  // pedido-productos no usa rango de fechas -un pedido es un hecho puntual,
  // no depende de desde/hasta- así que se resuelve antes de exigirlas.
  if (tipo === 'pedido-productos') {
    const { data, error } = await supabase.rpc('ventas_pedido_productos', {
      p_pedido: pedidoNum, p_provincias,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(r => ({
      producto: String(r.producto ?? ''),
      envase: String(r.envase ?? ''),
      categoria: String(r.categoria ?? ''),
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      unidades: Number(r.unidades ?? 0),
    })))
  }

  const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!esFecha(desde) || !esFecha(hasta))
    return NextResponse.json({ error: 'desde/hasta deben ser YYYY-MM-DD' }, { status: 400 })
  if (desde > hasta)
    return NextResponse.json({ error: 'desde no puede ser posterior a hasta' }, { status: 400 })

  if (tipo === 'pedidos-origen') {
    const { data, error } = await supabase.rpc('ventas_pedidos_por_origen', {
      p_ini: desde, p_fin: hasta, p_backlog: origen === 'backlog', p_provincias, p_por_entrega: porEntrega,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(r => ({
      pedido: String(r.pedido ?? ''),
      cliente: String(r.cliente ?? ''),
      vendedor: vendedorCanonico(String(r.vendedor ?? '')),
      fechaPedido: r.fecha_pedido ? String(r.fecha_pedido) : null,
      fechaEntrega: r.fecha_entrega ? String(r.fecha_entrega) : null,
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
    })))
  }

  if (tipo === 'cliente-productos') {
    const { data, error } = await supabase.rpc('ventas_detalle_cliente_productos', {
      p_cliente: cliente, p_ini: desde, p_fin: hasta, p_provincias, p_por_entrega: porEntrega,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(r => ({
      producto: String(r.producto ?? ''),
      envase: String(r.envase ?? ''),
      categoria: String(r.categoria ?? ''),
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      pedidos: Number(r.pedidos ?? 0),
      unidades: Number(r.unidades ?? 0),
    })))
  }

  if (tipo === 'clientes-producto') {
    const { data, error } = await supabase.rpc('ventas_detalle_clientes_por_producto', {
      p_producto: producto, p_envase: envaseProducto, p_ini: desde, p_fin: hasta, p_provincias, p_por_entrega: porEntrega,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(r => ({
      cliente: String(r.cliente ?? ''),
      vendedor: vendedorCanonico(String(r.vendedor ?? '')),
      localidad: r.localidad ? String(r.localidad) : null,
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      pedidos: Number(r.pedidos ?? 0),
      ultimaCompra: r.ultima_compra ? String(r.ultima_compra) : null,
    })))
  }

  if (tipo === 'clientes-por-entregar') {
    const { data, error } = await supabase.rpc('ventas_clientes_por_entregar', {
      p_ini: desde, p_fin: hasta, p_provincias,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(r => ({
      cliente: String(r.cliente ?? ''),
      vendedor: vendedorCanonico(String(r.vendedor ?? '')),
      localidad: r.localidad ? String(r.localidad) : null,
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      pedidos: Number(r.pedidos ?? 0),
      ultimaCompra: r.ultima_compra ? String(r.ultima_compra) : null,
    })))
  }

  if (tipo === 'pedidos-pendientes-cliente') {
    const { data, error } = await supabase.rpc('ventas_pedidos_pendientes_cliente', {
      p_cliente: cliente, p_ini: desde, p_fin: hasta, p_provincias,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(r => ({
      pedido: String(r.pedido ?? ''),
      fechaPedido: r.fecha_pedido ? String(r.fecha_pedido) : null,
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
    })))
  }

  if (tipo === 'clientes-vendedor') {
    const { data, error } = await supabase.rpc('ventas_detalle_clientes_por_vendedor', {
      p_vendedores: nombresErpDe(vendedor), p_ini: desde, p_fin: hasta, p_provincias, p_por_entrega: porEntrega,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(((data ?? []) as Record<string, unknown>[]).map(r => ({
      cliente: String(r.cliente ?? ''),
      vendedor: vendedorCanonico(String(r.vendedor ?? '')),
      localidad: r.localidad ? String(r.localidad) : null,
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      pedidos: Number(r.pedidos ?? 0),
      ultimaCompra: r.ultima_compra ? String(r.ultima_compra) : null,
      litrosPorEntregar: Number(r.litros_por_entregar ?? 0),
      revenuePorEntregar: Number(r.revenue_por_entregar ?? 0),
    })))
  }

  const fn = tipo === 'clientes' ? 'ventas_detalle_clientes' : 'ventas_detalle_productos'
  const { data, error } = await supabase.rpc(fn, { p_ini: desde, p_fin: hasta, p_provincias, p_por_entrega: porEntrega })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as Record<string, unknown>[]

  if (tipo === 'productos' || tipo === 'envase') {
    let productos = filas.map(r => ({
      producto: String(r.producto ?? ''),
      envase: String(r.envase ?? ''),
      categoria: String(r.categoria ?? ''),
      litros: Number(r.litros ?? 0),
      revenue: Number(r.revenue ?? 0),
      pedidos: Number(r.pedidos ?? 0),
      clientes: Number(r.clientes ?? 0),
      unidades: Number(r.unidades ?? 0),
    }))
    // ventas_detalle_productos agrupa por (producto, envase, categoria): un
    // mismo producto puede salir en 354ml y 473ml como filas separadas, así
    // que sólo filtrar por bucket/categoría ya da el detalle correcto.
    if (tipo === 'envase') productos = productos.filter(p => claseEnvase(p.envase, p.categoria) === bucket)
    if (categoria) productos = productos.filter(p => p.categoria === categoria)
    return NextResponse.json(productos)
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
