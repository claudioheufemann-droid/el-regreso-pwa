export type Vendedor = 'Javier Badilla' | 'Charly Urrejola'

export const VENDEDORES: Vendedor[] = ['Javier Badilla', 'Charly Urrejola']

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

export const ADMINS = ['benja.alarcon@elregresobeer.com', 'claudio.heufemann@elregresobeer.com']

export const CLIENTES_EXCLUIR = ['Cliente Ventas (Javier)', 'Cliente Ventas (Charly)', 'Cliente PDV', 'Cliente Merma PDV']

export interface Venta {
  id: number
  fecha_entrega: string
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
