// ─────────────────────────────────────────────────────────────────────────────
// PERÍODOS Y COMPARACIONES — Control Comercial
//
// No duplica el cálculo del período 24→23: eso vive en lib/periodos.ts y se
// reexporta tal cual. Este archivo solo agrega la lógica de comparación
// (período anterior, mismo período año anterior, YTD) respetando la regla del
// spec: si el período actual está en curso, la comparación se trunca al MISMO
// número de días en el lado comparado — nunca un parcial contra uno completo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Periodo24,
  periodoActual,
  periodoDeFecha,
  periodoAnterior,
  periodoPorAncla,
  generarPeriodos,
} from '@/lib/periodos'

export type { Periodo24 }
export { periodoActual, periodoDeFecha, periodoAnterior, periodoPorAncla, generarPeriodos }

export interface RangoFechas {
  inicio: string
  fin: string
}

export interface ComparacionRango {
  actual: RangoFechas
  comparado: RangoFechas
  /** Días incluidos en cada lado (siempre iguales). */
  dias: number
  /** true si el período actual está en curso (hoy cae dentro de él) — el lado comparado quedó truncado igual. */
  truncado: boolean
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseFecha(s: string): Date {
  return new Date(s + 'T12:00:00')
}

function diffDiasInclusive(inicio: string, fin: string): number {
  const a = parseFecha(inicio)
  const b = parseFecha(fin)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
}

function sumarDias(fecha: string, dias: number): string {
  const d = parseFecha(fecha)
  d.setDate(d.getDate() + dias)
  return ymd(d)
}

/** Período truncado a hoy si está en curso; completo si ya cerró. */
export function rangoTruncadoAHoy(periodo: Periodo24, hoy: Date = new Date()): RangoFechas {
  const hoyS = ymd(hoy)
  const fin = hoyS < periodo.fin ? hoyS : periodo.fin
  const inicio = hoyS < periodo.inicio ? periodo.fin : periodo.inicio // guard teórico, no debería pasar
  return { inicio: periodo.inicio, fin: fin < inicio ? periodo.inicio : fin }
}

function construirComparacion(periodoBase: Periodo24, periodoComparado: Periodo24, hoy: Date): ComparacionRango {
  const actual = rangoTruncadoAHoy(periodoBase, hoy)
  const dias = diffDiasInclusive(actual.inicio, actual.fin)
  const truncado = actual.fin !== periodoBase.fin
  const finComparado = sumarDias(periodoComparado.inicio, dias - 1)
  return {
    actual,
    comparado: { inicio: periodoComparado.inicio, fin: finComparado },
    dias,
    truncado,
  }
}

/** Período actual (posiblemente truncado a hoy) vs el período comercial inmediatamente anterior. */
export function comparacionPeriodoAnterior(periodo: Periodo24, hoy: Date = new Date()): ComparacionRango {
  const anterior = periodoPorAncla(
    periodo.anchorMonth === 1 ? periodo.anchorYear - 1 : periodo.anchorYear,
    periodo.anchorMonth === 1 ? 12 : periodo.anchorMonth - 1,
  )
  return construirComparacion(periodo, anterior, hoy)
}

/** Período actual (posiblemente truncado a hoy) vs el mismo período comercial del año anterior. */
export function comparacionAnioAnterior(periodo: Periodo24, hoy: Date = new Date()): ComparacionRango {
  const anioAnt = periodoPorAncla(periodo.anchorYear - 1, periodo.anchorMonth)
  return construirComparacion(periodo, anioAnt, hoy)
}

/**
 * YTD del año del período dado (desde el período ancla=Enero hasta el período dado, inclusive)
 * vs el mismo YTD del año anterior — con el mismo truncado por días si el período actual está en curso.
 */
export function comparacionYTD(periodo: Periodo24, hoy: Date = new Date()): ComparacionRango {
  const primeroEsteAnio = periodoPorAncla(periodo.anchorYear, 1)
  const finActualTrunc = rangoTruncadoAHoy(periodo, hoy).fin
  const actualYTD: RangoFechas = { inicio: primeroEsteAnio.inicio, fin: finActualTrunc }
  const dias = diffDiasInclusive(actualYTD.inicio, actualYTD.fin)
  const primeroAnioAnt = periodoPorAncla(periodo.anchorYear - 1, 1)
  const finComparado = sumarDias(primeroAnioAnt.inicio, dias - 1)
  return {
    actual: actualYTD,
    comparado: { inicio: primeroAnioAnt.inicio, fin: finComparado },
    dias,
    truncado: finActualTrunc !== periodo.fin,
  }
}

/** Variación %, con guarda para base 0 (evita Infinity/NaN en la UI). */
export function variacionPct(actual: number, comparado: number): number | null {
  if (!comparado) return actual > 0 ? null : 0
  return ((actual - comparado) / Math.abs(comparado)) * 100
}
