import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToAllAdmins } from '@/lib/push'

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
  barriles?: number
  cajas_cerveza?: number
  cajas_kombucha?: number
  barriles_vacios_devueltos?: number
  estado: 'entregado' | 'rechazado' | 'devuelto'
  motivo_rechazo?: string
  lat?: number
  lng?: number
}

// POST /api/logistica/paradas/[id]/entregar — Proof of Delivery.
// Guía + foto son obligatorias cuando estado='entregado'; motivo_rechazo y una foto de
// evidencia son obligatorios cuando hay incidencia (rechazado/devuelto) — se avisa a los
// admins de inmediato para que puedan actuar sin esperar al reporte del final del día.
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
  if (body.estado !== 'entregado') {
    if (!body.motivo_rechazo?.trim()) {
      return NextResponse.json({ error: 'El motivo es obligatorio para reportar una incidencia' }, { status: 400 })
    }
    if (!body.foto_entrega_url) {
      return NextResponse.json({ error: 'La foto de evidencia es obligatoria para reportar una incidencia' }, { status: 400 })
    }
  }

  const { data: entrega, error } = await supabase
    .from('entregas')
    .insert({
      parada_id: paradaId,
      guia_url: body.guia_url ?? '',
      foto_entrega_url: body.foto_entrega_url ?? '',
      cantidad_entregada: body.cantidad_entregada,
      barriles: body.barriles ?? 0,
      cajas_cerveza: body.cajas_cerveza ?? 0,
      cajas_kombucha: body.cajas_kombucha ?? 0,
      barriles_vacios_devueltos: body.barriles_vacios_devueltos ?? 0,
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

  if (body.estado !== 'entregado') {
    const { data: parada } = await supabase
      .from('despacho_paradas')
      .select('cliente:clientes(nombre_fantasia), cliente_terreno:clientes_terreno(nombre_fantasia)')
      .eq('id', paradaId)
      .single()
    const nombreCliente = (parada?.cliente as { nombre_fantasia?: string } | null)?.nombre_fantasia
      ?? (parada?.cliente_terreno as { nombre_fantasia?: string } | null)?.nombre_fantasia
      ?? 'Cliente'
    sendPushToAllAdmins({
      title: '🔴 Incidencia de entrega',
      body: `${nombreCliente}: ${body.motivo_rechazo}`,
      url: '/flota/admin/entregas',
      tag: `incidencia-${entrega.id}`,
      requireInteraction: true,
    }).catch(() => {})
  }

  return NextResponse.json(entrega, { status: 201 })
}
