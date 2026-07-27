/**
 * POST /api/misiones/cron
 * Endpoint protegido por secret — llamado por GitHub Actions cada lunes 8am.
 * Genera automáticamente las misiones de la semana para todos los vendedores.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularVolumen, calcularPrioridad } from '@/lib/misiones'
import { getComprasDesde, cerrarMisionesConCompra } from '@/lib/misionesCompras'

function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): string {
  const x = new Date(d); x.setDate(x.getDate() + n)
  return x.toISOString().split('T')[0]
}

type TipoMision = 'esta_semana' | 'proxima_semana' | 'vencido'

function clasificarTipo(siguienteCompra: string | null, hoy: Date): TipoMision {
  if (!siguienteCompra) return 'vencido'
  const hoyStr = hoy.toISOString().split('T')[0]
  const d7  = addDays(hoy, 7)
  const d14 = addDays(hoy, 14)
  if (siguienteCompra < hoyStr) return 'vencido'
  if (siguienteCompra <= d7)    return 'esta_semana'
  if (siguienteCompra <= d14)   return 'proxima_semana'
  return 'vencido'
}

export async function POST(req: Request) {
  // Verificar secret de autorización
  const authHeader = req.headers.get('Authorization')
  const expectedSecret = process.env.MISIONES_CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    console.error('[misiones/cron] Unauthorized attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const hoy      = new Date()
  const semana   = getMondayOfWeek(hoy)
  const d14      = addDays(hoy, 14)

  console.log(`[misiones/cron] Generando misiones para semana ${semana}`)

  // Traer todas las alertas del sistema
  const { data: alerts, error: alertErr } = await supabase.rpc('get_pending_call_alerts', {
    p_vendedor: null,
    p_nivel_minimo: 'proximo',
  })

  if (alertErr) {
    console.error('[misiones/cron] Error en RPC:', alertErr)
    return NextResponse.json({ error: alertErr.message }, { status: 500 })
  }

  if (!alerts?.length) {
    return NextResponse.json({ ok: true, insertadas: 0, semana, mensaje: 'Sin alertas activas' })
  }

  type AlertRow = {
    vendedor_actual: string; nombre_fantasia: string; alert_level: string
    score: number; segmento: string; dias_sin_compra: number
    ciclo_promedio_dias: number; siguiente_compra_estimada: string | null
  }

  // Solo CLIENTES ACTIVOS: compraron en los últimos 90 días (3 meses).
  const DIAS_ACTIVO = 90

  // Filtrar: solo clientes que compran en ≤14 días O ya están vencidos
  const alertsFiltrados = (alerts as AlertRow[]).filter(a => {
    if (!a.ciclo_promedio_dias) return false
    if ((a.dias_sin_compra ?? 0) > DIAS_ACTIVO) return false // inactivo (>3 meses)
    const sig = a.siguiente_compra_estimada
    if (!sig) return a.alert_level !== 'proximo'
    return sig <= d14
  })

  if (!alertsFiltrados.length) {
    return NextResponse.json({ ok: true, insertadas: 0, semana, mensaje: 'Sin clientes en ventana 14 días' })
  }

  // ── Excluir clientes que YA compraron esta semana ────────────────────────
  // Mismo criterio que app/api/misiones/route.ts (acción 'generar') — ver
  // lib/misionesCompras.ts para el porqué.
  const compras = await getComprasDesde(supabase, semana)
  const alertsSinCompra = alertsFiltrados.filter(a => !((compras.get(a.nombre_fantasia) ?? 0) > 0))

  if (!alertsSinCompra.length) {
    return NextResponse.json({ ok: true, insertadas: 0, semana, mensaje: 'Todos los clientes ya compraron esta semana' })
  }

  // Verificar estados ya existentes para respetar acciones del vendedor
  const { data: existentes } = await supabase
    .from('misiones')
    .select('vendedor, nombre_fantasia, tipo, estado')
    .eq('semana', semana)

  const existMap = new Map(
    (existentes ?? []).map(e => [`${e.vendedor}|${e.nombre_fantasia}|${e.tipo}`, e.estado])
  )

  // Priorización por volumen
  const nombresVol = [...new Set(alertsSinCompra.map(a => a.nombre_fantasia))]
  const volMap = await calcularVolumen(supabase, nombresVol)
  const maxVol = Math.max(1, ...[...volMap.values()].map(v => v.volumen_promedio))

  const rows = alertsSinCompra.map(a => {
    const tipo = clasificarTipo(a.siguiente_compra_estimada, hoy)
    const key  = `${a.vendedor_actual}|${a.nombre_fantasia}|${tipo}`
    const estadoExistente = existMap.get(key)
    const estadoFinal = estadoExistente &&
      ['contactado_pedido', 'contactado_sin_pedido', 'sin_respuesta', 'pospuesto', 'auto_completado'].includes(estadoExistente)
      ? estadoExistente
      : 'pendiente'

    const vol = volMap.get(a.nombre_fantasia)
    const volProm = vol?.volumen_promedio ?? 0

    return {
      vendedor:                  a.vendedor_actual,
      nombre_fantasia:           a.nombre_fantasia,
      semana,
      tipo,
      alert_level:               a.alert_level,
      score:                     Math.round(a.score ?? 0),
      segmento:                  a.segmento,
      dias_sin_compra:           a.dias_sin_compra,
      ciclo_promedio_dias:       a.ciclo_promedio_dias,
      siguiente_compra_estimada: a.siguiente_compra_estimada ?? null,
      estado:                    estadoFinal,
      volumen_promedio:          volProm,
      litros_ultima_compra:      vol?.litros_ultima_compra ?? null,
      prioridad_calculada:       calcularPrioridad(a, volProm, maxVol),
    }
  })

  const upsertOpts = { onConflict: 'vendedor,nombre_fantasia,semana,tipo' }
  let inserted: { id: string }[] | null = null
  {
    const r = await supabase.from('misiones').upsert(rows, upsertOpts).select('id')
    if (r.error) {
      const rowsBase = rows.map(({ volumen_promedio, litros_ultima_compra, prioridad_calculada, ...base }) => base)
      const r2 = await supabase.from('misiones').upsert(rowsBase, upsertOpts).select('id')
      if (r2.error) {
        console.error('[misiones/cron] Error al insertar:', r2.error)
        return NextResponse.json({ error: r2.error.message }, { status: 500 })
      }
      inserted = r2.data
    } else {
      inserted = r.data
    }
  }

  // Cerrar (no borrar) las misiones activas de clientes que ya compraron.
  await cerrarMisionesConCompra(supabase, semana, compras)

  // Limpiar misiones de la semana cuyos clientes ya no califican (inactivos >90d).
  const vivos = new Set(alertsSinCompra.map(a => `${a.vendedor_actual}|${a.nombre_fantasia}`))
  const { data: pendientes } = await supabase
    .from('misiones')
    .select('id, vendedor, nombre_fantasia')
    .eq('semana', semana)
    .eq('estado', 'pendiente')
  const idsBorrar = (pendientes ?? [])
    .filter(m => !vivos.has(`${m.vendedor}|${m.nombre_fantasia}`))
    .map(m => m.id)
  if (idsBorrar.length) {
    await supabase.from('misiones').delete().in('id', idsBorrar)
  }

  const resumen = {
    ok: true,
    semana,
    total_alertas: alerts.length,
    filtradas: alertsSinCompra.length,
    ya_compraron: alertsFiltrados.length - alertsSinCompra.length,
    insertadas: inserted?.length ?? 0,
    por_tipo: {
      esta_semana:    rows.filter(r => r.tipo === 'esta_semana').length,
      proxima_semana: rows.filter(r => r.tipo === 'proxima_semana').length,
      vencido:        rows.filter(r => r.tipo === 'vencido').length,
    },
  }

  console.log('[misiones/cron] Completado:', resumen)
  return NextResponse.json(resumen)
}
