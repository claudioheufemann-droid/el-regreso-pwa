import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES } from '@/lib/types'
import ClientesClient from './ClientesClient'

export const dynamic = 'force-dynamic'

function diasDesde(f: string | null | undefined): number | null {
  if (!f) return null
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000)
}

export type ActividadItem = {
  tipo: 'contacto' | 'pedido'
  cliente: string
  detalle: string
  fecha: string
}

export default async function ClientesPage() {
  const supabase = await createClient()
  const appUser  = await getServerUser()

  const vendedoresScope = appUser?.isAdmin ? VENDEDORES : VENDEDORES.filter(v => v === appUser?.nombre)

  const { data: periodo } = await supabase
    .from('periodos').select('id, nombre, fecha_inicio, fecha_fin').eq('activo', true).single()

  const fechaInicio = periodo?.fecha_inicio ?? '2000-01-01'
  const fechaFin    = periodo?.fecha_fin    ?? new Date().toISOString().split('T')[0]

  // Todas las queries en paralelo
  const [
    { data: clientes },
    { data: ultimosContactos },
    { data: ultimosPedidos },
    { data: ventasPeriodo },
    { data: estadosData },
    { data: scoreData },
    { data: deudoresData },
  ] = await Promise.all([
    supabase.from('clientes')
      .select('id, nombre_fantasia, razon_social, categoria, vendedor, localidad, localidad_entrega, ruta_despacho, telefono, lat, lng')
      .in('vendedor', vendedoresScope.length ? vendedoresScope : ['__none__'])
      .order('nombre_fantasia'),

    supabase.from('contactos')
      .select('cliente_nombre_fantasia, fecha_hora, tipo, vendedor')
      .order('fecha_hora', { ascending: false }).limit(5000),

    supabase.from('ventas')
      .select('nombre_fantasia, fecha_pedido, litros')
      .order('fecha_pedido', { ascending: false }).limit(10000),

    supabase.from('ventas')
      .select('nombre_fantasia, vendedor_actual, litros, total_sin_impuesto, fecha_pedido')
      .gte('fecha_pedido', fechaInicio).lte('fecha_pedido', fechaFin),

    supabase.from('clientes_estado').select('nombre_fantasia, estado, nota'),

    supabase.rpc('get_client_scores'),

    supabase.from('deudores').select('nombre_fantasia, deuda_vencida, saldo_total'),
  ])

  // ── Mapas de lookup ────────────────────────────────────────────────────────
  const contactoMap = new Map<string, { fecha: string; tipo: string; vendedor: string }>()
  for (const c of ultimosContactos ?? [])
    if (!contactoMap.has(c.cliente_nombre_fantasia))
      contactoMap.set(c.cliente_nombre_fantasia, { fecha: c.fecha_hora, tipo: c.tipo, vendedor: c.vendedor })

  const ultimaFechaMap = new Map<string, string>()
  for (const v of ultimosPedidos ?? [])
    if (v.nombre_fantasia && !ultimaFechaMap.has(v.nombre_fantasia))
      ultimaFechaMap.set(v.nombre_fantasia, v.fecha_pedido)

  const periodoMap = new Map<string, { litrosPeriodo: number; ventaPeriodo: number }>()
  for (const v of ventasPeriodo ?? []) {
    if (!v.nombre_fantasia) continue
    const ex = periodoMap.get(v.nombre_fantasia)
    if (!ex) periodoMap.set(v.nombre_fantasia, { litrosPeriodo: v.litros ?? 0, ventaPeriodo: v.total_sin_impuesto ?? 0 })
    else { ex.litrosPeriodo += v.litros ?? 0; ex.ventaPeriodo += v.total_sin_impuesto ?? 0 }
  }

  const estadosMap = new Map<string, { estado: string; nota: string | null }>()
  for (const e of estadosData ?? []) estadosMap.set(e.nombre_fantasia, { estado: e.estado, nota: e.nota ?? null })

  const frecuenciaMap = new Map<string, {
    dias_sin_compra: number; ciclo_promedio_dias: number | null; total_pedidos: number
    alert_level: string; siguiente_compra_estimada: string | null
    score: number; segmento: string; confianza_score: string
    litros_totales: number; revenue_total: number; pedidos_por_mes: number
  }>()
  for (const s of scoreData ?? [])
    if (s.nombre_fantasia) frecuenciaMap.set(s.nombre_fantasia, {
      dias_sin_compra: s.dias_sin_compra ?? 0,
      ciclo_promedio_dias: s.ciclo_promedio_dias ?? null,
      total_pedidos: s.total_pedidos ?? 0,
      alert_level: s.alert_level ?? 'sin_historial',
      siguiente_compra_estimada: s.siguiente_compra_estimada ?? null,
      score: s.score ?? 0, segmento: s.segmento ?? 'E',
      confianza_score: s.confianza_score ?? 'baja',
      litros_totales: s.litros_totales ?? 0, revenue_total: s.revenue_total ?? 0, pedidos_por_mes: s.pedidos_por_mes ?? 0,
    })

  const deudaMap = new Map<string, { deuda_vencida: number; saldo_total: number }>()
  for (const d of deudoresData ?? [])
    if (d.nombre_fantasia) deudaMap.set(d.nombre_fantasia, { deuda_vencida: d.deuda_vencida ?? 0, saldo_total: d.saldo_total ?? 0 })

  // Totales por vendedor
  const totalesPorVendedor: Record<string, { litros: number; venta: number }> = {}
  for (const v of ventasPeriodo ?? []) {
    const vend = v.vendedor_actual; if (!vend) continue
    if (!totalesPorVendedor[vend]) totalesPorVendedor[vend] = { litros: 0, venta: 0 }
    totalesPorVendedor[vend].litros += v.litros ?? 0
    totalesPorVendedor[vend].venta  += v.total_sin_impuesto ?? 0
  }

  // ── Enriquecer clientes ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientesEnriquecidos = (clientes ?? []).map((c: any) => ({
    ...c,
    ultimoContacto: contactoMap.get(c.nombre_fantasia ?? '') ?? null,
    ultimoPedido: ultimaFechaMap.has(c.nombre_fantasia ?? '') ? {
      ultimaFecha:   ultimaFechaMap.get(c.nombre_fantasia!)!,
      litrosPeriodo: periodoMap.get(c.nombre_fantasia ?? '')?.litrosPeriodo ?? 0,
      ventaPeriodo:  periodoMap.get(c.nombre_fantasia ?? '')?.ventaPeriodo  ?? 0,
    } : null,
    frecuencia:    frecuenciaMap.get(c.nombre_fantasia ?? '') ?? null,
    estadoCliente: estadosMap.get(c.nombre_fantasia ?? '')?.estado ?? 'activo',
    notaEstado:    estadosMap.get(c.nombre_fantasia ?? '')?.nota ?? null,
    deuda:         deudaMap.get(c.nombre_fantasia ?? '') ?? null,
  }))

  // ── KPIs de estado ────────────────────────────────────────────────────────
  const total         = clientesEnriquecidos.length
  const contactados7d = clientesEnriquecidos.filter(c => {
    const d = diasDesde(c.ultimoContacto?.fecha); return d !== null && d <= 7
  }).length
  const pendientes    = clientesEnriquecidos.filter(c => {
    const al = c.frecuencia?.alert_level
    const d = diasDesde(c.ultimoContacto?.fecha)
    return ['critico','vencido','proximo'].includes(al) && (d === null || d > 3)
  }).length
  const sinContacto   = clientesEnriquecidos.filter(c => {
    const d = diasDesde(c.ultimoContacto?.fecha); return !c.ultimoContacto || d === null || d > 7
  }).length
  const riesgoCompra  = clientesEnriquecidos.filter(c =>
    ['critico','vencido'].includes(c.frecuencia?.alert_level ?? '')
  ).length
  const deudaAlta     = clientesEnriquecidos.filter(c => (c.deuda?.deuda_vencida ?? 0) > 0).length
  const alDia         = clientesEnriquecidos.filter(c => {
    if ((c.deuda?.deuda_vencida ?? 0) > 0) return false
    if (['critico','vencido'].includes(c.frecuencia?.alert_level ?? '')) return false
    const d = diasDesde(c.ultimoContacto?.fecha); return d !== null && d <= 7
  }).length

  // ── Actividad reciente ────────────────────────────────────────────────────
  const actividad: ActividadItem[] = [
    ...(ultimosContactos ?? []).slice(0, 6).map(c => ({
      tipo: 'contacto' as const,
      cliente: c.cliente_nombre_fantasia,
      detalle: c.tipo || 'WhatsApp',
      fecha: c.fecha_hora,
    })),
    ...(ultimosPedidos ?? []).slice(0, 6).map(v => ({
      tipo: 'pedido' as const,
      cliente: v.nombre_fantasia ?? '—',
      detalle: `${(v.litros ?? 0).toFixed(1)} L`,
      fecha: v.fecha_pedido,
    })),
  ]
    .filter(a => a.cliente)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 8)

  return (
    <ClientesClient
      clientes={clientesEnriquecidos}
      periodo={periodo ? { nombre: periodo.nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin } : null}
      totalesPorVendedor={totalesPorVendedor}
      stats={{ total, contactados7d, pendientes, sinContacto, riesgoCompra, deudaAlta, alDia }}
      actividad={actividad}
      isAdmin={appUser?.isAdmin ?? false}
      vendedoresScope={vendedoresScope as string[]}
    />
  )
}
