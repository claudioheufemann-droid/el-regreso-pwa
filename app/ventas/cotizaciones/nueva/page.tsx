import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import type { StockPorCodigo } from '@/lib/catalogo-productos'
import NuevaCotizacionClient from './NuevaCotizacionClient'

export const dynamic = 'force-dynamic'

export interface ClienteParaCotizacion {
  id: number
  nombre_fantasia: string
  razon_social: string | null
  email: string | null
  telefono: string | null
}

export default async function NuevaCotizacionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [{ data: clientesRaw }, { data: stockRaw }] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nombre_fantasia, razon_social, email, telefono')
      .not('nombre_fantasia', 'is', null)
      .order('nombre_fantasia'),
    supabase
      .from('stock_productos')
      .select('codigo_producto, tipo, cantidad')
      .not('codigo_producto', 'is', null),
  ])

  const clientes: ClienteParaCotizacion[] = (clientesRaw ?? []).map(c => ({
    id: c.id,
    nombre_fantasia: c.nombre_fantasia,
    razon_social: c.razon_social ?? null,
    email: c.email ?? null,
    telefono: c.telefono ?? null,
  }))

  // Cotizaciones solo debe ofrecer lo que realmente hay en bodega — se cruza
  // por código de producto (no por nombre, que varía entre catálogo y stock).
  const stockPorCodigo: StockPorCodigo = {}
  for (const s of stockRaw ?? []) {
    const cod = s.codigo_producto as string
    if (!stockPorCodigo[cod]) stockPorCodigo[cod] = { barril: 0, envase: 0 }
    if (s.tipo === 'barril') stockPorCodigo[cod].barril += s.cantidad
    else stockPorCodigo[cod].envase += s.cantidad
  }

  return <NuevaCotizacionClient user={user} clientes={clientes} stockPorCodigo={stockPorCodigo} />
}
