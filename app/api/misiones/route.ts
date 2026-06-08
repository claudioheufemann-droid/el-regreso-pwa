import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { calcularVolumen, calcularPrioridad } from '@/lib/misiones'
import { sendPushToAllAdmins } from '@/lib/push'

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

    // ── Priorización por volumen: agregamos litros por cliente ──
    const nombresVol = [...new Set(alertsFiltrados.map(a => a.nombre_fantasia))]
    const volMap = await calcularVolumen(supabase, nombresVol)
    const maxVol = Math.max(1, ...[...volMap.values()].map(v => v.volumen_promedio))

    const rows = alertsFiltrados.map(a => {
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

    // Upsert tolerante: si faltan columnas nuevas (pre-migración), reintenta sin ellas
    const upsertOpts = { onConflict: 'vendedor,nombre_fantasia,semana,tipo', ignoreDuplicates: false }
    let inserted: { id: string }[] | null = null
    {
      const r = await supabase.from('misiones').upsert(rows, upsertOpts).select('id')
      if (r.error) {
        const rowsBase = rows.map(({ volumen_promedio, litros_ultima_compra, prioridad_calculada, ...base }) => base)
        const r2 = await supabase.from('misiones').upsert(rowsBase, upsertOpts).select('id')
        if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 })
        inserted = r2.data
      } else {
        inserted = r.data
      }
    }

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
    const { mision_id, estado, nota, dias, litros } = body as {
      mision_id: string
      estado: 'pendiente' | 'contactado_pedido' | 'contactado_sin_pedido' | 'sin_respuesta' | 'pospuesto'
      nota?: string
      dias?: number   // para 'pospuesto': días de snooze + push del ciclo
      litros?: number // para 'contactado_pedido': litros declarados
    }

    const estadosValidos = ['pendiente', 'contactado_pedido', 'contactado_sin_pedido', 'sin_respuesta', 'pospuesto']
    if (!estadosValidos.includes(estado))
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })

    const { data: mision } = await supabase
      .from('misiones')
      .select('*')  // tolerante a columnas que aún no existan (pre-migración)
      .eq('id', mision_id)
      .single()

    if (!mision) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 })
    if (!user.isAdmin && mision.vendedor !== user.nombre)
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const update: Record<string, unknown> = { estado }

    if (estado === 'contactado_pedido') {
      update.completado_at = new Date().toISOString()
      update.completado_canal = 'vendedor'
      if (typeof litros === 'number') update.resultado_litros = litros
    } else if (estado === 'pendiente') {
      update.completado_at = null
      update.snooze_until = null
    } else if (estado === 'sin_respuesta') {
      update.intentos_contacto = (mision.intentos_contacto ?? 0) + 1
    } else if (estado === 'pospuesto') {
      // ── Posponer X días: snooze + feedback al algoritmo ──
      const d = Math.max(1, Math.min(60, Math.round(dias ?? 5)))
      const hoy = new Date()
      const snooze = new Date(hoy); snooze.setDate(snooze.getDate() + d)
      update.snooze_until = snooze.toISOString().split('T')[0]
      update.completado_at = null

      // Retroalimentar la predicción: empujar la próxima compra +d días
      const baseFecha = mision.siguiente_compra_estimada
        ? new Date(mision.siguiente_compra_estimada + 'T12:00:00')
        : hoy
      const nuevaSig = new Date(Math.max(baseFecha.getTime(), hoy.getTime()))
      nuevaSig.setDate(nuevaSig.getDate() + d)
      const nuevaSigStr = nuevaSig.toISOString().split('T')[0]
      update.siguiente_compra_estimada = nuevaSigStr

      // Propagar el feedback a client_scores (fuente del motor predictivo)
      if (mision.nombre_fantasia) {
        await supabase
          .from('client_scores')
          .update({ siguiente_compra_estimada: nuevaSigStr })
          .eq('nombre', mision.nombre_fantasia)
      }
    }

    if (nota !== undefined) update.nota = nota

    let { error } = await supabase
      .from('misiones')
      .update(update)
      .eq('id', mision_id)

    // Fallback si la migración aún no corrió: reintentar con columnas base.
    // Los estados originales siguen funcionando; 'pospuesto' requiere la migración.
    if (error) {
      const originales = ['pendiente', 'contactado_pedido', 'contactado_sin_pedido', 'sin_respuesta']
      if (originales.includes(estado)) {
        const base: Record<string, unknown> = { estado }
        if ('completado_at' in update) base.completado_at = update.completado_at
        if (nota !== undefined) base.nota = nota
        const retry = await supabase.from('misiones').update(base).eq('id', mision_id)
        error = retry.error
      }
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 🔔 Notificar a admins cuando se cierra una misión con pedido
    if (estado === 'contactado_pedido' && mision.nombre_fantasia) {
      sendPushToAllAdmins({
        title: `🎯 Pedido confirmado — ${mision.nombre_fantasia}`,
        body: typeof litros === 'number'
          ? `${litros}L registrados por ${user?.nombre?.split(' ')[0] ?? 'vendedor'}`
          : `Pedido anotado por ${user?.nombre?.split(' ')[0] ?? 'vendedor'}`,
        url: '/ventas/misiones',
        tag: 'mision_pedido',
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, snooze_until: update.snooze_until ?? null })
  }

  // ── RECONCILIAR: misiones dinámicas (auto-completar por compra) ────────────
  if (action === 'reconciliar') {
    const semana = getMondayOfWeek(new Date())

    let q = supabase
      .from('misiones')
      .select('id, vendedor, nombre_fantasia, estado')
      .eq('semana', semana)
      .in('estado', ['pendiente', 'sin_respuesta', 'contactado_sin_pedido', 'pospuesto'])
    if (!user.isAdmin) q = q.eq('vendedor', user.nombre ?? '__none__')

    const { data: activas } = await q
    if (!activas?.length) return NextResponse.json({ ok: true, changed: 0 })

    const nombres = [...new Set(activas.map(a => a.nombre_fantasia))]

    // Ventas de esos clientes desde el lunes (ventana acotada → pocas filas)
    const { data: ventas } = await supabase
      .from('ventas')
      .select('nombre_fantasia, litros, fecha_pedido')
      .gte('fecha_pedido', semana)
      .in('nombre_fantasia', nombres)

    const litrosMap = new Map<string, number>()
    for (const v of ventas ?? []) {
      if (!v.nombre_fantasia) continue
      litrosMap.set(v.nombre_fantasia, (litrosMap.get(v.nombre_fantasia) ?? 0) + (v.litros ?? 0))
    }

    let changed = 0
    for (const m of activas) {
      const litros = litrosMap.get(m.nombre_fantasia)
      if (litros && litros > 0) {
        const { error: upErr } = await supabase
          .from('misiones')
          .update({
            estado: 'auto_completado',
            completado_at: new Date().toISOString(),
            completado_canal: 'auto',
            resultado_litros: Math.round(litros * 10) / 10,
          })
          .eq('id', m.id)
        if (!upErr) changed++
      }
    }

    return NextResponse.json({ ok: true, changed })
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
