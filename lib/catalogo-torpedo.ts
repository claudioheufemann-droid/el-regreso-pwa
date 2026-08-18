export interface ProductoTorpedo {
  nombre: string
  estilo: string
  marca: 'cerveza' | 'kombucha'
  abv?: number
  ibu?: number
  descripcion: string
  notas: string[]
  maridaje?: string
  premiado?: boolean
  acento: string
}

export const CATALOGO: Record<string, ProductoTorpedo> = {
  'arboretum': {
    nombre: 'Arboretum', estilo: 'Kölsch', marca: 'cerveza', abv: 4.8, ibu: 17,
    descripcion: 'Cerveza ligera de origen alemán. Notas florales y frutales, muy refrescante.',
    notas: ['Floral', 'Frutal', 'Ligera', 'Refrescante'],
    maridaje: 'Ensaladas, pastas suaves, quesos frescos',
    premiado: true, acento: '#EAD45A',
  },
  'mocho': {
    nombre: 'Mocho', estilo: 'English Red Ale', marca: 'cerveza', abv: 5.5, ibu: 25,
    descripcion: 'Color rojizo, aromas a galleta, almendras y caramelo. Cuerpo equilibrado.',
    notas: ['Galleta', 'Almendras', 'Caramelo', 'Cuerpo medio'],
    maridaje: 'Carnes rojas, quesos maduros, embutidos',
    premiado: true, acento: '#C0392B',
  },
  'la barra': {
    nombre: 'La Barra', estilo: 'American Pale Ale', marca: 'cerveza', abv: 5.5, ibu: 40,
    descripcion: 'Potente carácter cítrico y frutal con Citra y Cascade, final seco y limpio.',
    notas: ['Cítrico', 'Frutal', 'Citra', 'Final seco'],
    maridaje: 'Hamburguesas, pollo a la parrilla, pizza',
    premiado: true, acento: '#F5A623',
  },
  'fisura': {
    nombre: 'Fisura', estilo: 'Robust Porter', marca: 'cerveza', abv: 6.0, ibu: 40,
    descripcion: 'Cuerpo medio-alto con avena. Notas prominentes de chocolate amargo, cacao y café.',
    notas: ['Chocolate amargo', 'Cacao', 'Café', 'Avena'],
    maridaje: 'Postres de chocolate, carnes estofadas, quesos azules',
    premiado: true, acento: '#5D2E0C',
  },
  'descenso': {
    nombre: 'Descenso', estilo: 'West Coast IPA', marca: 'cerveza', abv: 6.5, ibu: 60,
    descripcion: 'Intenso amargor con notas resinosas, pino y pomelo. Para paladares exigentes.',
    notas: ['Resinoso', 'Pino', 'Pomelo', 'Amargor intenso'],
    maridaje: 'Sushi, mariscos, quesos intensos, ceviche',
    premiado: true, acento: '#7CB518',
  },
  'aguas blancas': {
    nombre: 'Aguas Blancas', estilo: 'Hazy IPA', marca: 'cerveza', abv: 5.5, ibu: 25,
    descripcion: 'Turbia y jugosa, explosión tropical de durazno y mango. Centennial, Mosaic y Citra.',
    notas: ['Durazno', 'Mango', 'Tropical', 'Jugosa'],
    maridaje: 'Comida asiática, tacos de mariscos, quesos frescos',
    premiado: true, acento: '#FF8C00',
  },
  'berry menta': {
    nombre: 'Berry Menta', estilo: 'Kombucha – Té Negro', marca: 'kombucha',
    descripcion: 'Base de té negro con frambuesa y menta fresca. Dulzor medio, acidez equilibrada.',
    notas: ['Frambuesa', 'Menta', 'Refrescante', 'Té negro'],
    maridaje: 'Postres frutales, ensaladas de verano',
    premiado: true, acento: '#E91E63',
  },
  'lemon fresh': {
    nombre: 'Lemon Fresh', estilo: 'Kombucha – Té Verde', marca: 'kombucha',
    descripcion: 'Té verde con limón, jengibre y semilla de cilantro. Energizante y refrescante.',
    notas: ['Limón', 'Jengibre', 'Cilantro', 'Energizante'],
    maridaje: 'Brunch, platos mediterráneos, mariscos',
    acento: '#C6C93D',
  },
  'maqui hops': {
    nombre: 'Maqui Hops', estilo: 'Kombucha – Té Verde/Negro', marca: 'kombucha',
    descripcion: 'Té verde y negro con maqui, mora y lúpulos nobles. Único puente entre cerveza y kombucha.',
    notas: ['Maqui', 'Mora', 'Lúpulos nobles', 'Berries'],
    maridaje: 'Tablas de quesos, charcutería, carnes blancas',
    premiado: true, acento: '#7B1FA2',
  },
  'maracuyá cardamomo': {
    nombre: 'Maracuyá Cardamomo', estilo: 'Kombucha – Té Verde', marca: 'kombucha',
    descripcion: 'Té verde con maracuyá y un toque de cardamomo verde. Sabor tropical exótico.',
    notas: ['Maracuyá', 'Cardamomo', 'Tropical', 'Dulce'],
    maridaje: 'Cocina asiática, ceviche, postres tropicales',
    acento: '#FF9800',
  },
  'detox': {
    nombre: 'Detox', estilo: 'Kombucha – Té Verde', marca: 'kombucha',
    descripcion: 'Té verde con arándano, manzanilla e hinojo. Propiedades diuréticas y depurativas.',
    notas: ['Arándano', 'Manzanilla', 'Hinojo', 'Funcional'],
    maridaje: 'Snacks saludables, brunches, ayuno intermitente',
    premiado: true, acento: '#1565C0',
  },
  'natural': {
    nombre: 'Natural', estilo: 'Kombucha – Té Verde', marca: 'kombucha',
    descripcion: 'Fermentación pura de té verde, notas sutiles a pera. Dulzor leve, acidez viva.',
    notas: ['Pera', 'Té verde', 'Fermentado', 'Puro'],
    maridaje: 'Todo tipo de platos, aperitivo, digestivo',
    premiado: true, acento: '#81C784',
  },
}

export function buscarTorpedo(nombreProducto: string): ProductoTorpedo | null {
  if (!nombreProducto) return null
  const n = nombreProducto.toLowerCase().trim()
  for (const [key, prod] of Object.entries(CATALOGO)) {
    if (n.includes(key) || key.includes(n.split(' ')[0]!)) return prod
  }
  return null
}
