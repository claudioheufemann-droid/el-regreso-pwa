import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
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
