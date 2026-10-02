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

/** Cobrado por mes calendario separado en venta mayorista y enlatado móvil (EWU + Bundor). */
export interface MesPorGrupo {
  mes: string
  mayoristas: number
  enlatado: number
  /** Ya cobrado en el mes en curso (0 en meses futuros). */
  real: number
  /** Facturas emitidas e impagas que, según cómo paga cada cliente, se cobran ese mes. */
  facturas: number
  /** Venta que todavía no se factura (forecast o ritmo actual + pedidos sin despachar). */
  venta: number
}

export interface DatosCajaCobrada {
  caja: CajaCobrada
  /** Lo mismo que caja.meses[].cobrado, separado mayoristas / enlatado (Bundor; EWU se suma en los escenarios). */
  mesesPorGrupo: MesPorGrupo[]
  /** Venta a crédito bruta promedio de los últimos 3 ciclos cerrados (escenario "ritmo actual"). */
  ritmoCicloCredito: number
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

/** Enlatado móvil (servicio a otras cerveceras): EWU Ginger Beer y Cervecera Bundor. */
export const esEnlatado = (nombre: string | null | undefined) => /ewu ginger beer|bundor/i.test(nombre ?? '')

/** Ciclo 24→23 de una fecha, como yyyy-mm-01 del mes en que termina. */
function cicloDe(fecha: string): string {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, d > 23 ? m : m - 1, 1)).toISOString().slice(0, 10)
}

/**
 * `venta` elige de dónde sale la venta a crédito futura:
 *   · 'forecast' (base): el forecast general del modelo × participación del crédito.
 *   · 'ritmo': la venta a crédito promedio de los últimos 3 ciclos cerrados, sin el repunte
 *     estacional que proyecta el forecast (escenario conservador).
 */
