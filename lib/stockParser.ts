/**
 * lib/stockParser.ts — Parseo del informe de stock del sistema de bodega.
 *
 * El archivo NO es una tabla plana: es un informe jerárquico impreso a
 * Excel, con varias secciones (tanques / barriles / envases) y dentro de
 * cada una, sub-secciones por cámara de frío. La indentación se expresa
 * como "en qué columna cae el valor", no con encabezados repetidos.
 *
 * Estructura de la sección BARRILES (a partir de la fila de la cámara):
 *   [camara, totalDeclarado]                                    ← header de cámara
 *   [_, _, producto, codigo, cantidadDeclarada]                  ← nuevo producto
 *   [_, _, _, _, "30.00 Lts"]                                    ← tamaño (se ignora, se infiere de litros/barril)
 *   [_, _, _, _, _, loteBarril, lote, litros]                    ← 1 fila por barril físico
 *   ... (se repite loteBarril hasta el siguiente producto)
 *
 * Estructura de la sección ENVASES:
 *   [camara, _, _, _, _, _, totalDeclarado]                      ← header de cámara
 *   [_, producto, codigo, _, _, _, cantidadDeclarada]            ← nuevo producto
 *   [_, _, _, "Sin caja"]                                        ← empaque (se ignora)
 *   [_, _, _, _, _, loteEnvase, unidades]                        ← 1 fila por lote
 *
 * En ambos casos, la sección/cámara termina en la siguiente fila donde la
 * columna A vuelve a tener contenido (es el próximo header). Por eso el
 * parseo NO usa números de fila fijos: son frágiles a que el informe traiga
 * más o menos productos la próxima vez. En cambio, busca los textos de
 * sección/cámara y se guía por las transiciones de columnas vacías.
 *
 * Fecha de embarrilado por lote:
 * Ni "Barriles en Depósitos" ni "Envases en Depósitos" (las secciones de
 * arriba) traen fecha — solo código de lote y cantidad. La fecha SÍ existe,
 * pero en una tabla previa y separada, "Stock de producto en barriles"
 * (listado plano, sin desglose por cámara), con una fila por barril físico
 * que incluye su fecha de embarrilado. El mismo código de lote se repite
 * también en las latas de ese mismo producto (se embarrila y se enlata el
 * mismo día), así que un lote sin match directo en barriles simplemente
 * queda sin fecha. Se cruza por código de lote (normalizado, sin "#") y se
 * usa la fecha más frecuente de ese lote si hay variantes menores.
 */
import * as XLSX from 'xlsx'

export interface LoteParsed {
  codigo: string
  cantidad: number
  /** Fecha de embarrilado (ISO yyyy-mm-dd), o null si no se encontró el lote en el listado plano. */
  fechaEmbarrilado: string | null
}

export interface StockProductoParsed {
  tipo: 'barril' | 'envase'
  producto: string
  codigoProducto: string | null
  categoria: 'Cerveza' | 'Kombucha' | 'Otros'
  cantidad: number
  litros: number | null
  lotes: LoteParsed[]
}

const CAMARA_OBJETIVO = 'camara general barrios bajos'
const SECCION_STOCK_BARRILES_PLANO = 'stock de producto en barriles'
const SECCION_BARRILES = 'barriles en depositos'
const SECCION_ENVASES = 'envases en depositos'

function norm(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca tildes
    .toLowerCase().trim()
}

