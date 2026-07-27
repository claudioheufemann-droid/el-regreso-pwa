/**
 * Tipos y constantes de la vista principal de Ventas.
 *
 * Va aparte de hoyData.ts a propósito: ese módulo importa
 * lib/supabase/server, y el componente cliente necesita RANGOS (un valor, no
 * sólo tipos), así que importarlo desde allá arrastraría código de servidor al
 * bundle del navegador y el build falla.
 */

/**
 * Pestañas de rango. 'periodo' NO es el mes calendario: es el período de venta
 * del negocio, que va del 24 de un mes al 23 del siguiente (tabla `periodos`).
 * Cuál período concreto se muestra lo decide el selector de arriba.
 */
export type RangoKey = 'hoy' | '7d' | '30d' | 'periodo' | 'anio' | 'custom'

/** Pestañas fijas. 'custom' no va acá: aparece sólo cuando hay rango elegido. */
export const RANGOS: { key: RangoKey; label: string }[] = [
  { key: 'hoy',     label: 'Hoy'     },
  { key: '7d',      label: '7D'      },
  { key: '30d',     label: '30D'     },
  { key: 'periodo', label: 'Período' },
  { key: 'anio',    label: 'Año'     },
]

export interface KpisRango {
  litros: number
  revenue: number
  clientes: number
  pedidos: number
  litrosCerveza: number
  litrosKombucha: number
  litrosOtros: number
}

export interface VendedorRango {
  vendedor: string      // nombre tal cual viene del ERP (Transición 2, Yadro Fabijancic, ...)
  litros: number
  revenue: number
  clientes: number
  litrosPrev: number
  /** Litros de pedidos del período aún sin despachar (por fecha de pedido, no de entrega) */
  litrosPorEntregar: number
}

export interface PuntoSerie {
  fecha: string
  litros: number
  revenue: number
  clientes: number
  pedidos: number
}

/**
 * Desglose entregado / por entregar.
 * "Por entregar" = venta ya tomada que el ERP aún no despachó (sin fecha de
 * entrega). Es la razón por la que un pedido puede existir y no aparecer en un
 * informe filtrado por fecha de entrega.
 */
export interface EntregasRango {
  litrosEntregados: number
  litrosPorEntregar: number
  /** Cargados antes de guardar el estado: no se puede afirmar si se entregaron */
  litrosSinDato: number
  revenueEntregado: number
  revenuePorEntregar: number
  pedidosEntregados: number
  pedidosPorEntregar: number
}

/**
 * Litros de PDV (degustaciones en punto de venta), Ferias y BaseCamp.
 * No cuentan como "litros vendidos" (no son clientes reales), pero son
 * volumen real que vale la pena visualizar aparte.
 */
export interface ConsumoInternoRango {
  categoria: string   // 'PDV' | 'Ferias' | 'BaseCamp'
  litros: number
  revenue: number
  pedidos: number
}

/** Unidades por tipo de envase (latas / barriles), derivadas de los litros. */
export interface EnvaseRango {
  tipo: string        // 'Lata 354 ml' | 'Lata 473 ml' | 'Barril 30L' | 'Otros'
  unidades: number
  litros: number
  revenue: number
  unidadesPrev: number
}

export interface DatosRango {
  desde: string
  hasta: string
  /** Qué se compara contra qué, para poder explicarlo en la UI */
  etiquetaComparacion: string
  actual: KpisRango
  previo: KpisRango
  vendedores: VendedorRango[]
  envases: EnvaseRango[]
  entregas: EntregasRango
  consumoInterno: ConsumoInternoRango[]
  serie: PuntoSerie[]
}

/** Un período de venta 24→23 con sus datos ya calculados. */
export interface PeriodoOpcion {
  id: number
  nombre: string        // "Agosto 2026"
  inicio: string        // 2026-07-24
  fin: string           // 2026-08-23
  activo: boolean
  datos: DatosRango
  metaLitros: number
}

export interface AlertaInsight {
  tipo: 'alerta' | 'insight'
  titulo: string
  detalle: string
  href?: string
}

export interface HoyData {
  /** Rangos relativos a hoy (no incluye 'periodo' ni 'custom') */
  rangos: Record<Exclude<RangoKey, 'periodo' | 'custom'>, DatosRango>
  /** Período activo primero, luego los anteriores */
  periodos: PeriodoOpcion[]
  /** Rango elegido a mano (?desde=&hasta=). null si no hay ninguno. */
  custom: DatosRango | null
  alertas: AlertaInsight[]
  ultimaSync: string | null
  usuario: { nombre: string; iniciales: string; avatarUrl: string | null } | null
}
