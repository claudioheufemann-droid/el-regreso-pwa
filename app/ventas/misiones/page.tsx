import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES_DB } from '@/lib/types'
import { getVolumenBajaCached, getCrossSellCached, getPedidoSugeridoCached, getUltimaVentasCached } from '@/lib/misionesCache'
import MisionesClient from './MisionesClient'

export const revalidate = 120

function getMondayOfWeek(d: Date): string {
  const x = new Date(d); const day = x.getDay()
  x.setDate(x.getDate() - day + (day === 0 ? -6 : 1))
  return x.toISOString().split('T')[0]
}

export type EstadoMision = 'pendiente' | 'contactado_pedido' | 'contactado_sin_pedido' | 'sin_respuesta' | 'pospuesto' | 'auto_completado'
export type TipoMision = 'esta_semana' | 'proxima_semana' | 'vencido'

export interface MisionEnriquecida {
  id: string
  vendedor: string
  nombre_fantasia: string
  semana: string
  tipo: TipoMision
  alert_level: string
  score: number
  segmento: string
  dias_sin_compra: number
  ciclo_promedio_dias: number | null
  siguiente_compra_estimada: string | null
  estado: EstadoMision
  completado_at: string | null
  nota: string | null
  snooze_until: string | null
  completado_canal: string | null
  resultado_litros: number | null
  intentos_contacto: number | null
  volumen_promedio: number | null
  litros_ultima_compra: number | null
  prioridad_calculada: number | null
  // Segmentación de cliente
  tipo_cliente: 'activo' | 'inactivo' | 'temporal' | 'nuevo' | null
  // Caída de volumen (señal temprana): % de caída vs baseline, o null
  volumen_caida_pct: number | null
  // Cross-sell: categoría sugerida que pares compran y este cliente no
  cross_sell: { categoria: string; pct: number } | null
  // Pedido sugerido: productos habituales (top 3) con litros típicos
  pedido_sugerido: { producto: string; envase: string | null; litros: number }[]
  // Enriquecido
  ruta_despacho: string | null
  localidad: string | null
  telefono: string | null
  cliente_id: number | null   // clientes.id → enlace al perfil
  ultima_venta_fecha: string | null
  ultima_venta_monto: number
  prioridad: 'Alta' | 'Media' | 'Baja'
  frecuencia_texto: string
  dias_para_compra: number | null // positivo = faltan días, negativo = ya venció
}

export interface ProximaPreview {
  nombre_fantasia: string; vendedor_actual: string
  alert_level: string; score: number; segmento: string
  dias_sin_compra: number; ciclo_promedio_dias: number
  siguiente_compra_estimada: string | null
}

export interface HistorialSemana {
  semana: string
  total: number; completadas: number
  misiones: MisionEnriquecida[]
}

function enriquecerMision(
  m: Omit<MisionEnriquecida, 'ruta_despacho'|'localidad'|'telefono'|'cliente_id'|'ultima_venta_fecha'|'ultima_venta_monto'|'prioridad'|'frecuencia_texto'|'dias_para_compra'|'tipo_cliente'|'volumen_caida_pct'|'cross_sell'|'pedido_sugerido'>,
  clienteMap: Map<string, { ruta_despacho: string|null; localidad: string|null; telefono: string|null; cliente_id: number|null }>,
  ventaMap: Map<string, { fecha: string; monto: number }>,
  tipoClienteMap: Map<string, 'activo' | 'inactivo' | 'temporal' | 'nuevo'>,
  volBajaMap: Map<string, number>,
  crossSellMap: Map<string, { categoria: string; pct: number }>,
  pedidoSugMap: Map<string, { producto: string; envase: string | null; litros: number }[]>
): MisionEnriquecida {
  const cli = clienteMap.get(m.nombre_fantasia) ?? { ruta_despacho:null, localidad:null, telefono:null, cliente_id:null }
  const vta = ventaMap.get(m.nombre_fantasia)
  const tipo_cliente = tipoClienteMap.get(m.nombre_fantasia) ?? null
  const volumen_caida_pct = volBajaMap.get(m.nombre_fantasia) ?? null
  const cross_sell = crossSellMap.get(m.nombre_fantasia) ?? null
  const pedido_sugerido = pedidoSugMap.get(m.nombre_fantasia) ?? []
  const prioridad = m.alert_level==='critico' ? 'Alta' : m.alert_level==='vencido' ? 'Media' : 'Baja'
  const ciclo = m.ciclo_promedio_dias
  const frecuencia_texto = ciclo ? `Cada ${ciclo} días` : 'Sin datos'
  // Calcular días restantes para próxima compra
  let dias_para_compra: number | null = null
  if (m.siguiente_compra_estimada) {
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    const sig = new Date(m.siguiente_compra_estimada + 'T12:00:00')
    dias_para_compra = Math.round((sig.getTime() - hoy.getTime()) / 86400000)
  }
  // Default tipo si no viene de DB (retrocompatibilidad)
  const tipo: TipoMision = (m as MisionEnriquecida).tipo ?? 'vencido'
  return {
    ...m, tipo, ...cli,
    tipo_cliente,
    volumen_caida_pct,
    cross_sell,
    pedido_sugerido,
    snooze_until: m.snooze_until ?? null,
    completado_canal: m.completado_canal ?? null,
    resultado_litros: m.resultado_litros ?? null,
    intentos_contacto: m.intentos_contacto ?? null,
    volumen_promedio: m.volumen_promedio ?? null,
    litros_ultima_compra: m.litros_ultima_compra ?? null,
    prioridad_calculada: m.prioridad_calculada ?? null,
    ultima_venta_fecha: vta?.fecha??null, ultima_venta_monto: vta?.monto??0,
    prioridad, frecuencia_texto, dias_para_compra,
  }
}

