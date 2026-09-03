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
  const [estadoRes, topRes, recuperadosRes] = await Promise.all([
    supabase.rpc('fn_barriles_estado'),
    supabase.rpc('fn_barriles_top_clientes', { p_limit: 10 }),
    supabase.rpc('fn_barriles_recuperados', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
  ])

  if (estadoRes.error) return NextResponse.json({ error: estadoRes.error.message }, { status: 500 })

  return NextResponse.json({
    periodo: { nombre: periodo.nombre, inicio: periodo.inicio, fin: periodo.fin },
    estado: estadoRes.data?.[0] ?? null,
    topClientes: topRes.data ?? [],
    recuperados: recuperadosRes.data?.[0] ?? null,
  })
}
