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
export type RangoKey = 'hoy' | '7d' | '30d' | 'periodo' | 'anio'

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
}

export interface PuntoSerie {
  fecha: string
  litros: number
  revenue: number
  clientes: number
  pedidos: number
}

export interface DatosRango {
  desde: string
  hasta: string
  /** Qué se compara contra qué, para poder explicarlo en la UI */
  etiquetaComparacion: string
  actual: KpisRango
  previo: KpisRango
  vendedores: VendedorRango[]
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
  /** Rangos relativos a hoy (no incluye 'periodo', que sale de `periodos`) */
  rangos: Record<Exclude<RangoKey, 'periodo'>, DatosRango>
  /** Período activo primero, luego los anteriores */
  periodos: PeriodoOpcion[]
  alertas: AlertaInsight[]
  ultimaSync: string | null
  usuario: { nombre: string; iniciales: string; avatarUrl: string | null } | null
}
