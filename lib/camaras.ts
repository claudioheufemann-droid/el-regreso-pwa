/**
 * lib/camaras.ts — Qué depósitos del informe de stock cuentan como stock
 * disponible, según quién pregunta.
 *
 * Son DOS listas distintas a propósito (definido por el usuario, 4 sep 2026):
 * Ventas responde "¿qué puedo prometerle a un cliente hoy?" y Producción
 * "¿cuánto producto terminado tenemos?". La segunda es más amplia.
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
 * VENTAS — lo que se le puede ofrecer y despachar a un cliente hoy.
 *
 * Sólo la bodega de despacho. Un vendedor no debería comprometer producto que
 * está en planta o en el depósito de rotación: puede estar sin liberar o sin
 * trasladar, y prometerlo genera un quiebre en el despacho.
 *
 * Aplica al módulo de Stock y a Cotizaciones (ambos son promesa al cliente).
 */
export const CAMARAS_VENTAS = [
  'camara general barrios bajos',
].map(norm)

/**
 * PRODUCCIÓN — todo el producto terminado que la empresa tiene, para decidir
 * si hace falta una cocción.
 *
 * Acá sí entran planta y FIFO: el producto existe y va a llegar a la bodega de
 * despacho por sí solo, así que contarlo como inexistente haría lanzar una
 * cocción redundante. Es una pregunta distinta a la de Ventas —"¿tenemos?" vs
 * "¿puedo prometerlo hoy?"— y por eso son dos listas y no una.
 *
 * Quedan fuera en ambos casos:
 *   · Cámara Reposición, Cámara de Frío Retail — stock ya asignado.
 *   · Camara Barriles Base Camp, Recarga Growler PDV, Barriles Despinchados
 *     PDV, Refrigerador — consumo propio del local.
 *   · Bodega Santiago Distribuidora M-O — ya despachado a un tercero.
 *   · Camara Contra Muestras, Cámara EVENTOS en Proceso — comprometido.
 */
export const CAMARAS_PRODUCCION = [
  'camara general barrios bajos',
  'camara de frio planta',
  'deposito latas fifo',
].map(norm)

/** Se compara por `includes` porque el ERP agrega el tipo como sufijo:
 *  "Camara General Barrios Bajos (Frío)". */
function coincide(camara: string | null | undefined, lista: string[]): boolean {
  if (!camara) return false
  const c = norm(camara)
  return lista.some(d => c.includes(d))
}

/** ¿Se puede vender/despachar desde esta cámara? (Stock y Cotizaciones) */
export function esCamaraVentas(camara: string | null | undefined): boolean {
  return coincide(camara, CAMARAS_VENTAS)
}

/** ¿Cuenta como inventario propio para decidir reposición? (Producción) */
export function esCamaraProduccion(camara: string | null | undefined): boolean {
  return coincide(camara, CAMARAS_PRODUCCION)
}
