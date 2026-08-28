import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * GET /api/clientes/cercanos?lat=&lng=&limit=5
 *
 * Antes /terreno/nueva-visita y /terreno/cercanos mandaban los ~600 clientes
 * con coordenadas completos al navegador para calcular la distancia ahí. El
 * cálculo se mueve acá: el navegador manda su posición, el servidor calcula
 * la distancia contra la tabla (una consulta indexada, no 600 filas por el
 * cable) y sólo devuelve los N más cercanos.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') ?? 5)))
  const radioM = Math.min(20000, Math.max(100, Number(searchParams.get('radio') ?? 500)))

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat y lng son requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clientes')
    .select('nombre_fantasia, categoria, localidad, telefono, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cercanos = (data ?? [])
    .map(c => ({
      nombre: c.nombre_fantasia as string,
      categoria: c.categoria as string | null,
      localidad: c.localidad as string | null,
      telefono: c.telefono as string | null,
      lat: Number(c.lat), lng: Number(c.lng),
      distancia: distanciaMetros(lat, lng, Number(c.lat), Number(c.lng)),
    }))
    .filter(c => c.distancia <= radioM)
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, limit)

  if (cercanos.length === 0) return NextResponse.json(cercanos)

  // "Hace cuánto no compra" — mismo caché que ya usa Nueva Visita, sólo
  // para los pocos clientes que quedaron dentro del radio.
  const { data: scores } = await supabase
    .from('client_scores')
    .select('nombre_fantasia, dias_sin_compra, ultima_compra')
    .in('nombre_fantasia', cercanos.map(c => c.nombre))

  const porNombre = new Map((scores ?? []).map(s => [s.nombre_fantasia as string, s]))

  return NextResponse.json(cercanos.map(c => {
    const s = porNombre.get(c.nombre)
    return {
      ...c,
      diasSinComprar: (s?.dias_sin_compra as number | null) ?? null,
      ultimaCompra: (s?.ultima_compra as string | null) ?? null,
    }
  }))
}
