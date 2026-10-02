/**
 * CAJA REAL COBRADA — cuándo llega de verdad la plata de la venta a crédito.
 *
 * Diseño aprobado por el usuario el 2-oct-2026 (patrón MEDIDO por cliente, montos
 * en BRUTO = lo que llega al banco, pestaña propia en Administración). Se arma en
 * etapas; esta es la 1: cobros CONFIRMADOS (facturas ya emitidas e impagas).
 *
 * Modelo, en términos del pedido original:
 *   · vencimiento     = emisión + plazo pactado (clientes.dias_pago; el ERP no entrega
 *                       la fecha de vencimiento).
 *   · desvío          = días reales de pago − plazo pactado, PONDERADO POR MONTO sobre
 *                       los pagos de los últimos 12 meses (RPC comportamiento_pago_ponderado).
 *                       Negativo = paga antes del vencimiento.
 *   · cobro esperado  = vencimiento + desvío, corrido al lunes si cae en fin de semana
 *                       (los clientes a crédito pagan sólo lun-vie, medido en cobros_erp).
 *   · historial corto = menos de `minPagosPropios` pagos → desvío promedio de su SEGMENTO:
 *                       "moroso" si hoy tiene deuda vencida en el informe Deudores, si no
 *                       "cumple".
 *
 * Lo medido (2-oct-2026, 12 meses, $369 M) no calza con el supuesto inicial de
 * "80% en plazo / 20% a +30 días": 31% paga en plazo o antes (−4 días promedio),
 * 33% entre 1 y 7 días tarde y 36% más de 7 días tarde (+20 días promedio). Por eso
 * se usa el comportamiento de cada cliente y no un parámetro global.
 */

import { lunesDe, normalizarNombreCliente } from './finanzas'
import { semanaISO, siguienteHabil } from './calendarioEntradas'
import type { FacturaImpaga } from './proyeccionCobros'
import { esClienteCobroInmediato, esClienteExcluido } from '@/lib/types'

export const PARAMETROS_CAJA = {
  /** Pagos propios mínimos para usar el desvío del cliente en vez del de su segmento. */
  minPagosPropios: 3,
  /** Ventana del comportamiento de pago. */
  ventanaDias: 365,
} as const

export type Segmento = 'cumple' | 'moroso'

/** Terceros que están en la lista de cuentas internas por otro motivo (co-packing) pero
 *  pagan a crédito como cualquier cliente: su plata sí llega al banco. */
const TERCEROS_EN_LISTA_INTERNA = ['ewu ginger beer']

/**
 * ¿Este cliente entra al modelo de crédito? Quedan fuera las cuentas propias (PDV,
 * BaseCamp El Regreso, ferias, marketing, mermas, muestras, calidad…): no son clientes
 * con plazo y su "comportamiento de pago" no significa nada — medido el 2-oct-2026,
 * Cliente PDV figuraba con 8.145 pagos a 128 días y torcía el segmento "cumple" a +34
 * días. Además concentran $186 M del saldo del informe Deudores sin ser cartera real.
 */
export function esClienteCredito(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  if (!n.trim() || esClienteCobroInmediato(n)) return false
  if (TERCEROS_EN_LISTA_INTERNA.some(t => n.includes(t))) return true
  return !esClienteExcluido(n)
}

/** Una fila de comportamiento_pago_ponderado. */
export interface PagosCliente {
  cliente: string
  pagos: number
  monto: number
  /** Días entre emisión y pago, ponderados por monto. */
  diasPonderado: number
}

export interface PerfilPago {
  pactado: number
  /** Días respecto del vencimiento (negativo = antes). */
  desvio: number
  fuente: 'propio' | 'segmento'
  segmento: Segmento
  pagos: number
}

export interface PerfilesPago {
  perfilDe(cliente: string): PerfilPago
  segmentos: Record<Segmento, { desvio: number; clientes: number; monto: number }>
}

const DIA = 86_400_000
export const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10)

/**
 * Perfil de pago de cada cliente: plazo pactado + desvío (propio o de su segmento).
 * `pactadoPorDefecto` cubre a quien no tiene plazo en su ficha (mediana de la cartera).
 */
