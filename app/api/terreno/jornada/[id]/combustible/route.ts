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

// POST /api/terreno/jornada/[id]/combustible — registra una carga de combustible en la jornada
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jornadaId } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json() as { monto: number; litros?: number; foto_boleta_url?: string }
  if (!body.monto) return NextResponse.json({ error: 'monto es obligatorio' }, { status: 400 })

  const { data: jornada } = await supabase
    .from('jornadas_terreno')
    .select('id')
    .eq('id', jornadaId)
    .eq('vendedor_id', user.id)
    .maybeSingle()
  if (!jornada) return NextResponse.json({ error: 'Jornada no encontrada' }, { status: 404 })

  const { data: carga, error } = await supabase
    .from('cargas_combustible_terreno')
    .insert({
      jornada_id: jornadaId,
      vendedor_id: user.id,
      monto: body.monto,
      litros: body.litros ?? null,
      foto_boleta_url: body.foto_boleta_url ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(carga, { status: 201 })
}
