/**
 * lib/insumosParser.ts — Parseo del informe de Stock de Insumos del ERP
 * (Gestión Cervecera, https://www.gestioncervecera.com/Compra/StockInsumos,
 * botón "Exportar a excel").
 *
 * A diferencia de lib/stockParser.ts (informe jerárquico por cámara), este
 * botón exporta un LISTADO plano — una fila por insumo. Sin una muestra real
 * todavía (7-sep-2026, automatización recién conectada), el parser busca la
 * fila de encabezado por CONTENIDO (nombres de columna típicos del ERP, con
 * tolerancia a mayúsculas/acentos/espacios) en vez de por posición fija, así
 * sobrevive si el archivo no empieza exactamente en la fila 1. La ruta que
 * lo usa (/api/insumos/stock/upload) tiene modo `?preview=true` — igual que
 * /api/stock/upload — para validar el mapeo de columnas contra un archivo
 * real ANTES de escribir nada.
 */
import * as XLSX from 'xlsx'

export interface InsumoStockParsed {
  /** Nombre tal cual viene del ERP — el matching contra `insumos.nombre` se
   *  hace en la ruta que llama a este parser, no acá. */
  nombreCrudo: string
  cantidad: number
  /** Unidad tal cual la declara el ERP (kg, gr, g, l, lt, ml, un...). */
  unidadCruda: string
}

type Fila = unknown[]

function norm(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca tildes
    .toLowerCase().trim()
}

/** Alias de encabezado → qué columna es. Ampliar acá si el ERP usa otro
 *  texto — no hace falta tocar el resto del parser. */
const ALIAS_NOMBRE = ['insumo', 'producto', 'nombre', 'material', 'articulo']
const ALIAS_CANTIDAD = ['cantidad', 'stock', 'existencia', 'saldo']
const ALIAS_UNIDAD = ['unidad', 'medida', 'um', 'u.m.', 'u m']

function indiceColumna(headerRow: Fila, alias: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = norm(headerRow[i])
    if (alias.some(a => cell.includes(a))) return i
  }
  return -1
}

/**
 * Busca la fila de encabezado dentro de las primeras `maxFilasBusqueda`
 * filas: la primera que tenga a la vez una columna de nombre Y una de
 * cantidad reconocibles.
 */
function buscarEncabezado(filas: Fila[], maxFilasBusqueda = 15): { fila: number; colNombre: number; colCantidad: number; colUnidad: number } | null {
  const tope = Math.min(maxFilasBusqueda, filas.length)
  for (let i = 0; i < tope; i++) {
    const colNombre = indiceColumna(filas[i], ALIAS_NOMBRE)
    const colCantidad = indiceColumna(filas[i], ALIAS_CANTIDAD)
    if (colNombre >= 0 && colCantidad >= 0) {
      const colUnidad = indiceColumna(filas[i], ALIAS_UNIDAD)
      return { fila: i, colNombre, colCantidad, colUnidad }
    }
  }
  return null
}

export function parseInsumosExcel(buffer: ArrayBuffer): InsumoStockParsed[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as Fila[]

  const encabezado = buscarEncabezado(filas)
  if (!encabezado) {
    throw new Error(
      'No se encontró una fila de encabezado con columnas de nombre y cantidad reconocibles ' +
      '(se buscó "Insumo/Producto/Nombre" + "Cantidad/Stock/Existencia" en las primeras 15 filas). ' +
      'El formato del export puede haber cambiado — revisar lib/insumosParser.ts.'
    )
  }

  const { fila: filaEncabezado, colNombre, colCantidad, colUnidad } = encabezado
  const resultado: InsumoStockParsed[] = []

  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const f = filas[i]
    const nombreCrudo = f[colNombre]
    if (nombreCrudo == null || String(nombreCrudo).trim() === '') continue
    // Fila de total/pie de página — no es un insumo real.
    if (norm(nombreCrudo) === 'total') continue

    const cantidadRaw = f[colCantidad]
    const cantidad = Number(cantidadRaw)
    if (!Number.isFinite(cantidad)) continue

    resultado.push({
      nombreCrudo: String(nombreCrudo).trim(),
      cantidad,
      unidadCruda: colUnidad >= 0 && f[colUnidad] != null ? String(f[colUnidad]).trim() : '',
    })
  }

  return resultado
}

/** "Kg"/"kg"/"KILOS" → factor 1000 a gr; "gr"/"g"/"GRAMOS" → 1 (ya en gr);
 *  "L"/"lt"/"litros" → 1000 a ml; "ml" → 1 (ya en ml). Devuelve null si la
 *  unidad no se reconoce — mejor marcar para revisión manual que adivinar. */
export function unidadBaseDe(unidadCruda: string): { unidadBase: 'gr' | 'ml'; factor: number } | null {
  const u = norm(unidadCruda)
  if (['kg', 'kilo', 'kilos', 'kgs'].includes(u)) return { unidadBase: 'gr', factor: 1000 }
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(u)) return { unidadBase: 'gr', factor: 1 }
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return { unidadBase: 'ml', factor: 1000 }
  if (['ml', 'mls', 'mililitro', 'mililitros'].includes(u)) return { unidadBase: 'ml', factor: 1 }
  return null
}
