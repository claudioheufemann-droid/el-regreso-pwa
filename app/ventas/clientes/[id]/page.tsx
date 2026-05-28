import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ClienteDetalleClient from './ClienteDetalleClient'

export default async function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', parseInt(id))
    .single()

  if (!cliente) notFound()

  // Historial completo de ventas
  const { data: ventas } = await supabase
    .from('ventas')
    .select('fecha_pedido, producto, envase, litros, total_sin_impuesto, pedido, categoria_producto, tipo_venta')
    .eq('nombre_fantasia', cliente.nombre_fantasia)
    .order('fecha_pedido', { ascending: false })
    .limit(500)

  // Historial de contactos
  const { data: contactos } = await supabase
    .from('contactos')
    .select('fecha_hora, tipo, vendedor, notas')
    .eq('cliente_nombre_fantasia', cliente.nombre_fantasia)
    .order('fecha_hora', { ascending: false })
    .limit(50)

  return (
    <ClienteDetalleClient
      cliente={cliente}
      ventas={ventas ?? []}
      contactos={contactos ?? []}
    />
  )
}
