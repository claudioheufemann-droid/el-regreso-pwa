/**
 * "¿Cuánta plata entra, semana a semana y día a día?" — la vista simple de la
 * pestaña Caja (pedido de Claudio, 26-oct-2026: la planilla de nueve columnas
 * del modelo "no se entendía").
 *
 * Se puede mirar por tipo de venta (filtros de la vista), cada uno con su regla:
 *
 *   · Fábrica (clientes a crédito) y Enlatado móvil (EWU, Bundor): cada
 *     factura por cobrar entra el día que VENCE (emisión + días de crédito; si
 *     vence sábado o domingo, el lunes: los clientes con crédito no pagan el
 *     fin de semana). Misma regla que Deudores.
 *   · PDV (mostrador y ferias) y BaseCamp (restaurante, Toteat): se cobran al
 *     contado, no hay factura esperando. Lo que viene es una ESTIMACIÓN: su
 *     promedio semanal repartido con su patrón real por día de la semana.
 *
 * Lo que ya pasó no se estima: es lo que entró de verdad (cobros_erp; BaseCamp,
 * ventas_restaurante). Excepción: días pasados de BaseCamp sin venta cargada
 * (el Toteat se sube a mano) muestran lo estimado, marcado como tal.
 *
 *   · Semana en curso: entró (lunes → hoy) + falta (lo que vence y sigue impago,
 *     incluido lo que venció el lunes y aún no llega, más lo estimado de contado).
 *   · Lo vencido ANTES de esta semana no cae en ninguna: no hay fecha en que
 *     se pueda esperar, va aparte como "vencido sin pagar".
 *
 * "BaseCamp El Regreso" en cobros_erp es la cuenta interna con que el
 * restaurante le compra a la fábrica: no es plata que entre de afuera y se
 * deja fuera (contarla además de la venta del restaurante sería duplicar).
 *
 * Todo en bruto (con IVA/ILA): es lo que llega al banco. Código puro.
 */
import { lunesDe } from './finanzas'
import { semanaISO, siguienteHabil, sumarDiasISO } from './calendarioEntradas'
import type { FacturaCalendario } from './proyeccionCobros'
import { esClienteCredito } from './cajaCobrada'
import { esEnlatado } from './cajaCobradaDatos'

export type Segmento = 'fabrica' | 'enlatado' | 'pdv' | 'basecamp'
export const SEGMENTOS: Segmento[] = ['fabrica', 'enlatado', 'pdv', 'basecamp']

const esPdv = (cliente: string | null | undefined) => /cliente pdv|cliente feria/i.test(cliente ?? '') && !/merma/i.test(cliente ?? '')

/** Venta de fábrica: cliente a crédito (sin PDV, ferias, BaseCamp ni cuentas propias) que no es enlatado móvil. */
export const esVentaFabrica = (cliente: string | null | undefined) => esClienteCredito(cliente) && !esEnlatado(cliente)

/** A qué tipo de venta pertenece un pago o una factura. null = cuenta propia que no es plata de afuera. */
export function segmentoDeCliente(cliente: string | null | undefined): Exclude<Segmento, 'basecamp'> | null {
  if (esEnlatado(cliente)) return 'enlatado'
  if (esPdv(cliente)) return 'pdv'
  if (esVentaFabrica(cliente)) return 'fabrica'
  return null
}

const ceros = (): Record<Segmento, number> => ({ fabrica: 0, enlatado: 0, pdv: 0, basecamp: 0 })

export interface FacturaDelDia {
  cliente: string
  factura: string
  bruto: number
  /** Vencimiento impreso (puede ser sábado/domingo: el día efectivo es el lunes). */
  vencimiento: string
  diasCredito: number
  segmento: 'fabrica' | 'enlatado'
}

