/**
 * lib/cobranza.ts — Reconstrucción de los documentos vencidos de un deudor.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * El informe de Deudores del ERP (Gestión Cervecera) es AGREGADO por cliente:
 * da el total vencido, los 6 tramos de antigüedad y el remito más antiguo con
 * saldo — pero NO la lista de facturas impagas ni su detalle. El vendedor que
 * llama a cobrar necesita justamente eso: qué documento, de qué fecha, por qué
 * productos y por cuánta plata.
 *
 * La reconstrucción cruza `deudores` con el informe de ventas (`ventas`, una
 * fila por producto y pedido) y se ancla en los tramos del ERP, que son dato
 * duro. La cadena es:
 *
 *   1. Cada pedido vence a los `dias_pago` de su fecha → días de mora exactos.
 *   2. Cada pedido cae en un tramo de mora (0-14, 15-29, … +90).
 *   3. El ERP dice cuánta plata hay en cada tramo. Tramo en $0 ⇒ todos los
 *      pedidos de ese tramo están pagados y se descartan.
 *   4. Tramo con saldo ⇒ se busca el subconjunto de pedidos cuyo bruto suma
 *      ese saldo. Ese subconjunto son las facturas impagas del tramo.
 *
 * El paso 4 funciona porque el bruto se puede calcular al peso desde el neto
 * (ver `brutoLinea`). Verificado contra los tramos del ERP el 1-sep-2026 en
 * 5 facturas de 5 clientes distintos (Teja Market, El Trébol El Bosque, Beer
 * Masters, La Birra Esquina, Cliente Birra): diferencia máxima $3.
 *
 * LO QUE NO SE PUEDE RECONSTRUIR SE MUESTRA IGUAL
 * -----------------------------------------------
 * 79 de los 171 deudores no tienen ninguna venta cargada en la app, y en otros
 * la deuda es más vieja que el histórico. Esa plata va en `restoPorTramo`, con
 * su antigüedad, para que la pantalla SIEMPRE sume la deuda vencida completa:
 * facturas identificadas + resto. Antes el resto simplemente desaparecía y el
 * vendedor veía menos plata de la que tenía que cobrar.
 *
 * MAQUILA
 * -------
 * El co-packing a terceros se factura al mismo cliente y entra en la deuda del
 * ERP, pero no es cobranza del área comercial. Los documentos que lo contienen
 * quedan marcados con `esMaquila` y su plata sale en `maquilaVencida`, para
 * que la pantalla la muestre aparte y no la sume a lo que se cobra.
 *
 * La cifra a cobrar SIEMPRE sale del ERP (`deuda_vencida`, menos maquila),
 * nunca de la suma reconstruida.
 */

import { IVA, ILA_CERVEZA } from './rentabilidad'

// ── Impuestos ────────────────────────────────────────────────────────────────
// El ILA (20,5%) grava la cerveza, no la kombucha. Y tampoco los ítems de
// "Empaque y Distribución", que son servicio aunque el ERP los categorice como
// Cerveza — ese detalle es justamente el que hace cuadrar la suma contra los
// tramos. La categoría del ERP sola no alcanza para decidir: hay barriles de
// cerveza cargados como "S/C", así que manda el nombre del producto.
const RE_EMPAQUE = /empaque\s*y\s*distrib/i
const RE_KOMBUCHA = /kombucha/i

export interface LineaVenta {
  producto: string
  envase: string | null
  categoria_producto: string | null
  litros: number
  total_sin_impuesto: number
}

export function aplicaIla(l: Pick<LineaVenta, 'producto' | 'categoria_producto'>): boolean {
  if (RE_EMPAQUE.test(l.producto)) return false
  if (RE_KOMBUCHA.test(l.producto)) return false
  const cat = l.categoria_producto ?? ''
  if (RE_KOMBUCHA.test(cat) && !/cerveza/i.test(cat)) return false
  return true
}

// ── Maquila (co-packing a terceros) ──────────────────────────────────────────
// No es venta del área comercial: son litros que se le producen o latas que se
// le cierran a otra cervecería. El ERP la factura al mismo cliente y por eso
// entra en el informe de Deudores, pero no es plata que persiga un vendedor
// (dato de Claudio, 2026-09-01, a partir de los $2.639.613 de El Growler).
//
// Los dos productos con que el ERP la carga hoy. Verificado el 1-sep-2026:
// las 27 facturas que los contienen son 100% maquila — ninguna mezcla maquila
// con venta comercial — así que la exclusión puede ser por documento entero.
const PRODUCTOS_MAQUILA = ['litros maquila', 'latas finales']

