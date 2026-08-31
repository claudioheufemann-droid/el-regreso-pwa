/**
 * lib/stockRiesgo.ts — Fuente única de verdad para "¿este cliente está por
 * quebrar stock?". Antes vivía sólo dentro de ClientesClient.tsx (componente
 * 'use client'), así que no se podía reusar desde una ruta de servidor (cron)
 * sin duplicar la lógica y arriesgar que se desalineen — un cliente que la UI
 * marca "riesgo alto" pero que el cron nunca avisa (o viceversa) es peor que
 * no tener la alerta. Ver app/ventas/clientes/ClientesClient.tsx y
 * app/api/cron/cartera-diaria/route.ts, ambos importan de acá.
 */

export interface FrequencyStat {
  dias_sin_compra: number; ciclo_promedio_dias: number | null; total_pedidos: number
  alert_level: string; siguiente_compra_estimada: string | null
  score: number; segmento: string; confianza_score: string
  litros_totales: number; revenue_total: number; pedidos_por_mes: number
  /** Modelo de ciclo v2 — ver supabase/migrations/ciclo_estacional_v2.sql */
  es_estacional?: boolean
  /** Cliente de temporada, actualmente en su temporada baja: no es "riesgo". */
  temporada_baja?: boolean
  factor_estacional?: number
  /** Ciclo sin ajuste estacional ni calibración (para explicar el cálculo). */
  ciclo_base_dias?: number | null
  /** Fecha de la primera compra ALGUNA VEZ (para clasificar "Nuevo"). */
  primera_compra?: string | null
}

// ── Stock proyectado del cliente ───────────────────────────────────────────────
// No existe (todavía) un trackeo real de litros en el local del cliente — se
// estima a partir del ciclo de compra que calcula client_scores:
//   litros por pedido = litros_totales / total_pedidos  (tamaño típico de compra)
//   consumo diario    = litros por pedido / ciclo_promedio_dias
//   días restantes    = ciclo_promedio_dias - dias_sin_compra  (negativo = vencido)
//   fecha de quiebre   = siguiente_compra_estimada (ya viene calculada)
//
// `ciclo_promedio_dias` NO es un promedio simple pese al nombre (se conservó
// por compatibilidad): desde ciclo_estacional_v2.sql es
//   mediana de los últimos 8 gaps desestacionalizados
//     × factor del mes proyectado          (estacionalidad)
//     × factor de calibración global       (corrige el sesgo del modelo)
// Detalle y justificación en supabase/migrations/ciclo_estacional_v2.sql.
export type StockBand = 'verde' | 'amarillo' | 'naranja' | 'rojo' | null
export interface StockProyectado {
  diasRestantes: number
  litrosDisponibles: number
  consumoSemanal: number
  fechaQuiebre: string | null
  agotado: boolean
  band: StockBand
  /** Cliente de temporada fuera de su temporada: se muestra neutro, no en rojo. */
  temporadaBaja: boolean
}

export function calcularStock(f: FrequencyStat | null): StockProyectado | null {
  if (!f || !f.ciclo_promedio_dias || f.total_pedidos <= 0) return null
  const litrosPorPedido = f.litros_totales / f.total_pedidos
  const consumoDiario = litrosPorPedido / f.ciclo_promedio_dias
  const diasRestantes = Math.round(f.ciclo_promedio_dias - f.dias_sin_compra)
  const litrosDisponibles = Math.max(0, consumoDiario * diasRestantes)
  const agotado = diasRestantes <= 0
  const band: StockBand = agotado ? 'rojo' : diasRestantes < 3 ? 'rojo' : diasRestantes <= 7 ? 'naranja' : diasRestantes <= 14 ? 'amarillo' : 'verde'
  return {
    diasRestantes,
    litrosDisponibles,
    consumoSemanal: consumoDiario * 7,
    fechaQuiebre: f.siguiente_compra_estimada,
    agotado,
    band,
    temporadaBaja: !!f.temporada_baja,
  }
}

/** Riesgo alto = naranja o rojo; medio = amarillo; sin riesgo = verde o sin historial.
 *  Un cliente de temporada FUERA de su temporada nunca es riesgo alto: que no
 *  compre en su temporada baja es su comportamiento normal, no una alerta. */
export function riesgoDeBand(band: StockBand, temporadaBaja = false): 'alto' | 'medio' | 'bajo' {
  if (temporadaBaja) return 'bajo'
  if (band === 'rojo' || band === 'naranja') return 'alto'
  if (band === 'amarillo') return 'medio'
  return 'bajo'
}

export function diasDesde(f?: string | null): number | null {
  if (!f) return null
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000)
}

// Cliente "Nuevo": su primera compra ALGUNA VEZ fue hace <=30 días. Se usa
// `primera_compra` (ventas reales) y no `clientes.created_at` porque esta
// última es cuándo se cargó la fila en la app (hubo una importación masiva
// de 723 clientes de golpe el 28-may-2026), no cuándo el cliente empezó a
// comprar de verdad.
export const DIAS_CLIENTE_NUEVO = 30
export function esClienteNuevo(f: FrequencyStat | null): boolean {
  if (!f?.primera_compra) return false
  const dias = diasDesde(f.primera_compra)
  return dias !== null && dias >= 0 && dias <= DIAS_CLIENTE_NUEVO
}
