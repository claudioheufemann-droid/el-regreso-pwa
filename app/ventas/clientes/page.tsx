import { createClient } from '@/lib/supabase/server'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  const supabase = await createClient()

  // Clientes con datos base — todos, sin filtro de vendedor
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre_fantasia, razon_social, categoria, vendedor, localidad, localidad_entrega, ruta_despacho, telefono, lat, lng')
    .order('nombre_fantasia')

  // Último contacto por cliente
  const { data: ultimosContactos } = await supabase
    .from('contactos')
    .select('cliente_nombre_fantasia, fecha_hora, tipo, vendedor')
    .order('fecha_hora', { ascending: false })
    .limit(5000)

  // Último pedido + litros del período por cliente
  const { data: ultimosPedidos } = await supabase
    .from('ventas')
    .select('nombre_fantasia, fecha_pedido, litros, total_sin_impuesto')
    .order('fecha_pedido', { ascending: false })
    .limit(10000)

  // Construir mapa: último contacto por cliente
  const contactoMap = new Map<string, { fecha: string; tipo: string; vendedor: string }>()
  for (const c of (ultimosContactos ?? [])) {
    if (!contactoMap.has(c.cliente_nombre_fantasia)) {
      contactoMap.set(c.cliente_nombre_fantasia, {
        fecha: c.fecha_hora,
        tipo: c.tipo,
        vendedor: c.vendedor,
      })
    }
  }

  // Construir mapa: último pedido + litros totales por cliente
  const pedidoMap = new Map<string, { ultimaFecha: string; litrosTotal: number; ventaTotal: number }>()
  for (const v of (ultimosPedidos ?? [])) {
    if (!v.nombre_fantasia) continue
    const existing = pedidoMap.get(v.nombre_fantasia)
    if (!existing) {
      pedidoMap.set(v.nombre_fantasia, {
        ultimaFecha: v.fecha_pedido,
        litrosTotal: v.litros ?? 0,
        ventaTotal: v.total_sin_impuesto ?? 0,
      })
    } else {
      existing.litrosTotal += v.litros ?? 0
      existing.ventaTotal += v.total_sin_impuesto ?? 0
    }
  }

  // Enriquecer clientes con datos de contacto y pedidos
  const clientesEnriquecidos = (clientes ?? []).map(c => ({
    ...c,
    ultimoContacto: contactoMap.get(c.nombre_fantasia ?? '') ?? null,
    ultimoPedido: pedidoMap.get(c.nombre_fantasia ?? '') ?? null,
  }))

  return <ClientesClient clientes={clientesEnriquecidos} />
}
