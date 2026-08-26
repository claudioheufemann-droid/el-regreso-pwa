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
  // Antes esta página traía TODOS los clientes (~600, sin límite) sólo para
  // que el buscador de "Cliente existente" filtrara 8 en memoria — la base
  // completa viajaba igual aunque nunca se mostrara de golpe. Ahora sólo se
  // trae el stock; la búsqueda de cliente es en vivo contra Supabase (ver
  // NuevaCotizacionClient), mismo patrón que ya usa Nueva Visita/Ruta.
  const { data: stockRaw } = await supabase
    .from('stock_productos')
    .select('codigo_producto, tipo, cantidad')
    .not('codigo_producto', 'is', null)

  // Cotizaciones solo debe ofrecer lo que realmente hay en bodega — se cruza
  // por código de producto (no por nombre, que varía entre catálogo y stock).
  const stockPorCodigo: StockPorCodigo = {}
  for (const s of stockRaw ?? []) {
    const cod = s.codigo_producto as string
    if (!stockPorCodigo[cod]) stockPorCodigo[cod] = { barril: 0, envase: 0 }
    if (s.tipo === 'barril') stockPorCodigo[cod].barril += s.cantidad
    else stockPorCodigo[cod].envase += s.cantidad
  }

  return <NuevaCotizacionClient user={user} stockPorCodigo={stockPorCodigo} />
}
