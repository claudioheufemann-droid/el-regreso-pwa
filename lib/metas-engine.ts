// Lógica de negocio para el módulo de control y seguimiento de metas comerciales.
// Todas las metas son en LITROS. Días hábiles = lunes a viernes (sin feriados).

export type EstadoSemaforo = 'verde' | 'amarillo' | 'rojo'

export interface AnalyticsCanal {
  canal: string
  metaMensual: number
  metaSemanal: number
  realizadoMes: number
  realizadoSemana: number
  metaEsperadaMes: number
  metaEsperadaSemana: number
  pctMes: number
  pctSemana: number
  semaforoMes: EstadoSemaforo
  semaforoSemana: EstadoSemaforo
}

export interface AnalyticsVendedor {
  vendedor: string
  fecha: string

  // Mensual
  metaMensual: number
  realizadoMes: number
  metaEsperadaMes: number
  pctCumplimientoMes: number
  semaforoMes: EstadoSemaforo
  diasHabilesMes: number
  diasTranscurridosMes: number
  diasRestantesMes: number
  faltanteMes: number
  promedioNecesarioDiarioMes: number
  mensajeMes: string | null

  // Semanal
  semanaLabel: string
  metaSemanal: number
  realizadoSemana: number
  metaEsperadaSemana: number
  pctCumplimientoSemana: number
  semaforoSemana: EstadoSemaforo
  diasHabilesSemana: number
  diasTranscurridosSemana: number
  diasRestantesSemana: number
  faltanteSemana: number
  promedioNecesarioDiarioSemana: number
  mensajeSemana: string | null

  // Por canal
  porCanal: AnalyticsCanal[]
}

/** Retorna un array con todas las fechas hábiles (L-V) en el rango [inicio, fin] inclusive. */
export function getDiasHabiles(inicio: Date, fin: Date): Date[] {
  const dias: Date[] = []
  const d = new Date(inicio)
  d.setHours(0, 0, 0, 0)
  const f = new Date(fin)
  f.setHours(0, 0, 0, 0)

  while (d <= f) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) dias.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

/** Días hábiles transcurridos hasta fechaRef inclusive. */
export function getDiasHabilesTranscurridos(diasHabiles: Date[], fechaRef: Date): number {
  const ref = new Date(fechaRef)
  ref.setHours(23, 59, 59, 999)
  return diasHabiles.filter(d => d <= ref).length
}

/**
 * Meta proporcional esperada a la fecha dada.
 * metaTotal * (diasTranscurridos / totalDias)
 */
export function getMetaEsperadaAFecha(
  metaTotal: number,
  diasHabiles: Date[],
  fechaRef: Date
): number {
  if (diasHabiles.length === 0) return 0
  const transcurridos = getDiasHabilesTranscurridos(diasHabiles, fechaRef)
  return (metaTotal * transcurridos) / diasHabiles.length
}

/** %C = (realizado / meta) × 100 */
export function calcularCumplimiento(realizado: number, meta: number): number {
  if (meta <= 0) return 0
  return (realizado / meta) * 100
}

/**
 * Semáforo comparando realizado vs meta esperada a la fecha.
 * Verde >= 95%, Amarillo 75–95%, Rojo < 75%
 */
export function getEstadoSemaforo(realizado: number, metaEsperada: number): EstadoSemaforo {
  if (metaEsperada <= 0) return 'verde'
  const pct = (realizado / metaEsperada) * 100
  if (pct >= 95) return 'verde'
  if (pct >= 75) return 'amarillo'
  return 'rojo'
}

/** Mensaje predictivo: litros/día necesarios para cumplir la meta en el tiempo restante. */
export function getMensajePredictivo(faltante: number, diasRestantes: number): string | null {
  if (diasRestantes <= 0) return null
  if (faltante <= 0) return null
  const avg = faltante / diasRestantes
  return `Necesitas promediar ${avg.toFixed(1)} L/día en los ${diasRestantes} días hábiles restantes`
}

export const SEMAFORO_COLORS: Record<EstadoSemaforo, string> = {
  verde:    '#4A7A3A',
  amarillo: '#D4AF37',
  rojo:     '#FF4444',
}

export const SEMAFORO_BG: Record<EstadoSemaforo, string> = {
  verde:    'rgba(74,122,58,0.12)',
  amarillo: 'rgba(212,175,55,0.12)',
  rojo:     'rgba(255,68,68,0.12)',
}

export const SEMAFORO_LABELS: Record<EstadoSemaforo, string> = {
  verde:    'En meta',
  amarillo: 'En riesgo',
  rojo:     'Bajo meta',
}

/** Colores por canal de venta */
export const CANAL_COLORS: Record<string, string> = {
  'Bar':                    '#D4AF37',
  'Supermercado':           '#60A5FA',
  'Minimarket':             '#4ADE80',
  'Distribuidor':           '#86EFAC',
  'Botillería':             '#A78BFA',
  'Cafetería':              '#FB923C',
  'Cliente Directo':        '#E879F9',
  'Almacén':                '#FCD34D',
  'Restaurante':            '#F472B6',
  'Actividades Turísticas': '#38BDF8',
  'Otros':                  '#6B7280',
}
