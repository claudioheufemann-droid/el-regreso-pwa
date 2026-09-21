import { NextResponse } from 'next/server'
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

/**
 * POST /api/terreno/visitas/[id]/sesion — abre la ventana de 5 minutos para
 * capturar la llegada (GPS + foto). El sello de tiempo lo pone el SERVIDOR,
 * no el teléfono: por eso esto es un viaje de ida y vuelta aparte en vez de
 * un campo que el cliente podría simplemente declarar en el POST de
 * /llegada. Que el vendedor haya podido llegar hasta acá ya prueba que
 * tenía conexión en ese instante — eso es lo que hace la sesión "online".
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: visita } = await supabase
    .from('visitas_terreno')
    .select('id')
    .eq('id', id)
    .eq('vendedor_id', user.id)
    .maybeSingle()
  if (!visita) return NextResponse.json({ error: 'Visita no encontrada' }, { status: 404 })

  const sesionCapturaId = crypto.randomUUID()
  const iniciadaAt = new Date().toISOString()

  const { error } = await supabase
    .from('visitas_terreno')
    .update({ sesion_captura_id: sesionCapturaId, sesion_captura_iniciada_at: iniciadaAt })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sesionCapturaId, iniciadaAt })
}
