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
 *  son N barriles de 30L en una sola línea; múltiplos de 50 (50/100/150…) son
 *  N de 50L. El resto (growlers, casos atípicos) va a "otros".
 *
 * Antes sólo se aceptaba 50 exacto para barril_50 (no sus múltiplos) — no
 * generó números mal en la práctica porque hasta ahora cada fila de venta
 * viene con UN barril por línea (litros=30 o litros=50, nunca la suma de
 * varios), pero si algún día el ERP agrupa 2+ barriles de 50L en una sola
 * fila (como ya hace con los de 30L), esa venta se hubiera perdido en
 * "otros" en vez de sumar al ritmo real de barril_50 — silencioso y directo
 * a las alarmas de quiebre de stock. Corregido preventivamente, mismo
 * criterio que ya se usaba para 30L. 150 (múltiplo de ambos) se resuelve a
 * favor de 30L, igual que antes — no hay forma de distinguir 5×30L de 3×50L
 * sólo con el total. */
export function bucketEnvase(envase: string | null, litros: number): EnvaseBucket {
  if (envase === 'Lata (354 ml)' || envase === 'Lata (473 ml)') return 'lata'
  if (envase === 'Barril') {
    if (litros > 0 && litros % 30 === 0) return 'barril_30'
    if (litros > 0 && litros % 50 === 0) return 'barril_50'
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

/* ── Días hábiles Chile (lun-vie, sin feriados) ────────────────────────────
   Usado por las alarmas de quiebre de stock y el ritmo de venta (ver
   app/produccion/page.tsx): vendemos lunes a viernes, así que un "día" de
   cobertura o de quiebre estimado tiene que saltarse fin de semana Y
   feriado, no sólo fin de semana — si no, una alarma que dice "se agota en
   7 días hábiles" puede caer en Fiestas Patrias y estar 2-3 días adelantada
   o atrasada según el mes.

   Fijos + Semana Santa (calculada, exacta cualquier año) + los dos feriados
   que la ley mueve al lunes más cercano (San Pedro y San Pablo, Encuentro
   de Dos Mundos) cubren el calendario oficial casi completo. Quedan FUERA
   a propósito, por variar año a año según decreto y no poder calcularse:
     - Día Nacional de los Pueblos Indígenas (~20-24 jun, ligado al
       solsticio + regla de traslado de Ley 21.357).
     - "Feriados irrenunciables" puente que a veces se agregan cerca del
       18-19 de septiembre cuando caen pegados a un fin de semana.
   Si alguno de estos cae dentro de la ventana de una alarma, la fecha
   estimada puede adelantarse esos 1-2 días — impacto menor y acotado a
   unos pocos días del año. */

/** Domingo de Pascua (calendario gregoriano) — algoritmo de Gauss/Meeus. */
function domingoDePascuaISO(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const MS_POR_DIA_FERIADOS = 86400000
function sumarDiasISO(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * MS_POR_DIA_FERIADOS).toISOString().slice(0, 10)
}
function diaSemanaISO(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() // 0=domingo ... 6=sábado
}
/** Ley 19.668: si el feriado cae mar/mié/jue, se traslada al lunes anterior. */
function trasladarALunes(iso: string): string {
  const dow = diaSemanaISO(iso)
  if (dow === 2) return sumarDiasISO(iso, -1) // martes → lunes
  if (dow === 3) return sumarDiasISO(iso, -2) // miércoles → lunes
  if (dow === 4) return sumarDiasISO(iso, -3) // jueves → lunes
  return iso
}

const feriadosChilePorAnio = new Map<number, Set<string>>()

/** Feriados oficiales de Chile para un año dado (ver limitaciones arriba). */
export function feriadosChile(year: number): Set<string> {
  const cached = feriadosChilePorAnio.get(year)
  if (cached) return cached

  const pascua = domingoDePascuaISO(year)
  const feriados = new Set<string>([
    `${year}-01-01`, // Año Nuevo
    sumarDiasISO(pascua, -2), // Viernes Santo
    sumarDiasISO(pascua, -1), // Sábado Santo
    `${year}-05-01`, // Día Nacional del Trabajo
    `${year}-05-21`, // Día de las Glorias Navales
    trasladarALunes(`${year}-06-29`), // San Pedro y San Pablo
    `${year}-07-16`, // Virgen del Carmen
    `${year}-08-15`, // Asunción de la Virgen
    `${year}-09-18`, // Fiestas Patrias
    `${year}-09-19`, // Glorias del Ejército
    trasladarALunes(`${year}-10-12`), // Encuentro de Dos Mundos
    `${year}-10-31`, // Día de las Iglesias Evangélicas y Protestantes
    `${year}-11-01`, // Día de Todos los Santos
    `${year}-12-08`, // Inmaculada Concepción
    `${year}-12-25`, // Navidad
  ])
  feriadosChilePorAnio.set(year, feriados)
  return feriados
}

/** true si `iso` es lunes-viernes y no es feriado chileno. */
export function esDiaHabilISO(iso: string): boolean {
  const dow = diaSemanaISO(iso)
  if (dow === 0 || dow === 6) return false
  return !feriadosChile(Number(iso.slice(0, 4))).has(iso)
}
