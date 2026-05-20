import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NuevaVisitaClient from './NuevaVisitaClient'

export const dynamic = 'force-dynamic'

function normalizarNombre(nombre: string): string {
  if (/barril.*30l.*local/i.test(nombre))         return 'Barril 30 Litros (Local)'
  if (/barril.*30l.*central/i.test(nombre))        return 'Barril 30 Litros (Zona Central)'
  if (/barril.*30l/i.test(nombre))                 return 'Barril 30 Litros'
  return nombre.replace(/\s{2,}/g, ' ').trim()
}

function esProductoCatalogable(nombre: string): boolean {
  if (!nombre) return false
  const excluir = ['empaque y distribución', 'empaque y distribucion', 'distribución lata', 'distribucion lata']
  const n = nombre.toLowerCase()
  return !excluir.some(e => n.includes(e))
}

export default async function NuevaVisitaPage({
  searchParams,
}: {
  searchParams: Promise<{ retomar?: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { retomar } = await searchParams

  // Si hay visita a retomar, cargarla
  let visitaRetomada = null
  if (retomar) {
    const { data } = await supabase
      .from('visitas_terreno')
      .select('id, cliente_nombre, es_cliente_nuevo, lat, lng, direccion_gps, estado')
      .eq('id', retomar)
      .eq('estado', 'en_progreso')
      .maybeSingle()
    visitaRetomada = data ?? null
  }

  // Clientes únicos de ventas para búsqueda
  const { data: clientesVentas } = await supabase
    .from('ventas')
    .select('nombre_fantasia, categoria_negocio, localidad')
    .not('nombre_fantasia', 'is', null)
    .order('nombre_fantasia')

  const seen = new Set<string>()
  const clientes = (clientesVentas ?? []).filter(c => {
    if (!c.nombre_fantasia || seen.has(c.nombre_fantasia)) return false
    seen.add(c.nombre_fantasia)
    return true
  })

  // Productos del catálogo — filtrados y normalizados
  const { data: productosRaw } = await supabase
    .from('ventas')
    .select('producto, categoria_producto, envase')
    .not('producto', 'is', null)
    .order('producto')

  const seenProd = new Set<string>()
  const productos = (productosRaw ?? [])
    .filter(p => p.producto && esProductoCatalogable(p.producto))
    .map(p => ({ ...p, producto: normalizarNombre(p.producto) }))
    .filter(p => {
      if (seenProd.has(p.producto)) return false
      seenProd.add(p.producto)
      return true
    })

  return (
    <NuevaVisitaClient
      vendedor={user}
      clientesExistentes={clientes}
      catalogoProductos={productos}
      visitaRetomada={visitaRetomada}
    />
  )
}
