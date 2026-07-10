import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { distanciaTotalRutaKm } from '@/lib/geo'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

// PATCH /api/terreno/jornada/[id]/cerrar — cierra la jornada con el km final + foto del odómetro.
// Calcula km declarados (tablero) vs km reales por GPS (ruta entre check-ins de visitas del día),
// aplica la tolerancia configurada y calcula el monto de reembolso.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json() as { km_fin: number; foto_odometro_fin: string }
  if (!body.km_fin || !body.foto_odometro_fin) {
    return NextResponse.json({ error: 'km_fin y foto_odometro_fin son obligatorios' }, { status: 400 })
  }

  const { data: jornada, error: jornadaErr } = await supabase
    .from('jornadas_terreno')
    .select('*')
    .eq('id', id)
    .eq('vendedor_id', user.id)
    .eq('estado', 'abierta')
    .single()

  if (jornadaErr || !jornada) {
    return NextResponse.json({ error: 'Jornada no encontrada o ya cerrada' }, { status: 400 })
  }
  if (body.km_fin < jornada.km_inicio) {
    return NextResponse.json({ error: 'El km final no puede ser menor al km inicial' }, { status: 400 })
  }

  const { data: profile } = await supabase.from('users').select('tarifa_reembolso_km').eq('id', user.id).single()
  const tarifaAplicada = profile?.tarifa_reembolso_km ?? 0

  // Ruta real: puntos GPS de las visitas de esta jornada, en el orden en que se hicieron.
  const { data: visitas } = await supabase
    .from('visitas_terreno')
    .select('lat, lng, iniciada_at')
    .eq('jornada_id', id)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('iniciada_at', { ascending: true })

  const puntos = (visitas ?? []).map(v => ({ lat: Number(v.lat), lng: Number(v.lng) }))
  const kmGps = puntos.length >= 2 ? distanciaTotalRutaKm(puntos) : 0

  const kmDeclarados = body.km_fin - jornada.km_inicio
  const diferenciaKm = kmDeclarados - kmGps
  const diferenciaPct = kmGps > 0 ? (Math.abs(diferenciaKm) / kmGps) * 100 : (kmDeclarados > 0 ? 100 : 0)
  const toleranciaPct = jornada.tolerancia_pct ?? 15
  const requiereRevision = diferenciaPct > toleranciaPct
  const montoReembolso = Math.round(kmDeclarados * tarifaAplicada)

  const { data: cerrada, error } = await supabase
    .from('jornadas_terreno')
    .update({
      km_fin: body.km_fin,
      foto_odometro_fin: body.foto_odometro_fin,
      km_declarados: kmDeclarados,
      km_gps: kmGps,
      diferencia_km: diferenciaKm,
      diferencia_pct: diferenciaPct,
      requiere_revision: requiereRevision,
      tarifa_aplicada: tarifaAplicada,
      monto_reembolso: montoReembolso,
      estado: 'cerrada',
      finalizada_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(cerrada)
}
