import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { provinciasDeRegion } from '@/lib/regiones'
import { calcularUnRango, rangoRelativo, porEntregaPeriodo, iso, addDias } from '@/app/ventas/hoyData'
import type { RangoKey } from '@/app/ventas/hoyTypes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ventas/rango — calcula UN rango de /ventas bajo demanda.
 *
 * Antes toda la pantalla (Hoy/7D/30D/Año + los 4 períodos del selector +
 * el rango a mano) se calculaba de una en la carga inicial: 7 familias de
 * RPC × hasta 14 rangos, un burst de 80+ llamadas concurrentes que medido
 * contra el servidor real tardaba 4-4.7 s por sí solo (ver el comentario al
 * inicio de app/ventas/hoyData.ts). La carga inicial ahora sólo calcula el
 * período activo; esta ruta resuelve cada rango adicional recién cuando el
 * usuario lo pide (cambia de pestaña, o abre un período distinto).
 *
 * Reutiliza `calcularUnRango` — la misma función, mismas 7 familias de RPC,
 * mismas reglas de negocio que ya usaba la carga inicial — no hay lógica
 * nueva, sólo se pide de a un rango en vez de todos juntos.
 *
 * Parámetros:
 *   ?tipo=relativo&key=hoy|7d|30d|anio
 *   ?tipo=periodo&id=<periodo_id>
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const scopeRegion = user.isAdmin ? null : (user.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const p_prov = provincias.length ? provincias : null

  const supabase = await createClient()
  const { searchParams } = req.nextUrl
  const tipo = searchParams.get('tipo')

  try {
    if (tipo === 'relativo') {
      const key = searchParams.get('key') as Exclude<RangoKey, 'periodo' | 'custom'> | null
      if (!key || !['hoy', '7d', '30d', 'anio'].includes(key)) {
        return NextResponse.json({ error: 'key inválida' }, { status: 400 })
      }
      const r = rangoRelativo(new Date(), key)
      const datos = await calcularUnRango(
        supabase, p_prov,
        { desde: r.desde, hasta: r.hasta, porEntrega: r.porEntrega },
        { desde: r.prevDesde, hasta: r.prevHasta, porEntrega: r.porEntrega },
        r.etiqueta,
      )
      return NextResponse.json({ key, datos })
    }

    if (tipo === 'periodo') {
      const id = Number(searchParams.get('id'))
      if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

      const hoy = iso(new Date())
      // Se piden todos los períodos hasta hoy (mismo criterio que hoyData.ts)
      // para poder ubicar cuál es "el anterior" del elegido, sin importar si
      // el elegido cae dentro o fuera de la ventana visible (PERIODOS_VISIBLES).
      const { data: periodosRaw, error } = await supabase
        .from('periodos')
        .select('id, nombre, fecha_inicio, fecha_fin, activo')
        .lte('fecha_inicio', hoy)
        .order('fecha_inicio', { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const lista = (periodosRaw ?? []) as { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean }[]
      const idx = lista.findIndex(p => p.id === id)
      if (idx < 0) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 })
      const p = lista[idx]
      const anterior = lista[idx + 1] ?? null

      // Mismo truncado "mismo día acumulado" que la carga inicial aplica al
      // período activo — si el período pedido resulta ser el activo (caso
      // límite: normalmente ya viene precalculado y esta ruta ni se llama),
      // se compara igual que allá para no mostrar una caída falsa.
      let previo: { desde: string; hasta: string; porEntrega: boolean } | null = null
      let etiqueta = 'sin período anterior'
      if (anterior) {
        if (p.activo) {
          const inicioAct = new Date(p.fecha_inicio + 'T12:00:00')
          const diasTranscurridos = Math.max(1, Math.round((new Date().getTime() - inicioAct.getTime()) / 86400000) + 1)
          const inicioAnt = new Date(anterior.fecha_inicio + 'T12:00:00')
          const finAntCompleto = new Date(anterior.fecha_fin + 'T12:00:00')
          const finTruncado = addDias(inicioAnt, diasTranscurridos - 1)
          previo = {
            desde: iso(inicioAnt),
            hasta: iso(finTruncado > finAntCompleto ? finAntCompleto : finTruncado),
            porEntrega: true,
          }
          etiqueta = `vs mismos días de ${anterior.nombre}`
        } else {
          previo = { desde: anterior.fecha_inicio, hasta: anterior.fecha_fin, porEntrega: porEntregaPeriodo(anterior.fecha_fin) }
          etiqueta = `vs ${anterior.nombre}`
        }
      }

      const { data: metaRow } = await supabase
        .from('metas')
        .select('meta_litros')
        .eq('tipo', 'mensual')
        .eq('periodo_id', id)

      const metaLitros = (metaRow ?? []).reduce((s, m) => s + Number((m as { meta_litros: number }).meta_litros ?? 0), 0)

      const datos = await calcularUnRango(
        supabase, p_prov,
        { desde: p.fecha_inicio, hasta: p.fecha_fin, porEntrega: porEntregaPeriodo(p.fecha_fin) },
        previo,
        etiqueta,
      )
      return NextResponse.json({ id, metaLitros, datos })
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error desconocido' }, { status: 500 })
  }
}
