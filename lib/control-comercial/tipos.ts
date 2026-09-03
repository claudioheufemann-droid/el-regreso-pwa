// Tipos de dominio de Control Comercial. Reflejan 1:1 la forma de las RPC de
// Supabase (fn_resumen_ejecutivo, fn_ventas_agregadas) — no inventar campos
// que esas funciones no devuelven.

export type Categoria = 'Cerveza' | 'Kombucha' | 'Otros'
export type TipoTerritorio = 'geografico' | 'canal' | 'sin_asignar'

export interface FilaVentaAgregada {
  territorio: string
  tipo: TipoTerritorio
  categoria_producto: Categoria
  litros: number
  monto: number
  clientes_unicos: number
  pedidos_unicos: number
}

export interface ResumenEjecutivoRaw {
  litros_total: number
  litros_cerveza: number
  litros_kombucha: number
  monto_total: number
  monto_cerveza: number
  monto_kombucha: number
  clientes_activos: number
  pedidos_unicos: number
  clientes_nuevos: number
  clientes_perdidos: number
}

export interface Comparativa<T> {
  actual: T
  comparado: T
  variacionPct: number | null
  /** true si el rango actual está truncado a hoy (período en curso). */
  truncado: boolean
  dias: number
}

export interface KpiEjecutivo {
  id: string
  titulo: string
  valor: number
  formato: 'clp' | 'litros' | 'numero' | 'porcentaje'
  comparado: number | null
  variacionPct: number | null
  tooltip: string
  /** Ruta de drill-down (spec §40) — null si el KPI aún no tiene destino. */
  drillHref?: string | null
  /**
   * Estado del KPI — nunca fabricar un cero engañoso:
   * - ok: valor y comparación disponibles.
   * - sin_meta: no hay valor que mostrar (ej. % de cumplimiento sin meta configurada).
   * - sin_comparacion: el valor SÍ es real (foto actual), pero no hay histórico contra qué comparar todavía.
   * - no_disponible: ni el valor se puede calcular con la data actual (explicar por qué, no mostrar 0).
   */
  estado?: 'ok' | 'sin_meta' | 'sin_comparacion' | 'no_disponible'
}

export interface ResumenEjecutivoResponse {
  periodo: { nombre: string; inicio: string; fin: string; truncado: boolean }
  kpis: KpiEjecutivo[]
  ventasPorTerritorio: FilaVentaAgregada[]
}

export interface Territorio {
  territorio: string
  tipo: 'geografico' | 'canal'
  responsable: string
  vigente_desde: string
  vigente_hasta: string | null
}

export type ScopeMeta = 'compania' | 'territorio' | 'vendedor'
export type KpiMeta =
  | 'ventas_clp' | 'litros_total' | 'litros_cerveza' | 'litros_kombucha'
  | 'nuevos_clientes' | 'reactivaciones' | 'cobranza_recuperada'
  | 'cuentas_regularizadas' | 'barriles_recuperados'

export interface MetaComercial {
  id: number
  periodo_id: number
  scope_type: ScopeMeta
  scope_value: string | null
  kpi_type: KpiMeta
  valor_meta: number
}
