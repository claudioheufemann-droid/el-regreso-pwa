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

  // Score y frecuencia de compra desde client_scores (RFM model)
  const { data: scoreRow } = await supabase
    .from('client_scores')
    .select('score, segmento, confianza_score, alert_level, dias_sin_compra, ciclo_promedio_dias, dias_para_siguiente, siguiente_compra_estimada, ultima_compra, total_pedidos, litros_totales, revenue_total, pedidos_por_mes')
    .eq('nombre_fantasia', cliente.nombre_fantasia ?? '')
    .single()

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
      frecuencia={frecuenciaData ?? null}
    />
  )
}
