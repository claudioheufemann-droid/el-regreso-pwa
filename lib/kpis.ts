import { RcTask, TaskStatus } from './gestion-types'

// ── Semáforo ──────────────────────────────────────────────

export type SemaphoreColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray'

export interface SemaphoreState {
  color: SemaphoreColor
  hex: string
  label: string
  hoursLeft: number
}

export function getSemaphore(plazo: string, estado: TaskStatus): SemaphoreState {
  if (estado === 'Completada') return { color: 'blue',  hex: '#3B82F6', label: 'Completada', hoursLeft: Infinity }
  if (estado === 'Rechazada') return { color: 'gray',  hex: '#6B7280', label: 'Rechazada',  hoursLeft: 0 }

  const deadline = new Date(plazo).getTime()
  const hoursLeft = (deadline - Date.now()) / 3_600_000

  if (hoursLeft < 0)  return { color: 'red',    hex: '#DC2626', label: `Vencida`,                       hoursLeft }
  if (hoursLeft < 24) return { color: 'red',    hex: '#DC2626', label: `${Math.round(hoursLeft)}h`,     hoursLeft }
  if (hoursLeft < 72) return { color: 'yellow', hex: '#D97706', label: `${Math.round(hoursLeft/24)}d`,  hoursLeft }
  return               { color: 'green',  hex: '#16A34A', label: `${Math.round(hoursLeft/24)}d`,  hoursLeft }
}

export const SEMAPHORE_HEX: Record<SemaphoreColor, string> = {
  green:  '#16A34A',
  yellow: '#D97706',
  red:    '#DC2626',
  blue:   '#3B82F6',
  gray:   '#6B7280',
}

// ── Helpers de fecha ──────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() + (day === 0 ? -6 : 1 - day))
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { monStr: toDateStr(mon), sunStr: toDateStr(sun) }
}

// ── KPI: OTCR (On-Time Completion Rate) ──────────────────
// Proxy: completada con contador_retrasos = 0 → a tiempo

export interface OtcrResult {
  rate: number       // 0-100
  onTime: number
  late: number
  total: number
}

export function calcOTCR(tasks: RcTask[]): OtcrResult {
  const completed = tasks.filter(t => t.estado === 'Completada')
  if (!completed.length) return { rate: 0, onTime: 0, late: 0, total: 0 }
  const onTime = completed.filter(t => t.contador_retrasos === 0).length
  return {
    rate:   Math.round((onTime / completed.length) * 100),
    onTime,
    late:   completed.length - onTime,
    total:  completed.length,
  }
}

// ── KPI: Lead Time ────────────────────────────────────────
// Días desde created_at hasta plazo (para completadas)

export function calcLeadTime(tasks: RcTask[]): { avg: number; min: number; max: number } {
  const completed = tasks.filter(t => t.estado === 'Completada' && t.created_at)
  if (!completed.length) return { avg: 0, min: 0, max: 0 }

  const days = completed.map(t => {
    const ms = new Date(t.plazo).getTime() - new Date(t.created_at!).getTime()
    return Math.max(0, ms / 86_400_000)
  })

  return {
    avg: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
    min: Math.round(Math.min(...days) * 10) / 10,
    max: Math.round(Math.max(...days) * 10) / 10,
  }
}

// ── KPI: Productividad Neta ───────────────────────────────

export interface ProductivityResult {
  created:  number
  closed:   number
  ratio:    number   // cerradas / creadas, 0-N
  balance:  number   // closed - created
}

export function calcNetProductivity(tasks: RcTask[]): ProductivityResult {
  const { monStr, sunStr } = getWeekBounds()
  const created = tasks.filter(t => t.created_at && t.created_at.slice(0, 10) >= monStr && t.created_at.slice(0, 10) <= sunStr).length
  const closed  = tasks.filter(t => t.estado === 'Completada' && t.plazo >= monStr && t.plazo <= sunStr).length
  return {
    created,
    closed,
    ratio:   created > 0 ? Math.round((closed / created) * 100) / 100 : 0,
    balance: closed - created,
  }
}

