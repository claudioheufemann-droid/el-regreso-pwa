import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { semanaLunes, semanaSiguienteLunes, fechaLimitePresentacion } from '@/lib/terreno/planificacion/semana'
import { hoySantiagoISO } from '@/lib/terreno/tiempoChile'

// GET /api/terreno/planificacion?vendedor_id=&semana_lunes= — mis planes, o (con permiso
// de gestión) los de cualquier vendedor. Sin filtros: mis planes recientes.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vendedorId = searchParams.get('vendedor_id')
  const semanaLunesParam = searchParams.get('semana_lunes')

  let query = supabase
    .from('planes_semanales_terreno')
    .select('*')
    .order('semana_lunes', { ascending: false })
    .limit(52)

  if (vendedorId) query = query.eq('vendedor_id', vendedorId)
  if (semanaLunesParam) query = query.eq('semana_lunes', semanaLunesParam)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/terreno/planificacion — crea el borrador de la semana siguiente (o la
// indicada). Un plan por vendedor/semana (constraint UNIQUE en DB).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { semana_lunes?: string }
  const semana = body.semana_lunes ?? semanaSiguienteLunes(hoySantiagoISO())

  if (semana !== semanaLunes(semana)) {
    return NextResponse.json({ error: 'semana_lunes debe ser un lunes' }, { status: 400 })
  }

  const { data: existente } = await supabase
    .from('planes_semanales_terreno')
    .select('id')
    .eq('vendedor_id', user.id)
    .eq('semana_lunes', semana)
    .maybeSingle()
  if (existente) return NextResponse.json(existente, { status: 200 })

  const { data: plan, error } = await supabase
    .from('planes_semanales_terreno')
    .insert({
      vendedor_id: user.id,
      created_by: user.id,
      semana_lunes: semana,
      fecha_limite_presentacion: fechaLimitePresentacion(semana),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(plan, { status: 201 })
}
