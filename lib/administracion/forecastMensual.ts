/**
 * Resumen por CICLO (mes interno 24→23) del forecast de una serie, para la
 * pestaña Forecast de Administración. El gráfico semanal reparte cada mes del
 * modelo parejo por día, así que dentro de un ciclo todas las semanas valen
 * casi lo mismo y no dicen nada nuevo: lo que sí se quiere leer de un vistazo
 * es "cuánto proyecta el modelo para diciembre" y si eso es razonable frente a
 * lo que pasó el mismo ciclo del año anterior.
 *
 * Sólo se listan los ciclos PROYECTADOS (no los reales): el último ciclo real
 * puede venir incompleto (BaseCamp se carga a mano y suele ir atrasado) y
 * mostrarlo como "real" daría una caída falsa. La comparación contra el año
 * anterior sí usa ciclos cerrados de hace 12 meses o más.
 */

export interface PuntoMensualBasico {
  /** yyyy-mm-01 del ciclo (mes en que TERMINA: el ciclo "dic" va del 24-nov al 23-dic). */
  mes: string
  tipo: string
  monto: number
  montoMin: number | null
  montoMax: number | null
}

export interface MesForecast {
  mes: string
  proyectado: number
  min: number | null
  max: number | null
  /** Monto REAL del mismo ciclo un año antes (null si no hay ese historial). */
  anioAnterior: number | null
}

function mismoMesAnioAnterior(mes: string): string {
  const [a, m, d] = mes.split('-')
  return `${Number(a) - 1}-${m}-${d}`
}

export function resumenMensualForecast(puntos: PuntoMensualBasico[]): MesForecast[] {
  const historico = new Map<string, number>()
  for (const p of puntos) if (p.tipo === 'historico') historico.set(p.mes, p.monto)

  return puntos
    .filter(p => p.tipo === 'forecast')
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(p => ({
      mes: p.mes,
      proyectado: Math.round(p.monto),
      min: p.montoMin != null ? Math.round(p.montoMin) : null,
      max: p.montoMax != null ? Math.round(p.montoMax) : null,
      anioAnterior: historico.has(mismoMesAnioAnterior(p.mes)) ? Math.round(historico.get(mismoMesAnioAnterior(p.mes))!) : null,
    }))
}
