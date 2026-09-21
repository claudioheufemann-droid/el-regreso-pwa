import 'server-only'

/**
 * Límites de período en hora de Santiago, devueltos como instantes UTC
 * (lo que hay que comparar contra columnas timestamptz). Nada de offset
 * fijo "-04:00" a mano: eso se rompe dos veces al año con el cambio de
 * horario. Se usa Intl con timeZone America/Santiago, que sí conoce el
 * calendario real de DST de Chile.
 */
const TZ = 'America/Santiago'

function partesEnZona(instanteMs: number) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const partes = dtf.formatToParts(new Date(instanteMs)).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = Number(p.value)
    return acc
  }, {} as Record<string, number>)
  return partes
}

/** offset tal que: instante_UTC + offset = "instante_UTC leído como si sus números fueran hora de Santiago". */
function offsetMs(instanteMs: number): number {
  const p = partesEnZona(instanteMs)
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return comoUtc - instanteMs
}

/** Instante UTC de la medianoche de `fechaISO` ('YYYY-MM-DD') en hora de Santiago. */
export function inicioDiaSantiago(fechaISO: string): Date {
  const [Y, M, D] = fechaISO.split('-').map(Number)
  const x = Date.UTC(Y, M - 1, D, 0, 0, 0)
  return new Date(x - offsetMs(x))
}

/** 'YYYY-MM-DD' de un instante, en hora de Santiago. */
export function fechaSantiago(instante: Date): string {
  const p = partesEnZona(instante.getTime())
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function sumarDias(fechaISO: string, dias: number): string {
  const [Y, M, D] = fechaISO.split('-').map(Number)
  const d = new Date(Date.UTC(Y, M - 1, D + dias))
  return d.toISOString().slice(0, 10)
}

/** Día de la semana ISO (1=lunes..7=domingo) de una fecha 'YYYY-MM-DD', sin desfase de zona. */
function diaSemanaISO(fechaISO: string): number {
  const [Y, M, D] = fechaISO.split('-').map(Number)
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay() // 0=domingo
  return dow === 0 ? 7 : dow
}

export type TipoPeriodo = 'dia' | 'semana' | 'mes'

export interface RangoPeriodo {
  desde: Date
  hasta: Date
  /** 'YYYY-MM-DD' de referencia, en hora de Santiago, para mostrar en la UI. */
  desdeFechaISO: string
  hastaFechaISO: string
}

/** Rango [desde, hasta) en instantes UTC, calculado sobre el calendario de Santiago. */
export function calcularRango(tipo: TipoPeriodo, fechaISO: string): RangoPeriodo {
  if (tipo === 'dia') {
    const desdeFechaISO = fechaISO
    const hastaFechaISO = sumarDias(fechaISO, 1)
    return { desde: inicioDiaSantiago(desdeFechaISO), hasta: inicioDiaSantiago(hastaFechaISO), desdeFechaISO, hastaFechaISO: sumarDias(fechaISO, 0) }
  }
  if (tipo === 'semana') {
    const dow = diaSemanaISO(fechaISO)
    const desdeFechaISO = sumarDias(fechaISO, -(dow - 1))
    const hastaFechaISOExclusiva = sumarDias(desdeFechaISO, 7)
    return { desde: inicioDiaSantiago(desdeFechaISO), hasta: inicioDiaSantiago(hastaFechaISOExclusiva), desdeFechaISO, hastaFechaISO: sumarDias(hastaFechaISOExclusiva, -1) }
  }
  // mes calendario
  const [Y, M] = fechaISO.split('-').map(Number)
  const desdeFechaISO = `${Y}-${String(M).padStart(2, '0')}-01`
  const primerDiaSiguiente = new Date(Date.UTC(Y, M, 1)).toISOString().slice(0, 10)
  return { desde: inicioDiaSantiago(desdeFechaISO), hasta: inicioDiaSantiago(primerDiaSiguiente), desdeFechaISO, hastaFechaISO: sumarDias(primerDiaSiguiente, -1) }
}

export function hoySantiagoISO(): string {
  return fechaSantiago(new Date())
}
