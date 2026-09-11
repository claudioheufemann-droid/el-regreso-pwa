/**
 * lib/administracion/flujoSemanal.ts — Motor del dashboard de flujo de caja
 * semanal de Administración y Finanzas.
 *
 * Separa a propósito INGRESOS CONFIRMADOS de INGRESOS PROYECTADOS y nunca los
 * suma en una sola cifra, porque son dos cosas con niveles de certeza
 * distintos y mezclarlas es lo que hace que una proyección de caja se vea
 * mejor de lo que es:
 *
 *   · Confirmado  = venta YA DESPACHADA. El producto salió, la factura existe
 *                   y el plazo de pago ya está corriendo. Sólo falta que
 *                   entre la plata. Fecha de cobro = entrega + plazo del
 *                   cliente (ver `proyectarCaja` en finanzas.ts, que ahora usa
 *                   el plazo REAL observado por cliente, no el declarado).
 *   · Proyectado  = plata que todavía no tiene respaldo de una entrega:
 *                   (a) backlog vendido pero SIN despachar, y
 *                   (b) lo que el modelo mensual espera vender y aún no se
 *                       vendió.
 *
 * El (b) se calcula como REMANENTE del mes (forecast del mes − lo ya vendido
 * ese mes) justamente para no contar dos veces lo que ya está en (a) o en los
 * confirmados.
 */
import { lunesDe } from './finanzas'

export interface SemanaFlujo {
  /** yyyy-mm-dd del lunes. */
  inicio: string
  /** true si la semana ya pasó (cobros que debieron entrar). */
  pasada: boolean
  /** true si es la semana en curso. */
  actual: boolean
  ingresosConfirmados: number
  ingresosProyectados: number
  comprasReales: number
  comprasProyectadas: number
  /** (confirmados + proyectados) − (compras reales + proyectadas). */
  flujoNeto: number
  /** Saldo de caja arrastrado semana a semana desde `saldoInicial`. */
  saldoAcumulado: number
  /** true cuando las compras superan a TODO el ingreso esperado de la semana
   *  — es la condición que se pinta en rojo en el gráfico. */
  deficit: boolean
}

export interface EntradaCompra {
  monto: number
  fecha_pago: string
  fecha_documento: string | null
  estado: 'comprometida' | 'estimada' | 'pagada'
}

/** Cobro esperado de una venta ya despachada, tal como lo reparte
 *  `proyectarCaja` (una entrada por semana). */
export interface CobroSemanal {
  inicio: string
  bruto: number
}

/** Venta cerrada pero sin despachar: se sabe el monto y el plazo del cliente,
 *  no la fecha de entrega. */
export interface BacklogCliente {
  bruto: number
  diasPago: number | null
}

export interface PuntoForecastMes {
  /** yyyy-mm-01 */
  mes: string
  /** Monto NETO que el modelo espera para ese mes. */
  monto: number
}

/** Suma `n` días corridos a una fecha ISO. */
function sumarDiasISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Lista de lunes consecutivos: `atras` semanas hacia atrás desde la actual y
 *  `adelante` hacia adelante (incluye la actual). */
export function semanasRodantes(hoyISO: string, atras: number, adelante: number): string[] {
  const base = lunesDe(hoyISO)
  const out: string[] = []
  for (let i = -atras; i <= adelante; i++) out.push(sumarDiasISO(base, i * 7))
  return out
}

interface ArgsFlujo {
  /** Cobros de ventas despachadas, por semana (de `proyectarCaja`). */
  cobrosConfirmados: CobroSemanal[]
  /** Vendido y aún no despachado, por cliente. */
  backlog: BacklogCliente[]
  /** Forecast mensual del modelo (neto). */
  forecastMensual: PuntoForecastMes[]
  /** Venta NETA ya registrada por mes (yyyy-mm-01 → neto), para descontarla
   *  del forecast de ese mes y no contar dos veces. */
  ventaRegistradaPorMes: Map<string, number>
  /** Factor neto→bruto promedio, para que el forecast (que es neto) quede en
   *  la misma unidad que el resto del dashboard (bruto, con IVA: es la plata
   *  que efectivamente llega a la cuenta). */
  factorBruto: number
  compras: EntradaCompra[]
  /** Saldo bancario de partida y su fecha. null = no hay saldo cargado. */
  saldoInicial: number | null
  /** Días que tarda en promedio un cliente en pagar — desplaza el forecast
   *  desde "mes de venta" a "semana de cobro". */
  diasCobroPromedio: number
  hoyISO: string
  semanas: string[]
}

