export type Vendedor = 'Vendedor 1'

// Nombre display unificado
export const VENDEDORES: Vendedor[] = ['Vendedor 1']

// Nombres reales en la BD (para queries a ventas)
export const VENDEDORES_DB = ['Javier Badilla', 'Carlos Urrejola'] as const

// Mapeo BD → display
export const VENDEDOR_DISPLAY: Record<string, string> = {
  'Javier Badilla':  'Vendedor 1',
  'Carlos Urrejola': 'Vendedor 1',
}

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