export function esLineaMaquila(producto: string): boolean {
  return PRODUCTOS_MAQUILA.includes(producto.trim().toLowerCase())
}

/** Precio que efectivamente se le factura al cliente por esa línea (IVA + ILA si aplica). */
export function brutoLinea(l: LineaVenta): number {
  const neto = Number(l.total_sin_impuesto) || 0
  return neto * (1 + IVA + (aplicaIla(l) ? ILA_CERVEZA : 0))
}

// ── Fechas ───────────────────────────────────────────────────────────────────
// Todo en UTC a partir del 'YYYY-MM-DD' crudo: `fecha_pedido` es un DATE de
// Postgres y convertirlo a Date local corre el día en Chile (UTC-3/-4).
function aUTC(fecha: string): number {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86_400_000)
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(aUTC(fecha) + dias * 86_400_000).toISOString().slice(0, 10)
}

// ── Tramos de antigüedad ─────────────────────────────────────────────────────
export type TramoKey = 'b14' | 'b29' | 'b44' | 'b59' | 'b89' | 'b90'

export interface Tramo {
  key: TramoKey
  lo: number
  hi: number
  label: string
}

export const TRAMOS: readonly Tramo[] = [
  { key: 'b14', lo: 1, hi: 14, label: '1–14 días' },
  { key: 'b29', lo: 15, hi: 29, label: '15–29 días' },
  { key: 'b44', lo: 30, hi: 44, label: '30–44 días' },
  { key: 'b59', lo: 45, hi: 59, label: '45–59 días' },
  { key: 'b89', lo: 60, hi: 89, label: '60–89 días' },
  { key: 'b90', lo: 90, hi: Number.MAX_SAFE_INTEGER, label: '+90 días' },
]

export function tramoDeMora(mora: number): TramoKey | null {
  if (mora <= 0) return null
  return TRAMOS.find(t => mora >= t.lo && mora <= t.hi)?.key ?? null
}

/**
 * Días exactos que lleva vencido el documento más antiguo impago del cliente,
 * calculados sólo con la fila de `deudores` — sin pedir nada al servidor, para
 * poder mostrarlos en la lista sin desplegar la tarjeta.
 *
 * `external_fecha` es la emisión del remito más antiguo con saldo y vence a los
 * `dias_pago` del cliente. Contrastado contra los tramos del ERP: los clientes
 * que dan >90 acá tienen su deuda en el tramo +90, los que dan 20 la tienen en
 * el tramo 15–29, etc.
 */
export function diasMoraDeudor(
  d: { external_fecha?: string | null; dias_pago?: number | null; deuda_vencida?: number | null },
  hoy: string = hoyISO(),
): number {
  if (!d.external_fecha) return 0
  if ((Number(d.deuda_vencida) || 0) <= 0) return 0
  const vence = sumarDias(d.external_fecha.slice(0, 10), Number(d.dias_pago) || 0)
  return Math.max(0, diasEntre(vence, hoy))
}

// ── Tipos de salida ──────────────────────────────────────────────────────────
export interface ItemDocumento {
  producto: string
  envase: string | null
  litros: number
  neto: number
  bruto: number
}

export interface DocumentoVencido {
  pedido: string
  fechaEmision: string
  fechaVencimiento: string
  /** Días transcurridos desde el vencimiento. ≤ 0 ⇒ todavía no vence. */
  diasMora: number
  tramo: TramoKey | null
  tramoLabel: string
  monto: number
  /** Monto original del documento, antes de descontar abonos. */
  montoOriginal: number
  /** true cuando el tramo trae menos plata que el documento: quedó un abono a cuenta. */
  abonoParcial: boolean
  /** Documento de co-packing a terceros: no es deuda del área comercial. */
  esMaquila: boolean
  items: ItemDocumento[]
}

/** Plata vencida en un tramo que ninguna factura del informe de ventas explica. */
export interface RestoTramo {
  tramo: TramoKey
  label: string
  monto: number
}

export interface DeudorEntrada {
  nombre_fantasia: string
  dias_pago?: number | null
  deuda_vencida: number
  saldo_total: number
  external_fecha?: string | null
  external_remito_mas_antiguo?: number | null
  deuda_menor_14_dias?: number | null
  deuda_entre_15_29_dias?: number | null
  deuda_entre_30_44_dias?: number | null
  deuda_entre_45_59_dias?: number | null
  deuda_entre_60_89_dias?: number | null
  deuda_mas_90_dias?: number | null
}