export function construirCajaCobrada(e: Entrada, opciones: { venta?: 'forecast' | 'ritmo' } = {}): DatosCajaCobrada {
  const { hoyISO, hastaISO } = e
  const modoVenta = opciones.venta ?? 'forecast'

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
  let netoTotal = 0, netoCredito = 0, brutoCredito = 0, mtdCreditoBruto = 0, brutoEnlatado = 0
  const brutoPorCiclo = new Map<string, number>()
  const primerPedido = e.ventas.reduce((m, v) => (v.fecha_pedido && v.fecha_pedido < m ? v.fecha_pedido : m), hoyISO)
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
    if (v.fecha_pedido) brutoPorCiclo.set(cicloDe(v.fecha_pedido), (brutoPorCiclo.get(cicloDe(v.fecha_pedido)) ?? 0) + bruto)
    if (esEnlatado(v.nombre_fantasia)) brutoEnlatado += bruto
    ventasPorCliente.set(v.nombre_fantasia!, (ventasPorCliente.get(v.nombre_fantasia!) ?? 0) + bruto)
    if (v.fecha_pedido) patron[(new Date(`${v.fecha_pedido}T00:00:00Z`).getUTCDay() + 6) % 7] += neto
    if (!pactado.has(normalizarNombreCliente(v.nombre_fantasia))) sinPlazo.add(v.nombre_fantasia!)
  }
  const participacionCredito = netoTotal > 0 ? netoCredito / netoTotal : 0
  const factorBruto = netoCredito > 0 ? brutoCredito / netoCredito : 1 + IVA
  // Sólo ciclos COMPLETOS dentro de la ventana de ventas (el primero suele venir cortado).
  const ciclosCerrados = [...brutoPorCiclo.entries()].filter(([c]) => e.inicioDeCiclo(c) >= primerPedido).sort((a, b) => a[0].localeCompare(b[0])).slice(-3)
  const ritmoCicloCredito = ciclosCerrados.length ? ciclosCerrados.reduce((s, [, b]) => s + b, 0) / ciclosCerrados.length : 0
  const participacionEnlatado = brutoCredito > 0 ? brutoEnlatado / brutoCredito : 0
  const mix = mixDePlazos([...ventasPorCliente.entries()].map(([cliente, bruto]) => ({ cliente, bruto })), perfiles)

  // ── Etapa 2: emisiones futuras ──
  const emisiones: EmisionProyectada[] = []
  const desde = sumarDias(hoyISO, 1) // lo de hoy ya está en lo pedido del ciclo
  for (const p of e.forecastGeneral) {
    if (p.tipo !== 'forecast') continue
    const ini = e.inicioDeCiclo(p.mes), fin = e.finDeCiclo(p.mes)
    if (fin < desde || ini > hastaISO) continue
    let monto = modoVenta === 'ritmo' ? ritmoCicloCredito : p.monto * participacionCredito * factorBruto
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

  // ── Cobrado por mes separado mayoristas / enlatado ──
  const confMes = new Map<string, number>()
  const enlConfMes = new Map<string, number>()
  for (const f of confirmados.detalle) {
    if (f.cobroEsperado < hoyISO || f.cobroEsperado > hastaISO) continue
    const m = f.cobroEsperado.slice(0, 7)
    confMes.set(m, (confMes.get(m) ?? 0) + f.bruto)
    if (esEnlatado(f.cliente)) enlConfMes.set(m, (enlConfMes.get(m) ?? 0) + f.bruto)
  }
  const realEnlMes = e.cobradoMesPorCliente.filter(c => esEnlatado(c.cliente)).reduce((s, c) => s + c.monto, 0)
  const mesesPorGrupo: MesPorGrupo[] = caja.meses.map(m => {
    const enCurso = m.mes === hoyISO.slice(0, 7)
    const real = enCurso ? cobradoMes : 0
    const proyectado = m.cobrado - real - (confMes.get(m.mes) ?? 0)
    const enlatado = (enCurso ? realEnlMes : 0) + (enlConfMes.get(m.mes) ?? 0) + proyectado * participacionEnlatado
    return { mes: m.mes, mayoristas: m.cobrado - enlatado, enlatado, real, facturas: confMes.get(m.mes) ?? 0, venta: proyectado }
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
    caja, mesesPorGrupo, ritmoCicloCredito, hastaISO, mix, segmentos: perfiles.segmentos, cobertura: confirmados.cobertura,
    carteraReconstruida: confirmados.total, carteraErp,
    supuestos: {
      participacionCredito, factorBruto, contadoSemanal, mostradorSemanal: e.mostradorSemanal, basecampSemanal,
      diasPagoProveedores, comprasComprometidasFuturas,
    },
    atrasadoPorCliente: [...porCliente.values()].sort((a, b) => b.monto - a.monto),
    clientesSinPlazo: [...sinPlazo].sort((a, b) => a.localeCompare(b)),
  }
}

/* ═══════════════ Escenarios mensuales (mayoristas + enlatado móvil) ═══════════════ */

export interface EscenarioMes {
  mes: string
  mayoristas: number
  enlatado: number
  total: number
  /** Composición (suma = total). */
  real: number
  facturas: number
  /** Recupero de facturas atrasadas. */
  atrasadas: number
  venta: number
  /** EWU con su ritmo de pago (no está en el informe de ventas). */
  ewu: number
}

export interface EscenarioCaja {
  id: 'conservador' | 'base' | 'optimista'
  nombre: string
  descripcion: string
  meses: EscenarioMes[]
}

export interface EscenariosCaja {
  escenarios: EscenarioCaja[]
  /** Lo que de verdad se cobró el mismo mes del año anterior (etiquetado con el mes de este año). */
  anioAnterior: EscenarioMes[]
  supuestos: {
    ritmoCicloCredito: number
    ewu: { min: number; promedio: number; max: number; meses: number }
    recupero: Record<EscenarioCaja['id'], number>
    /** Facturas por pagar hoy: al día (todavía no vencen según el cliente) y atrasadas. */
    facturasAlDia: number
    atrasado: number
    /** De las facturas por pagar de hoy, lo que según cada escenario sigue sin cobrar al cierre del horizonte. */
    quedanAlCierre: Record<EscenarioCaja['id'], number>
  }
}

/**
 * Ritmo mensual de recuperación de facturas atrasadas, medido en el backtest
 * (scripts/analisis/backtest-caja-cobrada.ts, abr-sep 2026: 9%, 4%, 0%, 6%, 4%, 13% de lo
 * atrasado al 1.º de cada mes se cobró dentro del mes). Conservador = 4% (lo típico de un mes
 * flojo), base = 6% (promedio), optimista = 13% (el mejor mes).
 */
export const RECUPERO_ATRASADO: Record<'conservador' | 'base' | 'optimista', number> = { conservador: 0.04, base: 0.06, optimista: 0.13 }

/**
 * Tres escenarios de cobro de mayoristas + enlatado, por mes calendario hasta el horizonte.
 * EWU no aparece en el informe de ventas desde mar-2026 (se factura por otra vía), así que el
 * modelo por factura no lo ve: se suma con su ritmo real de pago de los últimos 3 meses cerrados
 * (mínimo / promedio / máximo según el escenario), descontando lo que ya pagó en el mes en curso.
 */
export function construirEscenarios(
  base: DatosCajaCobrada,
  conservador: DatosCajaCobrada,
  cobrosMensuales: { mes: string; cliente: string; monto: number }[],
  hoyISO: string,
): EscenariosCaja {
  const mesActual = hoyISO.slice(0, 7)
  const esEwu = (c: string) => /ewu ginger beer/i.test(c)
  const ewuPorMes = new Map<string, number>()
  for (const c of cobrosMensuales) if (esEwu(c.cliente)) ewuPorMes.set(c.mes.slice(0, 7), (ewuPorMes.get(c.mes.slice(0, 7)) ?? 0) + c.monto)
  const cerrados = [...new Set(cobrosMensuales.map(c => c.mes.slice(0, 7)))].filter(m => m < mesActual).sort().slice(-3)
  const ewuMeses = cerrados.map(m => ewuPorMes.get(m) ?? 0)
  const ewu = {
    min: ewuMeses.length ? Math.min(...ewuMeses) : 0,
    promedio: ewuMeses.length ? ewuMeses.reduce((a, b) => a + b, 0) / ewuMeses.length : 0,
    max: ewuMeses.length ? Math.max(...ewuMeses) : 0,
    meses: ewuMeses.length,
  }
  const ewuYaPagado = ewuPorMes.get(mesActual) ?? 0
  const ewuDelMes = (mes: string, ritmo: number) => (mes === mesActual ? Math.max(0, ritmo - ewuYaPagado) : ritmo)

  const armar = (datos: DatosCajaCobrada, ritmoEwu: number, recupero: number): EscenarioMes[] => {
    let pendiente = datos.caja.atrasado.monto
    return datos.mesesPorGrupo.map(g => {
      const atrasadas = pendiente * recupero
      pendiente -= atrasadas
      const ewuMes = ewuDelMes(g.mes, ritmoEwu)
      const mayoristas = g.mayoristas + atrasadas
      const enlatado = g.enlatado + ewuMes
      return { mes: g.mes, mayoristas, enlatado, total: mayoristas + enlatado, real: g.real, facturas: g.facturas, atrasadas, venta: g.venta, ewu: ewuMes }
    })
  }

  // Mismo mes del año anterior: real cobrado de clientes a crédito.
  const anioAnterior: EscenarioMes[] = base.mesesPorGrupo.map(g => {
    const [y, m] = g.mes.split('-')
    const previo = `${Number(y) - 1}-${m}`
    let mayoristas = 0, enlatado = 0
    for (const c of cobrosMensuales) {
      if (c.mes.slice(0, 7) !== previo || !esClienteCredito(c.cliente)) continue
      if (esEnlatado(c.cliente)) enlatado += c.monto
      else mayoristas += c.monto
    }
    return { mes: g.mes, mayoristas, enlatado, total: mayoristas + enlatado, real: mayoristas + enlatado, facturas: 0, atrasadas: 0, venta: 0, ewu: 0 }
  })

  const mesesCons = armar(conservador, ewu.min, RECUPERO_ATRASADO.conservador)
  const mesesBase = armar(base, ewu.promedio, RECUPERO_ATRASADO.base)
  const mesesOpt = armar(base, ewu.max, RECUPERO_ATRASADO.optimista)
  // De las facturas por pagar HOY: lo que no se cobra dentro del horizonte (atrasado no recuperado +
  // facturas al día cuyo cobro esperado cae después del 31-dic).
  const facturasAlDia = base.caja.cuadratura.carteraInicial - base.caja.atrasado.monto
  const cobradoDeFacturas = (ms: EscenarioMes[]) => ms.reduce((s, m) => s + m.facturas + m.atrasadas, 0)
  const quedan = (ms: EscenarioMes[]) => base.caja.cuadratura.carteraInicial - cobradoDeFacturas(ms)

  return {
    escenarios: [
      { id: 'conservador', nombre: 'Conservador', descripcion: `Ventas al ritmo de los últimos 3 ciclos (sin el repunte del forecast). Facturas atrasadas: se recupera ${Math.round(RECUPERO_ATRASADO.conservador * 100)}% al mes. EWU a su mínimo reciente.`, meses: mesesCons },
      { id: 'base', nombre: 'Base', descripcion: `Forecast de ventas y cómo paga cada cliente. Facturas atrasadas: ${Math.round(RECUPERO_ATRASADO.base * 100)}% al mes (promedio medido). EWU a su promedio.`, meses: mesesBase },
      { id: 'optimista', nombre: 'Optimista', descripcion: `Forecast de ventas. Facturas atrasadas: ${Math.round(RECUPERO_ATRASADO.optimista * 100)}% al mes (el mejor mes medido). EWU a su máximo reciente.`, meses: mesesOpt },
    ],
    anioAnterior,
    supuestos: {
      ritmoCicloCredito: conservador.ritmoCicloCredito, ewu, recupero: RECUPERO_ATRASADO,
      facturasAlDia, atrasado: base.caja.atrasado.monto,
      quedanAlCierre: { conservador: quedan(mesesCons), base: quedan(mesesBase), optimista: quedan(mesesOpt) },
    },
  }
}
