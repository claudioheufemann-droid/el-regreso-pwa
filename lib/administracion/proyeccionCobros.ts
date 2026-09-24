/**
 * Proyección de cobranza: cuánta plata debería entrar en las próximas semanas,
 * cruzando lo que está IMPAGO con el comportamiento de pago REAL de cada
 * cliente.
 *
 * Qué la diferencia de `proyectarCaja` (la del flujo de caja semanal):
 *
 *   · proyectarCaja no sabe qué está pagado. `ventas` nunca tuvo marca de
 *     pago, así que tuvo que inventar un corte ciego —descartar los cobros
 *     esperados de hace más de 14 días— para no arrastrar como pendiente todo
 *     lo ya cobrado. Acá el estado de pago se sabe de verdad: se cruza el
 *     número de factura contra `cobros_erp` (el 96,6% de los pagos lo trae).
 *
 *   · proyectarCaja usa UN plazo por cliente. Acá se usan dos —el habitual y
 *     el lento— para entregar un rango en vez de un número solo, que es lo
 *     honesto cuando el mismo cliente a veces paga a 10 días y a veces a 30.
 *
 * Lo que NO hace: adivinar la venta que todavía no ocurrió. La venta de
 * mostrador (PDV), que se cobra al instante y no deja factura esperando, entra
 * como un promedio aparte — ver `mostradorSemanal`.
 */

import { brutoDeFila, lunesDe, esIngresoReal, normalizarNombreCliente, type FilaVentaFinanzas } from './finanzas'
import { esClienteCobroInmediato } from '@/lib/types'

/**
 * Precisión medida de esta proyección, para poder mostrarla junto al número.
 *
 * Sale del backtest walk-forward sobre 26 semanas
 * (scripts/analisis/backtest-cobranza.ts, corrida del 19-sep-2026), que simula
 * qué habría proyectado el modelo con la información disponible en cada
 * momento y lo compara contra lo que realmente entró:
 *
 *   estimador de días     MAE      MAPE   sesgo   corr
 *   promedio (el que usa) $1,80M    32%     +3%   0,49
 *   mediana (p50)         $2,16M    41%     -4%   0,39
 *   plazo declarado       $2,49M    47%     +8%   0,23
 *
 * Dos conclusiones que valen la pena:
 *
 *   · El comportamiento medido le gana claro al plazo que declara la ficha
 *     del cliente (0,49 vs 0,23 de correlación). Todo el trabajo de cargar
 *     "Movimientos Cta. Cte." se paga acá.
 *
 *   · Para proyectar PLATA conviene el promedio y no la mediana, aunque para
 *     describirle a una persona "cuánto se demora este cliente" la mediana
 *     sea lo correcto. La caja de una semana es una suma, y ahí manda el
 *     valor esperado: el que a veces paga a 60 días aporta su promedio.
 *
 * También se probó sumar un término de "recupero de lo atrasado". En una
 * primera medición parecía mejorar mucho, pero esa medición tenía sesgo de
 * supervivencia —el pool se había calculado sólo con facturas que terminaron
 * pagándose— y al corregirlo el término empeora el modelo (sesgo +34%). Lo
 * atrasado se muestra aparte, como lista para cobrar, y no se proyecta.
 */
export const BACKTEST_MAE_SEMANAL = 1_800_000

/** De dónde salió el plazo que se usó para proyectar esta factura. */
export type FuentePlazo = 'medido' | 'declarado' | 'estimado'

export interface PlazoCliente {
  /** PROMEDIO de días de sus pagos reales. Es el que se usa para proyectar
   *  plata: el backtest lo dejó como el mejor estimador (ver BACKTEST_MAE_SEMANAL). */
  promedio: number
  /** Su cuartil rápido: 1 de cada 4 pagos suyos entra en este plazo o menos.
   *  Da el escenario "si pagan mejor que su propio promedio". Es el espejo de
   *  `p75`, no un dato con validación propia: no hay backtest específico para
   *  este escenario, sólo para `promedio` (ver BACKTEST_MAE_SEMANAL). */
  p25: number
  /** Su cuartil lento: 1 de cada 4 pagos suyos tarda al menos esto. Da el
   *  escenario "si se demoran". */
  p75: number
  /** Plazo PACTADO — lo que dice la ficha del cliente (`clientes.dias_pago`),
   *  o la mediana declarada de toda la cartera si no tiene ficha propia.
   *  Distinto eje que `promedio`/`p25`/`p75`: esos miden comportamiento REAL
   *  (de `cobros_erp`); esto es la PROMESA, exista o no historial medido para
   *  este cliente. Da el escenario "si todos cumplen lo que acordamos" — el
   *  ideal, pedido explícitamente por Administración (23-sep-2026) para
   *  contrastar contra lo que el comportamiento real dice que en verdad va a
   *  pasar. Puede ser mayor O menor que `promedio`: hay clientes que pactan
   *  30 días y pagan a 15, y otros al revés. */
  pactado: number
  fuente: FuentePlazo
}

