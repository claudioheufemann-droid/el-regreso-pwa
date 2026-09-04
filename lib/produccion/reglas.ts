/**
 * Reglas de negocio del forecast de Producción — fuente única, compartida
 * entre app/api/produccion/datos (agregación mensual para el modelo) y
 * app/produccion/page.tsx (avance del mes en curso, calculado en vivo).
 * Antes vivían duplicadas en el endpoint; cualquier ajuste (ej. el bucketing
 * de envases) tenía que tocarse en dos lugares o se desincronizaban.
 */

/**
 * 'lata' fusiona 354ml y 473ml (decisión del usuario, 4 sep 2026): antes
 * eran dos buckets separados, con dos series independientes entrenadas en
 * Prophet cada una. La fusión pasa a ser efectiva DESDE LA AGREGACIÓN (ver
 * app/api/produccion/datos/route.ts, que llama bucketEnvase() por venta) —
 * Prophet entrena UN solo modelo sobre la serie ya sumada 354+473, no se
 * combinan dos forecasts por separado después. Afecta forecast, stock de
 * seguridad y el inventario agrupado por igual, porque los tres usan este
 * mismo tipo/función.
 */
export type EnvaseBucket = 'barril_30' | 'barril_50' | 'lata' | 'otros'

export const ENVASE_LABEL: Record<EnvaseBucket, string> = {
  barril_30: 'Barril 30L',
  barril_50: 'Barril 50L',
  lata: 'Lata',
  otros: 'Otros formatos',
}

/** Litros de un barril → familia de tamaño. Múltiplos de 30 (30/60/90/120…)
 *  son N barriles de 30L en una sola línea; 50L exacto es la otra medida
 *  estándar. El resto (growlers, casos atípicos) va a "otros". */
export function bucketEnvase(envase: string | null, litros: number): EnvaseBucket {
  if (envase === 'Lata (354 ml)' || envase === 'Lata (473 ml)') return 'lata'
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
   del mes calendario — corre del día 24 del mes anterior al día 23 del mes
   que le da nombre. Ej.: el ciclo "Septiembre" (etiqueta 2026-09-01) junta
   las ventas del 24 de agosto al 23 de septiembre.

   SIN superposición (ajustado el 4 sep 2026 — la versión anterior corría
   23→24 y compartía esos dos días entre el ciclo que cerraba y el que
   arrancaba, a propósito, como margen de reconciliación). Con el corte en
   24→23, todo día del mes cae en EXACTAMENTE un ciclo: `dia <= 23` sólo
   puede pertenecer al ciclo que cierra, `dia >= 24` sólo al que arranca, sin
   overlap posible entre ambas condiciones. Se prefirió así porque la
   superposición inflaba el total histórico que entrena Prophet (esos dos
   días se sumaban dos veces, en dos ciclos consecutivos), sesgando tanto la
   demanda proyectada como el MAPE del backtest. Cada ciclo queda 2 días más
   corto que antes (ej. "Septiembre" pasa de 33 a 31 días).

   La ETIQUETA de un ciclo sigue siendo yyyy-mm-01 (mismo formato que el resto
   del pipeline: forecast_produccion.mes, stock_seguridad.mes, Prophet con
   freq="MS") — sólo cambia qué ventas caen bajo cada etiqueta, no la cadencia
   mensual del modelo.
   ──────────────────────────────────────────────────────────────────────── */

/** Día en que arranca un ciclo (del mes anterior al que le da nombre). */
export const DIA_INICIO_CICLO = 24
/** Día en que cierra un ciclo (del mes que le da nombre). */
export const DIA_FIN_CICLO = 23

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
 * Ciclo interno al que pertenece una fecha. Devuelve SIEMPRE 1 etiqueta
 * (yyyy-mm-01) — con el corte en 24→23 no hay superposición: todo día cae en
 * exactamente un ciclo (`dia <= DIA_FIN_CICLO` y `dia >= DIA_INICIO_CICLO`
 * son mutuamente excluyentes por construcción, ya que DIA_FIN_CICLO+1 ===
 * DIA_INICIO_CICLO). Se mantiene el array de retorno por compatibilidad con
 * los call sites existentes (iteran el resultado con un `for`).
 */
export function ciclosDe(fechaISO: string): string[] {
  const [anio, mes, diaStr] = fechaISO.slice(0, 10).split('-').map(Number)
  const dia = diaStr
  const ciclos: string[] = []
  if (dia <= DIA_FIN_CICLO) ciclos.push(etiquetaCiclo(anio, mes))
  if (dia >= DIA_INICIO_CICLO) ciclos.push(etiquetaCiclo(anio, mes + 1))
  return ciclos
}

/** ¿Ya cerró este ciclo? (hoy pasó su día de cierre, el 23 del mes que le da
 *  nombre). Es la comparación correcta para decidir si un ciclo entra al
 *  modelo como período completo — compara la FECHA real de cierre, no la
 *  etiqueta (yyyy-mm-01), porque un ciclo cierra a mitad de su mes nombrado,
 *  no al final. */
export function cicloEstaCerrado(cicloLabel: string, hoyISO?: string): boolean {
  const hoy = hoyISO ?? new Date().toISOString().slice(0, 10)
  return hoy > finDeCiclo(cicloLabel)
}

/** Etiqueta (yyyy-mm-01) del ciclo interno "en curso" hoy, para trackear
 *  avance en vivo (barra de progreso, MTD). Sin superposición hay un único
 *  ciclo abierto en cualquier momento. */
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
