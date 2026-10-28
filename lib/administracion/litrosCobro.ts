/**
 * LITROS PAGADOS Y POR PAGAR — pestaña principal de Administración y Finanzas (27-oct-2026).
 *
 * Responde, en litros y no en pesos, lo que el usuario necesita para la bolsa de vendedores
 * y para la planificación:
 *   1. ¿Cuántos litros nos pagaron en el ciclo (24→23), y de qué ciclo vienen? Un pago del
 *      ciclo puede ser de una venta del mismo ciclo o "arrastrada" de ciclos anteriores.
 *      (Cuadre del 24-sep→23-oct: 3.339 L de ventas del ciclo + 3.789 L arrastrados con
 *      factura, igual que el cálculo a mano para la bolsa.)
 *   2. ¿Cuántos litros quedan por pagar hoy (facturas emitidas e impagas)?
 *   3. ¿Cuántos litros van a entrar las próximas semanas? = facturas por pagar según cómo
 *      paga cada cliente + la venta proyectada que todavía no se factura + recupero de lo
 *      atrasado. Es el MISMO modelo de la Caja (cajaCobrada.ts): mismo perfil de pago por
 *      cliente, mismo mix de plazos y la misma calibración del backtest; sólo cambia la
 *      unidad. Por eso no se recalibra: un litro se paga cuando se paga la plata de su factura.
 *
 * Fuentes: RPC litros_pagados_por_pago (pagos de cobros_erp convertidos a litros de su
 * factura), ventas de los últimos 120 días, facturas impagas, forecast de Producción en litros.
 * Sólo clientes a crédito (esClienteCredito): PDV, BaseCamp y cuentas propias no son cobranza.
 */