export interface FacturaPendiente {
  cliente: string
  factura: string
  fechaEntrega: string
  bruto: number
  dias: number
  fechaEsperada: string
  fechaEsperadaOptimista: string
  fechaEsperadaLenta: string
  /** Fecha esperada si el cliente pagara exactamente a su plazo PACTADO —
   *  independiente de `fechaEsperada` (que usa el comportamiento medido). */
  fechaEsperadaPactada: string
  fuente: FuentePlazo
  /** Días transcurridos desde que se esperaba el pago SEGÚN COMPORTAMIENTO
   *  REAL. 0 si todavía no vence bajo ese criterio. */
  diasAtraso: number
  /** Lo mismo, pero contra el plazo PACTADO — son criterios independientes:
   *  una factura puede estar atrasada según lo pactado (ya debería haber
   *  llegado si cumplieran) y al mismo tiempo NO estarlo según su
   *  comportamiento real (este cliente en particular siempre tarda más que
   *  lo que promete, así que su reloj real todavía no llegó). */
  diasAtrasoPactado: number
}

export interface SemanaProyectada {
  lunes: string
  /** Facturas que vencen esa semana, si el cliente paga como suele hacerlo. */
  base: number
  /** Lo mismo pero con el cuartil RÁPIDO de cada cliente — "si pagan mejor
   *  de lo habitual". Al ser más rápido, esta plata puede caer en una
   *  semana ANTERIOR a la de `base`: la suma de `optimista` en todas las
   *  semanas da lo mismo que la de `base`, sólo que corrida hacia atrás. */
  optimista: number
  /** Lo mismo pero con el cuartil lento de cada cliente. */
  lento: number
  /** Facturas que vencen esa semana si TODOS los clientes cumplieran su
   *  plazo pactado — el escenario ideal. Reparto INDEPENDIENTE del de
   *  `base`/`optimista`/`lento`: usa su propio criterio de atraso
   *  (`atrasadoPactado`, aparte de `atrasado`), así que una factura puede
   *  estar en el `atrasado` de un reparto y en semana futura del otro. */
  pactado: number
  /** Lo esperado esa semana. Hoy es igual a `base`; existe como campo propio
   *  porque la UI y los totales lo consumen, y si algún día se suma otro
   *  término (se probó uno de recupero del atraso y no mejoró — ver
   *  BACKTEST_MAE_SEMANAL) no hay que tocar a los consumidores. */
  total: number
  facturas: number
}

export interface ProyeccionCobros {
  hayDatos: boolean
  semanas: SemanaProyectada[]
  proximaSemana: { lunes: string; base: number; optimista: number; lento: number; total: number; detalle: FacturaPendiente[] }
  /** Facturas cuya fecha esperada de pago ya pasó y siguen sin aparecer
   *  pagadas. No se suman a ninguna semana futura a propósito: darlas por
   *  cobradas la próxima semana infla la proyección justo con la plata que
   *  ya demostró ser difícil. Se muestran aparte, que es lo accionable. */
  atrasado: { monto: number; facturas: number; detalle: FacturaPendiente[] }
  /** Lo mismo, pero contra el plazo PACTADO — un pool DISTINTO al de arriba
   *  (ver la nota en FacturaPendiente.diasAtrasoPactado): puede tener más o
   *  menos plata, y no son las mismas facturas necesariamente. */
  atrasadoPactado: { monto: number; facturas: number }
  /** Venta de mostrador: promedio semanal reciente, cobro inmediato. */
  mostradorSemanal: number
  totalPendiente: number
  /** Cuánto del monto pendiente se proyectó con cada calidad de plazo. */
  cobertura: { medido: number; declarado: number; estimado: number }
  /** Ventas despachadas sin número de factura: no se pueden cruzar contra los
   *  pagos, así que quedan fuera de la proyección. Se informa para que el
   *  número no parezca más completo de lo que es. */
  sinRastreo: { monto: number; filas: number }
}