// ── KPI: Distribución semáforo ────────────────────────────

export interface SemaphoreDistribution {
  red:    number
  yellow: number
  green:  number
  blue:   number
  gray:   number
  total:  number
}

export function calcSemaphoreDistribution(tasks: RcTask[]): SemaphoreDistribution {
  const dist: SemaphoreDistribution = { red: 0, yellow: 0, green: 0, blue: 0, gray: 0, total: tasks.length }
  for (const t of tasks) {
    const s = getSemaphore(t.plazo, t.estado)
    dist[s.color]++
  }
  return dist
}

// ── KPI: Tiempo de Reacción ───────────────────────────────────
// Días entre created_at y started_at (o proxy: días en 'Asignada' sin iniciar)

export interface ReactionTimeResult {
  avgDays: number        // promedio real (started_at - created_at) para las que tienen dato
  samplesReal: number    // tareas con started_at capturado
  pending: number        // tareas aún en 'Asignada'
  pendingOver24h: number // de esas, cuántas llevan > 1 día sin iniciar
  pendingOver72h: number // cuántas llevan > 3 días sin iniciar
  avgPendingDays: number // promedio días en espera de las 'Asignadas'
}

export function calcReactionTime(tasks: RcTask[]): ReactionTimeResult {
  const now = Date.now()

  // Tareas con dato real (started_at registrado)
  const started = tasks.filter(t => t.started_at && t.created_at)
  const realDays = started.map(t =>
    Math.max(0, (new Date(t.started_at!).getTime() - new Date(t.created_at!).getTime()) / 86_400_000)
  )
  const avgDays = realDays.length
    ? Math.round((realDays.reduce((a, b) => a + b, 0) / realDays.length) * 10) / 10
    : 0

  // Tareas aún asignadas (proxy: tiempo de espera actual)
  const asignadas = tasks.filter(t => t.estado === 'Asignada' && t.created_at)
  const pendingDays = asignadas.map(t =>
    Math.max(0, (now - new Date(t.created_at!).getTime()) / 86_400_000)
  )
  const avgPendingDays = pendingDays.length
    ? Math.round((pendingDays.reduce((a, b) => a + b, 0) / pendingDays.length) * 10) / 10
    : 0

  return {
    avgDays,
    samplesReal:    started.length,
    pending:        asignadas.length,
    pendingOver24h: pendingDays.filter(d => d > 1).length,
    pendingOver72h: pendingDays.filter(d => d > 3).length,
    avgPendingDays,
  }
}

// ── KPI por Área ──────────────────────────────────────────

export interface AreaKpi {
  area:         string
  total:        number
  red:          number
  yellow:       number
  green:        number
  blue:         number      // completadas
  otcr:         number      // %
  leadTime:     number      // días promedio
  productivity: ProductivityResult
  deviationAvg: number      // días promedio de retraso (contador_retrasos como proxy)
  pimponeo:     number      // comentarios promedio por tarea (requiere datos externos)
}

export function calcAreaKpis(tasks: RcTask[], areas: string[]): AreaKpi[] {
  return areas.map(area => {
    const at = tasks.filter(t => t.area === area)
    let red = 0, yellow = 0, green = 0, blue = 0

    for (const t of at) {
      const s = getSemaphore(t.plazo, t.estado)
      if (s.color === 'red')    red++
      else if (s.color === 'yellow') yellow++
      else if (s.color === 'green')  green++
      else if (s.color === 'blue')   blue++
    }

    const delayed = at.filter(t => t.contador_retrasos > 0)
    const deviationAvg = delayed.length
      ? Math.round(delayed.reduce((s, t) => s + t.contador_retrasos, 0) / delayed.length * 10) / 10
      : 0

    return {
      area,
      total:        at.length,
      red, yellow, green, blue,
      otcr:         calcOTCR(at).rate,
      leadTime:     calcLeadTime(at).avg,
      productivity: calcNetProductivity(at),
      deviationAvg,
      pimponeo:     0,   // se inyecta externamente
    }
  })
}
