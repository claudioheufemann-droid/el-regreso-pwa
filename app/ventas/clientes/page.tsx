import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES_SCOPE, VENDEDORES_CARTERA_ACTIVAS, esClienteExcluido, vendedorCanonico, nombresErpDe } from '@/lib/types'
import { getUltimaVentasCached } from '@/lib/misionesCache'
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

  // Vendedores con cartera propia para los botones "macro" del filtro — admin
  // ve la lista completa, un vendedor ve solo su propio nombre (no se le
  // ofrece ni siquiera la opción de mirar la cartera de otro).
  const vendedoresScope = appUser?.isAdmin
    ? [...VENDEDORES_CARTERA_ACTIVAS]
    : [vendedorCanonico(appUser?.nombre ?? '')]

  // El campo clientes.vendedor guarda nombres REALES (Marcelo Diaz, Yadro
  // Fabijancic, Los Rios/Los Lagos históricos, etc.), no un display unificado.
  //
  // OJO — esto filtra la QUERY A LA BASE DE DATOS, no solo lo que se pinta en
  // pantalla: antes `scopeDB` era SIEMPRE VENDEDORES_SCOPE completo sin
  // importar el rol, así que el navegador de CUALQUIER vendedor recibía el
  // roster completo de la empresa (nombres, teléfonos, deuda, revenue de
  // TODOS los clientes) en el HTML/props de la página, aunque la UI después
  // sólo mostrara su propia cartera filtrando en el cliente — cualquiera con
  // las devtools abiertas podía ver la cartera de sus compañeros. Ahora un
  // vendedor no-admin sólo trae SUS propios clientes desde la BD.
  const scopeDB: string[] = appUser?.isAdmin
    ? [...VENDEDORES_SCOPE]
    : nombresErpDe(vendedorCanonico(appUser?.nombre ?? '__sin_vendedor__'))

  const { data: periodo } = await supabase
    .from('periodos').select('id, nombre, fecha_inicio, fecha_fin').eq('activo', true).single()

  const fechaInicio = periodo?.fecha_inicio ?? '2000-01-01'
  const fechaFin    = periodo?.fecha_fin    ?? new Date().toISOString().split('T')[0]

  // Queries en paralelo
  const [
    { data: clientes },
    { data: estadosData },
    { data: scoreData },
    { data: deudoresData },
    ultimasVentasRaw,
  ] = await Promise.all([
    supabase.from('clientes')
      .select('id, nombre_fantasia, razon_social, categoria, vendedor, localidad, localidad_entrega, ruta_despacho, telefono, lat, lng')
      .in('vendedor', scopeDB)
      .order('nombre_fantasia'),
    supabase.from('clientes_estado').select('nombre_fantasia, estado, nota'),
    supabase.rpc('get_client_scores'),
    supabase.from('deudores').select('nombre_fantasia, deuda_vencida, saldo_total'),
    // Fuente directa de último pedido — más fiable que client_scores.ultima_compra
    getUltimaVentasCached(scopeDB),
  ])

  // Mapa de último pedido real desde ventas (primera aparición = más reciente, pues viene ordenado desc)
  const ultimaVentaMap = new Map<string, string>()
  for (const v of ultimasVentasRaw ?? [])
    if (v.nombre_fantasia && !ultimaVentaMap.has(v.nombre_fantasia))
      ultimaVentaMap.set(v.nombre_fantasia, v.fecha_pedido)

  // Queries grandes con paginación real (superan 1000 filas; .limit() fijo trunca silenciosamente)
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

  // Servicios de enlatado/co-packing a terceros (EWU Ginger Beer, etc.) no son
  // venta de cerveza propia — se excluyen antes de sumar litros/venta por
  // cliente y por vendedor.
  const ventasPeriodoFiltradas = ventasPeriodo.filter(v => !esClienteExcluido(v.nombre_fantasia))

  // ── Mapas de lookup ────────────────────────────────────────────────────────
  const contactoMap = new Map<string, { fecha: string; tipo: string; vendedor: string }>()
  for (const c of ultimosContactos ?? [])
    if (!contactoMap.has(c.cliente_nombre_fantasia))
      contactoMap.set(c.cliente_nombre_fantasia, { fecha: c.fecha_hora, tipo: c.tipo, vendedor: c.vendedor })

  const periodoMap = new Map<string, { litrosPeriodo: number; ventaPeriodo: number }>()
  for (const v of ventasPeriodoFiltradas) {
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
    // Modelo de ciclo v2 (ver supabase/migrations/ciclo_estacional_v2.sql)
    es_estacional: boolean; temporada_baja: boolean
    factor_estacional: number; ciclo_base_dias: number | null
    // Primera compra ALGUNA VEZ, no de la fila más reciente — para "Nuevo".
    primera_compra: string | null
  }>()
  // get_client_scores trae UNA FILA POR (nombre_fantasia, vendedor_actual) —
  // un mismo cliente puede tener varias filas si el ERP le cambió el nombre al
  // vendedor a lo largo del tiempo (pasó con las carteras Metropolitana/
  // Araucanía/Ríos/Lagos, 21-25 ago 2026: ej. "Oculto Beer Garden" quedó con
  // una fila reciente bajo "Yadro Fabijancic" — 13 pedidos, 150L, ayer — y
  // otra vieja bajo "Equipo Ventas" — 2 pedidos, 30L, hace 840 días).
  // Quedarnos con una sola fila (la que llegara última del RPC, sin orden
  // garantizado) mostraba "91d/840d sin comprar" al lado de un pedido de
  // ayer, y además subestimaba el historial real del cliente. Solución:
  // sumar pedidos/litros/revenue de TODAS las filas del cliente (historial
  // completo, sin importar bajo qué nombre de vendedor haya quedado cada
  // venta), y quedarnos con el ciclo/estado/score de la fila MÁS RECIENTE
  // (refleja mejor su ritmo de compra actual que promediar con filas viejas).
  type ScoreRow = NonNullable<typeof scoreData>[number]
  const filasPorCliente = new Map<string, ScoreRow[]>()
  for (const s of scoreData ?? []) {
    if (!s.nombre_fantasia) continue
    const arr = filasPorCliente.get(s.nombre_fantasia) ?? []
    arr.push(s)
    filasPorCliente.set(s.nombre_fantasia, arr)
  }
  for (const [nombre, filas] of filasPorCliente) {
    const masReciente = filas.reduce((a, b) => (b.ultima_compra ?? '') > (a.ultima_compra ?? '') ? b : a)
    frecuenciaMap.set(nombre, {
      ultima_compra: masReciente.ultima_compra ?? null,
      dias_sin_compra: masReciente.dias_sin_compra ?? 0,
      ciclo_promedio_dias: masReciente.ciclo_promedio_dias ?? null,
      total_pedidos: filas.reduce((sum, f) => sum + (f.total_pedidos ?? 0), 0),
      alert_level: masReciente.alert_level ?? 'sin_historial',
      siguiente_compra_estimada: masReciente.siguiente_compra_estimada ?? null,
      score: masReciente.score ?? 0, segmento: masReciente.segmento ?? 'E',
      confianza_score: masReciente.confianza_score ?? 'baja',
      litros_totales: filas.reduce((sum, f) => sum + (f.litros_totales ?? 0), 0),
      revenue_total:  filas.reduce((sum, f) => sum + (f.revenue_total  ?? 0), 0),
      pedidos_por_mes: masReciente.pedidos_por_mes ?? 0,
      es_estacional:     masReciente.es_estacional ?? false,
      temporada_baja:    masReciente.temporada_baja ?? false,
      factor_estacional: masReciente.factor_estacional ?? 1,
      ciclo_base_dias:   masReciente.ciclo_base_dias ?? null,
      // Mínimo entre TODAS las filas: la primera compra real del cliente,
      // sin importar bajo qué nombre de vendedor quedó archivada.
      primera_compra: filas.reduce((min: string | null, f) =>
        !f.primera_compra ? min : (!min || f.primera_compra < min) ? f.primera_compra : min, null),
    })
  }

  const deudaMap = new Map<string, { deuda_vencida: number; saldo_total: number }>()
  for (const d of deudoresData ?? [])
    if (d.nombre_fantasia) deudaMap.set(d.nombre_fantasia, { deuda_vencida: d.deuda_vencida ?? 0, saldo_total: d.saldo_total ?? 0 })

  // Totales por vendedor
  const totalesPorVendedor: Record<string, { litros: number; venta: number }> = {}
  for (const v of ventasPeriodoFiltradas) {
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
    const freqRaw = frecuenciaMap.get(c.nombre_fantasia ?? '') ?? null
    // Preferir fuente directa de ventas (scan de `ventas`, todos los vendedor_actual
    // del cliente); client_scores como fallback si no hay ninguna venta directa.
    const ultimaFechaCompra = ultimaVentaMap.get(c.nombre_fantasia ?? '') ?? freqRaw?.ultima_compra ?? null
    // "Xd sin comprar" SIEMPRE se deriva de ultimaFechaCompra (la fuente que
    // se muestra como "Último pedido"), nunca del dias_sin_compra que trae
    // client_scores — así los dos números de la tarjeta nunca pueden
    // contradecirse aunque client_scores quede desalineado por un cambio de
    // nombre de vendedor en el ERP.
    const freq = freqRaw && ultimaFechaCompra ? { ...freqRaw, dias_sin_compra: diasDesde(ultimaFechaCompra) ?? freqRaw.dias_sin_compra } : freqRaw
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