export function perfilesPago({ pagos, pactadoPorCliente, morosos, pactadoPorDefecto, minPagos = PARAMETROS_CAJA.minPagosPropios }: {
  pagos: PagosCliente[]
  /** Clave = nombre normalizado. */
  pactadoPorCliente: Map<string, number>
  /** Nombres normalizados con deuda vencida hoy. */
  morosos: Set<string>
  pactadoPorDefecto: number
  minPagos?: number
}): PerfilesPago {
  const pactadoDe = (k: string) => pactadoPorCliente.get(k) ?? pactadoPorDefecto
  const segmentoDe = (k: string): Segmento => (morosos.has(k) ? 'moroso' : 'cumple')

  const propios = new Map<string, { desvio: number; pagos: number }>()
  const acc: Record<Segmento, { suma: number; monto: number; clientes: number }> = {
    cumple: { suma: 0, monto: 0, clientes: 0 }, moroso: { suma: 0, monto: 0, clientes: 0 },
  }
  for (const p of pagos) {
    const k = normalizarNombreCliente(p.cliente)
    if (!k || p.monto <= 0 || !esClienteCredito(p.cliente)) continue
    const desvio = p.diasPonderado - pactadoDe(k)
    if (p.pagos >= minPagos) {
      propios.set(k, { desvio, pagos: p.pagos })
      const s = acc[segmentoDe(k)]
      s.suma += desvio * p.monto; s.monto += p.monto; s.clientes++
    }
  }
  // Un segmento sin clientes medidos toma el promedio de toda la cartera medida.
  const global = (acc.cumple.suma + acc.moroso.suma) / ((acc.cumple.monto + acc.moroso.monto) || 1)
  const segmentos = {
    cumple: { desvio: acc.cumple.monto ? acc.cumple.suma / acc.cumple.monto : global, clientes: acc.cumple.clientes, monto: acc.cumple.monto },
    moroso: { desvio: acc.moroso.monto ? acc.moroso.suma / acc.moroso.monto : global, clientes: acc.moroso.clientes, monto: acc.moroso.monto },
  }

  return {
    segmentos,
    perfilDe(cliente) {
      const k = normalizarNombreCliente(cliente)
      const segmento = segmentoDe(k)
      const propio = propios.get(k)
      return propio
        ? { pactado: pactadoDe(k), desvio: propio.desvio, fuente: 'propio', segmento, pagos: propio.pagos }
        : { pactado: pactadoDe(k), desvio: segmentos[segmento].desvio, fuente: 'segmento', segmento, pagos: 0 }
    },
  }
}

export interface FacturaConfirmada {
  factura: string
  cliente: string
  emision: string
  vencimiento: string
  cobroEsperado: string
  bruto: number
  perfil: PerfilPago
}

export interface SemanaCaja {
  lunes: string
  semanaIso: number
  confirmado: number
  facturas: number
}

export interface CobrosConfirmados {
  semanas: SemanaCaja[]
  /** Su cobro esperado ya pasó y no aparece pagada: se muestra aparte, no se reparte
   *  en semanas futuras (el backtest de cobranza mostró que proyectarla empeora el modelo). */
  atrasado: { monto: number; facturas: number; detalle: FacturaConfirmada[] }
  /** Cobro esperado después del horizonte (31-dic). */
  despuesDelHorizonte: { monto: number; facturas: number }
  /** Cuánto del monto se proyectó con desvío propio vs. de segmento. */
  cobertura: { propio: number; segmento: number }
  total: number
  detalle: FacturaConfirmada[]
}

/** Lunes de cada semana desde la de `hoyISO` hasta la que contiene `hastaISO`. */
export function semanasHasta(hoyISO: string, hastaISO: string): SemanaCaja[] {
  const out: SemanaCaja[] = []
  for (let l = lunesDe(hoyISO); l <= hastaISO; l = sumarDias(l, 7)) out.push({ lunes: l, semanaIso: semanaISO(l), confirmado: 0, facturas: 0 })
  return out
}

/** Fecha esperada de cobro de una factura según el perfil del cliente. */
export function fechaCobroEsperada(emision: string, perfil: Pick<PerfilPago, 'pactado' | 'desvio'>): { vencimiento: string; cobro: string } {
  const vencimiento = sumarDias(emision, perfil.pactado)
  // Nunca antes de la emisión, aunque el desvío sea muy negativo.
  const dias = Math.max(0, perfil.pactado + Math.round(perfil.desvio))
  return { vencimiento, cobro: siguienteHabil(sumarDias(emision, dias)) }
}

export function cobrosConfirmados({ facturas, perfiles, hoyISO, hastaISO }: {
  facturas: Map<string, FacturaImpaga>
  perfiles: PerfilesPago
  hoyISO: string
  hastaISO: string
}): CobrosConfirmados {
  const semanas = semanasHasta(hoyISO, hastaISO)
  const idx = new Map(semanas.map((s, i) => [s.lunes, i]))
  const atrasado = { monto: 0, facturas: 0, detalle: [] as FacturaConfirmada[] }
  const despuesDelHorizonte = { monto: 0, facturas: 0 }
  const cobertura = { propio: 0, segmento: 0 }
  const detalle: FacturaConfirmada[] = []

  for (const [factura, f] of facturas) {
    if (f.bruto <= 0 || !esClienteCredito(f.cliente)) continue
    const perfil = perfiles.perfilDe(f.cliente)
    const { vencimiento, cobro } = fechaCobroEsperada(f.fechaEntrega, perfil)
    const fila: FacturaConfirmada = { factura, cliente: f.cliente, emision: f.fechaEntrega, vencimiento, cobroEsperado: cobro, bruto: f.bruto, perfil }
    detalle.push(fila)
    cobertura[perfil.fuente] += f.bruto
    if (cobro < hoyISO) { atrasado.monto += f.bruto; atrasado.facturas++; atrasado.detalle.push(fila); continue }
    if (cobro > hastaISO) { despuesDelHorizonte.monto += f.bruto; despuesDelHorizonte.facturas++; continue }
    const s = semanas[idx.get(lunesDe(cobro))!]
    s.confirmado += f.bruto
    s.facturas++
  }
  atrasado.detalle.sort((a, b) => b.bruto - a.bruto)
  return { semanas, atrasado, despuesDelHorizonte, cobertura, total: detalle.reduce((s, f) => s + f.bruto, 0), detalle }
}
