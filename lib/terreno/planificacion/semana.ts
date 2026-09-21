import 'server-only'
import { calcularRango, fechaSantiago } from '@/lib/terreno/tiempoChile'

/** Lunes (YYYY-MM-DD, calendario de Santiago) de la semana que contiene `fechaISO`. */
export function semanaLunes(fechaISO: string): string {
  return calcularRango('semana', fechaISO).desdeFechaISO
}

/** Lunes de la semana SIGUIENTE a la de `fechaISO` — la que se presenta el viernes. */
export function semanaSiguienteLunes(fechaISO: string): string {
  const [Y, M, D] = semanaLunes(fechaISO).split('-').map(Number)
  return fechaSantiago(new Date(Date.UTC(Y, M - 1, D + 7, 12)))
}

/**
 * Fecha límite de presentación (viernes anterior a `semanaLunesISO`) — cambio operativo
 * explícito de Claudio vs. el PDF (que indicaba lunes), documentado también en
 * politicas_gastos_terreno.reglas_itinerario.cambio_dia_presentacion_nota.
 */
export function fechaLimitePresentacion(semanaLunesISO: string): string {
  const [Y, M, D] = semanaLunesISO.split('-').map(Number)
  return fechaSantiago(new Date(Date.UTC(Y, M - 1, D - 3, 12)))
}

export function esEntregaTardia(presentadoAtISO: string, fechaLimiteISO: string): boolean {
  return fechaSantiago(new Date(presentadoAtISO)) > fechaLimiteISO
}