export function construirFlujoSemanal(a: ArgsFlujo): SemanaFlujo[] {
  const semanaActual = lunesDe(a.hoyISO)
  const primera = a.semanas[0]
  const ultima = a.semanas[a.semanas.length - 1]
  const dentro = (lunes: string) => lunes >= primera && lunes <= ultima

  const confirmados = new Map<string, number>()
  for (const c of a.cobrosConfirmados) {
    if (!dentro(c.inicio)) continue
    confirmados.set(c.inicio, (confirmados.get(c.inicio) ?? 0) + c.bruto)
  }

  const proyectados = new Map<string, number>()
  const sumarProyectado = (lunes: string, monto: number) => {
    if (!dentro(lunes) || monto <= 0) return
    proyectados.set(lunes, (proyectados.get(lunes) ?? 0) + monto)
  }

  /* Backlog: la entrega todavía no ocurrió, así que no hay fecha real de la
     que colgar el plazo. Se asume que sale dentro de los próximos 7 días —
     es el supuesto más conservador que se puede sostener (ya está vendido y
     en cola de despacho) y queda del lado "proyectado", nunca del
     confirmado. */
  const entregaSupuesta = sumarDiasISO(a.hoyISO, 7)
  for (const b of a.backlog) {
    const dias = b.diasPago ?? a.diasCobroPromedio
    sumarProyectado(lunesDe(sumarDiasISO(entregaSupuesta, dias)), b.bruto)
  }

  /* Forecast del modelo: se reparte el REMANENTE de cada mes (lo que el
     modelo espera menos lo ya vendido) por días corridos, y cada día se
     desplaza `diasCobroPromedio` hacia adelante para pasar de "día de venta"
     a "día de cobro". */
  const mesDeHoy = a.hoyISO.slice(0, 7)
  for (const p of a.forecastMensual) {
    const mes = p.mes.slice(0, 7)
    if (mes < mesDeHoy) continue
    const yaVendido = a.ventaRegistradaPorMes.get(`${mes}-01`) ?? 0
    const remanenteNeto = p.monto - yaVendido
    if (remanenteNeto <= 0) continue

    const [y, m] = mes.split('-').map(Number)
    const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
    // Sólo los días del mes que todavía no pasaron pueden generar venta nueva.
    const primerDia = mes === mesDeHoy ? Number(a.hoyISO.slice(8, 10)) + 1 : 1
    const diasRestantes = diasDelMes - primerDia + 1
    if (diasRestantes <= 0) continue

    const brutoPorDia = (remanenteNeto * a.factorBruto) / diasRestantes
    for (let d = primerDia; d <= diasDelMes; d++) {
      const diaVenta = `${mes}-${String(d).padStart(2, '0')}`
      sumarProyectado(lunesDe(sumarDiasISO(diaVenta, a.diasCobroPromedio)), brutoPorDia)
    }
  }

  const reales = new Map<string, number>()
  const estimadas = new Map<string, number>()
  for (const c of a.compras) {
    const lunes = lunesDe(c.fecha_pago)
    if (!dentro(lunes)) continue
    const destino = c.estado === 'estimada' ? estimadas : reales
    destino.set(lunes, (destino.get(lunes) ?? 0) + Number(c.monto))
  }

  let saldo = a.saldoInicial ?? 0
  return a.semanas.map(inicio => {
    const ingresosConfirmados = confirmados.get(inicio) ?? 0
    const ingresosProyectados = proyectados.get(inicio) ?? 0
    const comprasReales = reales.get(inicio) ?? 0
    const comprasProyectadas = estimadas.get(inicio) ?? 0
    const flujoNeto = ingresosConfirmados + ingresosProyectados - comprasReales - comprasProyectadas
    saldo += flujoNeto
    return {
      inicio,
      pasada: inicio < semanaActual,
      actual: inicio === semanaActual,
      ingresosConfirmados,
      ingresosProyectados,
      comprasReales,
      comprasProyectadas,
      flujoNeto,
      saldoAcumulado: saldo,
      deficit: comprasReales + comprasProyectadas > ingresosConfirmados + ingresosProyectados,
    }
  })
}

// ── Aging de cartera ─────────────────────────────────────────────────────────

