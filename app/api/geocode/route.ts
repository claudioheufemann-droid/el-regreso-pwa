import { NextRequest, NextResponse } from 'next/server'

// lat+lon => geocoding inverso (usado por "Usar mi ubicación actual"): traduce las
// coordenadas del GPS a una dirección legible para mostrar en el campo, sin bloquear el
// flujo si Nominatim no responde (el caller ya tiene las coords, sólo pierde el texto).
async function reverseGeocode(lat: string, lon: string) {
  const params = new URLSearchParams({ lat, lon, format: 'json', 'accept-language': 'es', zoom: '18' })
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: {
      'User-Agent': 'ElRegresoDeliveryApp/1.0 admin@elregresobeer.com',
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) return NextResponse.json([])
  const data = await res.json()
  if (!data?.display_name) return NextResponse.json([])
  return NextResponse.json([{ lat, lon, display_name: data.display_name as string }])
}

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat')
  const lon = req.nextUrl.searchParams.get('lon')
  if (lat && lon) return reverseGeocode(lat, lon)

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json([])

  // bias=cl: búsqueda libre en todo Chile (ej. buscador de localidad del mapa).
  // Por defecto se mantiene el sesgo a Valdivia (autocompletado de direcciones
  // de clientes/visitas, donde casi siempre se busca cerca de Valdivia).
  const bias = req.nextUrl.searchParams.get('bias')
  const query = bias === 'cl' ? `${q}, Chile` : `${q}, Valdivia, Chile`

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '6',
    countrycodes: 'cl',
    addressdetails: '1',
    'accept-language': 'es',
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      'User-Agent': 'ElRegresoDeliveryApp/1.0 admin@elregresobeer.com',
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) return NextResponse.json([])
  const data = await res.json()
  return NextResponse.json(data)
}
