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

  const { data: profile } = await supabase.from('users').select('id, is_admin').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  // AUTORIZACIÓN, no sólo autenticación. La pantalla del viaje ya limitaba
  // "marcar entregado" al conductor que inició el viaje (ViajeDetailClient,
  // `puedeEditar`), pero eso es sólo la UI: este endpoint aceptaba el POST de
  // CUALQUIER usuario con sesión, sobre CUALQUIER parada de CUALQUIER viaje.
  // Una prueba de entrega (foto, guía, hora, cantidades) es un registro con
  // consecuencias — stock, facturación, cobranza — así que la regla se
  // aplica también acá, del lado del servidor.
  //
  // Quién puede registrar la entrega de una parada:
  //   · el conductor del viaje de flota vinculado al despacho,
  //   · el chofer asignado al despacho,
  //   · quien armó el despacho (logística, que a veces cierra por radio), o
  //   · un admin.
  // Se resuelve con consultas planas (parada → despacho → viaje) en vez de
  // un embed anidado de PostgREST: son índices por PK, y no dependen de que
  // el nombre de la relación se infiera bien.
  const { data: parada } = await supabase
    .from('despacho_paradas')
    .select('id, despacho_id')
    .eq('id', paradaId)
    .maybeSingle()

  if (!parada) return NextResponse.json({ error: 'Parada no encontrada' }, { status: 404 })

  const { data: despacho } = await supabase
    .from('despachos')
    .select('chofer_id, creado_por, viaje_flota_id')
    .eq('id', parada.despacho_id)
    .maybeSingle()

  let conductorId: string | null = null
  if (despacho?.viaje_flota_id) {
    const { data: viaje } = await supabase
      .from('viajes_flota')
      .select('conductor_id')
      .eq('id', despacho.viaje_flota_id)
      .maybeSingle()
    conductorId = viaje?.conductor_id ?? null
  }

  const autorizado = !!profile.is_admin
    || (!!conductorId && conductorId === profile.id)
    || (!!despacho?.chofer_id && despacho.chofer_id === profile.id)
    || (!!despacho?.creado_por && despacho.creado_por === profile.id)

  if (!autorizado) {
    return NextResponse.json(
      { error: 'Solo quien va en el viaje puede registrar esta entrega.' },
      { status: 403 },
    )
  }

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
    const { data: paradaCliente } = await supabase
      .from('despacho_paradas')
      .select('cliente:clientes(nombre_fantasia), cliente_terreno:clientes_terreno(nombre_fantasia)')
      .eq('id', paradaId)
      .single()
    const nombreCliente = (paradaCliente?.cliente as { nombre_fantasia?: string } | null)?.nombre_fantasia
      ?? (paradaCliente?.cliente_terreno as { nombre_fantasia?: string } | null)?.nombre_fantasia
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
