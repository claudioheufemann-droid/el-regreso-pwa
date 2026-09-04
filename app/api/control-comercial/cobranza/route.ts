import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import { periodoActual, periodoPorAncla } from '@/lib/control-comercial/periodos'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const anio = Number(searchParams.get('anio')) || undefined
  const mes = Number(searchParams.get('mes')) || undefined
  const periodo = anio && mes ? periodoPorAncla(anio, mes) : periodoActual()

  const supabase = await createClient()
  const [agingRes, kpisRes, dsoRes, serieRes] = await Promise.all([
    supabase.rpc('fn_cobranza_aging'),
    supabase.rpc('fn_cobranza_kpis', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_resumen_ejecutivo', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_cobranza_serie', { p_dias: 180 }),
  ])

  if (agingRes.error) return NextResponse.json({ error: agingRes.error.message }, { status: 500 })
  if (kpisRes.error) return NextResponse.json({ error: kpisRes.error.message }, { status: 500 })

  const kpis = kpisRes.data?.[0] ?? null
  const ventaPeriodo = dsoRes.data?.[0]?.monto_total ?? 0
  const dias = Math.round((new Date(periodo.fin).getTime() - new Date(periodo.inicio).getTime()) / 86_400_000) + 1
  // DSO = (deuda vencida actual / venta neta del período) × días del período — proxy estándar
  // cuando no hay ventas a crédito separadas de venta total.
  const dso = kpis && ventaPeriodo > 0 ? (kpis.deuda_vencida_actual / ventaPeriodo) * dias : null

  return NextResponse.json({
    periodo: { nombre: periodo.nombre, inicio: periodo.inicio, fin: periodo.fin },
    aging: agingRes.data ?? [],
    kpis,
    dso,
    serie: serieRes.data ?? [],
  })
}
