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

  // Historial completo de ventas + contactos + deuda en paralelo
  const [{ data: ventas }, { data: contactos }, { data: deudorData }] = await Promise.all([
    supabase
      .from('ventas')
      .select('fecha_pedido, producto, envase, litros, total_sin_impuesto, pedido, categoria_producto, tipo_venta')
      .eq('nombre_fantasia', cliente.nombre_fantasia)
      .order('fecha_pedido', { ascending: false })
      .limit(500),
    supabase
      .from('contactos')
      .select('fecha_hora, tipo, vendedor, notas')
      .eq('cliente_nombre_fantasia', cliente.nombre_fantasia)
      .order('fecha_hora', { ascending: false })
      .limit(50),
    supabase
      .from('deudores')
      .select('deuda_vencida, saldo_total, barriles_adeudados, ultimo_pago, deuda_menor_14_dias, deuda_entre_15_29_dias, deuda_entre_30_44_dias, deuda_entre_45_59_dias, deuda_entre_60_89_dias, deuda_mas_90_dias')
      .eq('nombre_fantasia', cliente.nombre_fantasia)
      .single(),
  ])

  return (
    <ClienteDetalleClient
      cliente={cliente}
      ventas={ventas ?? []}
      contactos={contactos ?? []}
      deudor={deudorData ?? null}
    />
  )
}
