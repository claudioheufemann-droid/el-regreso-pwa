import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { sendPushToAll } from '@/lib/push'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

interface ParadaInput {
  cliente_id?: number
  cliente_terreno_id?: string
  visita_terreno_id?: string
  eta_comprometida: string
  cantidad_pedida: number
  ventana_desde?: string
  ventana_hasta?: string
}

// GET /api/logistica/despachos?fecha=2026-07-14
export async function GET(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const fecha = req.nextUrl.searchParams.get('fecha')
  let query = supabase
    .from('despachos')
    .select(`*,
      chofer:users!despachos_chofer_id_fkey(nombre),
      vehiculo:vehiculos(nombre, patente),
      viaje_flota:viajes_flota(barriles_vacios_devueltos, merma_declarada),
      paradas:despacho_paradas(*,
        cliente:clientes(nombre_fantasia, direccion_entrega, telefono),
        cliente_terreno:clientes_terreno(nombre_fantasia, direccion, telefono),
        entrega:entregas(*)
      )
    `)
    .order('fecha', { ascending: false })

  if (fecha) query = query.eq('fecha', fecha)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ordenar paradas por secuencia dentro de cada despacho
  const withSorted = (data ?? []).map(d => ({
    ...d,
    paradas: (d.paradas ?? []).sort((a: { secuencia: number }, b: { secuencia: number }) => a.secuencia - b.secuencia),
  }))

  return NextResponse.json(withSorted)
}

// POST /api/logistica/despachos — Matías arma el despacho del día con su ruta ordenada
export async function POST(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id').eq('email', user.email!).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const body = await req.json() as {
    fecha: string
    region: string
    chofer_id?: string
    vehiculo_id?: string
    km_inicio?: number
    paradas: ParadaInput[]
  }

  if (!body.fecha || !body.region || !body.paradas?.length) {
    return NextResponse.json({ error: 'fecha, region y al menos una parada son obligatorios' }, { status: 400 })
  }
  for (const p of body.paradas) {
    if (!p.cliente_id && !p.cliente_terreno_id) {
      return NextResponse.json({ error: 'Cada parada necesita cliente_id o cliente_terreno_id' }, { status: 400 })
    }
  }

  const { data: despacho, error: despachoErr } = await supabase
    .from('despachos')
    .insert({
      fecha: body.fecha,
      region: body.region,
      chofer_id: body.chofer_id ?? null,
      vehiculo_id: body.vehiculo_id ?? null,
      creado_por: profile.id,
    })
    .select('*')
    .single()

  if (despachoErr) return NextResponse.json({ error: despachoErr.message }, { status: 500 })

  const { error: paradasErr } = await supabase
    .from('despacho_paradas')
    .insert(body.paradas.map((p, i) => ({
      despacho_id: despacho.id,
      secuencia: i + 1,
      cliente_id: p.cliente_id ?? null,
      cliente_terreno_id: p.cliente_terreno_id ?? null,
      visita_terreno_id: p.visita_terreno_id ?? null,
      ventana_desde: p.ventana_desde ?? null,
      ventana_hasta: p.ventana_hasta ?? null,
      eta_comprometida: p.eta_comprometida,
      cantidad_pedida: p.cantidad_pedida,
    })))

  if (paradasErr) return NextResponse.json({ error: paradasErr.message }, { status: 500 })

  // Unificación Flota+Despacho: si se indicó vehículo, este despacho ES la
  // salida del vehículo — se crea el viaje de flota vinculado y el vehículo
  // pasa a en_uso, sin necesitar pasar por el check-in de Flota por separado.
  if (body.vehiculo_id) {
    const { data: viaje, error: viajeErr } = await supabase
      .from('viajes_flota')
      .insert({
        vehiculo_id: body.vehiculo_id,
        conductor_id: body.chofer_id ?? profile.id,
        tipo: 'reparto',
        motivo: `Despacho ${body.region} · ${body.fecha}`,
        km_inicio: body.km_inicio ?? 0,
        estado: 'en_curso',
      })
      .select('id')
      .single()

    if (!viajeErr && viaje) {
      await supabase.from('despachos').update({ viaje_flota_id: viaje.id }).eq('id', despacho.id)
      await supabase.from('vehiculos').update({ estado: 'en_uso' }).eq('id', body.vehiculo_id)
      despacho.viaje_flota_id = viaje.id

      // 🔔 Notificar a todos que un camión salió — mismo evento
      // "camion_salida" que ya dispara el check-in de Flota
      // (CheckinClient.tsx), pero este flujo (armar el despacho) también
      // deja el vehículo en_uso y antes no avisaba a nadie: si el despacho
      // se crea desde acá en vez de por check-in, nunca sonaba ninguna
      // notificación. Se espera la promesa (no fire-and-forget) porque
      // esto corre en la misma función serverless que crea el despacho —
      // sin await, Vercel puede cortar la función apenas se envía la
      // respuesta y la notificación se pierde en silencio.
      const [{ data: vehiculo }, { data: chofer }] = await Promise.all([
        supabase.from('vehiculos').select('nombre').eq('id', body.vehiculo_id).single(),
        body.chofer_id
          ? supabase.from('users').select('nombre').eq('id', body.chofer_id).single()
          : Promise.resolve({ data: null as { nombre: string } | null }),
      ])
      await sendPushToAll({
        title: `🚚 ${vehiculo?.nombre ?? 'Vehículo'} en ruta`,
        body: `${chofer?.nombre?.split(' ')[0] ?? 'Conductor'} salió en reparto — ${body.region}`,
        url: '/flota',
        tag: 'camion_salida',
      })
    }
  }

  return NextResponse.json(despacho, { status: 201 })
}