export interface TramoAging {
  label: string
  monto: number
  /** % sobre el total de la cartera vencida. */
  pct: number
  /** Tono de la barra: mientras más viejo, más caliente. */
  tono: 'verde' | 'amber' | 'naranja' | 'rojo'
}

export interface FilaDeudorAging {
  nombre_fantasia: string | null
  deuda_menor_14_dias: number | null
  deuda_entre_15_29_dias: number | null
  deuda_entre_30_44_dias: number | null
  deuda_entre_45_59_dias: number | null
  deuda_entre_60_89_dias: number | null
  deuda_mas_90_dias: number | null
  deuda_vencida: number | null
  saldo_total: number | null
  ultimo_pago: string | null
}

/**
 * Tramos tal como los entrega el ERP (14/29/44/59/89/90+), no los 30/60/90
 * clásicos: re-agrupar obligaría a repartir un tramo entre dos, que es
 * inventar plata que no sabemos dónde cae. Se muestran los reales.
 *
 * OJO con qué mide esto: los tramos son la antigüedad del SALDO por cobrar,
 * que NO es lo mismo que `deuda_vencida`. Verificado con datos reales
 * (10-sep-2026, clientes reales, sin cuentas internas): los tramos suman
 * $68,4M, `deuda_vencida` $50,2M y el saldo total $84,7M — y hay 105 clientes
 * con plata en el tramo 90+ que el ERP igual reporta con deuda vencida $0.
 * Por eso este gráfico se rotula como antigüedad del saldo y el semáforo de
 * riesgo, que sí tiene que ser una alarma, se apoya en `deuda_vencida`.
 */
export function calcularAging(deudores: FilaDeudorAging[]): { tramos: TramoAging[]; total: number } {
  const suma = (f: (d: FilaDeudorAging) => number | null) =>
    deudores.reduce((s, d) => s + (Number(f(d)) || 0), 0)

  const crudos: { label: string; monto: number; tono: TramoAging['tono'] }[] = [
    { label: 'Hasta 14 días', monto: suma(d => d.deuda_menor_14_dias), tono: 'verde' },
    { label: '15 – 29 días', monto: suma(d => d.deuda_entre_15_29_dias), tono: 'amber' },
    { label: '30 – 44 días', monto: suma(d => d.deuda_entre_30_44_dias), tono: 'amber' },
    { label: '45 – 59 días', monto: suma(d => d.deuda_entre_45_59_dias), tono: 'naranja' },
    { label: '60 – 89 días', monto: suma(d => d.deuda_entre_60_89_dias), tono: 'naranja' },
    { label: '90+ días', monto: suma(d => d.deuda_mas_90_dias), tono: 'rojo' },
  ]
  const total = crudos.reduce((s, t) => s + t.monto, 0)
  return {
    total,
    tramos: crudos.map(t => ({ ...t, pct: total > 0 ? (t.monto / total) * 100 : 0 })),
  }
}

// ── Semáforo de riesgo por cliente ───────────────────────────────────────────

export interface ClienteRiesgo {
  cliente: string
  nivel: 'verde' | 'amarillo' | 'rojo'
  deudaVencida: number
  /** Tramo más viejo con plata: es lo que define el nivel. */
  tramoMasViejo: string | null
  /** Días que tarda en pagar según su historial real (null = sin historial). */
  diasPagoReal: number | null
  /** Plazo pactado en el ERP (null = sin plazo cargado). */
  diasPagoDeclarado: number | null
  /** Cuánto se pasa, en días, del plazo pactado. null si falta algún dato. */
  excesoSobrePlazo: number | null
  ultimoPago: string | null
}

/**
 * Semáforo de riesgo. Entran SÓLO los clientes que el ERP marca con
 * `deuda_vencida > 0`: ese es su criterio propio de "esto ya debió pagarse", y
 * es más estricto que los tramos de antigüedad (hay 105 clientes con saldo de
 * 90+ días que el ERP igual reporta sin deuda vencida — ver la nota en
 * `calcularAging`). Marcar a esos en rojo sería una alarma falsa.
 *
 * Dentro de los que sí están vencidos, el nivel lo define la EDAD de la
 * deuda, no el monto: deber poco hace 4 meses es peor señal que deber mucho
 * hace 10 días.
 *   rojo     → tiene saldo en el tramo de 60 días o más
 *   amarillo → tiene saldo en 30–59 días, o paga sistemáticamente más lento
 *              que su plazo pactado (más de 7 días de exceso)
 *   verde    → vencido, pero sólo en tramos recientes
 */
