import { createClient } from '@/lib/supabase/server'
import ReportesClient from './ReportesClient'

export default async function ReportesPage() {
  const supabase = await createClient()

  // Clientes activos
  const { data: clientes } = await supabase
    .from('clientes')
    .select('nombre_fantasia, vendedor, ruta_despacho, categoria, telefono')
    .in('vendedor', ['Equipo Ventas', 'Vendedor 1'])
    .order('nombre_fantasia')

  // Todos los contactos (últimos 90 días)
  const desde90 = new Date()
  desde90.setDate(desde90.getDate() - 90)

  const { data: contactos } = await supabase
    .from('contactos')
    .select('cliente_nombre_fantasia, vendedor, tipo, fecha_hora')
    .gte('fecha_hora', desde90.toISOString())
    .order('fecha_hora', { ascending: false })

  // Último pedido por cliente — paginado para no truncar a 1000 filas
  const pedidoMap = new Map<string, string>()
  {
    let offset = 0
    while (true) {
      const { data: page } = await supabase
        .from('ventas')
        .select('nombre_fantasia, fecha_pedido')
        .order('fecha_pedido', { ascending: false })
        .range(offset, offset + 999)
      if (!page || page.length === 0) break
      for (const v of page) {
        if (v.nombre_fantasia && !pedidoMap.has(v.nombre_fantasia)) {
          pedidoMap.set(v.nombre_fantasia, v.fecha_pedido)
        }
      }
      if (page.length < 1000) break
      offset += 1000
    }
  }

  // Construir estadísticas por cliente
  const contactosPorCliente = new Map<string, { count: number; ultima: string; tipos: Record<string, number> }>()
  for (const c of (contactos ?? [])) {
    const key = c.cliente_nombre_fantasia
    if (!contactosPorCliente.has(key)) {
      contactosPorCliente.set(key, { count: 0, ultima: c.fecha_hora, tipos: {} })
    }
    const stat = contactosPorCliente.get(key)!
    stat.count++
    stat.tipos[c.tipo] = (stat.tipos[c.tipo] ?? 0) + 1
    if (c.fecha_hora > stat.ultima) stat.ultima = c.fecha_hora
  }

  const reporte = (clientes ?? []).map(c => {
    const stats = contactosPorCliente.get(c.nombre_fantasia ?? '')
    const ultimaPedido = pedidoMap.get(c.nombre_fantasia ?? '') ?? null
    const diasSinContacto = stats
      ? Math.floor((Date.now() - new Date(stats.ultima).getTime()) / 86400000)
      : null
    return {
      nombre_fantasia: c.nombre_fantasia,
      vendedor: c.vendedor,
      ruta_despacho: c.ruta_despacho,
      categoria: c.categoria,
      telefono: c.telefono,
      contactos90d: stats?.count ?? 0,
      ultimoContacto: stats?.ultima ?? null,
      diasSinContacto,
      tiposContacto: stats?.tipos ?? {},
      ultimoPedido: ultimaPedido,
    }
  })

  // Ordenar: sin contacto primero, luego por días sin contacto descendente
  reporte.sort((a, b) => {
    if (a.diasSinContacto === null && b.diasSinContacto !== null) return -1
    if (b.diasSinContacto === null && a.diasSinContacto !== null) return 1
    if (a.diasSinContacto === null && b.diasSinContacto === null) return 0
    return (b.diasSinContacto ?? 0) - (a.diasSinContacto ?? 0)
  })

  return <ReportesClient reporte={reporte} />
}
