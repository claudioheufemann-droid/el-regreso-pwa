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

// ── POST /api/misiones?action=generar|completar|deshacer ─────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') ?? 'completar'

  // ── GENERAR: solo admin ────────────────────────────────────────────────────
  if (action === 'generar') {
    if (!user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const semana = getMondayOfWeek(new Date())

    // Traer todas las alertas pendientes
    const { data: alerts, error: alertErr } = await supabase.rpc('get_pending_call_alerts', {
      p_vendedor: null,
      p_nivel_minimo: 'proximo',
    })
    if (alertErr) return NextResponse.json({ error: alertErr.message }, { status: 500 })
    if (!alerts?.length) return NextResponse.json({ ok: true, insertadas: 0 })

    const rows = (alerts as {
      vendedor_actual: string
      nombre_fantasia: string
      alert_level: string
      score: number
      segmento: string
      dias_sin_compra: number
      ciclo_promedio_dias: number
      siguiente_compra_estimada: string | null
    }[]).map(a => ({
      vendedor:                  a.vendedor_actual,
      nombre_fantasia:           a.nombre_fantasia,
      semana,
      alert_level:               a.alert_level,
      score:                     Math.round(a.score ?? 0),
      segmento:                  a.segmento,
      dias_sin_compra:           a.dias_sin_compra,
      ciclo_promedio_dias:       a.ciclo_promedio_dias,
      siguiente_compra_estimada: a.siguiente_compra_estimada ?? null,
      estado:                    'pendiente',
    }))

    // upsert: si ya existe la misión para esa semana, actualiza los datos
    // pero respeta el estado (no resetea completadas)
    const { data: inserted, error: insErr } = await supabase
      .from('misiones')
      .upsert(rows, {
        onConflict: 'vendedor,nombre_fantasia,semana',
        ignoreDuplicates: true,   // no sobreescribir estado de completadas
      })
      .select('id')

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    // Devolver TODAS las misiones de la semana (incluyendo las ya existentes)
    const { data: todasMisiones } = await supabase
      .from('misiones')
      .select('id,vendedor,nombre_fantasia,semana,alert_level,score,segmento,dias_sin_compra,ciclo_promedio_dias,siguiente_compra_estimada,estado,completado_at')
      .eq('semana', semana)
      .order('estado', { ascending: true })
      .order('alert_level', { ascending: true })

    return NextResponse.json({ ok: true, insertadas: inserted?.length ?? 0, semana, misiones: todasMisiones ?? [] })
  }

  // ── COMPLETAR ──────────────────────────────────────────────────────────────
  if (action === 'completar') {
    const { mision_id } = await req.json()

    // Verificar que la misión pertenece al vendedor (o es admin)
    const { data: mision } = await supabase
      .from('misiones')
      .select('vendedor, estado')
      .eq('id', mision_id)
      .single()

    if (!mision) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 })
    if (!user.isAdmin && mision.vendedor !== user.nombre)
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { error } = await supabase
      .from('misiones')
      .update({ estado: 'completada', completado_at: new Date().toISOString() })
      .eq('id', mision_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── DESHACER ───────────────────────────────────────────────────────────────
  if (action === 'deshacer') {
    const { mision_id } = await req.json()

    const { data: mision } = await supabase
      .from('misiones')
      .select('vendedor')
      .eq('id', mision_id)
      .single()

    if (!mision) return NextResponse.json({ error: 'Misión no encontrada' }, { status: 404 })
    if (!user.isAdmin && mision.vendedor !== user.nombre)
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const { error } = await supabase
      .from('misiones')
      .update({ estado: 'pendiente', completado_at: null })
      .eq('id', mision_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
