import { createClient } from '@/lib/supabase/server'
import ClientesClient from './ClientesClient'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const supabase = await createClient()

  // Período activo
  const { data: periodo } = await supabase
    .from('periodos')
    .select('id, nombre, fecha_inicio, fecha_fin')
    .eq('activo', true)
    .single()

  const fechaInicio = periodo?.fecha_inicio ?? '2000-01-01'
  const fechaFin    = periodo?.fecha_fin    ?? new Date().toISOString().split('T')[0]

  // Clientes con datos base
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

  // Último pedido (histórico) — solo para mostrar "último pedido: X días"
  const { data: ultimosPedidosHistorico } = await supabase
    .from('ventas')
    .select('nombre_fantasia, fecha_pedido')
    .order('fecha_pedido', { ascending: false })
    .limit(10000)

  // Litros del PERÍODO ACTIVO por cliente
  const { data: ventasPeriodo } = await supabase
    .from('ventas')
    .select('nombre_fantasia, vendedor_actual, litros, total_sin_impuesto, fecha_pedido')
    .gte('fecha_pedido', fechaInicio)
    .lte('fecha_pedido', fechaFin)

  // Mapa: último contacto por cliente
  const contactoMap = new Map<string, { fecha: string; tipo: string; vendedor: string }>()
  for (const c of (ultimosContactos ?? [])) {
    if (!contactoMap.has(c.cliente_nombre_fantasia)) {
      contactoMap.set(c.cliente_nombre_fantasia, { fecha: c.fecha_hora, tipo: c.tipo, vendedor: c.vendedor })
    }
  }

  // Mapa: última fecha de pedido por cliente (histórico)
  const ultimaFechaMap = new Map<string, string>()
  for (const v of (ultimosPedidosHistorico ?? [])) {
    if (!v.nombre_fantasia) continue
    if (!ultimaFechaMap.has(v.nombre_fantasia)) {
      ultimaFechaMap.set(v.nombre_fantasia, v.fecha_pedido)
    }
  }

  // Mapa: litros + venta del período por cliente
  const periodoMap = new Map<string, { litrosPeriodo: number; ventaPeriodo: number }>()
  for (const v of (ventasPeriodo ?? [])) {
    if (!v.nombre_fantasia) continue
    const existing = periodoMap.get(v.nombre_fantasia)
    if (!existing) {
      periodoMap.set(v.nombre_fantasia, { litrosPeriodo: v.litros ?? 0, ventaPeriodo: v.total_sin_impuesto ?? 0 })
    } else {
      existing.litrosPeriodo += v.litros ?? 0
      existing.ventaPeriodo  += v.total_sin_impuesto ?? 0
    }
  }

  // Totales del período por vendedor (para mostrar en el encabezado)
  const totalesPorVendedor: Record<string, { litros: number; venta: number }> = {}
  for (const v of (ventasPeriodo ?? [])) {
    const vend = v.vendedor_actual
    if (!vend) continue
    if (!totalesPorVendedor[vend]) totalesPorVendedor[vend] = { litros: 0, venta: 0 }
    totalesPorVendedor[vend].litros += v.litros ?? 0
    totalesPorVendedor[vend].venta  += v.total_sin_impuesto ?? 0
  }

  // Estados manuales de clientes (activo / inactivo / estacional)
  const { data: estadosData } = await supabase
    .from('clientes_estado')
    .select('nombre_fantasia, estado, nota')

  const estadosMap = new Map<string, { estado: string; nota: string | null }>()
  for (const e of (estadosData ?? [])) {
    estadosMap.set(e.nombre_fantasia, { estado: e.estado, nota: e.nota ?? null })
  }

  // Scores y alertas de compra desde Supabase (RFM model)
  const { data: scoreData } = await supabase
    .rpc('get_client_scores')

  const frecuenciaMap = new Map<string, {
    ultima_compra: null
    dias_sin_compra: number
    ciclo_promedio_dias: number | null
    total_pedidos: number
    alert_level: string
    dias_para_siguiente: null
    siguiente_compra_estimada: string | null
    score: number
    segmento: string
    confianza_score: string
    litros_totales: number
    revenue_total: number
    pedidos_por_mes: number
  }>()
  for (const s of (scoreData ?? [])) {
    if (s.nombre_fantasia) {
      frecuenciaMap.set(s.nombre_fantasia, {
        ultima_compra: null,
        dias_sin_compra: s.dias_sin_compra ?? 0,
        ciclo_promedio_dias: s.ciclo_promedio_dias ?? null,
        total_pedidos: s.total_pedidos ?? 0,
        alert_level: s.alert_level ?? 'sin_historial',
        dias_para_siguiente: null,
        siguiente_compra_estimada: s.siguiente_compra_estimada ?? null,
        score: s.score ?? 0,
        segmento: s.segmento ?? 'E',
        confianza_score: s.confianza_score ?? 'baja',
        litros_totales: s.litros_totales ?? 0,
        revenue_total: s.revenue_total ?? 0,
        pedidos_por_mes: s.pedidos_por_mes ?? 0,
      })
    }
  }

  // Enriquecer clientes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientesEnriquecidos = (clientes ?? []).map((c: any) => ({
    ...c,
    ultimoContacto: contactoMap.get(c.nombre_fantasia ?? '') ?? null,
    ultimoPedido: ultimaFechaMap.has(c.nombre_fantasia ?? '')
      ? {
          ultimaFecha:   ultimaFechaMap.get(c.nombre_fantasia!)!,
          litrosPeriodo: periodoMap.get(c.nombre_fantasia ?? '')?.litrosPeriodo ?? 0,
          ventaPeriodo:  periodoMap.get(c.nombre_fantasia ?? '')?.ventaPeriodo  ?? 0,
        }
      : null,
    frecuencia: frecuenciaMap.get(c.nombre_fantasia ?? '') ?? null,
    estadoCliente: estadosMap.get(c.nombre_fantasia ?? '')?.estado ?? 'activo',
    notaEstado: estadosMap.get(c.nombre_fantasia ?? '')?.nota ?? null,
  }))

  return (
    <ClientesClient
      clientes={clientesEnriquecidos}
      periodo={periodo ? { nombre: periodo.nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin } : null}
      totalesPorVendedor={totalesPorVendedor}
    />
  )
}
