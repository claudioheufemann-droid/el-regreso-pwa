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

interface EntregarInput {
  guia_url?: string
  foto_entrega_url?: string
  cantidad_entregada: number
  estado: 'entregado' | 'rechazado' | 'devuelto'
  motivo_rechazo?: string
  lat?: number
  lng?: number
}

// POST /api/logistica/paradas/[id]/entregar — Proof of Delivery.
// Guía + foto son obligatorias cuando estado='entregado'; motivo_rechazo obligatorio en caso contrario.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: paradaId } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const body = await req.json() as EntregarInput

  if (body.estado === 'entregado' && (!body.guia_url || !body.foto_entrega_url)) {
    return NextResponse.json({ error: 'La guía de despacho y la foto de entrega son obligatorias para marcar como entregado' }, { status: 400 })
  }
  if (body.estado !== 'entregado' && !body.motivo_rechazo?.trim()) {
    return NextResponse.json({ error: 'motivo_rechazo es obligatorio cuando el pedido no se entrega' }, { status: 400 })
  }

  const { data: entrega, error } = await supabase
    .from('entregas')
    .insert({
      parada_id: paradaId,
      guia_url: body.guia_url ?? '',
      foto_entrega_url: body.foto_entrega_url ?? '',
      cantidad_entregada: body.cantidad_entregada,
      estado: body.estado,
      motivo_rechazo: body.motivo_rechazo ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      registrado_por: profile.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('despacho_paradas').update({ estado: body.estado }).eq('id', paradaId)

  return NextResponse.json(entrega, { status: 201 })
}
