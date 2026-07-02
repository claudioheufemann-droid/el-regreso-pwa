// Token interno/canónico — coincide con valores reales en la BD (no tocar:
// se usa como scope de queries `.in('vendedor_actual', VENDEDORES)`).
export type Vendedor = 'Vendedor 1'

export const VENDEDORES: Vendedor[] = ['Vendedor 1']

// Histórico consolidado en BD. Las ventas pasadas se relabelaron a
// 'Equipo Ventas' (Javier/Carlos ya no trabajan acá — datos despersonalizados).
export const VENDEDORES_DB = ['Equipo Ventas'] as const

// ─── GRUPOS DE VENDEDORES ────────────────────────────────────────────────────
// Fuente única de verdad para la organización de vendedores.
// Cada clave es el NOMBRE DE DISPLAY en la app.
// Cada valor es la lista de nombres que pueden aparecer en ventas.vendedor_actual.
//
// Para activar un vendedor regional: agregar su nombre real al array de la región.
// Ejemplo cuando llegue la persona de RM:
//   'R. Metropolitana': ['Región Metropolitana', 'Juan Pérez']
//
export const VENDEDOR_GRUPOS: Record<string, string[]> = {
  'Equipo Ventas':     ['Equipo Ventas', 'Vendedor 1'],   // histórico despersonalizado
  'OnLine':            ['OnLine'],
  'R. Metropolitana':  ['Región Metropolitana'],   // ← reemplazar con nombre real cuando llegue
  'R. Araucanía':      ['Región de la Araucanía'], // ← ídem
  'R. de los Ríos':    ['Región de los Ríos'],     // ← ídem
  'R. de los Lagos':   ['Región de los Lagos'],    // ← ídem
}

// Mapeo BD → display (derivado de VENDEDOR_GRUPOS — no editar manualmente)
export const VENDEDOR_DISPLAY: Record<string, string> = Object.entries(VENDEDOR_GRUPOS)
  .flatMap(([display, dbNames]) => dbNames.map(n => [n, display] as [string, string]))
  .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, string>)

// Scope completo: todos los nombres de BD aceptados en consultas y reportes
export const VENDEDORES_SCOPE: string[] = Object.values(VENDEDOR_GRUPOS).flat()

export const CATEGORIAS_NEGOCIO = [
  'Bar',
  'Minimarket',
  'Cafetería',
  'Botillería',
  'Almacén',
  'Restaurante',
  'Supermercado',
  'Distribuidor',
  'Actividades Turísticas',
  'Cliente Directo',
  'Otros',
] as const

/**
 * Lista maestra de clientes internos a excluir de todas las vistas y cálculos.
 * FUENTE ÚNICA DE VERDAD — no duplicar en otros archivos.
 *
 * Comparación: siempre case-insensitive con esClienteExcluido().
 * Todos los strings están en minúscula para evitar variantes.
 */
export const CLIENTES_EXCLUIR = [
  // Movimientos de personal de ventas
  'cliente ventas (javier)',
  'cliente ventas (charly)',
  'cliente ventas (carlos)',
  // PDV y mermas
  'cliente pdv',
  'cliente merma pdv',
  'cliente mermas producto terminado',
  // Consumo interno / marketing
  'cliente feria',
  'cliente marketing',
  'cliente calidad reclamos',
  'cliente copas/medallas',
  'basecamp el regreso',
  'beneficios clientes',
]

/**
 * Retorna true si el nombre de cliente es interno (debe excluirse de ventas reales).
 * Usa comparación case-insensitive con cada entrada de CLIENTES_EXCLUIR.
 * Usa includes() en vez de === para capturar variantes de escritura.
 */
export function esClienteExcluido(nombre: string | null | undefined): boolean {
  if (!nombre) return false
  const n = nombre.toLowerCase().trim()
  return CLIENTES_EXCLUIR.some(ex => n.includes(ex))
}

/** Alias para compatibilidad con código existente */
export const esInterno = esClienteExcluido

export interface Venta {
  id: number
  fecha_pedido: string
  vendedor_actual: string
  nombre_fantasia: string | null
  categoria_producto: string | null
  categoria_negocio: string | null
  producto: string | null
  envase: string | null
  litros: number
  total_sin_impuesto: number
  pedido: string | null
  tipo_venta: string | null
  localidad: string | null
  provincia: string | null
}

export interface Periodo {
  id: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
}

export interface Meta {
  id: number
  periodo_id: number
  vendedor: string
  tipo: 'mensual' | 'semanal'
  semana_numero: number | null
  fecha_inicio: string
  fecha_fin: string
  categoria_negocio: string
  meta_litros: number
}

export interface ResumenVendedor {
  vendedor: string
  litros_hoy: number
  litros_periodo: number
  clientes_hoy: string[]
  por_categoria: { categoria: string; litros: number }[]
}

export interface MetaSemana {
  id: number
  periodo_id: number | null
  vendedor: string
  tipo: 'mensual' | 'semanal'
  semana_numero: number | null
  fecha_inicio: string
  fecha_fin: string
  categoria_negocio: string
  meta_litros: number
}
