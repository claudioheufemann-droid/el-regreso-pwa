/** Tipos compartidos del motor de planificación semanal / gastos de terreno. */

export interface PoliticaGastos {
  id: string
  version: number
  vigente_desde: string
  vigente_hasta: string | null
  tarifa_km_clp: number
  monto_almuerzo_clp: number
  monto_desayuno_clp: number
  monto_once_cena_clp: number
  tope_alojamiento_noche_clp: number
  umbral_autorizacion_previa_clp: number
  reglas_itinerario: Record<string, unknown>
  activa: boolean
}

/** Un día del plan, tal como lo necesita el motor de presupuesto. */
export interface DiaPresupuesto {
  id: string
  fecha: string
  pernocta: boolean
  regreso_mismo_dia: boolean
  desayuno_incluido_alojamiento: boolean
  hotel_estimado_clp: number | null
  peajes_estimados_clp: number
  /** Metros pagables ya calculados por un RouteProvider real (nunca línea recta). null = pendiente. */
  km_pagable_m: number | null
  requiere_revision_comidas: boolean
  /** Paradas planificadas ese día. Un día sin paradas (ej. "seguimiento y cierre" de escritorio) no genera almuerzo, aunque sea parte de la semana laboral. */
  cantidad_paradas: number
}

export interface ComidasDia {
  almuerzos: number
  desayunos: number
  cenasOnce: number
  montoComidasClp: number
}

export interface ResultadoDia {
  plan_dia_id: string
  fecha: string
  comidas: ComidasDia
  kmPagableM: number | null
  montoKmClp: number | null
  montoPeajesClp: number
  montoDiaClp: number | null
  pendienteDeCalculo: boolean
}

export interface ResultadoSemana {
  dias: ResultadoDia[]
  montoTotalKmClp: number
  montoTotalPeajesClp: number
  montoTotalComidasClp: number
  montoTotalClp: number
  montoAlojamientoEstimadoClp: number
  algunDiaPendienteDeCalculo: boolean
}
