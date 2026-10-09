import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { construirLotes, type BarraSheets } from '@/lib/produccion/ganttSheets'

export const dynamic = 'force-dynamic'

/**
 * POST /api/produccion/gantt-sheets — recibe la Gantt de Google Sheets y la
 * refleja en plan_produccion. La llama el Apps Script de la planilla
 * (scripts/gantt-sheets/sincronizar.gs) con Bearer UPLOAD_SECRET_GANTT.
 * Reglas en lib/produccion/ganttSheets.ts.
 *
 * Body: { barras: BarraSheets[], dryRun?: boolean }
 */
export async function POST(req: Request) {
  const secret = process.env.UPLOAD_SECRET_GANTT
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 })
  const admin = createSupabaseClient(url, key)

  const body = await req.json().catch(() => null) as { barras?: BarraSheets[]; dryRun?: boolean } | null
  if (!body || !Array.isArray(body.barras)) return NextResponse.json({ error: 'Falta barras[]' }, { status: 400 })

  const log = async (ok: boolean, extra: Record<string, unknown>) => {
    try { await admin.from('erp_sync_log').insert({ fuente: 'gantt_sheets', origen: 'automatico', ok, ...extra }) } catch { /* informativo */ }
  }

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  const [fermRes, cursoRes, sheetsRes, prioRes] = await Promise.all([
    admin.from('fermentadores').select('nombre, capacidad_litros, categoria').eq('activo', true),
    admin.from('plan_produccion').select('fermentador, fecha_inicio_real, fecha_planificada, dias_ocupacion, categoria').eq('estado', 'en_curso'),
    admin.from('plan_produccion').select('id, clave_externa, estado').like('clave_externa', 'sheets:%'),
    admin.from('plan_produccion').select('prioridad').order('prioridad', { ascending: false }).limit(1).maybeSingle(),
  ])
  const err = fermRes.error ?? cursoRes.error ?? sheetsRes.error
  if (err) { await log(false, { mensaje: err.message }); return NextResponse.json({ error: err.message }, { status: 500 }) }

  const enCurso = (cursoRes.data ?? []).map(l => ({
    fermentador: l.fermentador as string | null,
    fecha_inicio: String(l.fecha_inicio_real ?? l.fecha_planificada).slice(0, 10),
    dias: Number(l.dias_ocupacion) || (l.categoria === 'kombucha' ? 12 : 24),
  }))

  const { lotes, omitidas } = construirLotes(body.barras, fermRes.data ?? [], enCurso, hoy)

  const existentes = new Map((sheetsRes.data ?? []).map(r => [r.clave_externa as string, r]))
  const clavesNuevas = new Set(lotes.map(l => l.clave_externa))
  // Sólo se borra lo que sigue 'planificado': si Producción ya lo inició o lo
  // cerró en la app, es dato real y se queda aunque la barra ya no esté.
  const aBorrar = (sheetsRes.data ?? []).filter(r => r.estado === 'planificado' && !clavesNuevas.has(r.clave_externa as string))
  const aInsertar = lotes.filter(l => !existentes.has(l.clave_externa))
  const aActualizar = lotes.filter(l => existentes.get(l.clave_externa)?.estado === 'planificado')

  const resumen = {
    barras: body.barras.length, lotes: lotes.length,
    insertados: aInsertar.length, actualizados: aActualizar.length, eliminados: aBorrar.length,
    omitidas,
  }
  if (body.dryRun) return NextResponse.json({ dryRun: true, ...resumen, lotesDetalle: lotes })

  let prioridad = (prioRes.data?.prioridad ?? 0) + 1
  const fila = (l: typeof lotes[number]) => ({
    producto: l.producto, categoria: l.categoria, litros_planificados: l.litros_planificados,
    fecha_planificada: l.fecha_planificada, dias_ocupacion: l.dias_ocupacion, fermentador: l.fermentador,
    observaciones: `Gantt Sheets: ${l.texto}`,
  })

  try {
    if (aBorrar.length) {
      const { error } = await admin.from('plan_produccion').delete().in('id', aBorrar.map(r => r.id))
      if (error) throw error
    }
    if (aInsertar.length) {
      const { error } = await admin.from('plan_produccion').insert(
        aInsertar.sort((a, b) => a.fecha_planificada.localeCompare(b.fecha_planificada)).map(l => ({
          ...fila(l), clave_externa: l.clave_externa, estado: 'planificado', origen: 'manual', prioridad: prioridad++,
        })))
      if (error) throw error
    }
    for (const l of aActualizar) {
      const { error } = await admin.from('plan_produccion').update({ ...fila(l), actualizado_at: new Date().toISOString() })
        .eq('clave_externa', l.clave_externa).eq('estado', 'planificado')
      if (error) throw error
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
    await log(false, { mensaje })
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }

  await log(true, {
    total: lotes.length, insertados: aInsertar.length, actualizados: aActualizar.length, eliminados: aBorrar.length,
    mensaje: omitidas.length ? `${omitidas.length} barra(s) omitida(s)` : null,
  })
  return NextResponse.json({ ok: true, ...resumen })
}