export interface DiaCobro {
  fecha: string
  /** 0 = lunes … 6 = domingo. */
  dow: number
  estado: 'pasado' | 'hoy' | 'futuro'
  /** Lo que entró de verdad ese día. null = día futuro. */
  entro: number | null
  /** Facturas que vencen ese día y siguen impagas. En un día pasado = vencieron sin pagar. */
  facturasMonto: number
  /** Contado estimado (PDV / BaseCamp) que falta para ese día. */
  estimado: number
  /** facturasMonto + estimado. */
  porEntrar: number
  entroPor: Record<Segmento, number>
  porEntrarPor: Record<Segmento, number>
  facturas: FacturaDelDia[]
}

export interface SemanaCobro {
  lunes: string
  domingo: string
  numero: number
  estado: 'pasada' | 'en_curso' | 'proxima'
  entro: number
  porEntrar: number
  /** entro + porEntrar: lo que debería entrar en total en la semana. */
  total: number
  /** Parte de porEntrar que es estimación de contado (PDV / BaseCamp). */
  estimado: number
  facturas: number
  totalPor: Record<Segmento, number>
  dias: DiaCobro[]
}

export interface CobrosSemanales {
  semanas: SemanaCobro[]
  /** Facturas vencidas antes de la semana en curso y todavía impagas. */
  vencidoAntes: { monto: number; facturas: number }
  /** Último día con pagos cargados. */
  ultimoPago: string | null
}

/** Lo que hace falta para estimar el contado (sale de DatosCalendario). */
export interface DatosContado {
  /** Promedio semanal de cobros del mostrador. */
  mostradorSemanal: number
  /** Reparto de la semana por día, lunes..domingo, suma 1. */
  patronMostrador: number[]
  /** Venta diaria real del restaurante (Toteat). */
  ventasBasecamp: Record<string, number>
  ultimaFechaBasecamp: string | null
  /** Monto semanal a estimar para BaseCamp (promedio real reciente o forecast). */
  basecampSemanal: number
  patronBasecamp: number[]
}

