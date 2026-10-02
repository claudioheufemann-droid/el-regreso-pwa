/**
 * Arma la Caja real cobrada a partir de los datos crudos que ya carga
 * app/administracion/page.tsx. Lógica pura (sin Supabase): page.tsx trae las filas y
 * esto decide. La explicación del modelo está en cajaCobrada.ts.
 *
 * Supuestos (todos visibles en la pantalla, en "Cómo se calcula"):
 *   · Venta a crédito futura = forecast general (Prophet, neto, por ciclo 24→23) ×
 *     participación del crédito en la venta reciente × factor neto→bruto del crédito.
 *     Del ciclo en curso sólo entra lo que falta (forecast − lo ya pedido a crédito).
 *   · Pedidos sin despachar: se facturan en su fecha estimada de entrega (o en 2 días
 *     hábiles) y se cobran según el perfil de SU cliente.
 *   · Contado = promedio real reciente de mostrador PDV + restaurante BaseCamp (mismo
 *     criterio por defecto que el calendario de la semana).
 *   · Salidas = pagos a proveedores cargados a mano con fecha futura + compras de
 *     insumos proyectadas (forecast "Total compras", neto ×1,19) corridas por los días
 *     promedio de pago a proveedores. NO incluye sueldos, arriendos ni impuestos.
 */

import { brutoDeFila, esIngresoReal, normalizarNombreCliente, type FilaVentaFinanzas } from './finanzas'
import { siguienteHabil } from './calendarioEntradas'
import { armarFacturasPendientes } from './proyeccionCobros'
import {
  armarCajaCobrada, cobrosConfirmados, cobrosProyectados, esClienteCredito, mixDePlazos, perfilesPago, repartirEnDias, sumarDias,
  type CajaCobrada, type EmisionProyectada, type PagosCliente, type PerfilesPago, type TramoPlazo,
} from './cajaCobrada'
import { lunesDe } from './finanzas'
import { grupoCarteraDe } from '@/lib/types'

export const IVA = 0.19

export interface AtrasadoCliente {
  cliente: string
  vendedor: string | null
  monto: number
  facturas: number
  /** Días desde la fecha en que, según su comportamiento, ya debía haber pagado. */
  diasAtraso: number
  /** Deuda vencida que reporta el ERP para este cliente (dato duro). */
  vencidaErp: number
}

export interface DatosCajaCobrada {
  caja: CajaCobrada
  hastaISO: string
  mix: TramoPlazo[]
  segmentos: PerfilesPago['segmentos']
  cobertura: { propio: number; segmento: number }
  /** Cartera a crédito reconstruida (facturas impagas) vs. saldo de la cartera de venta del ERP. */
  carteraReconstruida: number
  carteraErp: number
  supuestos: {
    participacionCredito: number
    factorBruto: number
    contadoSemanal: number
    mostradorSemanal: number
    basecampSemanal: number
    diasPagoProveedores: number
    comprasComprometidasFuturas: number
  }
  atrasadoPorCliente: AtrasadoCliente[]
  /** Clientes a crédito con venta reciente y sin plazo en su ficha (se proyectan con la mediana). */
  clientesSinPlazo: string[]
}

interface Entrada {
  hoyISO: string
  hastaISO: string
  ventas: (FilaVentaFinanzas & { numero_factura?: string | null; fecha_entrega_estimada?: string | null })[]
  facturasImpagas: Set<string>
  saldoErp: { saldos: Map<string, number>; cargadoISO: string } | null
  pagos: PagosCliente[]
  clientes: { nombre_fantasia: string | null; dias_pago: number | null }[]
  deudores: { nombre_fantasia: string | null; vendedor?: string | null; deuda_vencida: number | null; saldo_total: number | null }[]
  pactadoPorDefecto: number
  /** Puntos del forecast general (nivel='general'). */
  forecastGeneral: { mes: string; tipo: string; monto: number }[]
  inicioDeCiclo: (mes: string) => string
  finDeCiclo: (mes: string) => string
  /** Compras de insumos proyectadas por semana (lunes → neto). */
  comprasProyectadasSemana: Map<string, number>
  comprasComprometidas: { monto: number; fecha_pago: string; estado?: string | null }[]
  diasPagoProveedores: number | null
  mostradorSemanal: number
  ventasRestaurante: { fecha: string; monto: number }[]
  saldoBanco: number | null
  /** Cobrado por cliente desde el 1.º del mes calendario en curso. */
  cobradoMesPorCliente: { cliente: string; monto: number }[]
}

