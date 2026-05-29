import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES } from '@/lib/types'
import MisionesClient from './MisionesClient'

export const dynamic = 'force-dynamic'

function getMondayOfWeek(d: Date): string {
  const x = new Date(d); const day = x.getDay()
  x.setDate(x.getDate() - day + (day === 0 ? -6 : 1))
  return x.toISOString().split('T')[0]
}

export interface MisionEnriquecida {
  id: string
  vendedor: string
  nombre_fantasia: string
  semana: string
  alert_level: string
  score: number
  segmento: string
  dias_sin_compra: number
  ciclo_promedio_dias: number | null
  siguiente_compra_estimada: string | null
  estado: 'pendiente' | 'completada'
  completado_at: string | null
  // Enriquecido
  ruta_despacho: string | null
  localidad: string | null
  telefono: string | null
  ultima_venta_fecha: string | null
  ultima_venta_monto: number
  prioridad: 'Alta' | 'Media' | 'Baja'
  frecuencia_texto: string
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
  m: Omit<MisionEnriquecida, 'ruta_despacho'|'localidad'|'telefono'|'ultima_venta_fecha'|'ultima_venta_monto'|'prioridad'|'frecuencia_texto'>,
  clienteMap: Map<string, { ruta_despacho: string|null; localidad: string|null; telefono: string|null }>,
  ventaMap: Map<string, { fecha: string; monto: number }>
): MisionEnriquecida {
  const cli = clienteMap.get(m.nombre_fantasia) ?? { ruta_despacho:null, localidad:null, telefono:null }
  const vta = ventaMap.get(m.nombre_fantasia)
  const prioridad = m.alert_level==='critico' ? 'Alta' : m.alert_level==='vencido' ? 'Media' : 'Baja'
  const ciclo = m.ciclo_promedio_dias
  const frecuencia_texto = ciclo ? `Cada ${ciclo} días` : 'Sin datos'
  return { ...m, ...cli, ultima_venta_fecha: vta?.fecha??null, ultima_venta_monto: vta?.monto??0, prioridad, frecuencia_texto }
}

export default async function MisionesPage() {
  const supabase = await createClient()
  const appUser  = await getServerUser()

  const semana     = getMondayOfWeek(new Date())
  const semanaNext = getMondayOfWeek(new Date(Date.now() + 7 * 86400000))
  const semana4ago = getMondayOfWeek(new Date(Date.now() - 28 * 86400000))

  const vendedoresScope = appUser?.isAdmin ? VENDEDORES : [appUser?.nombre ?? '__none__']
  const p_vendedor      = appUser?.isAdmin ? null : (appUser?.nombre ?? null)

  // Queries en paralelo
  const [
    { data: misionesRaw },
    { data: historialRaw },
    { data: proximaRaw },
    { data: clientesRaw },
    { data: ventasRaw },
  ] = await Promise.all([
    // Misiones de esta semana
    supabase.from('misiones')
      .select('id,vendedor,nombre_fantasia,semana,alert_level,score,segmento,dias_sin_compra,ciclo_promedio_dias,siguiente_compra_estimada,estado,completado_at')
      .eq('semana', semana)
      .in('vendedor', vendedoresScope),

    // Historial: últimas 4 semanas (excluye esta semana)
    supabase.from('misiones')
      .select('id,vendedor,nombre_fantasia,semana,alert_level,score,segmento,dias_sin_compra,ciclo_promedio_dias,siguiente_compra_estimada,estado,completado_at')
      .in('vendedor', vendedoresScope)
      .gte('semana', semana4ago)
      .lt('semana', semana)
      .order('semana', { ascending: false }),

    // Preview próxima semana: alertas activas
    supabase.rpc('get_pending_call_alerts', { p_vendedor, p_nivel_minimo: 'proximo' }),

    // Datos de clientes (ruta, localidad, teléfono)
    supabase.from('clientes')
      .select('nombre_fantasia, ruta_despacho, localidad, localidad_entrega, telefono')
      .in('vendedor', vendedoresScope.length ? vendedoresScope : ['__none__']),

    // Último pedido por cliente
    supabase.from('ventas')
      .select('nombre_fantasia, fecha_pedido, total_sin_impuesto')
      .in('vendedor_actual', vendedoresScope.length ? vendedoresScope : ['__none__'])
      .order('fecha_pedido', { ascending: false })
      .limit(2000),
  ])

  // Mapas de lookup
  const clienteMap = new Map<string, { ruta_despacho: string|null; localidad: string|null; telefono: string|null }>()
  for (const c of clientesRaw ?? [])
    if (c.nombre_fantasia)
      clienteMap.set(c.nombre_fantasia, { ruta_despacho: c.ruta_despacho??null, localidad: c.localidad_entrega||c.localidad||null, telefono: c.telefono??null })

  const ventaMap = new Map<string, { fecha: string; monto: number }>()
  for (const v of ventasRaw ?? [])
    if (v.nombre_fantasia && !ventaMap.has(v.nombre_fantasia))
      ventaMap.set(v.nombre_fantasia, { fecha: v.fecha_pedido, monto: v.total_sin_impuesto ?? 0 })

  // Enriquecer misiones actuales
  const misiones: MisionEnriquecida[] = (misionesRaw ?? [])
    .map(m => enriquecerMision(m as Parameters<typeof enriquecerMision>[0], clienteMap, ventaMap))
    .sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1
      const pOrd = { Alta:0, Media:1, Baja:2 }
      return (pOrd[a.prioridad]??3) - (pOrd[b.prioridad]??3)
    })

  // Historial agrupado por semana
  const historialMap = new Map<string, MisionEnriquecida[]>()
  for (const m of historialRaw ?? []) {
    const me = enriquecerMision(m as Parameters<typeof enriquecerMision>[0], clienteMap, ventaMap)
    if (!historialMap.has(m.semana)) historialMap.set(m.semana, [])
    historialMap.get(m.semana)!.push(me)
  }
  const historial: HistorialSemana[] = Array.from(historialMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([s, ms]) => ({ semana: s, total: ms.length, completadas: ms.filter(m=>m.estado==='completada').length, misiones: ms }))

  // Preview próxima semana (alertas no guardadas aún)
  const proxima: ProximaPreview[] = (proximaRaw ?? []) as ProximaPreview[]

  // Consejos del día
  const pendientesAlta = misiones.filter(m => m.prioridad==='Alta' && m.estado==='pendiente')
  const consejos: string[] = []
  if (pendientesAlta.length > 0)
    consejos.push(`Tienes ${pendientesAlta.length} cliente${pendientesAlta.length>1?'s':''} de alta prioridad sin contactar. ¡Contáctalos hoy!`)
  const completadasHoy = misiones.filter(m => m.estado==='completada' && m.completado_at &&
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
