import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const nombre = req.nextUrl.searchParams.get('nombre_fantasia')
  if (!nombre) return NextResponse.json({ error: 'nombre_fantasia requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas')
    .select('producto, envase, litros, total_sin_impuesto, fecha_pedido')
    .eq('nombre_fantasia', nombre)
    .order('fecha_pedido', { ascending: false })
    .limit(60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ items: [], fecha: null, total: 0 })

  const fechaMax = data[0].fecha_pedido?.slice(0, 10) ?? ''
  const items = data
    .filter((r) => (r.fecha_pedido ?? '').slice(0, 10) === fechaMax)
    .map((r) => ({
      producto: r.producto ?? '',
      envase: r.envase ?? null,
      litros: r.litros ?? 0,
      total: r.total_sin_impuesto ?? 0,
    }))

  return NextResponse.json({ fecha: fechaMax, items, total: items.reduce((s, r) => s + r.total, 0) })
}