/** Normaliza un código de lote para cruzar entre secciones (algunas lo traen con "#", otras sin). */
function normalizarLote(codigo: string): string {
  return codigo.trim().replace(/^#/, '').toLowerCase()
}

/** Serial de fecha de Excel (sistema 1900) → ISO yyyy-mm-dd. */
function serialAFechaISO(serial: number): string {
  const utcDias = Math.floor(serial - 25569)
  return new Date(utcDias * 86400 * 1000).toISOString().split('T')[0]
}

/**
 * Recorre el listado plano "Stock de producto en barriles" (con fecha por
 * barril físico) y arma un mapa lote→fecha, quedándose con la fecha más
 * frecuente cuando el mismo lote aparece con más de una (variantes menores
 * de captura de datos, no un error de parseo).
 */
function construirMapaFechasPorLote(filas: Fila[], inicio: number, fin: number): Map<string, string> {
  const conteos = new Map<string, Map<string, number>>()
  for (let i = inicio; i < fin; i++) {
    const f = filas[i]
    const colLote = f[5]
    const colFecha = f[6]
    if (colLote == null || String(colLote).trim() === '') continue
    if (typeof colFecha !== 'number') continue
    const lote = normalizarLote(String(colLote))
    const fecha = serialAFechaISO(colFecha)
    if (!conteos.has(lote)) conteos.set(lote, new Map())
    const m = conteos.get(lote)!
    m.set(fecha, (m.get(fecha) ?? 0) + 1)
  }
  const resultado = new Map<string, string>()
  for (const [lote, fechas] of conteos) {
    let mejorFecha = ''
    let mejorConteo = -1
    for (const [fecha, n] of fechas) if (n > mejorConteo) { mejorFecha = fecha; mejorConteo = n }
    resultado.set(lote, mejorFecha)
  }
  return resultado
}

function categoriaDe(producto: string): 'Cerveza' | 'Kombucha' | 'Otros' {
  const p = norm(producto)
  if (p.includes('kombucha')) return 'Kombucha'
  if (p.includes('lata') || p.includes('barril') || p === '') return 'Cerveza'
  return 'Cerveza'
}

type Fila = unknown[]

function buscarFila(filas: Fila[], texto: string, desde: number): number {
  const t = norm(texto)
  for (let i = desde; i < filas.length; i++) {
    if (norm(filas[i]?.[0]).includes(t)) return i
  }
  return -1
}

function lotesDeMapa(mapa: Map<string, number>, mapaFechas: Map<string, string>): LoteParsed[] {
  return Array.from(mapa.entries()).map(([codigo, cantidad]) => ({
    codigo, cantidad,
    fechaEmbarrilado: mapaFechas.get(normalizarLote(codigo)) ?? null,
  }))
}

function parseBarriles(filas: Fila[], inicio: number, mapaFechas: Map<string, string>): StockProductoParsed[] {
  const productos: StockProductoParsed[] = []
  let actual: { producto: string; codigo: string | null; barriles: number; litros: number; lotes: Map<string, number> } | null = null

  for (let i = inicio + 1; i < filas.length; i++) {
    const f = filas[i]
    if (f[0] != null && String(f[0]).trim() !== '') break // siguiente cámara/sección

    if (f[2] != null && String(f[2]).trim() !== '') {
      if (actual) productos.push({
        tipo: 'barril', producto: actual.producto, codigoProducto: actual.codigo,
        categoria: categoriaDe(actual.producto), cantidad: actual.barriles, litros: actual.litros,
        lotes: lotesDeMapa(actual.lotes, mapaFechas),
      })
      actual = { producto: String(f[2]).trim(), codigo: f[3] != null ? String(f[3]).trim() : null, barriles: 0, litros: 0, lotes: new Map() }
    } else if (actual && f[5] != null && String(f[5]).trim() !== '') {
      actual.barriles += 1
      actual.litros += Number(f[7]) || 0
      const lote = f[6] != null ? String(f[6]).trim() : 'Sin lote'
      actual.lotes.set(lote, (actual.lotes.get(lote) ?? 0) + 1)
    }
  }
  if (actual) productos.push({
    tipo: 'barril', producto: actual.producto, codigoProducto: actual.codigo,
    categoria: categoriaDe(actual.producto), cantidad: actual.barriles, litros: actual.litros,
    lotes: lotesDeMapa(actual.lotes, mapaFechas),
  })
  return productos
}

function parseEnvases(filas: Fila[], inicio: number, mapaFechas: Map<string, string>): StockProductoParsed[] {
  const productos: StockProductoParsed[] = []
  let actual: { producto: string; codigo: string | null; unidades: number; lotes: Map<string, number> } | null = null

  for (let i = inicio + 1; i < filas.length; i++) {
    const f = filas[i]
    if (f[0] != null && String(f[0]).trim() !== '') break

    if (f[1] != null && String(f[1]).trim() !== '') {
      if (actual) productos.push({
        tipo: 'envase', producto: actual.producto, codigoProducto: actual.codigo,
        categoria: categoriaDe(actual.producto), cantidad: actual.unidades, litros: null,
        lotes: lotesDeMapa(actual.lotes, mapaFechas),
      })
      actual = { producto: String(f[1]).trim(), codigo: f[2] != null ? String(f[2]).trim() : null, unidades: 0, lotes: new Map() }
    } else if (actual && f[5] != null && f[6] != null) {
      const cant = Number(f[6]) || 0
      actual.unidades += cant
      const lote = String(f[5]).trim()
      actual.lotes.set(lote, (actual.lotes.get(lote) ?? 0) + cant)
    }
  }
  if (actual) productos.push({
    tipo: 'envase', producto: actual.producto, codigoProducto: actual.codigo,
    categoria: categoriaDe(actual.producto), cantidad: actual.unidades, litros: null,
    lotes: lotesDeMapa(actual.lotes, mapaFechas),
  })
  return productos
}

export function parseStockExcel(buffer: ArrayBuffer): StockProductoParsed[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as Fila[]

  const idxSeccionBarriles = buscarFila(filas, SECCION_BARRILES, 0)
  const idxSeccionEnvases = buscarFila(filas, SECCION_ENVASES, idxSeccionBarriles >= 0 ? idxSeccionBarriles + 1 : 0)

  if (idxSeccionBarriles < 0 || idxSeccionEnvases < 0) {
    throw new Error('No se encontraron las secciones "Barriles en Depósitos" / "Envases en Depósitos" en el archivo — ¿es el informe de stock correcto?')
  }

  // Fecha de embarrilado por lote: vive en el listado plano previo a
  // "Barriles en Depósitos", no en las secciones por cámara. Si el informe
  // cambia de formato y no aparece, seguimos sin fecha (no bloquea la carga).
  const idxStockBarrilesPlano = buscarFila(filas, SECCION_STOCK_BARRILES_PLANO, 0)
  const mapaFechas = idxStockBarrilesPlano >= 0
    ? construirMapaFechasPorLote(filas, idxStockBarrilesPlano, idxSeccionBarriles)
    : new Map<string, string>()

  const idxCamaraBarril = buscarFila(filas, CAMARA_OBJETIVO, idxSeccionBarriles + 1)
  const idxCamaraEnvase = buscarFila(filas, CAMARA_OBJETIVO, idxSeccionEnvases + 1)

  if (idxCamaraBarril < 0 || idxCamaraBarril >= idxSeccionEnvases) {
    throw new Error('No se encontró "Camara General Barrios Bajos" dentro de la sección de Barriles.')
  }
  if (idxCamaraEnvase < 0) {
    throw new Error('No se encontró "Camara General Barrios Bajos" dentro de la sección de Envases.')
  }

  return [
    ...parseBarriles(filas, idxCamaraBarril, mapaFechas),
    ...parseEnvases(filas, idxCamaraEnvase, mapaFechas),
  ]
}
