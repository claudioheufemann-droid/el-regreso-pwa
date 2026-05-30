import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

/** Devuelve el lunes de la semana actual */
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

type AlertRow = {
  vendedor_actual: string; nombre_fantasia: string; alert_level: string
  score: number; segmento: string; dias_sin_compra: number
  ciclo_promedio_dias: number; siguiente_compra_estimada: string | null
  revenue_total?: number; litros_totales?: number
}

type TipoMision = 'esta_semana' | 'proxima_semana' | 'vencido'

function clasificarTipo(siguienteCompra: string | null, hoy: Date): TipoMision {
  if (!siguienteCompra) return 'vencido'
  const d7  = addDays(hoy, 7)
  const d14 = addDays(hoy, 14)
  const hoyStr = hoy.toISOString().split('T')[0]
  if (siguienteCompra < hoyStr) return 'vencido'
  if (siguienteCompra <= d7)    return 'esta_semana'
  if (siguienteCompra <= d14)   return 'proxima_semana'
  return 'vencido' // más de 14 días: no aplica para misiones
}

// ── POST /api/misiones?action=generar|actualizar_estado|deshacer ─────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') ?? 'actualizar_estado'

  // ── GENERAR: solo admin ────────────────────────────────────────────────────
  if (action === 'generar') {
    if (!user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const hoy    = new Date()
    const semana = getMondayOfWeek(hoy)

    // Traer TODAS las alertas desde el RPC (incluye proximo, vencido, critico)
    const { data: alerts, error: alertErr } = await supabase.rpc('get_pending_call_alerts', {
      p_vendedor: null,
      p_nivel_minimo: 'proximo',
    })
    if (alertErr) return NextResponse.json({ error: alertErr.message }, { status: 500 })
    if (!alerts?.length) return NextResponse.json({ ok: true, insertadas: 0 })

    const hoyStr = hoy.toISOString().split('T')[0]
    const d14    = addDays(hoy, 14)

    // Filtrar: solo clientes que compran dentro de 14 días O ya están vencidos
    // Excluir clientes saludables (compra estimada > 14 días = aún tienen tiempo)
    const alertsFiltrados = (alerts as AlertRow[]).filter(a => {
      if (!a.ciclo_promedio_dias) return false // sin ciclo, sin misión
      const sig = a.siguiente_compra_estimada
      // Incluir si: vencido/critico (ya pasaron) O próxima compra en ≤14 días
      if (!sig) return a.alert_level !== 'proximo' // sin fecha → solo si ya vencido
      return sig <= d14 // incluye pasados + próximos 14 días
    })

    if (!alertsFiltrados.length) {
      return NextResponse.json({ ok: true, insertadas: 0, semana })
    }

    // Verificar qué misiones ya existen para esta semana (respetar estados de vendedor)
    const { data: existentes } = await supabase
      .from('misiones')
      .select('vendedor, nombre_fantasia, tipo, estado')
      .eq('semana', semana)

    const existMap = new Map(
      (existentes ?? []).map(e => [`${e.vendedor}|${e.nombre_fantasia}|${e.tipo}`, e.estado])
    )

    const rows = alertsFiltrados.map(a => {
      const tipo = clasificarTipo(a.siguiente_compra_estimada, hoy)
      const key  = `${a.vendedor_actual}|${a.nombre_fantasia}|${tipo}`
      // Si ya existe con estado distinto de pendiente, respetar el estado del vendedor
      const estadoExistente = existMap.get(key)
      const estadoFinal = estadoExistente &&
        ['contactado_pedido', 'contactado_sin_pedido', 'sin_respuesta'].includes(estadoExistente)
        ? estadoExistente
        : 'pendiente'

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
      }
    })

    // Upsert: inserta nuevas, actualiza datos pero respeta estado del vendedor
    const { data: inserted, error: insErr } = await supabase
      .from('misiones')
      .upsert(rows, {
        onConflict: 'vendedor,nombre_fantasia,semana,tipo',
        ignoreDuplicates: false, // actualizar datos frescos pero el estado se calcula arriba
      })
      .select('id')

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    // Devolver todas las misiones de la semana
    const { data: todasMisiones } = await supabase
      .from('misiones')
      .select('*')
      .eq('semana', semana)
      .order('score', { ascending: false })

    return NextResponse.json({
      ok: true,
      insertadas: inserted?.length ?? 0,
      semana,
      misiones: todasMisiones ?? [],
    })
  }

  // ── ACTUALIZAR ESTADO ──────────────────────────────────────────────────────
  if (action === 'actualizar_estado') {
    const body = await req.json()
    const { mision_id, estado, nota } = body as {
      mision_id: string
      estado: 'pendiente' | 'contactado_pedido' | 'contactado_sin_pedido' | 'sin_respuesta'
      nota?: string
    }

    const estadosValidos = ['pendiente', 'contactado_pedido', 'contactado_sin_pedido', 'sin_respuesta']
    if (!estadosValidos.includes(estado))
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })

    const { data: mision } = await supabase
      .from('misiones')
      .select('vendedor, estado')
      .eq('id', mision_id)
      .single()

    if (!mision) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 })
    if (!user.isAdmin && mision.vendedor !== user.nombre)
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const update: Record<string, unknown> = { estado }
    if (estado === 'contactado_pedido') {
      update.completado_at = new Date().toISOString()
    } else if (estado === 'pendiente') {
      update.completado_at = null
    }
    if (nota !== undefined) update.nota = nota

    const { error } = await supabase
      .from('misiones')
      .update(update)
      .eq('id', mision_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── DESHACER (legado, mantener compatibilidad) ─────────────────────────────
  if (action === 'deshacer' || action === 'completar') {
    const { mision_id, completar } = await req.json()

    const { data: mision } = await supabase
      .from('misiones')
      .select('vendedor')
      .eq('id', mision_id)
      .single()

    if (!mision) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 })
    if (!user.isAdmin && mision.vendedor !== user.nombre)
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const nuevoEstado = (action === 'completar' || completar) ? 'contactado_pedido' : 'pendiente'
    const { error } = await supabase
      .from('misiones')
      .update({
        estado: nuevoEstado,
        completado_at: nuevoEstado === 'contactado_pedido' ? new Date().toISOString() : null,
      })
      .eq('id', mision_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
