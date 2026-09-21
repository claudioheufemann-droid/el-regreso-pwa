import 'server-only'
import type { LatLng, RouteProvider, RouteProviderResult } from '../RouteProvider'

const MAPBOX_DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving'

function token(): string | undefined {
  return process.env.MAPBOX_ACCESS_TOKEN
}

interface MapboxDirectionsResponse {
  routes?: {
    distance: number
    duration: number
    legs: { distance: number; duration: number }[]
  }[]
  code?: string
  message?: string
}

export const mapboxDirectionsProvider: RouteProvider = {
  nombre: 'mapbox_directions',
  disponible: () => !!token(),

  async calcularRuta(origen: LatLng, paradas: LatLng[], destino?: LatLng): Promise<RouteProviderResult> {
    const t = token()
    if (!t) throw new Error('MAPBOX_ACCESS_TOKEN no configurado')

    const puntos = [origen, ...paradas, ...(destino ? [destino] : [])]
    if (puntos.length < 2) throw new Error('Se necesitan al menos 2 puntos para calcular una ruta')

    // Mapbox Directions: hasta 25 puntos por request. Rutas de terreno no deberían
    // superarlo en la práctica; si pasa, se corta acá con un error explícito en vez de
    // truncar la ruta en silencio.
    if (puntos.length > 25) {
      throw new Error(`Demasiadas paradas para un solo cálculo de ruta (${puntos.length}, máx. 25)`)
    }

    const coordenadas = puntos.map(p => `${p.lng},${p.lat}`).join(';')
    const url = `${MAPBOX_DIRECTIONS_URL}/${coordenadas}?geometries=geojson&overview=false&access_token=${t}`

    const res = await fetch(url, { cache: 'no-store' })
    const body = (await res.json()) as MapboxDirectionsResponse
    if (!res.ok || !body.routes?.length) {
      throw new Error(`Mapbox Directions falló: ${body.message ?? res.statusText}`)
    }

    const ruta = body.routes[0]
    const tramos = ruta.legs.map((leg, i) => ({
      desdeIndice: i,
      hastaIndice: i + 1,
      distanciaM: Math.round(leg.distance),
      duracionS: Math.round(leg.duration),
    }))

    return {
      distanciaTotalM: Math.round(ruta.distance),
      duracionTotalS: Math.round(ruta.duration),
      tramos,
    }
  },
}