export function armarCobrosSemanales({ pendientes, pagos, hoyISO, segmentos = ['fabrica'], contado = null, semanasAtras = 1, minSemanasAdelante = 5 }: {
  pendientes: FacturaCalendario[]
  /** Pagos recibidos (cobros_erp), uno por fila. */
  pagos: { fecha: string; cliente: string; monto: number }[]
  hoyISO: string
  /** Tipos de venta a mostrar. */
  segmentos?: Segmento[]
  contado?: DatosContado | null
  semanasAtras?: number
  minSemanasAdelante?: number
}): CobrosSemanales {
  const lunesHoy = lunesDe(hoyISO)
  const ver = new Set(segmentos)

  const pagosPorDia = new Map<string, Record<Segmento, number>>()
  for (const p of pagos) {
    const seg = segmentoDeCliente(p.cliente)
    if (!seg) continue
    const dia = pagosPorDia.get(p.fecha) ?? ceros()
    dia[seg] += p.monto
    pagosPorDia.set(p.fecha, dia)
  }
  if (contado) {
    for (const [fecha, monto] of Object.entries(contado.ventasBasecamp)) {
      const dia = pagosPorDia.get(fecha) ?? ceros()
      dia.basecamp += monto
      pagosPorDia.set(fecha, dia)
    }
  }

  const porDia = new Map<string, FacturaDelDia[]>()
  const vencidoAntes = { monto: 0, facturas: 0 }
  let ultimoLunes = sumarDiasISO(lunesHoy, (minSemanasAdelante - 1) * 7)
  for (const p of pendientes) {
    const seg = segmentoDeCliente(p.cliente)
    if (p.bruto <= 0 || (seg !== 'fabrica' && seg !== 'enlatado') || !ver.has(seg)) continue
    const dia = siguienteHabil(p.fechaEsperadaPactada)
    if (dia < lunesHoy) { vencidoAntes.monto += p.bruto; vencidoAntes.facturas++; continue }
    const lista = porDia.get(dia) ?? []
    lista.push({ cliente: p.cliente, factura: p.factura, bruto: p.bruto, vencimiento: p.fechaEsperadaPactada, diasCredito: p.diasCredito, segmento: seg })
    porDia.set(dia, lista)
    const l = lunesDe(dia)
    if (l > ultimoLunes) ultimoLunes = l
  }

  /** Contado esperado para un día que todavía no tiene dato real (o lo tiene a medias, hoy). */
  const estimadoDia = (fecha: string, dow: number, seg: 'pdv' | 'basecamp', real: number): number => {
    if (!contado || !ver.has(seg)) return 0
    if (seg === 'pdv') {
      if (fecha < hoyISO) return 0
      return Math.max(0, contado.mostradorSemanal * contado.patronMostrador[dow] - real)
    }
    // BaseCamp: el Toteat se carga a mano y puede ir atrasado; sin venta cargada se estima.
    const sinDato = contado.ultimaFechaBasecamp == null || fecha > contado.ultimaFechaBasecamp
    if (!sinDato) return 0
    return Math.max(0, contado.basecampSemanal * contado.patronBasecamp[dow] - real)
  }

  const semanas: SemanaCobro[] = []
  for (let lunes = sumarDiasISO(lunesHoy, -7 * semanasAtras); lunes <= ultimoLunes; lunes = sumarDiasISO(lunes, 7)) {
    const estado: SemanaCobro['estado'] = lunes < lunesHoy ? 'pasada' : lunes === lunesHoy ? 'en_curso' : 'proxima'
    const dias: DiaCobro[] = Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDiasISO(lunes, i)
      const estadoDia: DiaCobro['estado'] = fecha < hoyISO ? 'pasado' : fecha === hoyISO ? 'hoy' : 'futuro'
      const reales = pagosPorDia.get(fecha) ?? ceros()
      const entroPor = ceros()
      if (estadoDia !== 'futuro') for (const s of SEGMENTOS) if (ver.has(s)) entroPor[s] = Math.round(reales[s])
      // La semana pasada no lleva facturas: lo que quedó impago va en "vencido antes".
      const facturas = estado === 'pasada' ? [] : (porDia.get(fecha) ?? []).slice().sort((a, b) => b.bruto - a.bruto)
      const porEntrarPor = ceros()
      for (const f of facturas) porEntrarPor[f.segmento] += f.bruto
      porEntrarPor.pdv = Math.round(estimadoDia(fecha, i, 'pdv', entroPor.pdv))
      porEntrarPor.basecamp = Math.round(estimadoDia(fecha, i, 'basecamp', entroPor.basecamp))
      const facturasMonto = facturas.reduce((s, f) => s + f.bruto, 0)
      const estimado = porEntrarPor.pdv + porEntrarPor.basecamp
      return {
        fecha, dow: i, estado: estadoDia,
        entro: estadoDia === 'futuro' ? null : SEGMENTOS.reduce((s, k) => s + entroPor[k], 0),
        facturasMonto, estimado, porEntrar: facturasMonto + estimado,
        entroPor, porEntrarPor, facturas,
      }
    })
    const entro = dias.reduce((s, d) => s + (d.entro ?? 0), 0)
    const porEntrar = dias.reduce((s, d) => s + d.porEntrar, 0)
    const totalPor = ceros()
    for (const d of dias) for (const s of SEGMENTOS) totalPor[s] += d.entroPor[s] + d.porEntrarPor[s]
    semanas.push({
      lunes, domingo: sumarDiasISO(lunes, 6), numero: semanaISO(lunes), estado,
      entro, porEntrar, total: entro + porEntrar,
      estimado: dias.reduce((s, d) => s + d.estimado, 0),
      facturas: dias.reduce((s, d) => s + d.facturas.length, 0),
      totalPor, dias,
    })
  }

  const fechasPago = pagos.filter(p => p.monto > 0).map(p => p.fecha).sort()
  return { semanas, vencidoAntes, ultimoPago: fechasPago.length ? fechasPago[fechasPago.length - 1] : null }
}
