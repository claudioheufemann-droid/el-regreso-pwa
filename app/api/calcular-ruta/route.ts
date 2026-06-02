import { NextRequest, NextResponse } from 'next/server'

interface ParadaInput {
  nombre: string
  direccion: string
  lat?: number
  lng?: number
}

const UA = 'ElRegresoDeliveryApp/1.0 admin@elregresobeer.com'

async function geocodificar(texto: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    q: `${texto}, Valdivia, Chile`,
    format: 'json',
    limit: '1',
    countrycodes: 'cl',
  })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': UA },
    })
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2))
}

export async function POST(req: NextRequest) {
  const { paradas }: { paradas: ParadaInput[] } = await req.json()

  if (!paradas || paradas.length < 2) return NextResponse.json({ km: 0, minutos: 0 })

  // Obtener coordenadas para cada parada
  const coords: Array<{ lat: number; lng: number }> = []
  for (const p of paradas) {
    if (p.lat && p.lng) {
      coords.push({ lat: p.lat, lng: p.lng })
    } else {
      const geo = await geocodificar(p.direccion || p.nombre)
      if (geo) coords.push(geo)
    }
  }

  if (coords.length < 2) return NextResponse.json({ km: 0, minutos: 0, sinCoords: true })

  // OSRM routing (gratuito, sin API key)
  try {
    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';')
    const osrmRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false`,
      { headers: { 'User-Agent': UA } }
    )
    if (osrmRes.ok) {
      const data = await osrmRes.json()
      const ruta = data.routes?.[0]
      if (ruta) {
        const km = Math.round(ruta.distance / 1000)
        const minutos = Math.round(ruta.duration / 60)
        return NextResponse.json({ km, minutos, fuente: 'osrm' })
      }
    }
  } catch { /* fallback */ }

  // Fallback: suma de distancias haversine (en línea recta)
  let totalM = 0
  for (let i = 0; i < coords.length - 1; i++) totalM += haversineM(coords[i], coords[i + 1])
  const km = Math.round(totalM / 1000)
  return NextResponse.json({ km, minutos: Math.round(km / 35 * 60), fuente: 'haversine' })
}
