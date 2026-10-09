/**
 * Sincronización Gantt de Google Sheets → plan_produccion (desde 9-oct-2026).
 *
 * La planilla "Gantt Produccion" sigue siendo donde Producción arma el plan;
 * la app la refleja. Un Apps Script dentro de la planilla
 * (scripts/gantt-sheets/sincronizar.gs) lee cada barra —un rango combinado en
 * la fila de un tanque, con un texto tipo "BERRY 2000 L"— y la manda a
 * POST /api/produccion/gantt-sheets como { tanque, inicio, fin, texto }.
 *
 * Reglas (decididas con el usuario):
 * - Manda el Sheets: cada lote del Sheets queda identificado por
 *   `clave_externa` = sheets:<tanque>:<inicio>. Si la barra se mueve o se
 *   borra, el lote 'planificado' que la reflejaba se borra.
 * - Lo real manda sobre el Sheets: lotes en curso o completados no se tocan,
 *   y una barra que choca con un lote en curso del mismo tanque se omite.
 * - Barras que ya terminaron antes de hoy no se suben (son historia).
 * - Productos sin receta (cervezas de El Growler, Mango…) se suben igual con
 *   su nombre del Sheets: ocupan el tanque, pero no cruzan con forecast.
 */

export interface BarraSheets {
  tanque: string
  /** YYYY-MM-DD, primer día de la barra */
  inicio: string
  /** YYYY-MM-DD, último día de la barra (inclusive) */
  fin: string
  texto: string
}

export interface FermentadorRef {
  nombre: string
  capacidad_litros: number
  categoria: string | null
}

export interface LoteEnCurso {
  fermentador: string | null
  fecha_inicio: string
  dias: number
}

export interface LoteSheets {
  clave_externa: string
  producto: string
  categoria: 'cerveza' | 'kombucha'
  litros_planificados: number
  fecha_planificada: string
  dias_ocupacion: number
  fermentador: string
  texto: string
}

export interface BarraOmitida {
  tanque: string
  inicio: string
  texto: string
  motivo: string
}

/** Nombre corto del Sheets → producto del catálogo. La clave va normalizada
 *  (minúsculas, sin tildes). Lo que no está acá se sube con su nombre. */
const ALIAS_PRODUCTO: Record<string, string> = {
  berry: 'Kombucha Berry Menta',
  'berry menta': 'Kombucha Berry Menta',
  lemon: 'Kombucha Lemon',
  maracuya: 'Kombucha Maracuyá Cardamomo',
  maqui: 'Kombucha Maqui',
  detox: 'Kombucha Detox',
  lupulada: 'Kombucha Lupulada',
  pina: 'Kombucha Experimental Piña Albahaca',
  'pina albahaca': 'Kombucha Experimental Piña Albahaca',
  mango: 'Kombucha Mango',
  natural: 'Kombucha Natural',
  'por definir': 'Por definir',
}

export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tipoTitulo(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
}

/** "BERRY 2000 L" → { producto: 'Kombucha Berry Menta', litros: 2000 }.
 *  "PIÑA1200 L" (sin espacio) también funciona. */
export function interpretarTexto(texto: string): { producto: string; litros: number | null } {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  const m = limpio.match(/(\d[\d.]*)\s*l(?:ts?|itros)?\.?\s*$/i)
  const litros = m ? Number(m[1].replace(/\./g, '')) : null
  const nombre = (m ? limpio.slice(0, m.index) : limpio).trim()
  const alias = ALIAS_PRODUCTO[normalizarTexto(nombre)]
  return { producto: alias ?? tipoTitulo(nombre), litros: litros && litros > 0 ? litros : null }
}

const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

function sumarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}

/** Convierte las barras del Sheets en lotes listos para plan_produccion. */
export function construirLotes(
  barras: BarraSheets[],
  fermentadores: FermentadorRef[],
  enCurso: LoteEnCurso[],
  hoy: string,
): { lotes: LoteSheets[]; omitidas: BarraOmitida[] } {
  const porNombre = new Map(fermentadores.map(f => [normalizarTexto(f.nombre), f]))
  const lotes: LoteSheets[] = []
  const omitidas: BarraOmitida[] = []
  const claves = new Set<string>()

  for (const b of barras) {
    const texto = (b.texto ?? '').trim()
    const omitir = (motivo: string) => omitidas.push({ tanque: b.tanque, inicio: b.inicio, texto, motivo })

    if (!texto) { omitir('barra sin texto'); continue }
    if (!esFecha(b.inicio) || !esFecha(b.fin) || b.fin < b.inicio) { omitir('fechas inválidas'); continue }
    const f = porNombre.get(normalizarTexto(b.tanque))
    if (!f) { omitir('tanque desconocido'); continue }
    if (b.fin < hoy) continue // ya terminó: es historia, no plan

    const dias = diasEntre(b.inicio, b.fin) + 1
    if (dias > 120) { omitir('más de 120 días'); continue }

    const choque = enCurso.find(l =>
      l.fermentador && normalizarTexto(l.fermentador) === normalizarTexto(f.nombre)
      && l.fecha_inicio <= b.fin && sumarDias(l.fecha_inicio, l.dias - 1) >= b.inicio)
    if (choque) { omitir(`choca con un lote en curso desde ${choque.fecha_inicio}`); continue }

    const clave = `sheets:${f.nombre}:${b.inicio}`
    if (claves.has(clave)) { omitir('barra duplicada'); continue }
    claves.add(clave)

    const { producto, litros } = interpretarTexto(texto)
    lotes.push({
      clave_externa: clave,
      producto,
      categoria: f.categoria === 'kombucha' ? 'kombucha' : 'cerveza',
      litros_planificados: litros ?? Number(f.capacidad_litros),
      fecha_planificada: b.inicio,
      dias_ocupacion: dias,
      fermentador: f.nombre,
      texto,
    })
  }
  return { lotes, omitidas }
}