import { brutoDeFila, esIngresoReal, lunesDe, normalizarNombreCliente, type FilaVentaFinanzas } from './finanzas'
import { semanaISO, siguienteHabil } from './calendarioEntradas'
import { CALIBRACION_BACKTEST, esClienteCredito, fechaCobroEsperada, horizonte, mixDePlazos, repartirEnDias, sumarDias, type PerfilesPago } from './cajaCobrada'
import type { FacturaImpaga } from './proyeccionCobros'
import { esEnlatado } from './cajaCobradaDatos'
import { ciclosDe, inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import { vendedorCanonico } from '@/lib/types'

/** Nombre vigente de la cartera (el ERP la renombra: 'Los Lagos' y 'Marion' son Marion Meza). */
const vendedorDe = (v: string | null | undefined) => vendedorCanonico((v ?? '').trim()) || 'Sin vendedor'

/** Una fila del RPC litros_pagados_por_pago (pagos de un día · cliente · ciclo de origen). */
export interface FilaLitrosPago {
  fecha: string
  cliente: string
  vendedor: string
  /** Ciclo (yyyy-mm-01) de la ENTREGA de la factura pagada; null si el pago no trae factura. */
  cicloOrigen: string | null
  /** Pago sin factura imputada: los litros salen del bruto por litro del cliente. */
  estimado: boolean
  monto: number
  litros: number | null
}

export type Origen = 'mismo' | 'anterior' | 'dosAntes' | 'antiguo' | 'estimado'
export const ORIGENES: Origen[] = ['mismo', 'anterior', 'dosAntes', 'antiguo', 'estimado']
export type PorOrigen = Record<Origen, number>
const ceroOrigen = (): PorOrigen => ({ mismo: 0, anterior: 0, dosAntes: 0, antiguo: 0, estimado: 0 })

export interface VendedorLitros {
  vendedor: string
  litros: number
  porOrigen: PorOrigen
  clientes: number
  /** Litros en facturas emitidas e impagas hoy, y de ellos los atrasados. */
  porPagar: number
  atrasados: number
}

export interface CicloPagado {
  /** yyyy-mm-01 (el ciclo de oct-26 va del 24-sep al 23-oct). */
  ciclo: string
  desde: string
  /** Último día contado: el cierre del ciclo, o hoy si está en curso. */
  hasta: string
  enCurso: boolean
  litros: number
  monto: number
  porOrigen: PorOrigen
  vendedores: VendedorLitros[]
  /** Pagos sin factura de clientes sin ventas en el año: quedan en pesos, fuera de los litros. */
  sinLitros: { monto: number; clientes: number }
}

export interface SemanaLitros {
  lunes: string
  semanaIso: number
  /** Litros ya pagados esa semana (hasta hoy). */
  pagados: number
  /** Esperado de facturas emitidas, según el comportamiento de cada cliente (calibrado). */
  facturas: number
  /** Esperado de venta que todavía no se factura: forecast + pedidos sin despachar (calibrado). */
  venta: number
  /** Recupero de facturas atrasadas, al ritmo medido. */
  atrasadas: number
  /** pagados + facturas + venta + atrasadas. */
  total: number
  tipo: 'pasada' | 'en_curso' | 'futura'
}

export interface DatosLitrosCobro {
  hayDatos: boolean
  /** El ciclo en curso primero, después los dos anteriores. */
  ciclos: CicloPagado[]
  semanas: SemanaLitros[]
  porPagar: { litros: number; alDia: number; atrasados: number; facturas: number; clientesAtrasados: number }
  proximas: { semanas: number; facturas: number; venta: number; atrasadas: number; total: number }
  supuestos: {
    /** Bruto por litro de la cartera a crédito (referencia). */
    brutoLitroCartera: number
    /** Parte de los litros vendidos que va a clientes a crédito (ciclos cerrados recientes). */
    participacionCreditoLitros: number
    /** Litros a crédito del forecast que faltan en el horizonte. */
    litrosForecastCredito: number
    hayForecast: boolean
    calibracion: typeof CALIBRACION_BACKTEST
  }
}

interface Entrada {
  hoyISO: string
  pagos: FilaLitrosPago[]
  ventas: (FilaVentaFinanzas & { fecha_entrega_estimada?: string | null; vendedor_actual?: string | null })[]
  /** Facturas impagas ya recortadas contra el saldo del ERP (armarFacturasPendientes). */
  porFactura: Map<string, FacturaImpaga>
  perfiles: PerfilesPago
  forecastLitros: { mes: string; tipo: string; litros: number }[]
  semanasAtras?: number
  semanasAdelante?: number
}

/** Clientes a crédito cuyos litros son nuestros: sin el enlatado móvil (EWU, Bundor), que es
 *  un servicio a otra cervecera y no venta de cerveza o kombucha propia. */
const esClienteLitros = (n: string | null | undefined) => esClienteCredito(n) && !esEnlatado(n)

const cicloDe = (iso: string) => ciclosDe(iso)[0]
const ciclosEntre = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number)
  return (ya - yb) * 12 + (ma - mb)
}
const restarCiclos = (ciclo: string, n: number) => {
  const [y, m] = ciclo.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return d.toISOString().slice(0, 10)
}