export default async function MisionesPage() {
  const supabase = await createClient()
  const appUser  = await getServerUser()

  const semana     = getMondayOfWeek(new Date())
  const semanaNext = getMondayOfWeek(new Date(Date.now() + 7 * 86400000))
  const semana4ago = getMondayOfWeek(new Date(Date.now() - 28 * 86400000))

  // misiones.vendedor / client_scores.vendedor_actual guardan nombres REALES.
  // Equipo consolidado en un vendedor → todos ven la cartera del equipo.
  const vendedoresScope: string[] = [...VENDEDORES_DB]
  const p_vendedor = null

  // Queries en paralelo
  const [
    { data: misionesRaw },
    { data: historialRaw },
    { data: proximaRaw },
    { data: clientesRaw },
    ventasRaw,
    { data: tiposRaw },
    { data: inactivosRaw },
    volBajaRaw,
    crossRaw,
    pedidoSugRaw,
  ] = await Promise.all([
    // Misiones de esta semana (select '*' = tolerante a columnas nuevas)
    supabase.from('misiones')
      .select('*')
      .eq('semana', semana)
      .in('vendedor', vendedoresScope)
      .order('score', { ascending: false }),

    // Historial: últimas 4 semanas (excluye esta semana)
    supabase.from('misiones')
      .select('*')
      .in('vendedor', vendedoresScope)
      .gte('semana', semana4ago)
      .lt('semana', semana)
      .order('semana', { ascending: false }),

    // Preview próxima semana: alertas activas
    supabase.rpc('get_pending_call_alerts', { p_vendedor, p_nivel_minimo: 'proximo' }),

    // Datos de clientes (id para perfil, ruta, localidad, teléfono)
    supabase.from('clientes')
      .select('id, nombre_fantasia, ruta_despacho, localidad, localidad_entrega, telefono')
      .in('vendedor', vendedoresScope.length ? vendedoresScope : ['__none__']),

    // Último pedido por cliente — cacheado por scope (TTL 10 min)
    getUltimaVentasCached(vendedoresScope),

    // Tipo de cliente desde client_scores (para segmentación activo/inactivo/temporal/nuevo)
    supabase.from('client_scores')
      .select('nombre_fantasia, tipo_cliente')
      .in('vendedor_actual', vendedoresScope.length ? vendedoresScope : ['__none__']),

    // Clientes marcados como inactivos manualmente → ocultar de misiones
    supabase.from('clientes_estado')
      .select('nombre_fantasia')
      .eq('estado', 'inactivo'),

    // Análisis caros cacheados (compartidos, TTL 10 min) → no recalculan en cada navegación
    getVolumenBajaCached(p_vendedor),
    getCrossSellCached(p_vendedor),
    getPedidoSugeridoCached(p_vendedor),
  ])

  // Mapas de lookup
  const clienteMap = new Map<string, { ruta_despacho: string|null; localidad: string|null; telefono: string|null; cliente_id: number|null }>()
  for (const c of clientesRaw ?? [])
    if (c.nombre_fantasia)
      clienteMap.set(c.nombre_fantasia, { ruta_despacho: c.ruta_despacho??null, localidad: c.localidad_entrega||c.localidad||null, telefono: c.telefono??null, cliente_id: c.id ?? null })

  const ventaMap = new Map<string, { fecha: string; monto: number }>()
  for (const v of ventasRaw ?? [])
    if (v.nombre_fantasia && !ventaMap.has(v.nombre_fantasia))
      ventaMap.set(v.nombre_fantasia, { fecha: v.fecha_pedido, monto: v.total_sin_impuesto ?? 0 })

  // Mapa tipo_cliente: nombre → tipo
  const tipoClienteMap = new Map<string, 'activo' | 'inactivo' | 'temporal' | 'nuevo'>()
  for (const t of (tiposRaw ?? []))
    if (t.nombre_fantasia && t.tipo_cliente)
      tipoClienteMap.set(t.nombre_fantasia, t.tipo_cliente as 'activo' | 'inactivo' | 'temporal' | 'nuevo')

  // Set de clientes inactivos manuales → se ocultan de misiones al instante
  const inactivosManuales = new Set<string>((inactivosRaw ?? []).map(c => c.nombre_fantasia))

  // Mapa de caída de volumen: nombre → % de caída
  const volBajaMap = new Map<string, number>()
  for (const v of ((volBajaRaw ?? []) as { nombre_fantasia: string; caida_pct: number }[]))
    volBajaMap.set(v.nombre_fantasia, v.caida_pct)

  // Mapa de cross-sell: nombre → mejor sugerencia (primera = mayor pct, ya viene ordenado)
  const crossSellMap = new Map<string, { categoria: string; pct: number }>()
  for (const c of ((crossRaw ?? []) as { nombre_fantasia: string; categoria_sugerida: string; peers_pct: number }[]))
    if (!crossSellMap.has(c.nombre_fantasia))
      crossSellMap.set(c.nombre_fantasia, { categoria: c.categoria_sugerida, pct: c.peers_pct })

  // Mapa de pedido sugerido: nombre → top productos habituales (ya viene ordenado por rank)
  const pedidoSugMap = new Map<string, { producto: string; envase: string | null; litros: number }[]>()
  for (const p of ((pedidoSugRaw ?? []) as { nombre_fantasia: string; producto: string; envase: string | null; litros_tipico: number }[])) {
    if (!pedidoSugMap.has(p.nombre_fantasia)) pedidoSugMap.set(p.nombre_fantasia, [])
    pedidoSugMap.get(p.nombre_fantasia)!.push({ producto: p.producto, envase: p.envase, litros: p.litros_tipico })
  }

  // Enriquecer misiones actuales (oculta pospuestas con snooze vigente + inactivos manuales)
  const hoyStr = new Date().toISOString().split('T')[0]
  const misiones: MisionEnriquecida[] = (misionesRaw ?? [])
    .map(m => enriquecerMision(m as Parameters<typeof enriquecerMision>[0], clienteMap, ventaMap, tipoClienteMap, volBajaMap, crossSellMap, pedidoSugMap))
    .filter(m => !inactivosManuales.has(m.nombre_fantasia))
    .filter(m => (m.dias_sin_compra ?? 0) <= 90) // solo activos (≤3 meses sin comprar)
    .filter(m => !(m.estado === 'pospuesto' && m.snooze_until && m.snooze_until > hoyStr))
    .sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1
      // Priorización inteligente: prioridad_calculada (urgencia+volumen+valor), fallback score
      const pa = a.prioridad_calculada ?? a.score ?? 0
      const pb = b.prioridad_calculada ?? b.score ?? 0
      return pb - pa
    })

  // Historial agrupado por semana
  const historialMap = new Map<string, MisionEnriquecida[]>()
  for (const m of historialRaw ?? []) {
    const me = enriquecerMision(m as Parameters<typeof enriquecerMision>[0], clienteMap, ventaMap, tipoClienteMap, volBajaMap, crossSellMap, pedidoSugMap)
    if (!historialMap.has(m.semana)) historialMap.set(m.semana, [])
    historialMap.get(m.semana)!.push(me)
  }
  const historial: HistorialSemana[] = Array.from(historialMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([s, ms]) => ({ semana: s, total: ms.length, completadas: ms.filter(m=>m.estado==='contactado_pedido'||m.estado==='auto_completado').length, misiones: ms }))

  // Preview próxima semana (alertas no guardadas aún) — solo clientes activos (≤90 días)
  const proxima: ProximaPreview[] = ((proximaRaw ?? []) as ProximaPreview[])
    .filter(p => (p.dias_sin_compra ?? 0) <= 90)

  // Consejos del día
  const pendientesAlta = misiones.filter(m => m.prioridad==='Alta' && m.estado==='pendiente')
  const consejos: string[] = []
  if (pendientesAlta.length > 0)
    consejos.push(`Tienes ${pendientesAlta.length} cliente${pendientesAlta.length>1?'s':''} de alta prioridad sin contactar. ¡Contáctalos hoy!`)
  const completadasHoy = misiones.filter(m => m.estado==='contactado_pedido' && m.completado_at &&
    new Date(m.completado_at).toDateString() === new Date().toDateString())
  if (completadasHoy.length > 0)
    consejos.push(`¡Vas por buen camino! Contactaste ${completadasHoy.length} cliente${completadasHoy.length>1?'s':''} hoy 👍`)
  const primerPendiente = misiones.find(m => m.estado==='pendiente')
  if (primerPendiente)
    consejos.push(`Próximo contacto sugerido: ${primerPendiente.nombre_fantasia} (${primerPendiente.frecuencia_texto})`)
  if (misiones.length === 0)
    consejos.push('No hay misiones generadas para esta semana. El admin puede generarlas con el botón Actualizar.')

  return (
    <MisionesClient
      misiones={misiones}
      proxima={proxima}
      historial={historial}
      semana={semana}
      semanaNext={semanaNext}
      consejos={consejos}
      isAdmin={appUser?.isAdmin ?? false}
      vendedorActual={appUser?.nombre ?? null}
      vendedorNombre={appUser?.nombre ?? null}
    />
  )
}
