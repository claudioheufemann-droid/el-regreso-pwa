import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'

export const dynamic = 'force-dynamic'

/** Mismo umbral que ventas/hoyData.ts: fecha_entrega recién existe desde el
 *  25-may-2026 (verificado contra la base). Un período que termina antes de
 *  esa fecha se calcula por fecha_pedido, igual que "Año". */
const ENTREGA_CONFIABLE_DESDE = '2026-05-24'
const porEntregaPeriodo = (fechaFin: string) => fechaFin >= ENTREGA_CONFIABLE_DESDE

/**
 * GET /api/ventas/periodos-resumen
 *
 * Litros y monto de TODOS los períodos 24→23 (no sólo los recientes que ya
 * trae la carga inicial de la página) — se pide sólo al abrir el selector,
 * para no cargar cada período con su ranking/mix/envases completos en cada
 * visita a /ventas (eso sí se calcula, pero recién cuando se elige uno).
 */
export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const scopeRegion = user.isAdmin ? null : (user.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const p_provincias = provincias.length ? provincias : null

  const supabase = await createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const { data: periodos, error } = await supabase
    .from('periodos')
    .select('id, fecha_inicio, fecha_fin')
    .lte('fecha_inicio', hoy)
    .order('fecha_inicio', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (periodos ?? []) as { id: number; fecha_inicio: string; fecha_fin: string }[]

  const kpis = await Promise.all(filas.map(p => supabase.rpc('ventas_dashboard_kpis', {
    p_ini: p.fecha_inicio, p_fin: p.fecha_fin, p_provincias, p_por_entrega: porEntregaPeriodo(p.fecha_fin),
  })))

  return NextResponse.json(filas.map((p, i) => {
    const row = (kpis[i].data as Record<string, unknown>[] | null)?.[0]
    return {
      id: p.id,
      litros: Number(row?.litros ?? 0),
      revenue: Number(row?.revenue ?? 0),
    }
  }))
}
