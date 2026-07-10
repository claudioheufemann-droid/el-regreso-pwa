import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

// GET /api/terreno/jornada — la jornada abierta de hoy del vendedor logueado (o null)
export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: jornada, error } = await supabase
    .from('jornadas_terreno')
    .select('*')
    .eq('vendedor_id', user.id)
    .eq('estado', 'abierta')
    .order('iniciada_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(jornada)
}

// POST /api/terreno/jornada — abre la jornada del día con el km inicial + foto del odómetro
export async function POST(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json() as { km_inicio: number; foto_odometro_inicio: string }
  if (!body.km_inicio || !body.foto_odometro_inicio) {
    return NextResponse.json({ error: 'km_inicio y foto_odometro_inicio son obligatorios' }, { status: 400 })
  }

  const { data: yaAbierta } = await supabase
    .from('jornadas_terreno')
    .select('id')
    .eq('vendedor_id', user.id)
    .eq('estado', 'abierta')
    .maybeSingle()
  if (yaAbierta) return NextResponse.json({ error: 'Ya tienes una jornada abierta' }, { status: 400 })

  const { data: jornada, error } = await supabase
    .from('jornadas_terreno')
    .insert({
      vendedor_id: user.id,
      km_inicio: body.km_inicio,
      foto_odometro_inicio: body.foto_odometro_inicio,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(jornada, { status: 201 })
}
