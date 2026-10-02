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
  armarCajaCobrada, CALIBRACION_BACKTEST, horizonte, cobrosConfirmados, cobrosProyectados, esClienteCredito, mixDePlazos, perfilesPago, repartirEnDias, sumarDias,
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
  /** Facturas emitidas e impagas que, según cómo paga cada cliente, se cobran ese mes (calibrado). */
  facturas: number
  /** Venta que todavía no se factura (litros proyectados × precio + pedidos sin despachar), calibrada. */
  venta: number
  /** Recupero de facturas atrasadas (ritmo medido, decreciente). */
  atrasadas: number
}

/** De dónde sale la venta futura y cómo se compara con el forecast en pesos de Finanzas. */
export interface FuenteVenta {
  modo: 'litros' | 'pesos'
  /** Neto por litro real de los últimos ciclos cerrados (venta $ ÷ litros del mismo universo). */
  precioLitro: number
  ciclosPrecio: number
  /** Neto por litro que implica el forecast en $ de Finanzas sobre los litros de Producción (ciclos futuros del horizonte). */
  precioImplicitoFinanzas: number | null
  /** Cuánto más (o menos) proyecta el forecast de Finanzas que litros × precio real, en el horizonte. */
  diferenciaFinanzas: number | null
}

export interface DatosCajaCobrada {
  caja: CajaCobrada
  /** Lo mismo que caja.meses[].cobrado, separado mayoristas / enlatado (Bundor; EWU se suma en los escenarios). */
  mesesPorGrupo: MesPorGrupo[]
  fuenteVenta: FuenteVenta
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
  /** Puntos del forecast general en $ de Finanzas (nivel='general'): historia en $ y respaldo. */
  forecastGeneral: { mes: string; tipo: string; monto: number }[]
  /** Puntos del forecast general en LITROS de Producción (nivel='general'). Si vienen, la venta
   *  futura se valoriza como litros × precio real por litro: un solo pronóstico de demanda para
   *  Producción y Finanzas (decisión del usuario, 2-oct-2026). */
  forecastLitros?: { mes: string; tipo: string; litros: number }[]
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

/**
 * Venta a crédito futura por ciclo = litros proyectados por Producción × neto por litro real
 * (últimos 3 ciclos cerrados) × participación del crédito × factor bruto. Sin forecast de
 * litros, cae al forecast en $ de Finanzas. El escenario "ritmo de los últimos 3 meses" se
 * retiró: el backtest mostró que arrastra la estacionalidad con retraso (+50% desde abril).
 */
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
  let netoTotal = 0, netoCredito = 0, brutoCredito = 0, mtdCreditoBruto = 0, brutoEnlatado = 0
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
    if (esEnlatado(v.nombre_fantasia)) brutoEnlatado += bruto
    ventasPorCliente.set(v.nombre_fantasia!, (ventasPorCliente.get(v.nombre_fantasia!) ?? 0) + bruto)
    if (v.fecha_pedido) patron[(new Date(`${v.fecha_pedido}T00:00:00Z`).getUTCDay() + 6) % 7] += neto
    if (!pactado.has(normalizarNombreCliente(v.nombre_fantasia))) sinPlazo.add(v.nombre_fantasia!)
  }
  const participacionCredito = netoTotal > 0 ? netoCredito / netoTotal : 0
  const factorBruto = netoCredito > 0 ? brutoCredito / netoCredito : 1 + IVA
  // ── Precio neto por litro real y fuente de la venta futura ──
  const litrosHist = new Map<string, number>()
  const litrosFut = new Map<string, number>()
  for (const p of e.forecastLitros ?? []) (p.tipo === 'forecast' ? litrosFut : litrosHist).set(p.mes.slice(0, 10), p.litros)
  const cerradosPrecio = e.forecastGeneral
    .filter(p => p.tipo === 'historico' && litrosHist.get(p.mes.slice(0, 10)) && p.mes.slice(0, 10) < (mesActual ?? hoyISO))
    .sort((a, b) => a.mes.localeCompare(b.mes)).slice(-3)
  const litrosPrecio = cerradosPrecio.reduce((s, p) => s + (litrosHist.get(p.mes.slice(0, 10)) ?? 0), 0)
  const precioLitro = litrosPrecio > 0 ? cerradosPrecio.reduce((s, p) => s + p.monto, 0) / litrosPrecio : 0
  const usarLitros = precioLitro > 0 && litrosFut.size > 0
  let netoFinanzasHorizonte = 0, netoLitrosHorizonte = 0
  const participacionEnlatado = brutoCredito > 0 ? brutoEnlatado / brutoCredito : 0
  const mix = mixDePlazos([...ventasPorCliente.entries()].map(([cliente, bruto]) => ({ cliente, bruto })), perfiles)

  // ── Etapa 2: emisiones futuras ──
  const emisiones: EmisionProyectada[] = []
  const desde = sumarDias(hoyISO, 1) // lo de hoy ya está en lo pedido del ciclo
  for (const p of e.forecastGeneral) {
    if (p.tipo !== 'forecast') continue
    const ini = e.inicioDeCiclo(p.mes), fin = e.finDeCiclo(p.mes)
    if (fin < desde || ini > hastaISO) continue
    const litros = litrosFut.get(p.mes.slice(0, 10))
    const netoCiclo = usarLitros && litros != null ? litros * precioLitro : p.monto
    if (litros != null) { netoFinanzasHorizonte += p.monto; netoLitrosHorizonte += litros * precioLitro }
    let monto = netoCiclo * participacionCredito * factorBruto
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
    const k = m.facturas > 0 && confMes.get(m.mes) ? m.facturas / confMes.get(m.mes)! : CALIBRACION_BACKTEST.k[horizonte(`${m.mes}-01`, hoyISO)]
    const enlatado = (enCurso ? realEnlMes : 0) + (enlConfMes.get(m.mes) ?? 0) * k + m.venta * participacionEnlatado
    return { mes: m.mes, mayoristas: m.cobrado - enlatado, enlatado, real: m.real, facturas: m.facturas, venta: m.venta, atrasadas: m.atrasadas }
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
    caja, mesesPorGrupo, hastaISO, mix, segmentos: perfiles.segmentos, cobertura: confirmados.cobertura,
    fuenteVenta: {
      modo: usarLitros ? 'litros' : 'pesos', precioLitro, ciclosPrecio: cerradosPrecio.length,
      precioImplicitoFinanzas: netoLitrosHorizonte > 0 && precioLitro > 0 ? netoFinanzasHorizonte / (netoLitrosHorizonte / precioLitro) : null,
      diferenciaFinanzas: netoLitrosHorizonte > 0 ? netoFinanzasHorizonte / netoLitrosHorizonte - 1 : null,
    },
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
  /** Composición (suma = total). facturas y venta ya calibradas con el backtest. */
  real: number
  facturas: number
  /** Recupero de facturas atrasadas. */
  atrasadas: number
  venta: number
  /** EWU con su ritmo de pago (no está en el informe de ventas). */
  ewu: number
}