export function semaforoClientes(
  deudores: FilaDeudorAging[],
  diasPagoRealPorCliente: Map<string, { real: number | null; declarado: number | null }>,
  normalizar: (n: string | null | undefined) => string,
): ClienteRiesgo[] {
  const out: ClienteRiesgo[] = []
  for (const d of deudores) {
    const vencida = Number(d.deuda_vencida) || 0
    if (vencida <= 0) continue
    const v60 = (Number(d.deuda_entre_60_89_dias) || 0) + (Number(d.deuda_mas_90_dias) || 0)
    const v30 = (Number(d.deuda_entre_30_44_dias) || 0) + (Number(d.deuda_entre_45_59_dias) || 0)

    const plazos = diasPagoRealPorCliente.get(normalizar(d.nombre_fantasia))
    const real = plazos?.real ?? null
    const declarado = plazos?.declarado ?? null
    const exceso = real != null && declarado != null ? real - declarado : null

    let nivel: ClienteRiesgo['nivel'] = 'verde'
    if (v60 > 0) nivel = 'rojo'
    else if (v30 > 0 || (exceso != null && exceso > 7)) nivel = 'amarillo'

    const tramoMasViejo =
      (Number(d.deuda_mas_90_dias) || 0) > 0 ? '90+ días'
        : (Number(d.deuda_entre_60_89_dias) || 0) > 0 ? '60 – 89 días'
          : (Number(d.deuda_entre_45_59_dias) || 0) > 0 ? '45 – 59 días'
            : (Number(d.deuda_entre_30_44_dias) || 0) > 0 ? '30 – 44 días'
              : (Number(d.deuda_entre_15_29_dias) || 0) > 0 ? '15 – 29 días'
                : (Number(d.deuda_menor_14_dias) || 0) > 0 ? 'Hasta 14 días' : null

    out.push({
      cliente: d.nombre_fantasia ?? '(sin nombre)',
      nivel, deudaVencida: vencida, tramoMasViejo,
      diasPagoReal: real, diasPagoDeclarado: declarado, excesoSobrePlazo: exceso,
      ultimoPago: d.ultimo_pago ? String(d.ultimo_pago).slice(0, 10) : null,
    })
  }
  const orden = { rojo: 0, amarillo: 1, verde: 2 }
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel] || b.deudaVencida - a.deudaVencida)
}

// ── Ciclo de conversión de efectivo ──────────────────────────────────────────

export interface CicloConversion {
  /** Cuánto tarda el inventario en venderse. */
  diasInventario: number | null
  /** Cuánto tardan los clientes en pagarnos (DSO). */
  diasCobro: number | null
  /** Cuánto tardamos nosotros en pagarle a los proveedores (DPO). */
  diasPago: number | null
  /** inventario + cobro − pago. null si falta alguno de los tres. */
  dias: number | null
  /** Qué término no se pudo calcular y por qué — se muestra en la UI en vez
   *  de mostrar un número incompleto como si estuviera completo. */
  faltante: string | null
}

export function cicloConversionEfectivo(
  diasInventario: number | null,
  diasCobro: number | null,
  diasPago: number | null,
): CicloConversion {
  const faltante =
    diasInventario == null ? 'Falta el stock o la venta reciente para los días de inventario.'
      : diasCobro == null ? 'Falta historial de pagos para los días de cobro.'
        : diasPago == null ? 'Faltan compras con fecha de factura y de pago para los días de pago a proveedores.'
          : null
  return {
    diasInventario, diasCobro, diasPago,
    dias: faltante ? null : diasInventario! + diasCobro! - diasPago!,
    faltante,
  }
}

/** DPO: promedio de días entre la factura del proveedor y su pago. Sólo
 *  cuenta las compras que tienen ambas fechas. */
export function calcularDiasPagoProveedores(compras: EntradaCompra[]): number | null {
  const dias: number[] = []
  for (const c of compras) {
    if (!c.fecha_documento) continue
    const d = Math.round(
      (Date.parse(`${c.fecha_pago}T00:00:00Z`) - Date.parse(`${c.fecha_documento}T00:00:00Z`)) / 86_400_000
    )
    if (d >= 0 && d <= 365) dias.push(d)
  }
  if (dias.length === 0) return null
  return Math.round(dias.reduce((s, d) => s + d, 0) / dias.length)
}
