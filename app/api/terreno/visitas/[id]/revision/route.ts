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
 * POST /api/terreno/visitas/[id]/revision — el vendedor NUNCA llega hasta
 * acá (no hay UI que lo llame para su propia visita): solo un admin aprueba
 * o rechaza una llegada que el motor automático dejó en
 * 'pendiente_revision'. Cada decisión queda en terreno_auditoria con el
 * estado anterior completo — nunca se sobreescribe una evidencia sin dejar
 * rastro de qué había antes.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('users').select('is_admin').eq('id', user.id).maybeSingle()
  if (!perfil?.is_admin) return NextResponse.json({ error: 'Solo un administrador puede revisar evidencias' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { accion?: string; motivo?: string }
  if (body.accion !== 'aprobar' && body.accion !== 'rechazar') {
    return NextResponse.json({ error: "accion debe ser 'aprobar' o 'rechazar'" }, { status: 400 })
  }
  if (body.accion === 'rechazar' && !body.motivo) {
    return NextResponse.json({ error: 'Rechazar exige un motivo' }, { status: 400 })
  }

  const { data: previa } = await supabase
    .from('visitas_terreno')
    .select('estado_presencia, motivo_revision, revisado_por, revisado_at')
    .eq('id', id)
    .maybeSingle()
  if (!previa) return NextResponse.json({ error: 'Visita no encontrada' }, { status: 404 })

  const nuevoEstado = body.accion === 'aprobar' ? 'aprobada_manual' : 'rechazada'
  const ahora = new Date().toISOString()

  const { data: actualizada, error } = await supabase
    .from('visitas_terreno')
    .update({
      estado_presencia: nuevoEstado,
      motivo_revision: body.motivo ?? previa.motivo_revision,
      revisado_por: user.id,
      revisado_at: ahora,
    })
    .eq('id', id)
    .select('id, estado_presencia, motivo_revision, revisado_por, revisado_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('terreno_auditoria').insert({
    entidad: 'visita',
    entidad_id: id,
    accion: body.accion === 'aprobar' ? 'aprobada' : 'rechazada',
    admin_id: user.id,
    motivo: body.motivo ?? null,
    datos_previos: previa,
    datos_nuevos: actualizada,
  })

  return NextResponse.json(actualizada)
}