function sumarDias(fechaISO: string, dias: number): string {
  return new Date(Date.parse(`${fechaISO}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

function diffDias(desdeISO: string, hastaISO: string): number {
  return Math.round(
    (Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86_400_000
  )
}

export function proyectarCobros({
  ventas, facturasImpagas, plazoPorCliente, plazoPorDefecto, hoyISO,
  mostradorSemanal, semanasAdelante = 6,
}: {
  ventas: FilaVentaFinanzas[]
  /** Números de factura que NO aparecen en `cobros_erp` (RPC facturas_impagas). */
  facturasImpagas: Set<string>
  plazoPorCliente: Map<string, PlazoCliente>
  /** Para clientes sin plazo propio: la mediana MEDIDA de la cartera (cubre
   *  promedio/p25/p75). `PlazoCliente.pactado` no usa este fallback — cada
   *  entrada del mapa ya trae su propio pactado resuelto (ficha propia o
   *  mediana DECLARADA de la cartera), porque son ejes distintos: un cliente
   *  puede tener comportamiento medido pero ninguna ficha con plazo, o al
   *  revés. */
  plazoPorDefecto: number
  hoyISO: string
  mostradorSemanal: number
  semanasAdelante?: number
}): ProyeccionCobros {
  /* Una factura puede venir partida en varias líneas de venta (una por
     producto). Se agrupa primero, porque el cobro ocurre por factura
     completa, no por línea. */
  const porFactura = new Map<string, { cliente: string; fechaEntrega: string; bruto: number }>()
  const sinRastreo = { monto: 0, filas: 0 }

  for (const f of ventas) {
    if (!f.fecha_entrega) continue // sin despachar: el reloj de pago no arrancó
    if (!esIngresoReal(f)) continue // mermas, muestras, degustaciones
    // El mostrador se cobra en el momento y entra por `mostradorSemanal`;
    // contarlo también acá sería sumar la misma plata dos veces.
    if (esClienteCobroInmediato(f.nombre_fantasia)) continue

    const bruto = brutoDeFila(f)
    if (bruto <= 0) continue

    const factura = (f as FilaVentaFinanzas & { numero_factura?: string | null }).numero_factura
    if (!factura) { sinRastreo.monto += bruto; sinRastreo.filas++; continue }
    if (!facturasImpagas.has(factura)) continue // ya está pagada

    const acc = porFactura.get(factura) ?? {
      cliente: f.nombre_fantasia ?? '(sin nombre)',
      fechaEntrega: f.fecha_entrega,
      bruto: 0,
    }
    acc.bruto += bruto
    // Si las líneas tienen fechas distintas gana la más tardía: la factura no
    // se cobra hasta que salió todo lo que incluye.
    if (f.fecha_entrega > acc.fechaEntrega) acc.fechaEntrega = f.fecha_entrega
    porFactura.set(factura, acc)
  }

  const pendientes: FacturaPendiente[] = []
  const cobertura = { medido: 0, declarado: 0, estimado: 0 }

  for (const [factura, v] of porFactura) {
    const plazo = plazoPorCliente.get(normalizarNombreCliente(v.cliente))
      ?? { promedio: plazoPorDefecto, p25: plazoPorDefecto, p75: plazoPorDefecto, pactado: plazoPorDefecto, fuente: 'estimado' as FuentePlazo }

    const fechaEsperada = sumarDias(v.fechaEntrega, plazo.promedio)
    const fechaEsperadaOptimista = sumarDias(v.fechaEntrega, plazo.p25)
    const fechaEsperadaLenta = sumarDias(v.fechaEntrega, plazo.p75)
    const fechaEsperadaPactada = sumarDias(v.fechaEntrega, plazo.pactado)
    const diasAtraso = Math.max(0, diffDias(fechaEsperada, hoyISO))
    const diasAtrasoPactado = Math.max(0, diffDias(fechaEsperadaPactada, hoyISO))

    cobertura[plazo.fuente] += v.bruto
    pendientes.push({
      cliente: v.cliente, factura, fechaEntrega: v.fechaEntrega, bruto: v.bruto,
      dias: plazo.promedio, fechaEsperada, fechaEsperadaOptimista, fechaEsperadaLenta, fechaEsperadaPactada,
      fuente: plazo.fuente, diasAtraso, diasAtrasoPactado,
    })
  }

  /* ── Reparto a semanas ──────────────────────────────────────────────────
     El escenario base usa la fecha esperada habitual; el optimista, la del
     cuartil 25; el lento, la del cuartil 75. Son tres repartos del MISMO
     dinero, no montos distintos: por eso la suma de `optimista`/`lento` a lo
     largo de todas las semanas da lo mismo que la de `base`, sólo que
     corrida hacia atrás o hacia adelante.

     `pactado` es un reparto APARTE con su propio criterio de atraso
     (diasAtrasoPactado, no diasAtraso): una factura puede estar "atrasada"
     bajo un criterio y no bajo el otro, así que no se puede reusar el mismo
     filtro `if (p.diasAtraso > 0) continue` de arriba para repartirla. */
  const lunesHoy = lunesDe(hoyISO)
  const semanas: SemanaProyectada[] = []
  for (let i = 0; i < semanasAdelante; i++) {
    semanas.push({ lunes: sumarDias(lunesHoy, i * 7), base: 0, optimista: 0, lento: 0, pactado: 0, total: 0, facturas: 0 })
  }
  const idxDe = (fecha: string) => semanas.findIndex(s => fecha >= s.lunes && fecha < sumarDias(s.lunes, 7))

  const atrasado = { monto: 0, facturas: 0, detalle: [] as FacturaPendiente[] }
  const atrasadoPactado = { monto: 0, facturas: 0 }
  for (const p of pendientes) {
    if (p.diasAtrasoPactado > 0) {
      atrasadoPactado.monto += p.bruto
      atrasadoPactado.facturas++
    } else {
      const iPactado = idxDe(p.fechaEsperadaPactada)
      if (iPactado >= 0) semanas[iPactado].pactado += p.bruto
    }

    if (p.diasAtraso > 0) {
      atrasado.monto += p.bruto
      atrasado.facturas++
      atrasado.detalle.push(p)
      continue
    }
    const iBase = idxDe(p.fechaEsperada)
    if (iBase >= 0) { semanas[iBase].base += p.bruto; semanas[iBase].facturas++ }
    // El optimista puede caer ANTES de la primera semana de la ventana (un
    // pago que hoy mismo se adelantaría) — idxDe da -1 y ese monto queda
    // fuera, igual que ya le pasa al lento en la punta final de la ventana.
    const iOptimista = idxDe(p.fechaEsperadaOptimista)
    if (iOptimista >= 0) semanas[iOptimista].optimista += p.bruto
    const iLento = idxDe(p.fechaEsperadaLenta)
    if (iLento >= 0) semanas[iLento].lento += p.bruto
  }
  atrasado.detalle.sort((a, b) => b.bruto - a.bruto)
  for (const s of semanas) s.total = s.base

  // "Próxima semana" es la que viene, no la que corre: de la que corre ya
  // pasaron días y su plata en parte entró.
  const proximaLunes = sumarDias(lunesHoy, 7)
  const detalleProxima = pendientes
    .filter(p => p.diasAtraso === 0 && p.fechaEsperada >= proximaLunes && p.fechaEsperada < sumarDias(proximaLunes, 7))
    .sort((a, b) => b.bruto - a.bruto)
  const sem1 = semanas[1]

  return {
    hayDatos: pendientes.length > 0,
    semanas,
    proximaSemana: {
      lunes: proximaLunes,
      base: sem1?.base ?? 0,
      optimista: sem1?.optimista ?? 0,
      lento: sem1?.lento ?? 0,
      total: sem1?.total ?? 0,
      detalle: detalleProxima,
    },
    atrasado,
    atrasadoPactado,
    mostradorSemanal,
    totalPendiente: pendientes.reduce((s, p) => s + p.bruto, 0),
    cobertura,
    sinRastreo,
  }
}
