import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HistorialClient from './HistorialClient'

export const dynamic = 'force-dynamic'

export default async function HistorialPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  let query = supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, tiene_venta, motivo_sin_venta, total_pedido, estado, iniciada_at, completada_at, vendedor_id, es_cliente_nuevo, observaciones, direccion_gps, lat, lng, foto_exterior, foto_exhibicion, foto_competencia')
    .order('iniciada_at', { ascending: false })
    .limit(300)

  if (!user.isAdmin) query = query.eq('vendedor_id', user.id)

  const { data: visitas } = await query

  const visitaIds = (visitas ?? []).map(v => v.id)
  const clienteNombres = [...new Set((visitas ?? []).map(v => v.cliente_nombre).filter(Boolean))]

  // Items, vendedores y deudores en paralelo
  const [itemsRes, vendedoresRes, deudoresRes, ventasHistRes] = await Promise.all([
    visitaIds.length
      ? supabase.from('visitas_terreno_items').select('id, visita_id, producto, categoria, envase, cantidad, precio_unit, subtotal').in('visita_id', visitaIds)
      : Promise.resolve({ data: [] }),
    user.isAdmin
      ? supabase.from('users').select('id, nombre').order('nombre')
      : Promise.resolve({ data: [] }),
    clienteNombres.length
      ? supabase.from('deudores').select('nombre_fantasia, saldo_total, deuda_vencida, ultimo_pago, fecha_ultima_compra, limite_cta_cte').in('nombre_fantasia', clienteNombres)
      : Promise.resolve({ data: [] }),
    // Historial de ventas por cliente desde tabla ventas (Excel)
    clienteNombres.length
      ? supabase.from('ventas').select('nombre_fantasia, producto, litros, total_sin_impuesto, fecha_pedido').in('nombre_fantasia', clienteNombres).order('fecha_pedido', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  return (
    <HistorialClient
      user={user}
      visitas={visitas ?? []}
      items={itemsRes.data ?? []}
      vendedores={vendedoresRes.data ?? []}
      deudores={deudoresRes.data ?? []}
      ventasHist={ventasHistRes.data ?? []}
    />
  )
}
