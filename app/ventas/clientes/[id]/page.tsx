import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { vendedorCanonico } from '@/lib/types'
import ClienteDetalleClient from './ClienteDetalleClient'

export default async function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const appUser  = await getServerUser()

  const { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', parseInt(id))
    .single()

  if (!cliente) notFound()

  // La lista de /ventas/clientes ya viene acotada a la cartera del vendedor,
  // pero esta ficha se puede pedir directo por URL/id — sin este chequeo,
  // cualquier vendedor podía ver el detalle completo (contactos, deuda,
  // historial de ventas) de un cliente que no es suyo con solo cambiar el
  // número en la URL.
  //
  // vendedorCanonico(appUser.nombre) — el nombre de LOGIN, no el del ERP —
  // era el bug real acá: para Marcelo D. (login "Marcelo D.", ERP "Marcelo
  // Diaz") esto NUNCA calzaba y su propia ficha de cliente le tiraba 404.
  // Fix: partir de vendedoresErp (ver AppUser en lib/auth.ts), como ya hace
  // /ventas/clientes/page.tsx.
  const miVendedorCanonico = appUser?.vendedoresErp?.length
    ? vendedorCanonico(appUser.vendedoresErp[0])
    : '__sin_vendedor__'
  if (!appUser?.isAdmin && vendedorCanonico(cliente.vendedor) !== miVendedorCanonico) {
    notFound()
  }

  // Todas las queries en paralelo — antes scoreRow y estadoRow eran secuenciales (800ms perdidos)
  const [{ data: scoreRow }, { data: estadoRow }, { data: ventas }, { data: contactos }, { data: deudorData }] = await Promise.all([
    supabase
      .from('client_scores')
      .select('score, segmento, confianza_score, alert_level, dias_sin_compra, ciclo_promedio_dias, dias_para_siguiente, siguiente_compra_estimada, ultima_compra, total_pedidos, litros_totales, revenue_total, pedidos_por_mes')
      .eq('nombre_fantasia', cliente.nombre_fantasia ?? '')
      .maybeSingle(),
    supabase
      .from('clientes_estado')
      .select('estado, nota')
      .eq('nombre_fantasia', cliente.nombre_fantasia ?? '')
      .maybeSingle(),
    supabase
      .from('ventas')
      .select('fecha_pedido, producto, envase, litros, total_sin_impuesto, pedido, categoria_producto, tipo_venta')
      .eq('nombre_fantasia', cliente.nombre_fantasia)
      .order('fecha_pedido', { ascending: false })
      .limit(500),
    supabase
      .from('contactos')
      .select('fecha_hora, tipo, vendedor, notas, resultado')
      .eq('cliente_nombre_fantasia', cliente.nombre_fantasia)
      .order('fecha_hora', { ascending: false })
      .limit(100),
    // Service-role a propósito — ver lib/supabase/admin.ts. El chequeo de
    // cartera ya ocurrió arriba (notFound() si no es tu cliente).
    createAdminClient()
      .from('deudores')
      .select('deuda_vencida, saldo_total, barriles_adeudados, ultimo_pago, deuda_menor_14_dias, deuda_entre_15_29_dias, deuda_entre_30_44_dias, deuda_entre_45_59_dias, deuda_entre_60_89_dias, deuda_mas_90_dias')
      .eq('nombre_fantasia', cliente.nombre_fantasia)
      .maybeSingle(),
  ])

  const frecuenciaData = scoreRow ? {
    ultima_compra: scoreRow.ultima_compra ?? null,
    dias_sin_compra: scoreRow.dias_sin_compra ?? null,
    ciclo_promedio_dias: scoreRow.ciclo_promedio_dias ?? null,
    total_pedidos: scoreRow.total_pedidos ?? 0,
    alert_level: scoreRow.alert_level ?? 'sin_historial',
    dias_para_siguiente: scoreRow.dias_para_siguiente ?? null,
    siguiente_compra_estimada: scoreRow.siguiente_compra_estimada ?? null,
    score: scoreRow.score ?? 0,
    segmento: scoreRow.segmento ?? 'E',
    confianza_score: scoreRow.confianza_score ?? 'baja',
    litros_totales: scoreRow.litros_totales ?? 0,
    revenue_total: scoreRow.revenue_total ?? 0,
    pedidos_por_mes: scoreRow.pedidos_por_mes ?? 0,
  } : null

  return (
    <ClienteDetalleClient
      cliente={cliente}
      ventas={ventas ?? []}
      contactos={contactos ?? []}
      deudor={deudorData ?? null}
      frecuencia={frecuenciaData}
      estadoCliente={(estadoRow?.estado as 'activo' | 'inactivo' | 'estacional') ?? 'activo'}
      notaEstado={estadoRow?.nota ?? null}
    />
  )
}
