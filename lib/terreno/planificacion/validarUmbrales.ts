/**
 * Umbral de autorización previa escrita: ESTRICTAMENTE mayor, nunca mayor o igual
 * (regla explícita del prompt — no reinterpretar `>` como `>=`).
 */
export function requiereAutorizacionPrevia(montoClp: number, umbralClp: number): boolean {
  return montoClp > umbralClp
}

/**
 * "El monto aprobado no puede crecer sin una nueva autorización válida": el incremento
 * propuesto sobre el último monto aprobado sólo es válido si hay autorizaciones previas
 * ya aprobadas (plan_autorizaciones_previas_terreno.estado='aprobada') cuya suma cubre
 * ese incremento. Se valida acá (API), no en un trigger de DB, porque necesita leer el
 * historial completo del plan — más claro y testeable en TypeScript.
 */
export function incrementoAutorizado(
  montoAprobadoAnteriorClp: number,
  montoPropuestoClp: number,
  sumaAutorizacionesPreviasAprobadasClp: number,
): { autorizado: boolean; incrementoClp: number } {
  const incrementoClp = montoPropuestoClp - montoAprobadoAnteriorClp
  if (incrementoClp <= 0) return { autorizado: true, incrementoClp }
  return { autorizado: incrementoClp <= sumaAutorizacionesPreviasAprobadasClp, incrementoClp }
}
