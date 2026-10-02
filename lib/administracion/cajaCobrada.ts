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

/* ═══════════════ Etapa 2: cobros PROYECTADOS (venta que todavía no se factura) ═══════════════ */

/** Un tramo del mix de plazos de la venta a crédito reciente. */
export interface TramoPlazo {
  pactado: number
  /** Parte de la venta a crédito que tiene este plazo (0-1). */
  participacion: number
  /** Días reales medios emisión→pago de los clientes de este tramo (pactado + desvío), ponderados por venta. */
  diasMedios: number
}

/**
 * Mix histórico de plazos (1/7/15/30…) y el patrón de pago real de cada tramo, a
 * partir de la venta a crédito reciente por cliente. Es lo que se aplica a la venta
 * proyectada, que todavía no tiene cliente.
 */
export function mixDePlazos(ventas: { cliente: string; bruto: number }[], perfiles: PerfilesPago): TramoPlazo[] {
  const acc = new Map<number, { monto: number; dias: number }>()
  let total = 0
  for (const v of ventas) {
    if (v.bruto <= 0 || !esClienteCredito(v.cliente)) continue
    const p = perfiles.perfilDe(v.cliente)
    const a = acc.get(p.pactado) ?? { monto: 0, dias: 0 }
    a.monto += v.bruto
    a.dias += Math.max(0, p.pactado + p.desvio) * v.bruto
    acc.set(p.pactado, a)
    total += v.bruto
  }
  if (total <= 0) return []
  return [...acc.entries()].sort((a, b) => a[0] - b[0])
    .map(([pactado, a]) => ({ pactado, participacion: a.monto / total, diasMedios: a.dias / a.monto }))
}

/** 0 = lunes … 6 = domingo. */
const dow = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7

/**
 * Reparte un monto en los días de [inicio, fin] desde `desde`, con el peso de cada día
 * de la semana (`patron`, 7 valores lun→dom: cómo se factura de verdad). Si el patrón
 * no da peso a ningún día del rango, reparte parejo de lunes a viernes.
 */
export function repartirEnDias(inicio: string, fin: string, monto: number, patron: number[], desde: string): { fecha: string; monto: number }[] {
  const dias: string[] = []
  for (let d = inicio < desde ? desde : inicio; d <= fin; d = sumarDias(d, 1)) dias.push(d)
  if (!dias.length || monto <= 0) return []
  let pesos = dias.map(d => patron[dow(d)] ?? 0)
  if (pesos.reduce((a, b) => a + b, 0) <= 0) pesos = dias.map(d => (dow(d) < 5 ? 1 : 0))
  const suma = pesos.reduce((a, b) => a + b, 0) || 1
  return dias.map((fecha, i) => ({ fecha, monto: (monto * pesos[i]) / suma })).filter(x => x.monto > 0)
}

/** Venta futura a crédito, en bruto: del forecast (sin cliente) o de pedidos sin despachar (con cliente). */
export interface EmisionProyectada {
  fecha: string
  bruto: number
  origen: 'forecast' | 'pedido'
  cliente?: string
}

export interface Cobro { fecha: string; monto: number }

export interface CobrosProyectados {
  porSemana: Map<string, number>
  /** Se cobraría después del horizonte. */
  despuesDelHorizonte: number
  cobros: Cobro[]
  total: number
}

export function cobrosProyectados({ emisiones, mix, perfiles, hastaISO }: {
  emisiones: EmisionProyectada[]
  mix: TramoPlazo[]
  perfiles: PerfilesPago
  hastaISO: string
}): CobrosProyectados {
  const porSemana = new Map<string, number>()
  const cobros: Cobro[] = []
  let despuesDelHorizonte = 0
  let total = 0
  const anotar = (fecha: string, monto: number) => {
    total += monto
    if (fecha > hastaISO) { despuesDelHorizonte += monto; return }
    cobros.push({ fecha, monto })
    const l = lunesDe(fecha)
    porSemana.set(l, (porSemana.get(l) ?? 0) + monto)
  }
  for (const e of emisiones) {
    if (e.bruto <= 0) continue
    if (e.cliente) { anotar(fechaCobroEsperada(e.fecha, perfiles.perfilDe(e.cliente)).cobro, e.bruto); continue }
    // Sin tramos medidos no se inventa un plazo: queda fuera del horizonte y la cuadratura lo muestra.
    if (!mix.length) { total += e.bruto; despuesDelHorizonte += e.bruto; continue }
    for (const t of mix) anotar(siguienteHabil(sumarDias(e.fecha, Math.round(t.diasMedios))), e.bruto * t.participacion)
  }
  return { porSemana, despuesDelHorizonte, cobros, total }
}