export interface EscenarioCaja {
  id: 'bajo' | 'base' | 'alto'
  nombre: string
  descripcion: string
  meses: EscenarioMes[]
}

export interface EscenariosCaja {
  escenarios: EscenarioCaja[]
  /** Lo que de verdad se cobró el mismo mes del año anterior (etiquetado con el mes de este año). */
  anioAnterior: EscenarioMes[]
  supuestos: {
    ewu: { min: number; promedio: number; max: number; meses: number }
    calibracion: typeof CALIBRACION_BACKTEST
    /** Facturas por pagar hoy: al día (todavía no vencen según el cliente) y atrasadas. */
    facturasAlDia: number
    atrasado: number
    /** De lo atrasado hoy, cuánto se recupera hasta el horizonte al ritmo medido (sin gestión extra). */
    atrasadoRecuperado: number
    fuenteVenta: FuenteVenta
  }
}

/**
 * Ritmos de recupero por escenario del modelo ANTERIOR (constante en el tiempo). Se conservan
 * sólo porque el backtest los compara (scripts/analisis/backtest-escenarios-caja.ts); el modelo
 * vigente usa CALIBRACION_BACKTEST.recupero, decreciente por horizonte.
 */
export const RECUPERO_ATRASADO: Record<'conservador' | 'base' | 'optimista', number> = { conservador: 0.04, base: 0.06, optimista: 0.13 }

