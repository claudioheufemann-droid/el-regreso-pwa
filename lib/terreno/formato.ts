/** Formatea una distancia en metros: bajo 1 km en metros enteros, desde 1 km en km con 1 decimal. */
export function fDistancia(m: number): string {
  if (m >= 1000) return `${(m / 1000).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
  return `${Math.round(m)} m`
}
