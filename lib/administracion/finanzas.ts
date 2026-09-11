/**
 * lib/administracion/finanzas.ts — Núcleo de cálculo del módulo Administración.
 *
 * Dos preguntas distintas, que acá se resuelven por separado a propósito:
 *
 *   1. ¿CUÁNTO vendemos?  → serie de ingresos en $ por ciclo interno, que
 *      alimenta el forecast (Prophet, mismo pipeline que Producción).
 *      Se cuenta por FECHA DE PEDIDO, igual que el forecast de litros: es la
 *      señal más temprana de demanda y mantiene ambos módulos hablando del
 *      mismo período (decisión del usuario, 7-sep-2026).
 *
 *   2. ¿CUÁNDO entra esa plata? → proyección de cobranza, que ancla los
 *      `dias_pago` del cliente a la FECHA DE ENTREGA (decisión del usuario,
 *      9-sep-2026): el plazo empieza a correr cuando se despacha/factura, no
 *      cuando se toma el pedido. `fecha_entrega` está poblada en el 97% de las
 *      ventas recientes; `numero_factura` sólo en el 38%, así que la fecha de
 *      factura no sirve como ancla aunque conceptualmente sería la exacta.
 *
 * La unidad de la venta es el NETO (`total_sin_impuesto`, "Total s/imp $" en el
 * informe del ERP). La unidad de la CAJA es el bruto: al banco entra el neto
 * más IVA y, en cerveza, ILA — por eso cada período proyectado lleva las dos
 * cifras (decisión del usuario). El bruto se calcula con `brutoLinea()` de
 * lib/cobranza.ts, que ya está verificado contra los tramos del ERP.
 */
import { brutoLinea, sumarDias } from '@/lib/cobranza'
import { esClienteExcluido } from '@/lib/types'

/** Mirror exacto de la función SQL `_categoria_normalizada`, para que la
 *  apertura por categoría dé lo mismo acá que en los RPC de Ventas. Si cambia
 *  una, hay que cambiar la otra. */
export function categoriaNormalizada(producto: string | null, categoriaProducto: string | null): 'Cerveza' | 'Kombucha' | 'Otros' {
  const cat = (categoriaProducto ?? '').toLowerCase()
  if (cat.includes('cerveza')) return 'Cerveza'
  if (cat.includes('kombucha')) return 'Kombucha'
  const p = (producto ?? '').toLowerCase()
  if (p === 'doble ipa' || p === 'del caribe sour') return 'Cerveza'
  return 'Otros'
}

/** Tours y degustaciones no son producto vendido — mismo criterio que la
 *  función SQL `_excluir_producto` que ya filtra el dashboard de Ventas. */
export function esProductoExcluido(producto: string | null): boolean {
  const p = (producto ?? '').toLowerCase()
  return p.includes('tour') || p.includes('degustaci')
}

