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
  const porSemana = new Map<string, { neto: number; bruto: number; filas: number }>()
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

    const semana = lunesDe(fechaCobro)
    const acc = porSemana.get(semana) ?? { neto: 0, bruto: 0, filas: 0 }
    acc.neto += neto
    acc.bruto += bruto
    acc.filas++
    porSemana.set(semana, acc)

    const nombre = f.nombre_fantasia ?? '(sin nombre)'
    const cli = porCliente.get(nombre) ?? { cliente: nombre, diasPago: dias, neto: 0, bruto: 0, proximoCobro: fechaCobro }
    cli.neto += neto
    cli.bruto += bruto
    if (fechaCobro < cli.proximoCobro) cli.proximoCobro = fechaCobro
    porCliente.set(nombre, cli)
  }

  const semanaActual = lunesDe(hoyISO)
  const periodos: PeriodoCaja[] = [...porSemana.entries()]
    .map(([inicio, v]) => ({ inicio, ...v, vencido: inicio < semanaActual }))
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
