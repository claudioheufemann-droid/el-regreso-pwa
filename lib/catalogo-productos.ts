/**
 * lib/catalogo-productos.ts — Catálogo estático de productos con precio real
 * (fuente única). Antes vivía duplicado dentro de NuevaVisitaClient.tsx; se
 * extrajo para que Cotizaciones (y cualquier otro módulo) use los mismos
 * precios sin repetir la lista.
 *
 * Solo cubre los productos que YA tienen precio de venta a público cargado.
 * Precios bruto (con IVA y, en cerveza, ILA incluidos) tomados de la
 * planilla oficial "costos y precios.xlsx" (cargada 2026-08-12) — la misma
 * fuente que alimenta costo_neto/precio_neto en el módulo Rentabilidad
 * (lib/rentabilidad.ts, tabla costos_precios). Los 10 productos agregados
 * ahí (Ámbar Lager, Barley Wine, Carrot Cake Stout, Cucumbeer Sour, Del
 * Caribe Sour, Doble Hazy IPA, Doble IPA, Helles Colab, Imperial Stout, Red
 * IPA) todavía no tienen copy de marketing oficial — las descripciones acá
 * son genéricas por estilo, a revisar antes de tratarlas como definitivas.
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
  /** codigo_producto real, para cruzar contra stock_productos (Cotizaciones). '' = sin código conocido, no se cruza con stock. */
  codigo: string
}

export type Zona = 'valdivia' | 'santiago'

