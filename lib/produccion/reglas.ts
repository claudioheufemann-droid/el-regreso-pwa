/**
 * Reglas de negocio del forecast de Producción — fuente única, compartida
 * entre app/api/produccion/datos (agregación mensual para el modelo) y
 * app/produccion/page.tsx (avance del mes en curso, calculado en vivo).
 * Antes vivían duplicadas en el endpoint; cualquier ajuste (ej. el bucketing
 * de envases) tenía que tocarse en dos lugares o se desincronizaban.
 */

export type EnvaseBucket = 'barril_30' | 'barril_50' | 'lata_354' | 'lata_473' | 'otros'

export const ENVASE_LABEL: Record<EnvaseBucket, string> = {
  barril_30: 'Barril 30L',
  barril_50: 'Barril 50L',
  lata_354: 'Lata 354ml',
  lata_473: 'Lata 473ml',
  otros: 'Otros formatos',
}

/** Litros de un barril → familia de tamaño. Múltiplos de 30 (30/60/90/120…)
 *  son N barriles de 30L en una sola línea; 50L exacto es la otra medida
 *  estándar. El resto (growlers, casos atípicos) va a "otros". */
export function bucketEnvase(envase: string | null, litros: number): EnvaseBucket {
  if (envase === 'Lata (354 ml)') return 'lata_354'
  if (envase === 'Lata (473 ml)') return 'lata_473'
  if (envase === 'Barril') {
    if (litros > 0 && litros % 30 === 0) return 'barril_30'
    if (litros === 50) return 'barril_50'
  }
  return 'otros'
}

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7) + '-01' // yyyy-mm-01
}

/** yyyy-mm-01 del mes actual, en UTC (mismo criterio que el servidor de
 *  Vercel usa para "hoy" en el resto del pipeline). */
export function mesEnCursoISO(): string {
  const hoy = new Date()
  return `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Espacios dobles del ERP ("Mocho  English") y descriptores entre
 *  paréntesis en costos_precios ("Kombucha Lemon (Fresh)") hacen que el
 *  nombre de ventas.producto no calce contra costos_precios.producto con una
 *  igualdad estricta — normalizamos ambos lados igual antes de cruzar
 *  (confirmado con datos reales: sin esto se perdía ~48% del volumen). */
export function normalizarProducto(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim()
}

/** Separador de la clave compuesta del nivel 'producto_envase' (ver
 *  app/api/produccion/datos). "::" porque ni nombres de producto ni de
 *  bucket de envase lo usan nunca, a diferencia de espacios o guiones. */
export const SEP_PRODUCTO_ENVASE = '::'

export function claveProductoEnvase(producto: string, bucket: EnvaseBucket): string {
  return `${producto}${SEP_PRODUCTO_ENVASE}${bucket}`
}

export function partirClaveProductoEnvase(clave: string): { producto: string; bucket: EnvaseBucket } {
  const [producto, bucket] = clave.split(SEP_PRODUCTO_ENVASE)
  return { producto, bucket: (bucket as EnvaseBucket) ?? 'otros' }
}