export function construirCajaCobrada(e: Entrada): DatosCajaCobrada {
  const { hoyISO, hastaISO } = e

  // ── Perfiles de pago ──
  const pactado = new Map<string, number>()
  for (const c of e.clientes) {
    const k = normalizarNombreCliente(c.nombre_fantasia)
    if (k && c.dias_pago != null && !pactado.has(k)) pactado.set(k, c.dias_pago)
  }
  const morosos = new Set<string>()
  const vendedorDe = new Map<string, string | null>()
  const vencidaErpDe = new Map<string, number>()
  let carteraErp = 0
  for (const d of e.deudores) {
    const k = normalizarNombreCliente(d.nombre_fantasia)
    if (!k) continue
    if ((Number(d.deuda_vencida) || 0) > 0) morosos.add(k)
    vendedorDe.set(k, d.vendedor ?? null)
    vencidaErpDe.set(k, (vencidaErpDe.get(k) ?? 0) + (Number(d.deuda_vencida) || 0))
    if (grupoCarteraDe(d.vendedor) === 'vendedor') carteraErp += Number(d.saldo_total) || 0
  }
  const perfiles = perfilesPago({ pagos: e.pagos, pactadoPorCliente: pactado, morosos, pactadoPorDefecto: e.pactadoPorDefecto })

  // ── Etapa 1: confirmados ──
  const { porFactura } = armarFacturasPendientes({ ventas: e.ventas, facturasImpagas: e.facturasImpagas, saldoErp: e.saldoErp })
  const confirmados = cobrosConfirmados({ facturas: porFactura, perfiles, hoyISO, hastaISO })

  // ── Venta a crédito reciente: mix de plazos, participación, factor bruto, patrón semanal ──
  const mesActual = e.forecastGeneral.find(p => e.inicioDeCiclo(p.mes) <= hoyISO && e.finDeCiclo(p.mes) >= hoyISO)?.mes ?? null
  const inicioCicloActual = mesActual ? e.inicioDeCiclo(mesActual) : hoyISO
  let netoTotal = 0, netoCredito = 0, brutoCredito = 0, mtdCreditoBruto = 0
  const ventasPorCliente = new Map<string, number>()
  const patron = [0, 0, 0, 0, 0, 0, 0]
  const sinPlazo = new Set<string>()
  for (const v of e.ventas) {
    if (!esIngresoReal(v)) continue
    const neto = Number(v.total_sin_impuesto) || 0
    if (neto === 0) continue
    const credito = esClienteCredito(v.nombre_fantasia)
    const bruto = brutoDeFila(v)
    if (v.fecha_pedido && v.fecha_pedido >= inicioCicloActual) {
      if (credito) mtdCreditoBruto += bruto
      continue // el ciclo en curso no entra a las proporciones (está incompleto)
    }
    netoTotal += neto
    if (!credito) continue
    netoCredito += neto
    brutoCredito += bruto
    ventasPorCliente.set(v.nombre_fantasia!, (ventasPorCliente.get(v.nombre_fantasia!) ?? 0) + bruto)
    if (v.fecha_pedido) patron[(new Date(`${v.fecha_pedido}T00:00:00Z`).getUTCDay() + 6) % 7] += neto
    if (!pactado.has(normalizarNombreCliente(v.nombre_fantasia))) sinPlazo.add(v.nombre_fantasia!)
  }
  const participacionCredito = netoTotal > 0 ? netoCredito / netoTotal : 0
  const factorBruto = netoCredito > 0 ? brutoCredito / netoCredito : 1 + IVA
  const mix = mixDePlazos([...ventasPorCliente.entries()].map(([cliente, bruto]) => ({ cliente, bruto })), perfiles)

  // ── Etapa 2: emisiones futuras ──
  const emisiones: EmisionProyectada[] = []
  const desde = sumarDias(hoyISO, 1) // lo de hoy ya está en lo pedido del ciclo
  for (const p of e.forecastGeneral) {
    if (p.tipo !== 'forecast') continue
    const ini = e.inicioDeCiclo(p.mes), fin = e.finDeCiclo(p.mes)
    if (fin < desde || ini > hastaISO) continue
    let monto = p.monto * participacionCredito * factorBruto
    if (p.mes === mesActual) monto = Math.max(0, monto - mtdCreditoBruto)
    for (const d of repartirEnDias(ini, fin, monto, patron, desde)) {
      if (d.fecha <= hastaISO) emisiones.push({ fecha: d.fecha, bruto: d.monto, origen: 'forecast' })
    }
  }
  // Pedidos a crédito sin despachar (backlog): ya tienen cliente.
  for (const v of e.ventas) {
    if (v.fecha_entrega || !esIngresoReal(v) || !esClienteCredito(v.nombre_fantasia)) continue
    const bruto = brutoDeFila(v)
    if (bruto <= 0) continue
    const est = v.fecha_entrega_estimada && v.fecha_entrega_estimada >= hoyISO ? v.fecha_entrega_estimada.slice(0, 10) : siguienteHabil(sumarDias(hoyISO, 2))
    if (est <= hastaISO) emisiones.push({ fecha: est, bruto, origen: 'pedido', cliente: v.nombre_fantasia! })
  }
  const proyectados = cobrosProyectados({ emisiones, mix, perfiles, hastaISO })

  // ── Contado: promedio real reciente ──
  const hace56 = sumarDias(hoyISO, -56)
  const ultimaRest = e.ventasRestaurante.reduce((m, r) => (r.fecha > m ? r.fecha : m), '')
  const desdeRest = ultimaRest ? sumarDias(ultimaRest, -55) : hace56
  const basecampSemanal = e.ventasRestaurante.filter(r => r.fecha >= desdeRest).reduce((s, r) => s + (Number(r.monto) || 0), 0) / 8
  const contadoSemanal = e.mostradorSemanal + basecampSemanal

  // ── Salidas ──
  const salidasPorSemana = new Map<string, number>()
  const sumarSalida = (fecha: string, monto: number) => {
    if (fecha < lunesDe(hoyISO) || fecha > hastaISO || monto <= 0) return
    const l = lunesDe(fecha)
    salidasPorSemana.set(l, (salidasPorSemana.get(l) ?? 0) + monto)
  }
  let comprasComprometidasFuturas = 0
  for (const c of e.comprasComprometidas) {
    if (c.fecha_pago >= hoyISO && c.estado !== 'pagada') { sumarSalida(c.fecha_pago, Number(c.monto) || 0); comprasComprometidasFuturas += Number(c.monto) || 0 }
  }
  const diasPagoProveedores = e.diasPagoProveedores ?? 30
  for (const [lunes, neto] of e.comprasProyectadasSemana) sumarSalida(sumarDias(lunes, diasPagoProveedores), neto * (1 + IVA))

  // ── Real del mes calendario en curso (para la tabla mensual) ──
  const inicioMes = `${hoyISO.slice(0, 7)}-01`
  let facturadoMes = 0
  for (const v of e.ventas) {
    if (!v.fecha_entrega || v.fecha_entrega < inicioMes || v.fecha_entrega >= hoyISO) continue
    if (!esIngresoReal(v) || !esClienteCredito(v.nombre_fantasia)) continue
    facturadoMes += Math.max(0, brutoDeFila(v))
  }
  const cobradoMes = e.cobradoMesPorCliente.filter(c => esClienteCredito(c.cliente)).reduce((s, c) => s + c.monto, 0)

  const caja = armarCajaCobrada({
    confirmados, proyectados, emisiones, contadoSemanal, salidasPorSemana, saldoInicialBanco: e.saldoBanco,
    hoyISO, hastaISO, realMesEnCurso: { facturado: facturadoMes, cobrado: cobradoMes },
  })

  // ── Atrasado agrupado por cliente (pestaña Cobranza) ──
  const porCliente = new Map<string, AtrasadoCliente>()
  for (const f of confirmados.atrasado.detalle) {
    const k = normalizarNombreCliente(f.cliente)
    const dias = Math.round((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${f.cobroEsperado}T00:00:00Z`)) / 86_400_000)
    const a = porCliente.get(k) ?? { cliente: f.cliente, vendedor: vendedorDe.get(k) ?? null, monto: 0, facturas: 0, diasAtraso: 0, vencidaErp: vencidaErpDe.get(k) ?? 0 }
    a.monto += f.bruto
    a.facturas++
    a.diasAtraso = Math.max(a.diasAtraso, dias)
    porCliente.set(k, a)
  }

  return {
    caja, hastaISO, mix, segmentos: perfiles.segmentos, cobertura: confirmados.cobertura,
    carteraReconstruida: confirmados.total, carteraErp,
    supuestos: {
      participacionCredito, factorBruto, contadoSemanal, mostradorSemanal: e.mostradorSemanal, basecampSemanal,
      diasPagoProveedores, comprasComprometidasFuturas,
    },
    atrasadoPorCliente: [...porCliente.values()].sort((a, b) => b.monto - a.monto),
    clientesSinPlazo: [...sinPlazo].sort((a, b) => a.localeCompare(b)),
  }
}
