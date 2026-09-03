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
  const [estadoRes, nuevosRes, consolidacionRes, reactivadosRes, perdidosRes, crossRes, oportunidadRes] = await Promise.all([
    // mv_clientes_estado: cache de fn_clientes_estado() — client_metrics_calc es cara (~4-5s en
    // vivo), no se puede llamar en cada carga de página. Ver fn_refrescar_clientes_estado().
    supabase.from('mv_clientes_estado').select('nombre_fantasia, dias_sin_compra, ciclo_promedio_dias, ultima_compra, total_pedidos, estado, territorio'),
    supabase.rpc('fn_clientes_nuevos_lista', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_clientes_consolidacion', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_clientes_reactivados', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_clientes_perdidos_lista', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_clientes_cross_selling'),
    supabase.rpc('fn_clientes_oportunidad_kombucha'),
  ])

  if (estadoRes.error) return NextResponse.json({ error: estadoRes.error.message }, { status: 500 })

  const estados = estadoRes.data ?? []
  // estadoResumen: foto ACUMULADA de hoy (todo cliente alguna vez perdido cuenta), distinto de
  // perdidosRes que es "cruzó el umbral recién durante este período" — no mezclar ambos.
  const estadoResumen = { activo: 0, riesgo: 0, inactivo: 0, perdido: 0 } as Record<string, number>
  for (const e of estados) estadoResumen[e.estado] = (estadoResumen[e.estado] ?? 0) + 1

  return NextResponse.json({
    periodo: { nombre: periodo.nombre, inicio: periodo.inicio, fin: periodo.fin },
    estadoResumen,
    estados,
    nuevos: nuevosRes.data ?? [],
    consolidacion: consolidacionRes.data?.[0] ?? null,
    reactivados: reactivadosRes.data ?? [],
    perdidosPeriodo: perdidosRes.data ?? [],
    crossSelling: crossRes.data ?? [],
    oportunidadKombucha: (oportunidadRes.data ?? []).slice(0, 15),
  })
}
