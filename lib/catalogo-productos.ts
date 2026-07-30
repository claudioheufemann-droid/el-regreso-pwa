/**
 * lib/catalogo-productos.ts — Catálogo estático de productos con precio real
 * (fuente única). Antes vivía duplicado dentro de NuevaVisitaClient.tsx; se
 * extrajo para que Cotizaciones (y cualquier otro módulo) use los mismos
 * precios sin repetir la lista.
 *
 * Solo cubre los productos que YA tienen precio de venta a público cargado —
 * el resto del catálogo (Doble IPA, Red IPA, Helles Colab, etc.) todavía no
 * tiene lista de precios y no debe aparecer aquí hasta que se cargue.
 */

export interface CatalogoInfo {
  estilo: string
  precio_lata: number
  precio_barril: number
  descripcion: string
  abv?: string
  ibu?: string
  dulzor?: string
  acidez?: string
  envase_ml: number
}

export type Zona = 'valdivia' | 'santiago'

export const CATALOGO_INFO_DEFAULT: Record<string, CatalogoInfo> = {
  'Nitro Coffee':                { estilo: 'Nitro Cold Brew',           precio_lata: 0,    precio_barril: 120000, envase_ml: 470, descripcion: 'Cold brew de café con nitrógeno. Cremoso, suave y con notas a chocolate y avellana.' },
  'Arboretum':                   { estilo: 'Kölsch',                   precio_lata: 2100, precio_barril: 83000,  envase_ml: 470, descripcion: 'Color amarillo pajizo, aromas a grano y pan con notas florales. Super ligera y fácil de beber.' },
  'Mocho English':               { estilo: 'English Red Ale',          precio_lata: 2100, precio_barril: 83000,  envase_ml: 470, abv: '5.5%', ibu: '25', descripcion: 'Rojizo brillante con aromas a galleta, almendras y caramelo. Retrogusto semi dulce y tostado.' },
  'La Barra APA':                { estilo: 'American Pale Ale',        precio_lata: 2250, precio_barril: 90000,  envase_ml: 470, descripcion: 'Dorado intenso y cítrico con lúpulos Citra y Cascade. Amargor medio y final seco.' },
  'Fisura':                      { estilo: 'Robust Porter',            precio_lata: 2250, precio_barril: 90000,  envase_ml: 470, descripcion: 'Negro intenso, notas a chocolate amargo, cacao y café. Cuerpo medio-alto con avena.' },
  'Descenso West Coast IPA':     { estilo: 'West Coast IPA',           precio_lata: 2750, precio_barril: 110000, envase_ml: 470, abv: '6.5%', descripcion: 'Aromas resinosos a pino, mentol y pomelo. Sabor intenso con amargor potente.' },
  'Aguas Blancas':               { estilo: 'Hazy IPA',                 precio_lata: 3000, precio_barril: 125000, envase_ml: 470, abv: '5.5%', ibu: '25', descripcion: 'Turbia y tropical con Centennial, Mosaic y Citra. Notas a durazno, mango y maracuyá.' },
  'Kombucha Berry Menta':        { estilo: 'Kombucha · Té Negro',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media',      descripcion: 'Frambuesa y menta fresca. Equilibrio perfecto entre dulzor y acidez.' },
  'Kombucha Lemon':              { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media-alta', descripcion: 'Limón, jengibre y cilantro. Cítrica, especiada y muy refrescante.' },
  'Kombucha Maqui':              { estilo: 'Kombucha · Té Verde+Negro',precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media',      descripcion: 'Maqui, mora y lúpulos nobles. Frutal y terroso con toque herbal. Color púrpura.' },
  'Kombucha Maracuyá Cardamomo': { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Alto',  acidez: 'Baja',       descripcion: 'Maracuyá tropical con cardamomo verde. Dulce, aromático y floral.' },
  'Kombucha Detox':              { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Bajo',  acidez: 'Media-alta', descripcion: 'Arándano, manzanilla e hinojo. Fresco, limpio y con propiedades diuréticas.' },
  'Kombucha Natural':            { estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Bajo',  acidez: 'Media-alta', descripcion: 'Esencia pura de fermentación. Notas a pera y florales. Para puristas.' },
  'Kombucha Mango':              { estilo: 'Kombucha',                  precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, descripcion: 'Kombucha de mango con toque de merkén. Dulce y tropical.' },
}

// Precios Santiago — solo sobreescribe precio_lata/precio_barril; el resto
// de los datos del producto se heredan del catálogo default (Valdivia).
export const CATALOGO_PRECIOS_SANTIAGO: Record<string, Pick<CatalogoInfo, 'precio_lata' | 'precio_barril'>> = {
  'Arboretum':                   { precio_lata: 2300, precio_barril: 98000 },
  'Mocho English':               { precio_lata: 2300, precio_barril: 98000 },
  'Fisura':                      { precio_lata: 2450, precio_barril: 105000 },
  'La Barra APA':                { precio_lata: 2450, precio_barril: 105000 },
  'Descenso West Coast IPA':     { precio_lata: 2950, precio_barril: 125000 },
  'Aguas Blancas':               { precio_lata: 3200, precio_barril: 140000 },
  'Kombucha Berry Menta':        { precio_lata: 1625, precio_barril: 90000 },
  'Kombucha Detox':              { precio_lata: 1625, precio_barril: 90000 },
  'Kombucha Lemon':              { precio_lata: 1625, precio_barril: 90000 },
  'Kombucha Mango':              { precio_lata: 1625, precio_barril: 90000 },
  'Kombucha Maqui':              { precio_lata: 1625, precio_barril: 90000 },
  'Kombucha Maracuyá Cardamomo': { precio_lata: 1625, precio_barril: 90000 },
  'Kombucha Natural':            { precio_lata: 1625, precio_barril: 90000 },
}

export const EMAIL_LISTA_PRECIOS_SANTIAGO = 'yadro.favijancic@elregresobeer.com'

/** Catálogo según el email del vendedor logueado (regla histórica de Nueva Visita). */
export function catalogoParaVendedor(email: string): Record<string, CatalogoInfo> {
  if (email.toLowerCase() !== EMAIL_LISTA_PRECIOS_SANTIAGO) return CATALOGO_INFO_DEFAULT
  return catalogoPorZona('santiago')
}

/** Catálogo según zona elegida manualmente (Cotizaciones). */
export function catalogoPorZona(zona: Zona): Record<string, CatalogoInfo> {
  if (zona === 'valdivia') return CATALOGO_INFO_DEFAULT
  const resultado: Record<string, CatalogoInfo> = {}
  for (const [nombre, info] of Object.entries(CATALOGO_INFO_DEFAULT)) {
    resultado[nombre] = { ...info, ...CATALOGO_PRECIOS_SANTIAGO[nombre] }
  }
  return resultado
}

export function fmtPrecioCLP(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}