/**
 * Tres escenarios de cobro de mayoristas + enlatado, por mes calendario hasta el horizonte.
 *   · Base: el modelo calibrado con el backtest (venta = litros de Producción × precio real).
 *   · Bajo / alto: base ± el error medio fuera de muestra del backtest para ese horizonte
 *     (24% / 23% / 22%). Lo ya cobrado no se mueve. Reemplaza a los escenarios anteriores
 *     (ritmo de 3 meses y recupero al 13%), que el backtest mostró sesgados al alza.
 * EWU no aparece en el informe de ventas desde mar-2026: se suma con el promedio de sus pagos
 * de los últimos 3 meses cerrados, descontando lo que ya pagó en el mes en curso.
 */
export function construirEscenarios(
  base: DatosCajaCobrada,
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

  const mesesBase: EscenarioMes[] = base.mesesPorGrupo.map(g => {
    const ewuMes = g.mes === mesActual ? Math.max(0, ewu.promedio - ewuYaPagado) : ewu.promedio
    const enlatado = g.enlatado + ewuMes
    return { mes: g.mes, mayoristas: g.mayoristas, enlatado, total: g.mayoristas + enlatado, real: g.real, facturas: g.facturas, atrasadas: g.atrasadas, venta: g.venta, ewu: ewuMes }
  })
  // Bajo / alto: se escala todo lo que no es "ya cobrado" por (1 ∓ error del horizonte).
  const banda = (signo: 1 | -1): EscenarioMes[] => mesesBase.map(m => {
    const f = 1 + signo * CALIBRACION_BACKTEST.error[horizonte(`${m.mes}-01`, hoyISO)]
    const x = (v: number) => v * f
    const realMay = m.real * (m.mayoristas / (m.total || 1))
    return {
      mes: m.mes, real: m.real, facturas: x(m.facturas), atrasadas: x(m.atrasadas), venta: x(m.venta), ewu: x(m.ewu),
      mayoristas: realMay + x(m.mayoristas - realMay), enlatado: (m.real - realMay) + x(m.enlatado - (m.real - realMay)),
      total: m.real + x(m.total - m.real),
    }
  })

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

  const err = CALIBRACION_BACKTEST.error.map(e => `${Math.round(e * 100)}%`).join(' / ')
  return {
    escenarios: [
      { id: 'bajo', nombre: 'Bajo', descripcion: `Base menos el error medio del backtest (${err} según el mes). Así de mal le fue al modelo en un mes típico.`, meses: banda(-1) },
      { id: 'base', nombre: 'Base', descripcion: 'Facturas por pagar y venta proyectada (litros de Producción × precio real), corregidas con lo medido en el backtest; atrasadas al ritmo de recupero medido; EWU a su promedio.', meses: mesesBase },
      { id: 'alto', nombre: 'Alto', descripcion: `Base más el error medio del backtest (${err}).`, meses: banda(1) },
    ],
    anioAnterior,
    supuestos: {
      ewu, calibracion: CALIBRACION_BACKTEST,
      facturasAlDia: base.caja.cuadratura.carteraInicial - base.caja.atrasado.monto,
      atrasado: base.caja.atrasado.monto,
      atrasadoRecuperado: mesesBase.reduce((s, m) => s + m.atrasadas, 0),
      fuenteVenta: base.fuenteVenta,
    },
  }
}
