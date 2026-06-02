import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// GET /api/leads?en_zona=1&ciudad=&producto=&q=&conCoords=
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const enZona    = searchParams.get('en_zona')
  const ciudad    = searchParams.get('ciudad')
  const producto  = searchParams.get('producto')
  const q         = searchParams.get('q')
  const conCoords = searchParams.get('conCoords') === '1'
  const limit     = Math.min(Number(searchParams.get('limit') ?? 500), 6000)

  let query = supabase
    .from('cold_leads')
    .select('id, nombre, region, ciudad, tipo_buscado, producto_sugerido, categoria, categoria_mapeada, direccion, telefono, sitio_web, rating, lat, lng, litros_potencial, score_lead, en_zona, estado, vendedor_asignado, nota')
    .order('score_lead', { ascending: false })
    .limit(limit)

  if (enZona === '1') query = query.eq('en_zona', true)
  if (ciudad) query = query.eq('ciudad', ciudad)
  if (producto && producto !== 'all') query = query.eq('producto_sugerido', producto)
  if (q) query = query.ilike('nombre', `%${q}%`)
  if (conCoords) query = query.not('lat', 'is', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data ?? [] })
}

// PATCH /api/leads  { id, estado?, vendedor_asignado?, nota? }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, estado, vendedor_asignado, nota } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (estado !== undefined) {
    if (!['nuevo', 'contactado', 'convertido', 'descartado'].includes(estado))
      return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
    patch.estado = estado
  }
  if (vendedor_asignado !== undefined) patch.vendedor_asignado = vendedor_asignado
  if (nota !== undefined) patch.nota = nota

  const { error } = await supabase.from('cold_leads').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
