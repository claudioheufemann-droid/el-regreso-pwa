import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Bounding box de Chile continental — cualquier resultado fuera de esto
// es un falso positivo de Nominatim (p.ej. matchea una calle homónima
// en otro país) y se descarta en vez de guardarse.
const CHILE_BOUNDS = { minLat: -56.0, maxLat: -17.5, minLng: -75.7, maxLng: -66.4 }

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=cl&addressdetails=0`,
      {
        headers: {
          'User-Agent': 'ElRegresoBeerApp/1.0 (admin@elregresobeer.com)',
          'Accept-Language': 'es',
        },
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    if (isNaN(lat) || isNaN(lng)) return null
    if (lat < CHILE_BOUNDS.minLat || lat > CHILE_BOUNDS.maxLat || lng < CHILE_BOUNDS.minLng || lng > CHILE_BOUNDS.maxLng) return null
    return { lat, lng }
  } catch {
    return null
  }
}

// Construye la mejor query de dirección posible para un cliente:
// prioriza la dirección completa de Google Maps (ya trae comuna/región),
// si no existe usa dirección + localidad/provincia + Chile.
function buildQuery(c: { direccion_google_maps: string | null; direccion: string | null; localidad: string | null; provincia: string | null }): string | null {
  if (c.direccion_google_maps) return `${c.direccion_google_maps}, Chile`
  if (c.direccion) {
    const zona = c.localidad || c.provincia
    return zona ? `${c.direccion}, ${zona}, Chile` : `${c.direccion}, Chile`
  }
  return null
}

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })
  }

  const supabase = createClient(url, key)

  const { data: sinCoords, error } = await supabase
    .from('clientes')
    .select('id, nombre_fantasia, direccion, direccion_google_maps, localidad, provincia')
    .or('lat.is.null,lng.is.null')
    .limit(60) // Nominatim: 1 req/seg — limitar para no exceder el timeout de la función

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sinCoords || sinCoords.length === 0) {
    return NextResponse.json({ mensaje: 'Todos los clientes ya tienen coordenadas', actualizados: 0 })
  }

  let actualizados = 0
  let sinDireccion = 0
  let sinResultado = 0

  for (const c of sinCoords) {
    const query = buildQuery(c)
    if (!query) { sinDireccion++; continue }

    const coords = await geocodeAddress(query)
    await sleep(1100) // Nominatim: máximo 1 req/seg

    if (!coords) { sinResultado++; continue }

    const { error: updateError } = await supabase
      .from('clientes')
      .update({ lat: coords.lat, lng: coords.lng })
      .eq('id', c.id)

    if (!updateError) actualizados++
  }

  return NextResponse.json({
    procesados: sinCoords.length,
    actualizados,
    sin_direccion: sinDireccion,
    sin_resultado: sinResultado,
  })
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'No configurado' }, { status: 500 })

  const supabase = createClient(url, key)

  const { count: conCoords } = await supabase
    .from('clientes')
    .select('id', { count: 'exact', head: true })
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  const { count: sinCoords } = await supabase
    .from('clientes')
    .select('id', { count: 'exact', head: true })
    .or('lat.is.null,lng.is.null')

  return NextResponse.json({ con_coordenadas: conCoords ?? 0, sin_coordenadas: sinCoords ?? 0 })
}
