/**
 * Calendario de entradas de la semana, día por día y por concepto de venta.
 *
 * Responde "¿qué día entra cuánta plata esta semana, y de qué?" con tres
 * conceptos que se calendarizan DISTINTO porque su plata llega distinto:
 *
 *   · Cobranza de facturas (clientes con crédito): cada factura impaga tiene su
 *     fecha esperada de pago (proyeccionCobros.ts), así que se ubica en su día
 *     exacto, con nombre de cliente. Dos escenarios: "real" (cómo paga de
 *     verdad cada cliente) y "pactado" (si todos cumplen su plazo).
 *   · Mostrador PDV (cobro inmediato): no hay factura esperando; es el
 *     promedio semanal de cobros del PDV repartido con el patrón REAL por día
 *     de la semana (vende viernes y sábado, casi nada domingo).
 *   · BaseCamp (restaurante): el forecast semanal del modelo repartido con el
 *     patrón por día de las ventas cargadas del Toteat.
 *
 * Los días que YA pasaron muestran lo que de verdad entró (cobros_erp /
 * ventas_restaurante), no lo que se esperaba: así "lo que va a entrar esta
 * semana" parte de lo que ya entró y suma lo que falta.
 *
 * Todo en BRUTO: es lo que llega al banco (neto + IVA/ILA), igual que el resto
 * del flujo de caja. Código puro, sin acceso a base ni a React.
 */
import { lunesDe } from './finanzas'
import type { FacturaCalendario } from './proyeccionCobros'

export type Escenario = 'real' | 'pactado'

/** Lo que el servidor entrega ya resumido; el navegador sólo combina. */
export interface DatosCalendario {
  hoyISO: string
  /** Pagos que YA entraron por día (cobros_erp): crédito y mostrador. */
  realesPorDia: Record<string, { credito: number; pdv: number }>
  /** Venta diaria real del restaurante (ventas_restaurante), por fecha. */
  realesBasecamp: Record<string, number>
  /** Última fecha con venta del restaurante cargada (se sube a mano: puede ir atrasada). */
  ultimaFechaBasecamp: string | null
  /** Reparto de una semana por día, lunes..domingo, suma 1. */
  patronMostrador: number[]
  patronBasecamp: number[]
  /** Promedio semanal de cobros del mostrador (12 semanas). */
  mostradorSemanal: number
  /** Monto esperado de BaseCamp por semana completa (lunes → bruto). */
  basecampSemanal: Record<string, number>
  basecampFuente: 'forecast' | 'historico' | 'sin_datos'
  /** Promedio semanal REAL de BaseCamp (últimas semanas completas cargadas), para contrastar con el forecast. */
  basecampPromedioReal: number | null
}

/** Con qué monto semanal se calendariza BaseCamp: el forecast del modelo o el promedio real reciente. */
export type BaseBasecamp = 'forecast' | 'promedio'

export interface DiaCalendario {
  fecha: string
  /** 0 = lunes … 6 = domingo. */
  dow: number
  /** real: ya pasó (se muestra lo que entró); hoy; futuro: se muestra lo esperado. */
  estado: 'real' | 'hoy' | 'futuro'
  facturas: number
  mostrador: number
  basecamp: number
  total: number
  /** Facturas esperadas ese día (sólo hoy/futuro), de mayor a menor. */
  detalleFacturas: { cliente: string; factura: string; bruto: number }[]
  /** BaseCamp de un día pasado sin venta cargada: se muestra lo esperado en vez de $0 falso. */
  basecampSinDato: boolean
}

export interface SemanaCalendario {
  lunes: string
  domingo: string
  numeroSemana: number
  dias: DiaCalendario[]
  totales: { facturas: number; mostrador: number; basecamp: number; total: number }
  /** Suma de lo que de verdad entró en los días que ya pasaron (sin contar BaseCamp estimado por falta de dato). */
  yaEntro: number
  /** BaseCamp de días pasados sin venta cargada: está sumado en el total del día como estimación, pero no cuenta como "ya entró". */
  sinDatoBasecamp: number
  /** Suma de hoy y los días que vienen (esperado). */
  falta: number
}

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

const MS_DIA = 86_400_000