/* ═══════════════ Etapa 3: salidas (semana a semana y mes a mes) ═══════════════ */

export interface SemanaCajaCompleta {
  lunes: string
  semanaIso: number
  /** Facturas emitidas e impagas que deberían pagarse esa semana. */
  confirmado: number
  /** Venta futura a crédito (forecast + pedidos sin despachar) que se cobraría esa semana. */
  proyectado: number
  /** Venta al contado (mostrador PDV + restaurante BaseCamp): promedio real reciente. */
  contado: number
  /** confirmado + proyectado + contado. */
  entradas: number
  /** Pagos a proveedores: comprometidos cargados + compras proyectadas. */
  salidas: number
  /** entradas − salidas. */
  neto: number
  /** Saldo de bancos (si está cargado) + neto acumulado. */
  acumulado: number
}

export interface MesCaja {
  /** yyyy-mm (mes calendario: la caja se mide por mes de banco, no por ciclo 24→23). */
  mes: string
  /** Venta a crédito facturada (real del mes en curso + proyectada), bruto. */
  facturado: number
  /** Caja cobrada a crédito (real del mes en curso + esperada), bruto. */
  cobrado: number
  /** Saldo por cobrar a crédito al cierre del mes. */
  saldoCierre: number
}

export interface Cuadratura {
  carteraInicial: number
  facturadoFuturo: number
  cobradoFuturo: number
  saldoFinal: number
  diferencia: number
  ok: boolean
  mensaje: string
}

export interface CajaCobrada {
  semanas: SemanaCajaCompleta[]
  meses: MesCaja[]
  atrasado: CobrosConfirmados['atrasado']
  cuadratura: Cuadratura
  saldoInicialBanco: number | null
}

const mesDe = (iso: string) => iso.slice(0, 7)
const sumaMap = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