export interface FilaVenta extends LineaVenta {
  pedido: string | null
  fecha_pedido: string
}

export interface DetalleCobranza {
  /** Días exactos de mora del documento más antiguo con saldo. */
  diasMoraMaxima: number
  /** Fecha de emisión del documento más antiguo con saldo (dato del ERP). */
  fechaDocumentoAntiguo: string | null
  /** N° de remito más antiguo con saldo, tal como lo numera el ERP. */
  remitoMasAntiguo: number | null
  diasPago: number
  vencidos: DocumentoVencido[]
  porVencer: DocumentoVencido[]
  /** Suma de `vencidos`. Referencial: la cifra a cobrar es `deuda_vencida` del ERP. */
  totalReconstruido: number
  /**
   * Deuda vencida que no quedó explicada por ninguna factura, desglosada por
   * antigüedad. Es la diferencia entre lo que el ERP dice que hay en cada
   * tramo y lo que se pudo identificar ahí. Con esto la lista de la pantalla
   * SIEMPRE suma la deuda vencida completa: facturas + resto.
   *
   * Pasa por tres motivos: la deuda es anterior al histórico de ventas de la
   * app (79 de los 171 deudores no tienen ninguna venta cargada), es un ajuste
   * de cuenta corriente hecho a mano en el ERP, o hay notas de crédito.
   */
  restoPorTramo: RestoTramo[]
  /** Suma de `restoPorTramo`. */
  restoSinDetalle: number
  /** Parte de la deuda vencida que es co-packing y no cobranza comercial. */
  maquilaVencida: number
  /** true si cada tramo del ERP cuadró exacto con un subconjunto de pedidos. */
  conciliado: boolean
}

// ── Núcleo: qué pedidos siguen impagos ───────────────────────────────────────
const TOLERANCIA_PCT = 0.005 // 0,5% — el bruto calculado cuadra al peso; esto cubre redondeos
const TOLERANCIA_MIN = 1_500 // pesos
const MAX_EXHAUSTIVO = 18 // 2^18 ≈ 262k combinaciones: instantáneo y de sobra por tramo

/** Días de holgura entre la fecha del remito del ERP y la del pedido en ventas. */
const HOLGURA_REMITO_DIAS = 7

/** Bajo este monto, un saldo sin explicar es redondeo y no se muestra. */
const RESTO_MINIMO = 1_000

function popcount(n: number): number {
  let c = 0
  while (n) {
    n &= n - 1
    c++
  }
  return c
}

/**
 * Subconjunto de `docs` cuya suma más se acerca a `objetivo`. Búsqueda
 * exhaustiva mientras el tramo tenga pocos documentos (el caso normal: 1 a 4);
 * si son muchos, greedy del más antiguo al más nuevo.
 */
function subconjuntoQueSuma(docs: DocumentoVencido[], objetivo: number): DocumentoVencido[] | null {
  const tol = Math.max(objetivo * TOLERANCIA_PCT, TOLERANCIA_MIN)

  if (docs.length <= MAX_EXHAUSTIVO) {
    let mejor: DocumentoVencido[] | null = null
    let mejorDif = Infinity
    let mejorCant = Infinity
    for (let mask = 1; mask < 1 << docs.length; mask++) {
      let suma = 0
      for (let i = 0; i < docs.length; i++) if (mask & (1 << i)) suma += docs[i].monto
      const dif = Math.abs(suma - objetivo)
      const cant = popcount(mask)
      // A igual diferencia gana el subconjunto con menos documentos: la
      // explicación más simple de la misma plata es la más probable.
      if (dif < mejorDif - 0.5 || (dif <= mejorDif + 0.5 && cant < mejorCant)) {
        mejorDif = dif
        mejorCant = cant
        mejor = docs.filter((_, i) => mask & (1 << i))
      }
    }
    return mejorDif <= tol ? mejor : null
  }

  const elegidos: DocumentoVencido[] = []
  let suma = 0
  for (const d of [...docs].sort((a, b) => b.diasMora - a.diasMora)) {
    if (suma + d.monto > objetivo + tol) continue
    elegidos.push(d)
    suma += d.monto
  }
  return Math.abs(suma - objetivo) <= tol ? elegidos : null
}

