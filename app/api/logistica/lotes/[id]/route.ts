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

// GET /api/logistica/lotes/[id] — Detalle de un envío con sus items
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: lote, error } = await supabase
    .from('lotes_produccion')
    .select('*, items:lotes_produccion_items(*)')
    .eq('id', id)
    .single()

  if (error || !lote) return NextResponse.json({ error: error?.message ?? 'Envío no encontrado' }, { status: 404 })
  return NextResponse.json(lote)
}

// DELETE /api/logistica/lotes/[id] — puede borrar un admin, o quien declaró el envío.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id, is_admin').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: lote } = await supabase.from('lotes_produccion').select('declarado_por').eq('id', id).single()
  if (!lote) return NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 })

  const puedeBorrar = profile.is_admin || lote.declarado_por === profile.id
  if (!puedeBorrar) {
    return NextResponse.json({ error: 'Solo un administrador o quien declaró el envío puede eliminarlo' }, { status: 403 })
  }

  // alertas_inventario no tiene borrado en cascada — sin esto, un envío con
  // descuadre (el caso más visible en Historial) fallaría por la llave foránea.
  await supabase.from('alertas_inventario').delete().eq('lote_id', id)

  const { error, count } = await supabase
    .from('lotes_produccion')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'No se pudo eliminar el envío (permisos de base de datos)' }, { status: 403 })

  return NextResponse.json({ ok: true })
}
