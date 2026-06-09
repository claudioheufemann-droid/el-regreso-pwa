// ─────────────────────────────────────────────────────────────────────────────
// PERÍODOS DE VENTA — del 24 de un mes al 23 del siguiente.
// Fuente única de verdad para los límites de período en toda la app.
//
// Convención de nombre: el período se llama por el mes donde cae la MAYORÍA
// de sus días (= el mes en que TERMINA). Ej:
//   24-may → 23-jun  → "Junio"  (8 días de mayo vs 23 de junio)
//   24-abr → 23-may  → "Mayo"
// Coincide con el fallback que ya usa el dashboard (2026-04-24 → 2026-05-23 = Mayo).
// ─────────────────────────────────────────────────────────────────────────────

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// Día de corte: el período abre el 24 y cierra el 23.
export const DIA_CORTE = 24

export interface Periodo24 {
  /** 'YYYY-MM-DD' del día 24 en que abre */
  inicio: string
  /** 'YYYY-MM-DD' del día 23 en que cierra */
  fin: string
  /** Etiqueta legible, ej. "Junio 2026" */
  nombre: string
  /** Año/mes ancla = el mes en que el período TERMINA (1-12) */
  anchorYear: number
  anchorMonth: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * Construye el período cuyo mes-ancla (mes de cierre) es (year, month).
 *   month: 1-12. Resultado: inicio = 24 del mes anterior, fin = 23 de este mes.
 */
export function periodoPorAncla(year: number, month: number): Periodo24 {
  // mes anterior (para el día 24 de apertura)
  let py = year
  let pm = month - 1
  if (pm === 0) { pm = 12; py = year - 1 }

  return {
    inicio: ymd(py, pm, DIA_CORTE),        // 24 del mes anterior
    fin: ymd(year, month, DIA_CORTE - 1),  // 23 del mes ancla
    nombre: `${MESES_ES[month - 1]} ${year}`,
    anchorYear: year,
    anchorMonth: month,
  }
}

/**
 * Devuelve el período de venta que CONTIENE la fecha dada.
 *   - día >= 24 → el período abrió este mes el 24; cierra el mes siguiente.
 *                 (mes-ancla = mes siguiente)
 *   - día <= 23 → el período abrió el mes pasado el 24; cierra este mes.
 *                 (mes-ancla = este mes)
 */
export function periodoDeFecha(fecha: Date): Periodo24 {
  const y = fecha.getFullYear()
  const m = fecha.getMonth() + 1 // 1-12
  const d = fecha.getDate()

  if (d >= DIA_CORTE) {
    // mes-ancla = mes siguiente
    let ay = y
    let am = m + 1
    if (am === 13) { am = 1; ay = y + 1 }
    return periodoPorAncla(ay, am)
  }
  // mes-ancla = este mes
  return periodoPorAncla(y, m)
}

/** Período de venta vigente hoy. */
export function periodoActual(): Periodo24 {
  return periodoDeFecha(new Date())
}

/** Período inmediatamente anterior al de la fecha dada. */
export function periodoAnterior(fecha: Date): Periodo24 {
  const actual = periodoDeFecha(fecha)
  let ay = actual.anchorYear
  let am = actual.anchorMonth - 1
  if (am === 0) { am = 12; ay -= 1 }
  return periodoPorAncla(ay, am)
}

/**
 * Genera una lista de períodos consecutivos para sembrar / mostrar.
 * @param anchorYear  año del primer mes-ancla
 * @param anchorMonth mes-ancla inicial (1-12)
 * @param cantidad    cuántos períodos generar hacia adelante
 */
export function generarPeriodos(anchorYear: number, anchorMonth: number, cantidad: number): Periodo24[] {
  const out: Periodo24[] = []
  let y = anchorYear
  let m = anchorMonth
  for (let i = 0; i < cantidad; i++) {
    out.push(periodoPorAncla(y, m))
    m++
    if (m === 13) { m = 1; y++ }
  }
  return out
}

/**
 * Sub-semanas (lunes→domingo) que tejen dentro de un período 24→23,
 * recortadas a los límites del período. Útil para metas semanales.
 * Cada semana arranca un lunes; la primera y la última pueden ser parciales.
 */
export function semanasDePeriodo(p: Pick<Periodo24, 'inicio' | 'fin'>): { num: number; inicio: string; fin: string }[] {
  const ini = new Date(p.inicio + 'T12:00:00')
  const fin = new Date(p.fin + 'T12:00:00')
  const out: { num: number; inicio: string; fin: string }[] = []

  let cursor = new Date(ini)
  let num = 1
  while (cursor <= fin) {
    // fin de la semana = domingo de la semana del cursor
    const dow = cursor.getDay() // 0=dom..6=sáb
    const diasHastaDomingo = dow === 0 ? 0 : 7 - dow
    const finSemana = new Date(cursor)
    finSemana.setDate(cursor.getDate() + diasHastaDomingo)
    const finReal = finSemana > fin ? fin : finSemana

    out.push({
      num,
      inicio: ymd(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()),
      fin: ymd(finReal.getFullYear(), finReal.getMonth() + 1, finReal.getDate()),
    })

    cursor = new Date(finReal)
    cursor.setDate(finReal.getDate() + 1)
    num++
  }
  return out
}
