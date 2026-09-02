/**
 * lib/producto-imagenes.ts — Fuente ÚNICA de las fotos de producto.
 *
 * Antes este mapa vivía copiado en cinco archivos (DeclararClient,
 * piezas.tsx, RentabilidadClient, StockClient, VentasHoyClient), con dos
 * criterios distintos de llave (por nombre y por código) y sin ninguna
 * garantía de que las cinco copias coincidieran. VentasHoyClient además
 * caía en un fallback equivocado: le ponía la foto de "Mocho English" a
 * CUALQUIER cerveza sin foto propia, o sea mostraba un producto por otro.
 *
 * Reglas:
 *  - Una sola tabla, indexada por nombre; los códigos apuntan al mismo
 *    archivo (no se duplican rutas).
 *  - Si un producto no tiene foto, se devuelve `null`. NUNCA la foto de
 *    otro producto: preferimos un marcador neutro (ver ProductImage) antes
 *    que mentirle al vendedor sobre qué está mirando.
 *
 * Productos sin fotografía al 2026-09-02 — pendiente de sesión de fotos:
 * Ámbar Lager, Cucumbeer Sour, Del Caribe Sour, Doble Hazy IPA,
 * Helles Colab, Imperial Stout.
 * (Nitro Coffee ya tiene foto por nombre, pero no aparece hoy en el ERP —
 * sin código conocido para mapear por codigo_producto.)
 */

/** Foto genérica de barril — el envase es el mismo sin importar el sabor. */
export const IMAGEN_BARRIL = '/productos/cerveza/barril.webp'

/** nombre de producto → ruta de la foto. */
export const IMAGEN_POR_NOMBRE: Record<string, string> = {
  'Arboretum':                   '/productos/cerveza/arboretum.webp',
  'Mocho English':               '/productos/cerveza/mocho.webp',
  'La Barra APA':                '/productos/cerveza/la-barra.webp',
  'Fisura':                      '/productos/cerveza/fisura.webp',
  'Descenso West Coast IPA':     '/productos/cerveza/descenso.webp',
  'Aguas Blancas':               '/productos/cerveza/aguas-blancas.webp',
  'Kombucha Berry Menta':        '/productos/kombucha/berry-menta.webp',
  'Kombucha Detox':              '/productos/kombucha/detox.webp',
  'Kombucha Lemon':              '/productos/kombucha/lemon-fresh.webp',
  'Kombucha Mango':              '/productos/kombucha/mango-merken.webp',
  'Kombucha Maqui':              '/productos/kombucha/maqui-hops.webp',
  'Kombucha Maracuyá Cardamomo': '/productos/kombucha/maracuya-cardamomo.webp',
  'Kombucha Natural':            '/productos/kombucha/natural.webp',
  'Kombucha Lupulada':           '/productos/kombucha/lupulada.webp',
  'Doble IPA':                   '/productos/cerveza/doble-ipa.webp',
  'Red IPA':                     '/productos/cerveza/red-ipa.webp',
  'Barley Wine':                 '/productos/cerveza/barley-wine.webp',
  'Carrot Cake Stout':           '/productos/cerveza/carrot-cake-stout.webp',
  'Nitro Coffee':                '/productos/cerveza/nitro-coffee.webp',
}

/** codigo_producto del ERP → el mismo archivo del mapa por nombre. */
export const IMAGEN_POR_CODIGO: Record<string, string> = {
  'C-1':  IMAGEN_POR_NOMBRE['Arboretum'],
  'C-2':  IMAGEN_POR_NOMBRE['La Barra APA'],
  'C-4':  IMAGEN_POR_NOMBRE['Descenso West Coast IPA'],
  'C-5':  IMAGEN_POR_NOMBRE['Aguas Blancas'],
  'C-8':  IMAGEN_POR_NOMBRE['Mocho English'],
  'C-9':  IMAGEN_POR_NOMBRE['Fisura'],
  'K-1':  IMAGEN_POR_NOMBRE['Kombucha Natural'],
  'K-2':  IMAGEN_POR_NOMBRE['Kombucha Lemon'],
  'K-4':  IMAGEN_POR_NOMBRE['Kombucha Berry Menta'],
  'K-6':  IMAGEN_POR_NOMBRE['Kombucha Maqui'],
  'K-10': IMAGEN_POR_NOMBRE['Kombucha Maracuyá Cardamomo'],
  'K-11': IMAGEN_POR_NOMBRE['Kombucha Mango'],
  'K-22': IMAGEN_POR_NOMBRE['Kombucha Detox'],
  'C-26': IMAGEN_POR_NOMBRE['Doble IPA'],
  'C-11': IMAGEN_POR_NOMBRE['Red IPA'],
  'K-30': IMAGEN_POR_NOMBRE['Kombucha Lupulada'],
  'C-13': IMAGEN_POR_NOMBRE['Barley Wine'],
  'ROT-2': IMAGEN_POR_NOMBRE['Carrot Cake Stout'],
}

/**
 * Resuelve la foto de un producto. Devuelve `null` cuando no hay foto propia
 * — quien la use debe dibujar un marcador, no sustituirla por otra foto.
 */
export function imagenProducto(opts: {
  nombre?: string | null
  codigo?: string | null
  esBarril?: boolean
}): string | null {
  if (opts.esBarril) return IMAGEN_BARRIL
  if (opts.codigo && IMAGEN_POR_CODIGO[opts.codigo]) return IMAGEN_POR_CODIGO[opts.codigo]
  if (opts.nombre && IMAGEN_POR_NOMBRE[opts.nombre]) return IMAGEN_POR_NOMBRE[opts.nombre]
  return null
}

export type CategoriaProducto = 'cerveza' | 'kombucha' | 'otro'

/** Normaliza las mil formas en que llega la categoría desde el ERP y la UI. */
export function categoriaProducto(raw?: string | null, nombre?: string | null): CategoriaProducto {
  const s = `${raw ?? ''} ${nombre ?? ''}`.toLowerCase()
  if (s.includes('kombucha')) return 'kombucha'
  if (s.includes('cerveza') || s.includes('ipa') || s.includes('stout') || s.includes('lager') || s.includes('ale')) return 'cerveza'
  return 'otro'
}