export function sumarDiasISO(fechaISO: string, dias: number): string {
  return new Date(Date.parse(`${fechaISO}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10)
}

/** 0 = lunes … 6 = domingo. */
export function diaSemana(fechaISO: string): number {
  return (new Date(`${fechaISO}T00:00:00Z`).getUTCDay() + 6) % 7
}

/** Número de semana del año (ISO 8601: la que contiene el primer jueves de enero es la 1). */
export function semanaISO(fechaISO: string): number {
  const d = new Date(Date.parse(`${fechaISO}T00:00:00Z`))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAno.getTime()) / MS_DIA + 1) / 7)
}

/**
 * Los clientes con crédito pagan sólo de lunes a viernes (medido en cobros_erp:
 * cero pagos en fin de semana), así que lo que "vence" un sábado o domingo se
 * ve en el banco el lunes.
 */
export function siguienteHabil(fechaISO: string): string {
  const dow = diaSemana(fechaISO)
  return dow === 5 ? sumarDiasISO(fechaISO, 2) : dow === 6 ? sumarDiasISO(fechaISO, 1) : fechaISO
}

/** Lunes de la semana más antigua y más lejana que ofrece el selector. */
export function lunesDisponibles(hoyISO: string, atras = 1, adelante = 5): string[] {
  const actual = lunesDe(hoyISO)
  return Array.from({ length: atras + adelante + 1 }, (_, i) => sumarDiasISO(actual, (i - atras) * 7))
}

/** Reparto por día de la semana a partir de montos diarios; si no hay historia, parejo de lunes a sábado. */
export function patronPorDiaSemana(filas: { fecha: string; monto: number }[]): number[] {
  const sumas = [0, 0, 0, 0, 0, 0, 0]
  for (const f of filas) sumas[diaSemana(f.fecha)] += Math.max(0, f.monto)
  const total = sumas.reduce((a, b) => a + b, 0)
  return total > 0 ? sumas.map(s => s / total) : [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 0]
}

export function atrasadoEnEscenario(pendientes: FacturaCalendario[], escenario: Escenario): { monto: number; facturas: number } {
  let monto = 0, facturas = 0
  for (const p of pendientes) {
    if ((escenario === 'real' ? p.diasAtraso : p.diasAtrasoPactado) > 0) { monto += p.bruto; facturas++ }
  }
  return { monto, facturas }
}

export function armarSemana(
  datos: DatosCalendario, pendientes: FacturaCalendario[], lunes: string, escenario: Escenario,
  baseBasecamp: BaseBasecamp = 'forecast',
): SemanaCalendario {
  // Facturas esperadas por día efectivo (con el corrimiento de fin de semana). Las ya atrasadas NO se
  // calendarizan: su fecha pasó y darlas por cobradas "mañana" infla justo la plata que ya falló.
  const porDia = new Map<string, FacturaCalendario[]>()
  for (const p of pendientes) {
    const atraso = escenario === 'real' ? p.diasAtraso : p.diasAtrasoPactado
    if (atraso > 0) continue
    const dia = siguienteHabil(escenario === 'real' ? p.fechaEsperada : p.fechaEsperadaPactada)
    const lista = porDia.get(dia) ?? []
    lista.push(p)
    porDia.set(dia, lista)
  }

  const semanalBasecamp = baseBasecamp === 'promedio' && datos.basecampPromedioReal != null
    ? datos.basecampPromedioReal
    : datos.basecampSemanal[lunes] ?? 0
  const dias: DiaCalendario[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDiasISO(lunes, i)
    const estado: DiaCalendario['estado'] = fecha < datos.hoyISO ? 'real' : fecha === datos.hoyISO ? 'hoy' : 'futuro'
    const esperadoBasecamp = semanalBasecamp * datos.patronBasecamp[i]

    if (estado === 'real') {
      const r = datos.realesPorDia[fecha]
      const bc = datos.realesBasecamp[fecha]
      return {
        fecha, dow: i, estado, detalleFacturas: [], basecampSinDato: bc === undefined,
        facturas: Math.round(r?.credito ?? 0), mostrador: Math.round(r?.pdv ?? 0),
        basecamp: Math.round(bc ?? esperadoBasecamp), total: 0,
      }
    }
    const lista = (porDia.get(fecha) ?? []).slice().sort((a, b) => b.bruto - a.bruto)
    return {
      fecha, dow: i, estado, basecampSinDato: false,
      facturas: lista.reduce((s, p) => s + p.bruto, 0),
      mostrador: Math.round(datos.mostradorSemanal * datos.patronMostrador[i]),
      basecamp: Math.round(esperadoBasecamp), total: 0,
      detalleFacturas: lista.map(p => ({ cliente: p.cliente, factura: p.factura, bruto: p.bruto })),
    }
  })
  for (const d of dias) d.total = d.facturas + d.mostrador + d.basecamp

  const suma = (k: 'facturas' | 'mostrador' | 'basecamp' | 'total') => dias.reduce((s, d) => s + d[k], 0)
  const sinDatoBasecamp = dias.filter(d => d.estado === 'real' && d.basecampSinDato).reduce((s, d) => s + d.basecamp, 0)
  return {
    lunes, domingo: sumarDiasISO(lunes, 6), numeroSemana: semanaISO(lunes), dias,
    totales: { facturas: suma('facturas'), mostrador: suma('mostrador'), basecamp: suma('basecamp'), total: suma('total') },
    yaEntro: dias.filter(d => d.estado === 'real').reduce((s, d) => s + d.total, 0) - sinDatoBasecamp,
    sinDatoBasecamp,
    falta: dias.filter(d => d.estado !== 'real').reduce((s, d) => s + d.total, 0),
  }
}

/* ── Armado de los datos en el servidor ───────────────────────────────────── */

export interface PuntoForecastBasico { mes: string; tipo: string; monto: number }

/**
 * Resume lo que el calendario necesita. `inicioCiclo`/`finCiclo` se inyectan
 * (vienen de lib/produccion/reglas) para que este archivo no dependa de ellos.
 *
 * BaseCamp semanal: el forecast mensual (por ciclo 24→23) se reparte parejo por
 * día, igual que en la pestaña Forecast, y se suma por semana COMPLETA (lunes a
 * domingo, incluidos los días ya pasados, porque el reparto por patrón de día
 * necesita el total de la semana entera). Sin forecast, se usa el promedio de
 * las semanas con datos cargados.
 */
export function armarDatosCalendario(o: {
  hoyISO: string
  cobrosPorDia: { fecha: string; tipo: string; monto: number }[]
  ventasRestaurante: { fecha: string; monto: number }[]
  mostradorSemanal: number
  forecastRestaurante: PuntoForecastBasico[]
  inicioCiclo: (mes: string) => string
  finCiclo: (mes: string) => string
  semanasAdelante?: number
}): DatosCalendario {
  const { hoyISO } = o
  const lunesHoy = lunesDe(hoyISO)

  const realesPorDia: DatosCalendario['realesPorDia'] = {}
  const pdvDiario: { fecha: string; monto: number }[] = []
  for (const c of o.cobrosPorDia) {
    const dia = realesPorDia[c.fecha] ?? { credito: 0, pdv: 0 }
    if (c.tipo === 'pdv') { dia.pdv += c.monto; if (c.fecha < hoyISO) pdvDiario.push({ fecha: c.fecha, monto: c.monto }) }
    else dia.credito += c.monto
    realesPorDia[c.fecha] = dia
  }

  const realesBasecamp: Record<string, number> = {}
  for (const r of o.ventasRestaurante) realesBasecamp[r.fecha] = (realesBasecamp[r.fecha] ?? 0) + (Number(r.monto) || 0)
  const fechasBc = Object.keys(realesBasecamp).sort()

  // Forecast parejo por día de cada ciclo, agrupado por semana completa.
  const basecampSemanal: Record<string, number> = {}
  let hayForecast = false
  for (const p of o.forecastRestaurante) {
    if (p.tipo !== 'forecast') continue
    const ini = o.inicioCiclo(p.mes), fin = o.finCiclo(p.mes)
    const dias = Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${ini}T00:00:00Z`)) / MS_DIA) + 1
    if (dias <= 0) continue
    const porDiaMonto = p.monto / dias
    for (let d = 0; d < dias; d++) {
      const dia = sumarDiasISO(ini, d)
      const lunes = lunesDe(dia)
      if (lunes < lunesHoy) continue
      basecampSemanal[lunes] = (basecampSemanal[lunes] ?? 0) + porDiaMonto
      hayForecast = true
    }
  }

  // Promedio real de las últimas semanas completas (≥5 días cargados), siempre: sirve de contraste con el forecast.
  const porSemana = new Map<string, { monto: number; dias: number }>()
  for (const f of fechasBc) {
    const l = lunesDe(f)
    if (l >= lunesHoy) continue
    const acc = porSemana.get(l) ?? { monto: 0, dias: 0 }
    acc.monto += realesBasecamp[f]; acc.dias++
    porSemana.set(l, acc)
  }
  const completas = [...porSemana.entries()].filter(([, v]) => v.dias >= 5).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8)
  const basecampPromedioReal = completas.length > 0 ? completas.reduce((s, [, v]) => s + v.monto, 0) / completas.length : null

  let basecampFuente: DatosCalendario['basecampFuente'] = hayForecast ? 'forecast' : 'sin_datos'
  if (!hayForecast && basecampPromedioReal != null) {
    for (let i = 0; i < (o.semanasAdelante ?? 6); i++) basecampSemanal[sumarDiasISO(lunesHoy, i * 7)] = basecampPromedioReal
    basecampFuente = 'historico'
  }

  return {
    hoyISO, realesPorDia, realesBasecamp,
    ultimaFechaBasecamp: fechasBc.length ? fechasBc[fechasBc.length - 1] : null,
    patronMostrador: patronPorDiaSemana(pdvDiario),
    patronBasecamp: patronPorDiaSemana(o.ventasRestaurante.map(r => ({ fecha: r.fecha, monto: Number(r.monto) || 0 }))),
    mostradorSemanal: o.mostradorSemanal,
    basecampSemanal, basecampFuente, basecampPromedioReal,
  }
}