/** Agrupa las filas de `ventas` en documentos (un documento = un `pedido`). */
function armarDocumentos(ventas: FilaVenta[], diasPago: number, hoy: string): DocumentoVencido[] {
  const porPedido = new Map<string, FilaVenta[]>()
  for (const v of ventas) {
    // Sin número de pedido no hay documento que cobrar (devoluciones, ajustes).
    const pedido = (v.pedido ?? '').trim()
    if (!pedido || !/^\d+$/.test(pedido)) continue
    const arr = porPedido.get(pedido)
    if (arr) arr.push(v)
    else porPedido.set(pedido, [v])
  }

  const docs: DocumentoVencido[] = []
  for (const [pedido, filas] of porPedido) {
    const fechaEmision = filas
      .reduce((min, f) => (f.fecha_pedido < min ? f.fecha_pedido : min), filas[0].fecha_pedido)
      .slice(0, 10)
    const fechaVencimiento = sumarDias(fechaEmision, diasPago)
    const diasMora = diasEntre(fechaVencimiento, hoy)

    const items: ItemDocumento[] = filas
      .map(f => ({
        producto: f.producto,
        envase: f.envase,
        litros: Number(f.litros) || 0,
        neto: Number(f.total_sin_impuesto) || 0,
        bruto: brutoLinea(f),
      }))
      .sort((a, b) => b.bruto - a.bruto)

    const tramo = tramoDeMora(diasMora)
    const monto = items.reduce((s, i) => s + i.bruto, 0)
    // Un documento que neteó a cero (venta anulada por su propia nota de
    // crédito) no es plata que se pueda cobrar: ensucia la lista y además
    // entra "gratis" en cualquier subconjunto al buscar el que suma el tramo.
    if (Math.abs(monto) < 1) continue
    docs.push({
      pedido,
      fechaEmision,
      fechaVencimiento,
      diasMora,
      tramo,
      tramoLabel: TRAMOS.find(t => t.key === tramo)?.label ?? 'Por vencer',
      monto,
      montoOriginal: monto,
      abonoParcial: false,
      esMaquila: filas.every(f => esLineaMaquila(f.producto)),
      items,
    })
  }
  return docs.sort((a, b) => b.diasMora - a.diasMora)
}

