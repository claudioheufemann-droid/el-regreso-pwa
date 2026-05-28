import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function geocodeCity(ciudad: string, pais = 'Chile'): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(`${ciudad}, ${pais}`)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=cl`,
      {
        headers: {
          'User-Agent': 'ElRegresoBeerApp/1.0 (benja.alarcon@elregresobeer.com)',
          'Accept-Language': 'es',
        },
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.length === 0) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

function addJitter(coord: number, range = 0.008) {
  return coord + (Math.random() - 0.5) * range
}

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })
  }

  const supabase = createClient(url, key)

  // Get all clients without coordinates
  const { data: sinCoords, error } = await supabase
    .from('clientes')
    .select('id, nombre_fantasia, localidad_entrega, localidad, provincia')
    .or('lat.is.null,lng.is.null')
    .limit(1000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sinCoords || sinCoords.length === 0) {
    return NextResponse.json({ mensaje: 'Todos los clientes ya tienen coordenadas', actualizados: 0 })
  }

  // Group by city to minimize API calls
  const ciudadMap = new Map<string, number[]>() // ciudad → [client ids]
  for (const c of sinCoords) {
    const ciudad = (c.localidad_entrega || c.localidad || c.provincia || '').trim()
    if (!ciudad) continue
    if (!ciudadMap.has(ciudad)) ciudadMap.set(ciudad, [])
    ciudadMap.get(ciudad)!.push(c.id)
  }

  let actualizados = 0
  let sinCiudad = sinCoords.filter(c => !((c.localidad_entrega || c.localidad || c.provincia || '').trim())).length

  // Geocode each unique city (max 60 to avoid long timeouts)
  const ciudades = [...ciudadMap.entries()].slice(0, 60)

  for (const [ciudad, ids] of ciudades) {
    const coords = await geocodeCity(ciudad)
    if (!coords) {
      await sleep(1100) // wait before next request even if failed
      continue
    }

    // Update all clients in this city with slightly randomized coordinates
    for (const id of ids) {
      const lat = addJitter(coords.lat)
      const lng = addJitter(coords.lng)

      const { error: updateError } = await supabase
        .from('clientes')
        .update({ lat, lng })
        .eq('id', id)

      if (!updateError) actualizados++
    }

    await sleep(1100) // Nominatim rate limit: max 1 req/sec
  }

  return NextResponse.json({
    total_sin_coords: sinCoords.length,
    ciudades_procesadas: ciudades.length,
    actualizados,
    sin_ciudad: sinCiudad,
    pendientes: Math.max(0, ciudadMap.size - 60),
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
