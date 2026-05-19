import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NuevaVisitaClient from './NuevaVisitaClient'

export const dynamic = 'force-dynamic'

export default async function NuevaVisitaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Clientes únicos de ventas para búsqueda
  const { data: clientesVentas } = await supabase
    .from('ventas')
    .select('nombre_fantasia, categoria_negocio, localidad')
    .not('nombre_fantasia', 'is', null)
    .order('nombre_fantasia')

  // Deduplicar por nombre
  const seen = new Set<string>()
  const clientes = (clientesVentas ?? []).filter(c => {
    if (!c.nombre_fantasia || seen.has(c.nombre_fantasia)) return false
    seen.add(c.nombre_fantasia)
    return true
  })

  // Productos del catálogo (únicos de ventas)
  const { data: productosRaw } = await supabase
    .from('ventas')
    .select('producto, categoria_producto, envase')
    .not('producto', 'is', null)
    .order('producto')

  const seenProd = new Set<string>()
  const productos = (productosRaw ?? []).filter(p => {
    if (!p.producto || seenProd.has(p.producto)) return false
    seenProd.add(p.producto)
    return true
  })

  return (
    <NuevaVisitaClient
      vendedor={user}
      clientesExistentes={clientes}
      catalogoProductos={productos}
    />
  )
}