export function normalizarNombreCliente(nombre: string | null | undefined): string {
  return (nombre ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface FilaVentaFinanzas {
  nombre_fantasia: string | null
  producto: string | null
  categoria_producto: string | null
  envase: string | null
  litros: number | null
  total_sin_impuesto: number | null
  fecha_pedido: string
  fecha_entrega: string | null
  entregado: boolean | null
}

/** ¿Esta fila es ingreso real de la empresa? Excluye consumo interno
 *  (PDV, BaseCamp, mermas, muestras) y tours: nunca generan plata a cobrar.
 *  La maquila SÍ entra — no es venta del área comercial, pero es plata que la
 *  empresa factura y cobra, que es lo que le importa a Administración. */
export function esIngresoReal(f: Pick<FilaVentaFinanzas, 'nombre_fantasia' | 'producto'>): boolean {
  if (esClienteExcluido(f.nombre_fantasia)) return false
  if (esProductoExcluido(f.producto)) return false
  return true
}

export function brutoDeFila(f: FilaVentaFinanzas): number {
  return brutoLinea({
    producto: f.producto ?? '',
    envase: f.envase,
    categoria_producto: f.categoria_producto,
    litros: Number(f.litros) || 0,
    total_sin_impuesto: Number(f.total_sin_impuesto) || 0,
  })
}

// ── Proyección de cobranza ───────────────────────────────────────────────────

/** Un cliente que se espera que pague DENTRO de una semana puntual — a
 *  diferencia de `ClientePorCobrar` (agregado global, una fila por cliente
 *  con su cobro más próximo), acá cada semana lleva su propio desglose para
 *  poder responder "¿quién me paga esta semana, y a qué plazo?". */
export interface ClienteEnPeriodo {
  cliente: string
  diasPago: number
  neto: number
  bruto: number
}

export interface PeriodoCaja {
  /** yyyy-mm-dd del lunes de la semana (o del primer día del mes si se agrupa
   *  por mes). */
  inicio: string
  neto: number
  bruto: number
  /** Cuántos documentos-línea caen en el período — para saber si un pico es
   *  un cliente grande o muchos chicos. */
  filas: number
  /** true si el período ya pasó: la plata debería haber entrado. Se muestra
   *  aparte porque no es proyección, es mora esperada. */
  vencido: boolean
  /** Quién compone el cobro de esta semana puntual, de mayor a menor bruto —
   *  para expandir la semana y ver nombres, montos y plazo de cada uno. */
  clientes: ClienteEnPeriodo[]
}

export interface ClientePorCobrar {
  cliente: string
  diasPago: number
  neto: number
  bruto: number
  /** Fecha de cobro más próxima entre sus documentos pendientes. */
  proximoCobro: string
}

export interface ProyeccionCaja {
  periodos: PeriodoCaja[]
  /** Quién debe esa plata, de mayor a menor — para saber si una semana grande
   *  depende de un solo cliente. */
  porCliente: ClientePorCobrar[]
  /** Ventas ya despachadas de clientes SIN `dias_pago` en el maestro: no se
   *  puede saber cuándo entran, así que no se reparten en ninguna semana
   *  (decisión del usuario) — quedan acá para que se corrija el maestro. */
  sinPlazo: { neto: number; bruto: number; filas: number; clientes: string[] }
  /** Vendido pero todavía sin despachar: la plata va a entrar, pero el plazo
   *  ni siquiera empezó a correr porque el reloj arranca en la entrega. */
  sinDespachar: { neto: number; bruto: number; filas: number }
  totalProyectado: { neto: number; bruto: number }
}

/** Lunes de la semana de una fecha (ISO, UTC). */
export function lunesDe(fechaISO: string): string {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=domingo
  const delta = dow === 0 ? -6 : 1 - dow
  return new Date(dt.getTime() + delta * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Reparte la plata de cada venta en la semana en que se espera cobrarla:
 * `fecha_entrega + dias_pago` del cliente.
 *
 * Sólo entran ventas YA DESPACHADAS: mientras no haya entrega el plazo no
 * arrancó, así que ponerlas en una semana concreta sería inventar una fecha.
 * Esas quedan en `sinDespachar`, visibles, en vez de desaparecer del total.
 */
export function proyectarCaja(
  ventas: FilaVentaFinanzas[],
  diasPagoPorCliente: Map<string, number | null>,
  hoyISO: string,
  /** Cobros esperados ANTES de esta fecha se descartan: a esa altura la plata
   *  ya entró (o ya es mora vieja, que se mide con el informe de Deudores del
   *  ERP, que sí sabe qué se pagó). `ventas` no tiene marca de pago, así que
   *  sin este corte la proyección arrastraría como "por cobrar" todo lo ya
   *  cobrado del histórico. */
  desdeISO: string,
): ProyeccionCaja {
  const porSemana = new Map<string, {
    neto: number; bruto: number; filas: number
    clientes: Map<string, { diasPago: number; neto: number; bruto: number }>
  }>()
  const porCliente = new Map<string, { cliente: string; diasPago: number; neto: number; bruto: number; proximoCobro: string }>()
  const sinPlazo = { neto: 0, bruto: 0, filas: 0, clientes: new Set<string>() }
  const sinDespachar = { neto: 0, bruto: 0, filas: 0 }

  for (const f of ventas) {
    if (!esIngresoReal(f)) continue
    const neto = Number(f.total_sin_impuesto) || 0
    if (neto === 0) continue
    const bruto = brutoDeFila(f)

    if (!f.fecha_entrega) {
      sinDespachar.neto += neto
      sinDespachar.bruto += bruto
      sinDespachar.filas++
      continue
    }

    const dias = diasPagoPorCliente.get(normalizarNombreCliente(f.nombre_fantasia))
    if (dias == null) {
      sinPlazo.neto += neto
      sinPlazo.bruto += bruto
      sinPlazo.filas++
      if (f.nombre_fantasia) sinPlazo.clientes.add(f.nombre_fantasia)
      continue
    }

    const fechaCobro = sumarDias(f.fecha_entrega.slice(0, 10), dias)
    if (fechaCobro < desdeISO) continue

    const nombre = f.nombre_fantasia ?? '(sin nombre)'

    const semana = lunesDe(fechaCobro)
    const acc = porSemana.get(semana) ?? { neto: 0, bruto: 0, filas: 0, clientes: new Map() }
    acc.neto += neto
    acc.bruto += bruto
    acc.filas++
    const cliSemana = acc.clientes.get(nombre) ?? { diasPago: dias, neto: 0, bruto: 0 }
    cliSemana.neto += neto
    cliSemana.bruto += bruto
    acc.clientes.set(nombre, cliSemana)
    porSemana.set(semana, acc)

    const cli = porCliente.get(nombre) ?? { cliente: nombre, diasPago: dias, neto: 0, bruto: 0, proximoCobro: fechaCobro }
    cli.neto += neto
    cli.bruto += bruto
    if (fechaCobro < cli.proximoCobro) cli.proximoCobro = fechaCobro
    porCliente.set(nombre, cli)
  }

  const semanaActual = lunesDe(hoyISO)
  const periodos: PeriodoCaja[] = [...porSemana.entries()]
    .map(([inicio, v]) => ({
      inicio, neto: v.neto, bruto: v.bruto, filas: v.filas,
      vencido: inicio < semanaActual,
      clientes: [...v.clientes.entries()]
        .map(([cliente, c]) => ({ cliente, diasPago: c.diasPago, neto: c.neto, bruto: c.bruto }))
        .sort((a, b) => b.bruto - a.bruto),
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))

  return {
    periodos,
    porCliente: [...porCliente.values()].sort((a, b) => b.bruto - a.bruto),
    sinPlazo: { neto: sinPlazo.neto, bruto: sinPlazo.bruto, filas: sinPlazo.filas, clientes: [...sinPlazo.clientes].sort() },
    sinDespachar,
    totalProyectado: {
      neto: periodos.reduce((s, p) => s + p.neto, 0),
      bruto: periodos.reduce((s, p) => s + p.bruto, 0),
    },
  }
}

// ── Precisión de cobro ───────────────────────────────────────────────────────
// Responde la pregunta que `proyectarCaja` NO responde: de lo que en el
// pasado se esperaba cobrar, ¿cuánto se cobró de verdad? `ventas` no tiene
// marca de pago (no hay tabla de recibos ni de movimientos de cuenta
// corriente sincronizada todavía — sólo el saldo/deuda ACTUAL del cliente,
// vía el informe de Deudores del ERP). Así que la única forma de calibrar es
// indirecta: para cada cliente cuya fecha de cobro esperada (fecha_entrega +
// dias_pago) ya pasó, se mira si ese cliente sigue figurando con deuda
// vencida > 0 en el snapshot MÁS RECIENTE de `deudores` (dato duro del ERP,
// no una proyección nuestra).
//
// Es una aproximación, no una conciliación contable: `deuda_vencida` es la
// deuda vencida TOTAL del cliente hoy, no "esta venta puntual" — si el
// cliente pagó ESTA venta pero se atrasó en otra más vieja, igual cuenta como
// "incumplido" acá. Se documenta así en vez de aparentar precisión que no
// existe. Lo que SÍ es sólido: el % resultante es la mejor estimación posible
// hoy de "cuántos clientes realmente están pagando cuando dijeron que iban a
// pagar", construida enteramente con datos que el ERP ya nos da — sin
// inventar nada.
export interface ClienteIncumplido {
  cliente: string
  /** Lo que ESTE análisis esperaba cobrarle en la ventana evaluada. */
  brutoEsperado: number
  /** La fecha de cobro esperada más antigua entre sus ventas vencidas —
   *  para ordenar por "hace cuánto que debería haber entrado". */
  fechaEsperadaMasAntigua: string
  /** Deuda vencida TOTAL del cliente según el ERP ahora mismo — puede ser
   *  mayor, menor o igual a `brutoEsperado` (ver nota arriba). */
  deudaVencidaReal: number
}

export interface PrecisionCobro {
  ventanaDesdeISO: string
  totalEsperado: { bruto: number; clientes: number }
  totalConfirmadoPagado: { bruto: number; clientes: number }
  totalIncumplido: { bruto: number; clientes: number }
  /** % de PLATA esperada que efectivamente se cobró (no % de clientes: un
   *  cliente grande incumplido pesa distinto que uno chico). Null si no
   *  hubo nada que evaluar en la ventana (recién arrancando el negocio). */
  pctCumplimiento: number | null
  /** Clientes incumplidos, de mayor a menor bruto esperado. */
  clientesIncumplidos: ClienteIncumplido[]
}

export function calcularPrecisionCobro(
  ventas: FilaVentaFinanzas[],
  diasPagoPorCliente: Map<string, number | null>,
  /** clave = nombre normalizado → deuda_vencida real, del snapshot más
   *  reciente de `deudores`. Un cliente ausente de este mapa (no aparece en
   *  Deudores) se interpreta como sin deuda vencida — el ERP sólo lista
   *  clientes con saldo, así que "no está" ya es la señal de "está al día". */
  deudaVencidaPorCliente: Map<string, number>,
  hoyISO: string,
  ventanaDesdeISO: string,
): PrecisionCobro {
  const porCliente = new Map<string, { bruto: number; fechaMasAntigua: string; nombreOriginal: string }>()

  for (const f of ventas) {
    if (!esIngresoReal(f)) continue
    if (!f.fecha_entrega) continue
    const neto = Number(f.total_sin_impuesto) || 0
    if (neto === 0) continue

    const clave = normalizarNombreCliente(f.nombre_fantasia)
    const dias = diasPagoPorCliente.get(clave)
    if (dias == null) continue

    const fechaCobro = sumarDias(f.fecha_entrega.slice(0, 10), dias)
    // Sólo ventas cuyo cobro YA debería haber llegado (fechaCobro < hoy),
    // dentro de la ventana de evaluación — más viejo que eso es harina de
    // otro costal (mora estructural, no algo que esta corrida deba juzgar).
    if (fechaCobro >= hoyISO || fechaCobro < ventanaDesdeISO) continue

    const bruto = brutoDeFila(f)
    const acc = porCliente.get(clave) ?? { bruto: 0, fechaMasAntigua: fechaCobro, nombreOriginal: f.nombre_fantasia ?? clave }
    acc.bruto += bruto
    if (fechaCobro < acc.fechaMasAntigua) acc.fechaMasAntigua = fechaCobro
    porCliente.set(clave, acc)
  }

  const clientesIncumplidos: ClienteIncumplido[] = []
  let brutoConfirmado = 0, clientesConfirmados = 0
  let brutoIncumplido = 0

  for (const [clave, v] of porCliente) {
    const deudaVencida = deudaVencidaPorCliente.get(clave) ?? 0
    if (deudaVencida > 0) {
      brutoIncumplido += v.bruto
      clientesIncumplidos.push({
        cliente: v.nombreOriginal, brutoEsperado: Math.round(v.bruto),
        fechaEsperadaMasAntigua: v.fechaMasAntigua, deudaVencidaReal: Math.round(deudaVencida),
      })
    } else {
      brutoConfirmado += v.bruto
      clientesConfirmados++
    }
  }
  clientesIncumplidos.sort((a, b) => b.brutoEsperado - a.brutoEsperado)

  const brutoEsperado = brutoConfirmado + brutoIncumplido
  return {
    ventanaDesdeISO,
    totalEsperado: { bruto: Math.round(brutoEsperado), clientes: porCliente.size },
    totalConfirmadoPagado: { bruto: Math.round(brutoConfirmado), clientes: clientesConfirmados },
    totalIncumplido: { bruto: Math.round(brutoIncumplido), clientes: clientesIncumplidos.length },
    pctCumplimiento: brutoEsperado > 0 ? Math.round((brutoConfirmado / brutoEsperado) * 1000) / 10 : null,
    clientesIncumplidos,
  }
}