export function armarCajaCobrada({
  confirmados, proyectados, emisiones, contadoSemanal, salidasPorSemana, saldoInicialBanco, hoyISO, hastaISO, realMesEnCurso,
}: {
  confirmados: CobrosConfirmados
  proyectados: CobrosProyectados
  emisiones: EmisionProyectada[]
  contadoSemanal: number
  salidasPorSemana: Map<string, number>
  saldoInicialBanco: number | null
  hoyISO: string
  hastaISO: string
  /** Lo ya facturado y cobrado a crédito en el mes calendario en curso (hasta ayer). */
  realMesEnCurso: { facturado: number; cobrado: number }
}): CajaCobrada {
  let acumulado = saldoInicialBanco ?? 0
  const semanas: SemanaCajaCompleta[] = confirmados.semanas.map(s => {
    const proyectado = proyectados.porSemana.get(s.lunes) ?? 0
    // La semana en curso ya tiene días pasados: el contado se prorratea a los días que quedan.
    const pasados = s.lunes < hoyISO ? Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${s.lunes}T00:00:00Z`)) / DIA) : 0
    const contado = contadoSemanal * (Math.max(0, 7 - pasados) / 7)
    const entradas = s.confirmado + proyectado + contado
    const salidas = salidasPorSemana.get(s.lunes) ?? 0
    const neto = entradas - salidas
    acumulado += neto
    return { lunes: s.lunes, semanaIso: s.semanaIso, confirmado: s.confirmado, proyectado, contado, entradas, salidas, neto, acumulado }
  })

  // ── Meses calendario, del en curso al del horizonte ──
  const facturadoFuturo = new Map<string, number>()
  for (const e of emisiones) if (e.fecha <= hastaISO) facturadoFuturo.set(mesDe(e.fecha), (facturadoFuturo.get(mesDe(e.fecha)) ?? 0) + e.bruto)
  const cobradoFuturo = new Map<string, number>()
  const sumarCobro = (fecha: string, monto: number) => cobradoFuturo.set(mesDe(fecha), (cobradoFuturo.get(mesDe(fecha)) ?? 0) + monto)
  for (const f of confirmados.detalle) if (f.cobroEsperado >= hoyISO && f.cobroEsperado <= hastaISO) sumarCobro(f.cobroEsperado, f.bruto)
  for (const c of proyectados.cobros) sumarCobro(c.fecha, c.monto)

  const meses: MesCaja[] = []
  let saldo = confirmados.total
  for (let m = mesDe(hoyISO); m <= mesDe(hastaISO); m = sumarDias(`${m}-01`, 32).slice(0, 7)) {
    const fFut = facturadoFuturo.get(m) ?? 0
    const cFut = cobradoFuturo.get(m) ?? 0
    saldo += fFut - cFut
    const enCurso = m === mesDe(hoyISO)
    meses.push({
      mes: m,
      facturado: fFut + (enCurso ? realMesEnCurso.facturado : 0),
      cobrado: cFut + (enCurso ? realMesEnCurso.cobrado : 0),
      saldoCierre: saldo,
    })
  }

  /* ── Etapa 4: cuadratura ──
     cartera inicial + facturado futuro = cobrado futuro + saldo por cobrar al cierre.
     El saldo final se calcula POR SEPARADO (lo atrasado + lo que se cobra después del
     horizonte), no despejado de la fórmula: si algún monto se perdiera o se contara dos
     veces en el reparto a semanas/meses, la diferencia lo delata. `emisiones` debe venir
     ya recortada al horizonte (lo mismo que se pasó a cobrosProyectados). */
  const carteraInicial = confirmados.total
  const factFut = sumaMap(facturadoFuturo)
  const cobFut = sumaMap(cobradoFuturo)
  const saldoFinal = confirmados.atrasado.monto + confirmados.despuesDelHorizonte.monto + proyectados.despuesDelHorizonte
  const diferencia = carteraInicial + factFut - cobFut - saldoFinal
  const ok = Math.abs(diferencia) < 1
  return {
    semanas, meses, atrasado: confirmados.atrasado, saldoInicialBanco,
    cuadratura: {
      carteraInicial, facturadoFuturo: factFut, cobradoFuturo: cobFut, saldoFinal, diferencia, ok,
      mensaje: ok
        ? 'Cuadra: cartera inicial + facturado = cobrado + saldo por cobrar.'
        : `No cuadra por $${Math.round(diferencia).toLocaleString('es-CL')}: hay plata que se pierde o se cuenta dos veces entre facturas, semanas y meses. No usar estas cifras hasta revisarlo.`,
    },
  }
}

/**
 * Backtest walk-forward (scripts/analisis/backtest-caja-cobrada.ts, corrida del
 * 2-oct-2026): parado el 1.º de cada mes, con perfiles medidos sólo con pagos
 * anteriores, contra lo que de verdad entró por venta a crédito (cobros_erp). Mide el
 * modelo de PAGO (las facturas del mes entran con su fecha real).
 *
 * Lectura honesta: error mensual medio 16,3% en jul-sep (16,8% en 6 meses), casi igual
 * que usar sólo el plazo pactado (16,1%). A nivel mensual el desvío medido todavía no
 * le gana al pactado; a nivel semanal sí (backtest de cobranza: correlación 0,49 vs 0,23).
 * ~25% de lo que entra cada mes son pagos sin factura imputada o de facturas viejas que
 * el modelo por factura no ve; sumar un promedio de eso EMPEORÓ el error (35%), porque
 * parte de esas facturas el modelo ya las cuenta como pendientes. Mayo-2026 (−36%) fue
 * un mes atípico de recuperación de deuda.
 */
export const BACKTEST_CAJA: { mes: string; real: number; modelo: number; soloPactado: number }[] = [
  { mes: '2026-04', real: 36_015_685, modelo: 37_355_768, soloPactado: 36_770_060 },
  { mes: '2026-05', real: 41_561_191, modelo: 26_436_790, soloPactado: 26_031_149 },
  { mes: '2026-06', real: 24_976_216, modelo: 27_927_569, soloPactado: 30_738_274 },
  { mes: '2026-07', real: 29_249_075, modelo: 26_055_200, soloPactado: 25_814_888 },
  { mes: '2026-08', real: 27_603_170, modelo: 32_607_089, soloPactado: 34_445_499 },
  { mes: '2026-09', real: 40_590_510, modelo: 32_560_234, soloPactado: 35_781_563 },
]