export function reconstruirCobranza(
  deudor: DeudorEntrada,
  ventas: FilaVenta[],
  hoy: string = hoyISO(),
): DetalleCobranza {
  const diasPago = Number(deudor.dias_pago) || 0
  const fechaDocumentoAntiguo = deudor.external_fecha ? deudor.external_fecha.slice(0, 10) : null

  // Días de mora del documento más antiguo con saldo. Sale del ERP, no de la
  // reconstrucción: `external_fecha` es la emisión de ese documento y vence a
  // los `dias_pago`. Verificado contra los tramos — un cliente con 180 días acá
  // tiene el 100% de su deuda en el tramo +90, como corresponde.
  const diasMoraMaxima = fechaDocumentoAntiguo
    ? Math.max(0, diasEntre(sumarDias(fechaDocumentoAntiguo, diasPago), hoy))
    : 0

  const saldosTramo: Record<TramoKey, number> = {
    b14: Number(deudor.deuda_menor_14_dias) || 0,
    b29: Number(deudor.deuda_entre_15_29_dias) || 0,
    b44: Number(deudor.deuda_entre_30_44_dias) || 0,
    b59: Number(deudor.deuda_entre_45_59_dias) || 0,
    b89: Number(deudor.deuda_entre_60_89_dias) || 0,
    b90: Number(deudor.deuda_mas_90_dias) || 0,
  }

  // Nada anterior al documento más antiguo con saldo puede seguir impago: el
  // ERP ya dijo cuál es el más viejo que debe. Pero `external_fecha` es la
  // fecha del REMITO y `fecha_pedido` la del pedido, y no siempre coinciden:
  // en 16 de los 92 deudores con ventas cargadas el remito sale 1 a 3 días
  // después del pedido. Sin esta holgura, la factura más antigua —
  // justamente la que más importa cobrar — quedaba fuera de la lista
  // (Vintage Pizza Bar perdía así $1,59M de $2,96M).
  const desde = fechaDocumentoAntiguo ? sumarDias(fechaDocumentoAntiguo, -HOLGURA_REMITO_DIAS) : null
  const candidatos = armarDocumentos(
    desde ? ventas.filter(v => v.fecha_pedido.slice(0, 10) >= desde) : ventas,
    diasPago,
    hoy,
  )

  const porVencer = candidatos.filter(d => d.diasMora <= 0)
  const vencidos: DocumentoVencido[] = []
  const restoPorTramo: RestoTramo[] = []
  let conciliado = true

  for (const tramo of TRAMOS) {
    const objetivo = saldosTramo[tramo.key]
    if (objetivo <= 0) continue // tramo sin saldo ⇒ esos pedidos ya se pagaron

    const delTramo = candidatos.filter(d => d.tramo === tramo.key)
    let asignado = 0

    if (delTramo.length === 0) {
      conciliado = false
    } else {
      const exacto = subconjuntoQueSuma(delTramo, objetivo)
      if (exacto) {
        vencidos.push(...exacto)
        asignado = exacto.reduce((s, d) => s + d.monto, 0)
      } else {
        // Sin combinación exacta: hubo abono parcial o nota de crédito. Se
        // toman del más antiguo al más nuevo hasta cubrir el saldo del tramo y
        // el último queda marcado como parcial, para que el vendedor sepa que
        // ese documento ya tiene plata abonada.
        conciliado = false
        let restante = objetivo
        for (const d of [...delTramo].sort((a, b) => b.diasMora - a.diasMora)) {
          if (restante <= 0) break
          const doc = restante < d.monto ? { ...d, monto: restante, abonoParcial: true } : d
          vencidos.push(doc)
          asignado += doc.monto
          restante -= d.monto
        }
      }
    }

    // Lo que el tramo tiene y ninguna factura explica. Se publica para que la
    // pantalla pueda mostrar la deuda COMPLETA — antes este saldo simplemente
    // desaparecía de la lista y el vendedor veía menos plata de la que cobra.
    // El umbral deja fuera los restos de redondeo (unos pocos pesos): una fila
    // "sin detalle de factura, $3" es ruido, no información.
    const resto = objetivo - asignado
    if (resto > RESTO_MINIMO) {
      conciliado = false
      restoPorTramo.push({ tramo: tramo.key, label: tramo.label, monto: resto })
    }
  }

  vencidos.sort((a, b) => b.diasMora - a.diasMora)

  // Los tramos del ERP a veces suman MÁS que su propia `deuda_vencida` — pasa
  // cuando hay un abono a cuenta que el ERP todavía no imputó a ningún
  // documento (Tilo Restobar: tramos por $1.820.007 contra $1.540.010 de deuda).
  // Sin este ajuste la pantalla haría cobrar plata de más. Se recorta desde el
  // documento más nuevo: la mora más antigua es la que el ERP confirma con
  // `external_fecha` y es la que más urge cobrar.
  const deudaVencida = Number(deudor.deuda_vencida) || 0
  let exceso = vencidos.reduce((s, d) => s + d.monto, 0) - deudaVencida
  for (let i = vencidos.length - 1; i >= 0 && exceso > 1; i--) {
    const quita = Math.min(exceso, vencidos[i].monto)
    vencidos[i] = { ...vencidos[i], monto: vencidos[i].monto - quita, abonoParcial: true }
    exceso -= quita
  }
  const vencidosFinal = vencidos.filter(d => d.monto > 1)

  return {
    diasMoraMaxima,
    fechaDocumentoAntiguo,
    remitoMasAntiguo:
      deudor.external_remito_mas_antiguo != null ? Number(deudor.external_remito_mas_antiguo) : null,
    diasPago,
    vencidos: vencidosFinal,
    porVencer: porVencer.sort((a, b) => b.diasMora - a.diasMora),
    totalReconstruido: vencidosFinal.reduce((s, d) => s + d.monto, 0),
    restoPorTramo,
    restoSinDetalle: restoPorTramo.reduce((s, r) => s + r.monto, 0),
    maquilaVencida: vencidosFinal.filter(d => d.esMaquila).reduce((s, d) => s + d.monto, 0),
    conciliado,
  }
}

/**
 * Cuánto de la deuda vencida de un cliente es maquila. Se usa en la carga de
 * /ventas/deudores para descontarla de los totales por cartera sin tener que
 * reconstruir los 171 deudores: sólo 3 clientes tienen maquila.
 */
export function maquilaVencidaDe(deudor: DeudorEntrada, ventas: FilaVenta[], hoy: string = hoyISO()): number {
  return reconstruirCobranza(deudor, ventas, hoy).maquilaVencida
}
