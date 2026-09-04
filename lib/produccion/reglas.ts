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

/* ────────────────────────────────────────────────────────────────────────
   CICLO INTERNO DE PRODUCCIÓN (no calendario)
   Definido con el usuario el 4 sep 2026: por un tema de ciclos internos, el
   "mes" que agrupa las ventas para el forecast no corre del 1 al último día
   del mes calendario — corre del día 23 del mes anterior al día 24 del mes
   que le da nombre. Ej.: el ciclo "Septiembre" (etiqueta 2026-09-01) junta
   las ventas del 23 de agosto al 24 de septiembre.

   Elegido A PROPÓSITO con superposición: los días 23 y 24 de cada mes caen
   DENTRO de dos ciclos a la vez (el que cierra y el que recién arranca), así
   que esas ventas se suman en los totales de AMBOS. Es el trade-off que el
   usuario aceptó explícitamente a cambio de un margen de reconciliación
   interna — no es un bug si un mismo litro aparece en el "vendido este mes"
   de dos ciclos consecutivos.

   La ETIQUETA de un ciclo sigue siendo yyyy-mm-01 (mismo formato que el resto
   del pipeline: forecast_produccion.mes, stock_seguridad.mes, Prophet con
   freq="MS") — sólo cambia qué ventas caen bajo cada etiqueta, no la cadencia
   mensual del modelo.
   ──────────────────────────────────────────────────────────────────────── */

/** Día en que arranca un ciclo (del mes anterior al que le da nombre). */
export const DIA_INICIO_CICLO = 23
/** Día en que cierra un ciclo (del mes que le da nombre). */
export const DIA_FIN_CICLO = 24

/** Suma `delta` meses a (anio, mes) y normaliza el desborde (mes 13 → enero
 *  del año siguiente, mes 0 → diciembre del año anterior). */
function sumarMeses(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const total = mes - 1 + delta
  const anioResultado = anio + Math.floor(total / 12)
  const mesResultado = ((total % 12) + 12) % 12 + 1
  return { anio: anioResultado, mes: mesResultado }
}

/** Etiqueta yyyy-mm-01 del ciclo que da nombre a (anio, mes). */
function etiquetaCiclo(anio: number, mes: number): string {
  const { anio: y, mes: m } = sumarMeses(anio, mes, 0)
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** yyyy-mm-dd del día en que arranca el ciclo etiquetado `cicloLabel`
 *  (yyyy-mm-01) — el 23 del mes ANTERIOR al que le da nombre. */
export function inicioDeCiclo(cicloLabel: string): string {
  const [anio, mes] = cicloLabel.slice(0, 7).split('-').map(Number)
  const { anio: y, mes: m } = sumarMeses(anio, mes, -1)
  return `${y}-${String(m).padStart(2, '0')}-${String(DIA_INICIO_CICLO).padStart(2, '0')}`
}

/** yyyy-mm-dd del día en que cierra el ciclo etiquetado `cicloLabel`
 *  (yyyy-mm-01) — el 24 del mes que le da nombre. */
export function finDeCiclo(cicloLabel: string): string {
  return `${cicloLabel.slice(0, 7)}-${String(DIA_FIN_CICLO).padStart(2, '0')}`
}

/**
 * Ciclo(s) internos a los que pertenece una fecha. Devuelve 1 o 2 etiquetas
 * (yyyy-mm-01): 2 sólo cuando el día del mes es 23 o 24 (la ventana
 * compartida entre el ciclo que cierra y el que arranca).
 */
export function ciclosDe(fechaISO: string): string[] {
  const [anio, mes, diaStr] = fechaISO.slice(0, 10).split('-').map(Number)
  const dia = diaStr
  const ciclos: string[] = []
  if (dia <= DIA_FIN_CICLO) ciclos.push(etiquetaCiclo(anio, mes))
  if (dia >= DIA_INICIO_CICLO) ciclos.push(etiquetaCiclo(anio, mes + 1))
  return ciclos
}

/** ¿Ya cerró este ciclo? (hoy pasó su día de cierre, el 24 del mes que le da
 *  nombre). Es la comparación correcta para decidir si un ciclo entra al
 *  modelo como período completo — un simple `>=` de etiquetas no alcanza
 *  porque, con la ventana compartida del 23-24, dos ciclos consecutivos
 *  pueden estar "abiertos" ambos a la vez por un par de días. */
export function cicloEstaCerrado(cicloLabel: string, hoyISO?: string): boolean {
  const hoy = hoyISO ?? new Date().toISOString().slice(0, 10)
  return hoy > finDeCiclo(cicloLabel)
}

/** Etiqueta (yyyy-mm-01) del ciclo interno "en curso" hoy, para trackear
 *  avance en vivo (barra de progreso, MTD) — el ciclo abierto MÁS ANTIGUO
 *  (mientras no pasó su día 24 de cierre), aunque el ciclo siguiente ya haya
 *  empezado a acumular ventas desde el 23. */
export function cicloEnCursoISO(): string {
  const hoy = new Date()
  const anio = hoy.getUTCFullYear(), mes = hoy.getUTCMonth() + 1, dia = hoy.getUTCDate()
  return dia > DIA_FIN_CICLO ? etiquetaCiclo(anio, mes + 1) : etiquetaCiclo(anio, mes)
}

/** Espacios dobles del ERP ("Mocho  English"), descriptores entre paréntesis
 *  al FINAL en costos_precios/stock_productos ("Kombucha Lemon (Fresh)",
 *  "Mocho English (Red Ale)") y el prefijo de envase al PRINCIPIO que trae
 *  stock_productos para latas ("Lata (473 ml) de Mocho English Red Ale")
 *  hacen que el mismo producto aparezca escrito de formas distintas según
 *  la tabla — normalizamos todo antes de cruzar.
 *
 *  El prefijo de latas NUNCA aparece en ventas.producto (confirmado con
 *  datos reales), así que agregarlo acá es inofensivo para ese caso — sólo
 *  hace algo cuando el nombre viene de stock_productos.
 *
 *  Bug real que esto corrigió: sin sacar el prefijo, el litraje de las
 *  latas en stock_productos quedaba guardado bajo la clave completa
 *  ("Lata (473 ml) de Mocho English Red Ale") en vez de "Mocho English" —
 *  nunca se sumaba al inventario real del producto, el Stock de Seguridad
 *  mostraba sólo el litraje de los barriles como si las latas no existieran. */
export function normalizarProducto(nombre: string): string {
  return nombre
    .replace(/^Lata\s*\(\s*\d+\s*ml\s*\)\s*de\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
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
