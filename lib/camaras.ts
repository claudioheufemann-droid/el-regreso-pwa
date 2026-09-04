/**
 * lib/camaras.ts — Qué depósitos del informe de stock cuentan como stock
 * disponible.
 *
 * Vive aparte de lib/stockParser.ts a propósito: el parser importa `xlsx`
 * (pesado, y sólo tiene sentido en el endpoint de carga), mientras que esta
 * definición la necesitan también las páginas que sólo LEEN stock. Sin la
 * separación, cualquier pantalla que quisiera filtrar por cámara arrastraba
 * xlsx a su bundle.
 *
 * Contexto: el informe del ERP trae 15 depósitos. Hasta el 4 sep 2026 el
 * parser leía únicamente "Camara General Barrios Bajos" y descartaba el resto
 * en silencio — se estaba viendo el 53% de los barriles (327 de 616) y el 46%
 * de las latas (17.826 de 39.070), así que el stock de seguridad comparaba el
 * punto de reorden contra medio inventario y marcaba quiebres inexistentes.
 */

/** Sin tildes, minúsculas, espacios colapsados. */
function norm(v: string): string {
  return v
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Depósitos cuyo contenido cuenta como STOCK DISPONIBLE para vender y para
 * decidir reposición. Definido por el usuario el 4 sep 2026.
 *
 * Quedan fuera a propósito:
 *   · Cámara Reposición, Cámara de Frío Retail — stock ya asignado.
 *   · Camara Barriles Base Camp, Recarga Growler PDV, Barriles Despinchados
 *     PDV, Refrigerador — consumo propio del local.
 *   · Bodega Santiago Distribuidora M-O — ya despachado a un tercero.
 *   · Camara Contra Muestras, Cámara EVENTOS en Proceso — comprometido.
 *
 * Se comparan por `includes` porque el ERP les agrega el tipo como sufijo:
 * "Camara General Barrios Bajos (Frío)".
 */
export const CAMARAS_DISPONIBLES = [
  'camara general barrios bajos',
  'camara de frio planta',
  'deposito latas fifo',
].map(norm)

/** ¿El contenido de esta cámara cuenta como stock disponible? */
export function esCamaraDisponible(camara: string | null | undefined): boolean {
  if (!camara) return false
  const c = norm(camara)
  return CAMARAS_DISPONIBLES.some(d => c.includes(d))
}