export function construirLitrosCobro(e: Entrada): DatosLitrosCobro {
  const { hoyISO, perfiles } = e
  const atras = e.semanasAtras ?? 6
  const adelante = e.semanasAdelante ?? 8
  const K = CALIBRACION_BACKTEST

  // ── Bruto por litro de la cartera a crédito y litros por factura ──
  let brutoCartera = 0, litrosCartera = 0
  const facturaInfo = new Map<string, { litros: number; bruto: number; vendedor: string }>()
  for (const v of e.ventas) {
    if (!v.fecha_entrega || !esIngresoReal(v) || !esClienteLitros(v.nombre_fantasia)) continue
    const bruto = brutoDeFila(v), litros = Number(v.litros) || 0
    if (bruto > 0 && litros > 0) { brutoCartera += bruto; litrosCartera += litros }
    if (!v.numero_factura) continue
    const fi = facturaInfo.get(v.numero_factura) ?? { litros: 0, bruto: 0, vendedor: vendedorDe(v.vendedor_actual) }
    fi.litros += litros; fi.bruto += Math.max(0, bruto)
    facturaInfo.set(v.numero_factura, fi)
  }
  const brutoLitroCartera = litrosCartera > 0 ? brutoCartera / litrosCartera : 0
  // Un pago sin factura de un cliente sin ventas en el año (abonos de deudas viejas) no tiene
  // con qué pasarse a litros: se informa en pesos, no se le inventan litros.
  const litrosDe = (p: FilaLitrosPago) => p.litros ?? 0

  // ── 1. Litros pagados por ciclo y su origen ──
  const pagosCredito = e.pagos.filter(p => esClienteLitros(p.cliente))
  const cicloHoy = cicloDe(hoyISO)
  const ciclos: CicloPagado[] = [0, 1, 2].map(n => {
    const ciclo = restarCiclos(cicloHoy, n)
    const desde = inicioDeCiclo(ciclo), fin = finDeCiclo(ciclo)
    const enCurso = n === 0
    const porVend = new Map<string, { porOrigen: PorOrigen; clientes: Set<string> }>()
    const porOrigen = ceroOrigen()
    const sinLitros = { monto: 0, clientes: new Set<string>() }
    let monto = 0
    for (const p of pagosCredito) {
      if (p.fecha < desde || p.fecha > fin) continue
      const l = litrosDe(p)
      if (p.litros == null) { sinLitros.monto += p.monto; sinLitros.clientes.add(normalizarNombreCliente(p.cliente)) }
      let o: Origen = 'estimado'
      if (!p.estimado && p.cicloOrigen) {
        const d = ciclosEntre(ciclo, p.cicloOrigen)
        o = d <= 0 ? 'mismo' : d === 1 ? 'anterior' : d === 2 ? 'dosAntes' : 'antiguo'
      }
      porOrigen[o] += l
      monto += p.monto
      const vendedor = vendedorDe(p.vendedor)
      const v = porVend.get(vendedor) ?? { porOrigen: ceroOrigen(), clientes: new Set<string>() }
      v.porOrigen[o] += l
      v.clientes.add(normalizarNombreCliente(p.cliente))
      porVend.set(vendedor, v)
    }
    const vendedores: VendedorLitros[] = [...porVend].map(([vendedor, v]) => ({
      vendedor, porOrigen: v.porOrigen, clientes: v.clientes.size, porPagar: 0, atrasados: 0,
      litros: ORIGENES.reduce((s, o) => s + v.porOrigen[o], 0),
    }))
    return {
      ciclo, desde, hasta: enCurso && hoyISO < fin ? hoyISO : fin, enCurso, monto, porOrigen, vendedores,
      sinLitros: { monto: sinLitros.monto, clientes: sinLitros.clientes.size },
      litros: ORIGENES.reduce((s, o) => s + porOrigen[o], 0),
    }
  })

  // ── Semanas: las pasadas con lo pagado, las futuras con lo esperado ──
  const lunesHoy = lunesDe(hoyISO)
  const semanas: SemanaLitros[] = []
  for (let i = -atras; i < adelante; i++) {
    const lunes = sumarDias(lunesHoy, 7 * i)
    semanas.push({ lunes, semanaIso: semanaISO(lunes), pagados: 0, facturas: 0, venta: 0, atrasadas: 0, total: 0, tipo: i < 0 ? 'pasada' : i === 0 ? 'en_curso' : 'futura' })
  }
  const idx = new Map(semanas.map((s, i) => [s.lunes, i]))
  const ultimaSemana = semanas[semanas.length - 1].lunes
  const hastaISO = sumarDias(ultimaSemana, 6)
  for (const p of pagosCredito) {
    const i = idx.get(lunesDe(p.fecha))
    if (i != null && p.fecha <= hoyISO) semanas[i].pagados += litrosDe(p)
  }
  // Mes al que pertenece cada semana para la calibración (la en curso, al mes de hoy).
  const mesSemana = (lunes: string) => (lunes < hoyISO ? hoyISO : lunes).slice(0, 7)
  const kDe = (fecha: string) => K.k[horizonte(`${mesSemana(lunesDe(fecha))}-01`, hoyISO)]
  const anotar = (fecha: string, litros: number, campo: 'facturas' | 'venta') => {
    if (fecha < hoyISO || fecha > hastaISO || litros <= 0) return
    const i = idx.get(lunesDe(fecha))
    if (i != null) semanas[i][campo] += litros * kDe(fecha)
  }

  // ── 2. Facturas por pagar hoy, en litros ──
  const porPagar = { litros: 0, alDia: 0, atrasados: 0, facturas: 0, clientesAtrasados: 0 }
  const clientesAtrasados = new Set<string>()
  const porPagarVend = new Map<string, { porPagar: number; atrasados: number }>()
  for (const [factura, f] of e.porFactura) {
    if (f.bruto <= 0 || !esClienteLitros(f.cliente)) continue
    const info = facturaInfo.get(factura)
    if (!info || info.litros <= 0 || info.bruto <= 0) continue
    // Recortada contra el saldo del ERP: sólo cuentan los litros de la parte impaga.
    const litros = info.litros * Math.min(1, f.bruto / info.bruto)
    const { cobro } = fechaCobroEsperada(f.fechaEntrega, perfiles.perfilDe(f.cliente))
    porPagar.litros += litros
    porPagar.facturas++
    const pv = porPagarVend.get(info.vendedor) ?? { porPagar: 0, atrasados: 0 }
    pv.porPagar += litros
    if (cobro < hoyISO) {
      porPagar.atrasados += litros
      pv.atrasados += litros
      clientesAtrasados.add(normalizarNombreCliente(f.cliente))
    } else {
      porPagar.alDia += litros
      anotar(cobro, litros, 'facturas')
    }
    porPagarVend.set(info.vendedor, pv)
  }
  porPagar.clientesAtrasados = clientesAtrasados.size
  const cicloActual = ciclos[0]
  for (const [vendedor, pv] of porPagarVend) {
    const v = cicloActual.vendedores.find(x => x.vendedor === vendedor)
    if (v) { v.porPagar = pv.porPagar; v.atrasados = pv.atrasados }
    else cicloActual.vendedores.push({ vendedor, litros: 0, porOrigen: ceroOrigen(), clientes: 0, porPagar: pv.porPagar, atrasados: pv.atrasados })
  }
  for (const c of ciclos) c.vendedores.sort((a, b) => b.litros - a.litros || b.porPagar - a.porPagar)

  // Recupero de atrasadas: % de lo pendiente por mes (decreciente), repartido en sus semanas.
  let pendiente = porPagar.atrasados
  const semanasFuturasDelMes = new Map<string, number[]>()
  semanas.forEach((s, i) => { if (s.tipo !== 'pasada') semanasFuturasDelMes.set(mesSemana(s.lunes), [...(semanasFuturasDelMes.get(mesSemana(s.lunes)) ?? []), i]) })
  for (const [mes, is] of [...semanasFuturasDelMes].sort((a, b) => a[0].localeCompare(b[0]))) {
    // El recupero es mensual. El mes en curso lo reparte en las semanas que le quedan (igual
    // que la Caja); un mes que el horizonte corta sólo recibe la parte de las semanas que entran.
    const semanasMes = mes === hoyISO.slice(0, 7) ? is.length : 4
    const r = pendiente * K.recupero[horizonte(`${mes}-01`, hoyISO)]
    pendiente -= r
    for (const i of is) semanas[i].atrasadas += r / Math.max(semanasMes, is.length)
  }

  // ── 3. Venta que todavía no se factura, en litros ──
  const inicioActual = inicioDeCiclo(cicloHoy)
  let litrosTotal = 0, litrosCredito = 0, litrosCreditoCicloActual = 0
  const patron = [0, 0, 0, 0, 0, 0, 0]
  const ventaCredPorCliente = new Map<string, number>()
  for (const v of e.ventas) {
    if (!esIngresoReal(v)) continue
    const litros = Number(v.litros) || 0
    if (litros <= 0) continue
    const credito = esClienteLitros(v.nombre_fantasia)
    if (v.fecha_pedido >= inicioActual) { if (credito) litrosCreditoCicloActual += litros; continue }
    litrosTotal += litros
    if (!credito) continue
    litrosCredito += litros
    patron[(new Date(`${v.fecha_pedido}T00:00:00Z`).getUTCDay() + 6) % 7] += litros
    ventaCredPorCliente.set(v.nombre_fantasia!, (ventaCredPorCliente.get(v.nombre_fantasia!) ?? 0) + Math.max(0, brutoDeFila(v)))
  }
  const participacionCreditoLitros = litrosTotal > 0 ? litrosCredito / litrosTotal : 0
  // Mismo mix de plazos que la Caja (ponderado por venta en pesos).
  const mix = mixDePlazos([...ventaCredPorCliente].map(([cliente, bruto]) => ({ cliente, bruto })), perfiles)
  const desde = sumarDias(hoyISO, 1)
  let litrosForecastCredito = 0
  const forecast = e.forecastLitros.filter(p => p.tipo === 'forecast')
  for (const p of forecast) {
    const ciclo = p.mes.slice(0, 10)
    const ini = inicioDeCiclo(ciclo), fin = finDeCiclo(ciclo)
    if (fin < desde || ini > hastaISO) continue
    let litros = p.litros * participacionCreditoLitros
    if (ciclo === cicloHoy) litros = Math.max(0, litros - litrosCreditoCicloActual)
    for (const d of repartirEnDias(ini, fin, litros, patron, desde)) {
      if (d.fecha > hastaISO) continue
      litrosForecastCredito += d.monto
      for (const t of mix) anotar(siguienteHabil(sumarDias(d.fecha, Math.round(t.diasMedios))), d.monto * t.participacion, 'venta')
    }
  }
  // Pedidos a crédito sin despachar: se facturan en su fecha estimada y se pagan según su cliente.
  for (const v of e.ventas) {
    if (v.fecha_entrega || !esIngresoReal(v) || !esClienteLitros(v.nombre_fantasia)) continue
    const litros = Number(v.litros) || 0
    if (litros <= 0) continue
    const est = v.fecha_entrega_estimada && v.fecha_entrega_estimada >= hoyISO ? v.fecha_entrega_estimada.slice(0, 10) : siguienteHabil(sumarDias(hoyISO, 2))
    anotar(fechaCobroEsperada(est, perfiles.perfilDe(v.nombre_fantasia!)).cobro, litros, 'venta')
  }

  for (const s of semanas) s.total = s.pagados + s.facturas + s.venta + s.atrasadas
  const futuras = semanas.filter(s => s.tipo !== 'pasada')
  const proximas = {
    semanas: futuras.length,
    facturas: futuras.reduce((a, s) => a + s.facturas, 0),
    venta: futuras.reduce((a, s) => a + s.venta, 0),
    atrasadas: futuras.reduce((a, s) => a + s.atrasadas, 0),
    total: 0,
  }
  proximas.total = proximas.facturas + proximas.venta + proximas.atrasadas

  return {
    hayDatos: e.pagos.length > 0,
    ciclos, semanas, porPagar, proximas,
    supuestos: { brutoLitroCartera, participacionCreditoLitros, litrosForecastCredito, hayForecast: forecast.length > 0, calibracion: K },
  }
}
