import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import { periodoActual, periodoPorAncla, comparacionAnioAnterior } from '@/lib/control-comercial/periodos'

export const dynamic = 'force-dynamic'

interface Insight { texto: string; tipo: 'oportunidad' | 'alerta'; drillHref: string }
interface FilaEquipo {
  territorio: string; venta_clp: number; clientes_activos: number; clientes_nuevos: number; clientes_perdidos: number
}

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const anio = Number(searchParams.get('anio')) || undefined
  const mes = Number(searchParams.get('mes')) || undefined
  const periodo = anio && mes ? periodoPorAncla(anio, mes) : periodoActual()
  const comparacion = comparacionAnioAnterior(periodo)

  const supabase = await createClient()
  const [actualRes, comparadoRes, cobranzaRes, barrilesTopRes, oportunidadRes, periodoRowRes] = await Promise.all([
    supabase.rpc('fn_equipo_resumen', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_equipo_resumen', { p_inicio: comparacion.comparado.inicio, p_fin: comparacion.comparado.fin }),
    supabase.rpc('fn_cobranza_kpis', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_barriles_top_clientes', { p_limit: 5 }),
    supabase.rpc('fn_clientes_oportunidad_kombucha'),
    supabase.from('periodos').select('id').eq('fecha_inicio', periodo.inicio).eq('fecha_fin', periodo.fin).maybeSingle(),
  ])

  const insights: Insight[] = []
  const actual = (actualRes.data ?? []) as FilaEquipo[]
  const comparadoPorTerritorio = new Map(((comparadoRes.data ?? []) as FilaEquipo[]).map(f => [f.territorio, f]))

  let metas: { scope_value: string | null; valor_meta: number }[] = []
  if (periodoRowRes.data?.id) {
    const { data } = await supabase.from('metas_comerciales').select('scope_value, valor_meta')
      .eq('periodo_id', periodoRowRes.data.id).eq('scope_type', 'territorio').eq('kpi_type', 'ventas_clp')
    metas = data ?? []
  }
  const metaPorTerritorio = new Map(metas.map(m => [m.scope_value, m.valor_meta]))

  for (const f of actual) {
    if (f.territorio === 'Sin territorio asignado') continue
    const comp = comparadoPorTerritorio.get(f.territorio)
    if (comp && comp.venta_clp > 0) {
      const crecimiento = ((f.venta_clp - comp.venta_clp) / comp.venta_clp) * 100
      if (crecimiento > 20) {
        insights.push({ texto: `${f.territorio} está creciendo ${crecimiento.toFixed(0)}% vs mismo período año anterior.`, tipo: 'oportunidad', drillHref: '/control-comercial/equipo' })
      } else if (crecimiento < -15) {
        insights.push({ texto: `${f.territorio} cae ${Math.abs(crecimiento).toFixed(0)}% vs mismo período año anterior.`, tipo: 'alerta', drillHref: '/control-comercial/equipo' })
      }
    }
    const meta = metaPorTerritorio.get(f.territorio)
    if (meta) {
      const cumplimiento = (f.venta_clp / meta) * 100
      if (cumplimiento < 85) {
        insights.push({ texto: `${f.territorio} proyecta cierre ${(100 - cumplimiento).toFixed(0)}% bajo meta.`, tipo: 'alerta', drillHref: '/control-comercial/metas' })
      }
    }
    if (f.clientes_perdidos > f.clientes_nuevos && f.clientes_perdidos >= 3) {
      insights.push({ texto: `${f.territorio}: ${f.clientes_perdidos} clientes perdidos vs ${f.clientes_nuevos} nuevos este período.`, tipo: 'alerta', drillHref: '/control-comercial/clientes' })
    }
  }

  const cobranza = cobranzaRes.data?.[0]
  if (cobranza && cobranza.concentracion_top5_pct > 40 && cobranza.deuda_vencida_actual > 0) {
    insights.push({
      texto: `El ${cobranza.concentracion_top5_pct.toFixed(0)}% de la deuda vencida está concentrada en los 5 clientes con más deuda.`,
      tipo: 'alerta', drillHref: '/control-comercial/cobranza',
    })
  }

  const topBarriles = (barrilesTopRes.data ?? []) as { nombre_fantasia: string; criticos: number }[]
  const sumaCriticosTop = topBarriles.reduce((a, b) => a + b.criticos, 0)
  if (sumaCriticosTop >= 5) {
    insights.push({
      texto: `${sumaCriticosTop} barriles críticos están concentrados en los ${topBarriles.filter(b => b.criticos > 0).length} clientes con más barriles.`,
      tipo: 'alerta', drillHref: '/control-comercial/barriles',
    })
  }

  const oportunidad = (oportunidadRes.data ?? []) as unknown[]
  if (oportunidad.length >= 5) {
    insights.push({
      texto: `${oportunidad.length} clientes activos de cerveza todavía no compran Kombucha — oportunidad de cross-selling.`,
      tipo: 'oportunidad', drillHref: '/control-comercial/clientes',
    })
  }

  return NextResponse.json({ periodo: { nombre: periodo.nombre }, insights })
}
