import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import { periodoActual, periodoPorAncla } from '@/lib/control-comercial/periodos'
import type { FilaVentaAgregada } from '@/lib/control-comercial/tipos'

export const dynamic = 'force-dynamic'

interface FilaSerie {
  mes: number
  inicio: string
  fin: string
  litros_total: number
  litros_cerveza: number
  litros_kombucha: number
  monto_total: number
  monto_cerveza: number
  monto_kombucha: number
}

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const anio = Number(searchParams.get('anio')) || periodoActual().anchorYear
  const anioComparado = Number(searchParams.get('anioComparado')) || anio - 1

  const supabase = await createClient()

  const [serieActualRes, serieComparadaRes, territorioRes, territorioCompRes] = await Promise.all([
    supabase.rpc('fn_serie_periodos', { p_anio: anio }),
    supabase.rpc('fn_serie_periodos', { p_anio: anioComparado }),
    supabase.rpc('fn_ventas_agregadas', {
      p_inicio: periodoPorAncla(anio, 1).inicio,
      p_fin: periodoPorAncla(anio, 12).fin,
    }),
    supabase.rpc('fn_ventas_agregadas', {
      p_inicio: periodoPorAncla(anioComparado, 1).inicio,
      p_fin: periodoPorAncla(anioComparado, 12).fin,
    }),
  ])

  if (serieActualRes.error) return NextResponse.json({ error: serieActualRes.error.message }, { status: 500 })
  if (serieComparadaRes.error) return NextResponse.json({ error: serieComparadaRes.error.message }, { status: 500 })

  const nombrar = (f: FilaSerie, y: number) => ({ ...f, nombre: periodoPorAncla(y, f.mes).nombre })

  const serieActual = ((serieActualRes.data ?? []) as FilaSerie[]).map(f => nombrar(f, anio))
  const serieComparada = ((serieComparadaRes.data ?? []) as FilaSerie[]).map(f => nombrar(f, anioComparado))

  return NextResponse.json({
    anio, anioComparado,
    mesActual: anio === periodoActual().anchorYear ? periodoActual().anchorMonth : 12,
    serieActual, serieComparada,
    ventasPorTerritorio: (territorioRes.data ?? []) as FilaVentaAgregada[],
    ventasPorTerritorioComparado: (territorioCompRes.data ?? []) as FilaVentaAgregada[],
  })
}
