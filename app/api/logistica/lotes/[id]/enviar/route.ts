import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToUsers } from '@/lib/push'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

// POST /api/logistica/lotes/[id]/enviar — Producción marca el lote como despachado a bodega
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: lote, error } = await supabase
    .from('lotes_produccion')
    .update({ estado: 'enviado', enviado_at: new Date().toISOString(), enviado_por: profile.id })
    .eq('id', id)
    .eq('estado', 'declarado')
    .select('*')
    .single()

  if (error || !lote) {
    return NextResponse.json({ error: error?.message ?? 'Lote no encontrado o ya fue enviado' }, { status: 400 })
  }

  // Avisar a todo Logística que viene un lote en camino
  const { data: destinatarios } = await supabase.from('users').select('id').eq('macro_area', 'logistica')
  if (destinatarios?.length) {
    sendPushToUsers(destinatarios.map(d => d.id), {
      title: '🚚 Lote en camino desde Producción',
      body: `${lote.codigo_lote} · ETA ${new Date(lote.eta_entrega).toLocaleString('es-CL')}`,
      url: '/logistica/recepcion',
      tag: `lote-enviado-${lote.id}`,
    }).catch(() => {})
  }

  return NextResponse.json(lote)
}
