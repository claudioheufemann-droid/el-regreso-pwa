const RADIO_TIERRA_M = 6371000

/** Distancia en línea recta entre dos coordenadas, en metros (fórmula de Haversine). */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (n: number) => (n * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return RADIO_TIERRA_M * c
}

export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return distanciaMetros(lat1, lng1, lat2, lng2) / 1000
}

/** Suma la distancia recta entre puntos consecutivos de una ruta (en km). */
export function distanciaTotalRutaKm(puntos: { lat: number; lng: number }[]): number {
  let total = 0
  for (let i = 1; i < puntos.length; i++) {
    total += distanciaKm(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng)
  }
  return total
}

const RADIO_GEOFENCE_M = 50

/** ¿El punto dado está dentro del radio de geocerca de un cliente? */
export function dentroDeGeofence(
  latVisita: number, lngVisita: number,
  latCliente: number, lngCliente: number,
  radioM: number = RADIO_GEOFENCE_M,
): { dentro: boolean; distanciaM: number } {
  const distanciaM = distanciaMetros(latVisita, lngVisita, latCliente, lngCliente)
  return { dentro: distanciaM <= radioM, distanciaM }
}
