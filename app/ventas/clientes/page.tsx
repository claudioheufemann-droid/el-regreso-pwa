import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES, VENDEDORES_DB, esClienteExcluido } from '@/lib/types'
import ClientesClient from './ClientesClient'

export const revalidate = 120

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
  // El campo clientes.vendedor guarda nombres REALES (Javier/Carlos), no el display
  // "Vendedor 1". Para el query usamos VENDEDORES_DB; si no, no matchea y la lista
  // sale vacía. (Equipo consolidado en un vendedor → todos ven la cartera del equipo.)
  const scopeDB: string[] = [...VENDEDORES_DB]

  const { data: periodo } = await supabase
    .from('periodos').select('id, nombre, fecha_inicio, fecha_fin').eq('activo', true).single()

  const fechaInicio = periodo?.fecha_inicio ?? '2000-01-01'
  const fechaFin    = periodo?.fecha_fin    ?? new Date().toISOString().split('T')[0]

  // Queries pequeñas (no superan 1000 filas) — en paralelo
  const [
    { data: clientes },
    { data: estadosData },
    { data: scoreData },
    { data: deudoresData },
  ] = await Promise.all([
    supabase.from('clientes')
      .select('id, nombre_fantasia, razon_social, categoria, vendedor, localidad, localidad_entrega, ruta_despacho, telefono, lat, lng')
      .in('vendedor', scopeDB)
      .order('nombre_fantasia'),
    supabase.from('clientes_estado').select('nombre_fantasia, estado, nota'),
    supabase.rpc('get_client_scores'),
    supabase.from('deudores').select('nombre_fantasia, deuda_vencida, saldo_total'),
  ])

  // Queries grandes con paginación real (superan 1000 filas; .limit() fijo trunca silenciosamente)
  // NOTA: ultimosPedidos eliminado — client_scores ya tiene ultima_compra por cliente
  const ultimosContactos: { cliente_nombre_fantasia: string; fecha_hora: string; tipo: string; vendedor: string }[] = []
  const ventasPeriodo: { nombre_fantasia: string; vendedor_actual: string; litros: number; total_sin_impuesto: number; fecha_pedido: string }[] = []

  // Filtrar contactos solo de clientes en scope para reducir volumen
  const nombresScope = (clientes ?? []).map((c: { nombre_fantasia: string | null }) => c.nombre_fantasia).filter(Boolean) as string[]

  await Promise.all([
    // contactos: solo de clientes en scope, orden desc → capturamos el más reciente por cliente
    (async () => {
      // Si hay muchos clientes, paginamos; si pocos, query directa
      const chunk = 100 // máx clientes por chunk para no exceder URL limit
      for (let i = 0; i < nombresScope.length; i += chunk) {
        const nombres = nombresScope.slice(i, i + chunk)
        const { data } = await supabase.from('contactos')
          .select('cliente_nombre_fantasia, fecha_hora, tipo, vendedor')
          .in('cliente_nombre_fantasia', nombres)
          .order('fecha_hora', { ascending: false })
          .limit(1000)
        if (data) ultimosContactos.push(...data)
      }
    })(),
    // ventas del período activo: litros y venta por cliente
    (async () => {
      let offset = 0
      while (true) {
        const { data } = await supabase.from('ventas')
          .select('nombre_fantasia, vendedor_actual, litros, total_sin_impuesto, fecha_pedido')
          .gte('fecha_pedido', fechaInicio).lte('fecha_pedido', fechaFin)
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        ventasPeriodo.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
    })(),
  ])

  // ── Mapas de lookup ────────────────────────────────────────────────────────
  const contactoMap = new Map<string, { fecha: string; tipo: string; vendedor: string }>()
  for (const c of ultimosContactos ?? [])
    if (!contactoMap.has(c.cliente_nombre_fantasia))
      contactoMap.set(c.cliente_nombre_fantasia, { fecha: c.fecha_hora, tipo: c.tipo, vendedor: c.vendedor })

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
    ultima_compra: string | null; dias_sin_compra: number; ciclo_promedio_dias: number | null; total_pedidos: number
    alert_level: string; siguiente_compra_estimada: string | null
    score: number; segmento: string; confianza_score: string
    litros_totales: number; revenue_total: number; pedidos_por_mes: number
  }>()
  for (const s of scoreData ?? [])
    if (s.nombre_fantasia) frecuenciaMap.set(s.nombre_fantasia, {
      ultima_compra: s.ultima_compra ?? null,
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

  // Helper: excluir clientes internos
  const esInterno = esClienteExcluido

  // ── Enriquecer clientes (sin internos) ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientesEnriquecidos = (clientes ?? []).filter((c: any) => !esInterno(c.nombre_fantasia)).map((c: any) => {
    const freq = frecuenciaMap.get(c.nombre_fantasia ?? '') ?? null
    const ultimaFechaCompra = freq?.ultima_compra ?? null  // viene de client_scores, sin query extra
    const periodo = periodoMap.get(c.nombre_fantasia ?? '') ?? null
    return {
      ...c,
      ultimoContacto: contactoMap.get(c.nombre_fantasia ?? '') ?? null,
      ultimoPedido: ultimaFechaCompra ? {
        ultimaFecha:   ultimaFechaCompra,
        litrosPeriodo: periodo?.litrosPeriodo ?? 0,
        ventaPeriodo:  periodo?.ventaPeriodo  ?? 0,
      } : null,
      frecuencia:    freq,
      estadoCliente: estadosMap.get(c.nombre_fantasia ?? '')?.estado ?? 'activo',
      notaEstado:    estadosMap.get(c.nombre_fantasia ?? '')?.nota ?? null,
      deuda:         deudaMap.get(c.nombre_fantasia ?? '') ?? null,
    }
  })

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

  // ── Actividad reciente (contactos + últimas ventas del período) ─────────
  const actividadPedidos = ventasPeriodo
    .filter(v => !esInterno(v.nombre_fantasia) && v.nombre_fantasia)
    .sort((a, b) => b.fecha_pedido.localeCompare(a.fecha_pedido))
    .slice(0, 10)

  const actividad: ActividadItem[] = [
    ...(ultimosContactos ?? [])
      .filter(c => !esInterno(c.cliente_nombre_fantasia))
      .slice(0, 10).map(c => ({
        tipo: 'contacto' as const,
        cliente: c.cliente_nombre_fantasia,
        detalle: c.tipo || 'WhatsApp',
        fecha: c.fecha_hora,
      })),
    ...actividadPedidos.map(v => ({
      tipo: 'pedido' as const,
      cliente: v.nombre_fantasia ?? '—',
      detalle: `${(v.litros ?? 0).toFixed(1)} L`,
      fecha: v.fecha_pedido,
    })),
  ]
    .filter(a => a.cliente && a.cliente !== '—')
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