export const CATALOGO_INFO_DEFAULT: Record<string, CatalogoInfo> = {
  'Nitro Coffee':                { codigo: '',     estilo: 'Nitro Cold Brew',           precio_lata: 0,    precio_barril: 120000, envase_ml: 470, descripcion: 'Cold brew de café con nitrógeno. Cremoso, suave y con notas a chocolate y avellana.' },
  'Arboretum':                   { codigo: 'C-1',  estilo: 'Kölsch',                   precio_lata: 2100, precio_barril: 83000,  envase_ml: 470, descripcion: 'Color amarillo pajizo, aromas a grano y pan con notas florales. Super ligera y fácil de beber.' },
  'Mocho English':               { codigo: 'C-8',  estilo: 'English Red Ale',          precio_lata: 2100, precio_barril: 83000,  envase_ml: 470, abv: '5.5%', ibu: '25', descripcion: 'Rojizo brillante con aromas a galleta, almendras y caramelo. Retrogusto semi dulce y tostado.' },
  'La Barra APA':                { codigo: 'C-2',  estilo: 'American Pale Ale',        precio_lata: 2250, precio_barril: 90000,  envase_ml: 470, descripcion: 'Dorado intenso y cítrico con lúpulos Citra y Cascade. Amargor medio y final seco.' },
  'Fisura':                      { codigo: 'C-9',  estilo: 'Robust Porter',            precio_lata: 2250, precio_barril: 90000,  envase_ml: 470, descripcion: 'Negro intenso, notas a chocolate amargo, cacao y café. Cuerpo medio-alto con avena.' },
  'Descenso West Coast IPA':     { codigo: 'C-4',  estilo: 'West Coast IPA',           precio_lata: 2750, precio_barril: 110000, envase_ml: 470, abv: '6.5%', descripcion: 'Aromas resinosos a pino, mentol y pomelo. Sabor intenso con amargor potente.' },
  'Aguas Blancas':               { codigo: 'C-5',  estilo: 'Hazy IPA',                 precio_lata: 3000, precio_barril: 125000, envase_ml: 470, abv: '5.5%', ibu: '25', descripcion: 'Turbia y tropical con Centennial, Mosaic y Citra. Notas a durazno, mango y maracuyá.' },
  'Kombucha Berry Menta':        { codigo: 'K-4',  estilo: 'Kombucha · Té Negro',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media',      descripcion: 'Frambuesa y menta fresca. Equilibrio perfecto entre dulzor y acidez.' },
  'Kombucha Lemon':              { codigo: 'K-2',  estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media-alta', descripcion: 'Limón, jengibre y cilantro. Cítrica, especiada y muy refrescante.' },
  'Kombucha Maqui':              { codigo: 'K-6',  estilo: 'Kombucha · Té Verde+Negro',precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Medio', acidez: 'Media',      descripcion: 'Maqui, mora y lúpulos nobles. Frutal y terroso con toque herbal. Color púrpura.' },
  'Kombucha Maracuyá Cardamomo': { codigo: 'K-10', estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Alto',  acidez: 'Baja',       descripcion: 'Maracuyá tropical con cardamomo verde. Dulce, aromático y floral.' },
  'Kombucha Detox':              { codigo: 'K-22', estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Bajo',  acidez: 'Media-alta', descripcion: 'Arándano, manzanilla e hinojo. Fresco, limpio y con propiedades diuréticas.' },
  'Kombucha Natural':            { codigo: 'K-1',  estilo: 'Kombucha · Té Verde',      precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, dulzor: 'Bajo',  acidez: 'Media-alta', descripcion: 'Esencia pura de fermentación. Notas a pera y florales. Para puristas.' },
  'Kombucha Mango':              { codigo: 'K-11', estilo: 'Kombucha',                  precio_lata: 1500, precio_barril: 75000,  envase_ml: 355, descripcion: 'Kombucha de mango con toque de merkén. Dulce y tropical.' },

  // Agregadas 2026-08-12 desde "costos y precios.xlsx" — sin código de marca
  // propio todavía, se identifican por estilo. precio_barril: 0 = no se
  // vende en barril (planilla marca "-" para esos formatos).
  'Ámbar Lager':                 { codigo: 'C-30', estilo: 'Vienna Lager',              precio_lata: 2250, precio_barril: 0,      envase_ml: 470, descripcion: 'Vienna Lager ámbar, cuerpo suave y maltoso con final limpio.' },
  'Barley Wine':                 { codigo: 'C-13', estilo: 'Barley Wine',               precio_lata: 2700, precio_barril: 0,      envase_ml: 470, descripcion: 'Cuerpo denso y alta graduación, notas a caramelo y fruta madura. Estilo de guarda.' },
  'Carrot Cake Stout':           { codigo: 'ROT-2',estilo: 'Stout',                     precio_lata: 2700, precio_barril: 115000, envase_ml: 470, descripcion: 'Stout oscura inspirada en el carrot cake: canela, nuez y caramelo especiado.' },
  'Cucumbeer Sour':              { codigo: '',     estilo: 'Sour',                      precio_lata: 2500, precio_barril: 0,      envase_ml: 470, descripcion: 'Sour refrescante con pepino. Ácida, ligera y muy fácil de tomar.' },
  'Del Caribe Sour':             { codigo: 'C-27', estilo: 'Sour',                      precio_lata: 2500, precio_barril: 0,      envase_ml: 470, descripcion: 'Sour tropical con frutas del Caribe. Ácida, jugosa y refrescante.' },
  'Doble Hazy IPA':              { codigo: 'C-24', estilo: 'Double Hazy IPA',           precio_lata: 3200, precio_barril: 145000, envase_ml: 470, descripcion: 'Hazy IPA doble, turbia e intensa en lúpulo tropical. Cuerpo pleno y alto ABV.' },
  'Doble IPA':                   { codigo: 'C-26', estilo: 'Double IPA',                precio_lata: 3100, precio_barril: 135000, envase_ml: 470, descripcion: 'Doble IPA de amargor y aroma potentes, cuerpo firme y alta graduación.' },
  'Helles Colab':                { codigo: 'C-16', estilo: 'Doppelbock',                precio_lata: 2250, precio_barril: 0,      envase_ml: 470, descripcion: 'Doppelbock de colaboración, maltosa y de cuerpo firme.' },
  'Imperial Stout':              { codigo: 'C-6',  estilo: 'Imperial Stout',            precio_lata: 2600, precio_barril: 125000, envase_ml: 470, descripcion: 'Imperial Stout oscura y densa, notas a café tostado y chocolate amargo.' },
  'Red IPA':                     { codigo: 'C-11', estilo: 'Red IPA',                   precio_lata: 2750, precio_barril: 110000, envase_ml: 470, descripcion: 'Red IPA de cuerpo rojizo, equilibrio entre malta caramelo y lúpulo resinoso.' },
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

export function esKombucha(info: CatalogoInfo): boolean {
  return info.estilo.toLowerCase().includes('kombucha')
}

/** Stock disponible por código de producto, cruzado desde stock_productos. */
export type StockPorCodigo = Record<string, { barril: number; envase: number }>

