import { createHash } from 'crypto'
import type { LatLng } from './RouteProvider'

/**
 * Hash estable de la secuencia ordenada origen→paradas→destino. Cualquier cambio en el
 * orden, en una coordenada, o en el destino invalida el cache de
 * plan_ruta_calculos_terreno automáticamente (parametros_hash distinto).
 */
export function hashSecuenciaRuta(origen: LatLng, paradas: LatLng[], destino?: LatLng): string {
  const puntos = [origen, ...paradas, ...(destino ? [destino] : [])]
  const texto = puntos.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|')
  return createHash('sha1').update(texto).digest('hex')
}
