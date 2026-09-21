import type { PoliticaGastos, ResultadoSemana } from './types'

export interface SnapshotPlanInput {
  plan: Record<string, unknown>
  politica: PoliticaGastos
  dias: Record<string, unknown>[]
  paradas: Record<string, unknown>[]
  presupuesto: ResultadoSemana
}

/**
 * Snapshot inmutable de una versión del plan (días/paradas/objetivos/ruta/km/comidas/
 * tarifas/presupuesto/política íntegros), tal como lo exige el prompt. Se inserta como
 * fila nueva en plan_versiones_terreno — nunca se sobrescribe una vez creada. Es JSON
 * plano (no referencias a otras tablas) a propósito: debe seguir siendo legible aunque
 * las tablas de origen cambien de forma más adelante.
 */
export function construirSnapshotPlan(input: SnapshotPlanInput) {
  return {
    generado_at: new Date().toISOString(),
    plan: input.plan,
    politica_gastos: input.politica,
    dias: input.dias,
    paradas: input.paradas,
    presupuesto: input.presupuesto,
  }
}
