/**
 * lib/rentabilidad.ts — Matemática del módulo Rentabilidad (interno,
 * solo Claudio/Benja/Douglas). Todo el margen se calcula SIEMPRE en neto:
 * el IVA y el ILA son plata que se cobra al cliente pero se le debe al
 * Fisco, nunca son parte de la ganancia de la empresa. Ver conversación
 * de diseño 2026-07-30 — este es el punto donde un error de fórmula se
 * traduce directo en plata perdida, así que cualquier cambio acá debe
 * volver a verificarse con un ejemplo numérico antes de mergear.
 */

export const IVA = 0.19
export const ILA_CERVEZA = 0.205 // SII: cervezas y demás bebidas alcohólicas — https://www.sii.cl/ayudas/aprenda_sobre/3072-3-3079.html

export type Zona = 'sur' | 'santiago' | 'supermercados'
export type Formato = 'lata' | 'barril'
export type Semaforo = 'verde' | 'amarillo' | 'rojo'

export interface CostoPrecio {
  id: string
  producto: string
  codigo: string | null
  categoria: 'cerveza' | 'kombucha'
  zona: Zona
  formato: Formato
  costo_neto: number
  precio_neto: number
  aplica_ila: boolean
}

export interface DesglosePrecio {
  precioNeto: number
  iva: number
  ila: number
  precioCliente: number
}

/** Precio final que paga el cliente, a partir del precio neto. IVA siempre 19%; ILA solo si aplica (cerveza). */
export function desglosePrecio(precioNeto: number, aplicaIla: boolean): DesglosePrecio {
  const iva = precioNeto * IVA
  const ila = aplicaIla ? precioNeto * ILA_CERVEZA : 0
  return { precioNeto, iva, ila, precioCliente: precioNeto + iva + ila }
}

export interface Margen {
  margenClp: number
  margenPct: number
}

/** Margen de contribución — SIEMPRE sobre valores netos (sin IVA/ILA). */
export function calcularMargen(precioNetoVenta: number, costoNeto: number): Margen {
  const margenClp = precioNetoVenta - costoNeto
  const margenPct = precioNetoVenta > 0 ? margenClp / precioNetoVenta : 0
  return { margenClp, margenPct }
}

export const UMBRAL_VERDE = 0.35
export const UMBRAL_AMARILLO = 0.20

export function semaforoDeMargen(margenPct: number): Semaforo {
  if (margenPct >= UMBRAL_VERDE) return 'verde'
  if (margenPct >= UMBRAL_AMARILLO) return 'amarillo'
  return 'rojo'
}

/**
 * % de descuento máximo (sobre precio neto) que se puede aplicar antes de
 * que el margen caiga bajo `margenMinimoPct`. Devuelve null si el costo es
 * 0 o el precio neto es 0 (no hay suficiente dato para calcularlo).
 */
export function descuentoMaximoPct(
  costoNeto: number,
  precioNeto: number,
  margenMinimoPct: number = UMBRAL_AMARILLO
): number | null {
  if (precioNeto <= 0 || costoNeto <= 0) return null
  const precioMinimoAceptable = costoNeto / (1 - margenMinimoPct)
  const d = 1 - precioMinimoAceptable / precioNeto
  return Math.max(0, Math.min(1, d))
}

/** % de descuento antes de vender con pérdida (margen 0%). */
export function descuentoPuntoEquilibrioPct(costoNeto: number, precioNeto: number): number | null {
  return descuentoMaximoPct(costoNeto, precioNeto, 0)
}

/**
 * Inverso de `calcularMargen`: dado un costo fijo y un margen objetivo,
 * el precio neto que hay que cobrar para lograrlo. Base del "menú de
 * margen" del Catálogo — Claudio elige el % y ve a qué precio final
 * cliente corresponde, en vez de mirar el margen que resulta de un precio
 * ya fijado. Devuelve null si el costo es 0/desconocido o el margen es
 * 100% o más (precio infinito).
 */
export function precioNetoParaMargen(costoNeto: number, margenPct: number): number | null {
  if (costoNeto <= 0 || margenPct >= 1) return null
  return costoNeto / (1 - margenPct)
}

/** Pasos del menú desplegable de margen objetivo, 10% a 70% cada 5 puntos. */
export const MARGEN_PRESETS: number[] = Array.from({ length: 13 }, (_, i) => 0.10 + i * 0.05)

export interface ItemSimulacion {
  costoPrecioId: string
  producto: string
  formato: Formato
  cantidad: number
  descuentoPct: number // 0-1, sobre precio neto
}

export interface LineaSimulada extends ItemSimulacion {
  precioNetoUnitario: number
  costoNetoUnitario: number
  ventaNetaLinea: number
  costoLinea: number
  margenClpLinea: number
  margenPctLinea: number
}

export interface ResumenSimulacion {
  lineas: LineaSimulada[]
  ventaNetaTotal: number
  costoTotal: number
  margenClpTotal: number
  margenPctTotal: number
  semaforo: Semaforo
}

/** Arma el resumen completo de una simulación multi-línea (carrito interno). */
export function simular(items: ItemSimulacion[], catalogo: Map<string, CostoPrecio>): ResumenSimulacion {
  const lineas: LineaSimulada[] = items.map(item => {
    const cp = catalogo.get(item.costoPrecioId)
    const precioNetoUnitario = cp?.precio_neto ?? 0
    const costoNetoUnitario = cp?.costo_neto ?? 0
    const precioConDescuento = precioNetoUnitario * (1 - item.descuentoPct)
    const ventaNetaLinea = precioConDescuento * item.cantidad
    const costoLinea = costoNetoUnitario * item.cantidad
    const margenClpLinea = ventaNetaLinea - costoLinea
    const margenPctLinea = ventaNetaLinea > 0 ? margenClpLinea / ventaNetaLinea : 0
    return { ...item, precioNetoUnitario, costoNetoUnitario, ventaNetaLinea, costoLinea, margenClpLinea, margenPctLinea }
  })

  const ventaNetaTotal = lineas.reduce((s, l) => s + l.ventaNetaLinea, 0)
  const costoTotal = lineas.reduce((s, l) => s + l.costoLinea, 0)
  const margenClpTotal = ventaNetaTotal - costoTotal
  const margenPctTotal = ventaNetaTotal > 0 ? margenClpTotal / ventaNetaTotal : 0

  return { lineas, ventaNetaTotal, costoTotal, margenClpTotal, margenPctTotal, semaforo: semaforoDeMargen(margenPctTotal) }
}

export function fmtCLP(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export function fmtPct(n: number): string {
  return `${(n * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`
}

// ── Simulador de promociones (2x1, 3x2, "el segundo al 50%", etc.) ────────
//
// Modelo único que cubre todos los casos que pidió Claudio: un "tramo" que
// se repite cada `cantidadGrupo` unidades, con un % de descuento propio por
// posición dentro del tramo. Ej.: 2x1 → grupo de 2, descuentos [0%, 100%].
// "El tercer barril al 50%" → grupo de 3, descuentos [0%, 0%, 50%].
// `repetir: false` hace que el descuento aplique una sola vez (a las
// primeras `cantidadGrupo` unidades) y el resto del pedido se cobre normal
// — útil para bundles puntuales en vez de una promo que se repite en
// pedidos grandes.
export interface PromoTramo {
  nombre: string
  cantidadGrupo: number
  descuentosPct: number[] // largo = cantidadGrupo, uno por posición (0-1)
  repetir: boolean
}

export const PROMO_PRESETS: PromoTramo[] = [
  { nombre: '2x1', cantidadGrupo: 2, descuentosPct: [0, 1], repetir: true },
  { nombre: '3x2', cantidadGrupo: 3, descuentosPct: [0, 0, 1], repetir: true },
  { nombre: '3x1', cantidadGrupo: 3, descuentosPct: [0, 1, 1], repetir: true },
  { nombre: '2º al 50%', cantidadGrupo: 2, descuentosPct: [0, 0.5], repetir: false },
  { nombre: '3º al 50%', cantidadGrupo: 3, descuentosPct: [0, 0, 0.5], repetir: false },
]

export interface UnidadPromo {
  posicion: number
  descuentoPct: number
  precioNetoUnitario: number
  costoNetoUnitario: number
}

export interface ResumenPromo {
  cp: CostoPrecio
  promo: PromoTramo
  cantidadTotal: number
  unidades: UnidadPromo[]
  ventaNormalTotal: number // sin ningún descuento, de referencia
  ventaNetaTotal: number
  costoTotal: number
  descuentoTotalClp: number
  margenClpTotal: number
  margenPctTotal: number
  margenPctSinPromo: number
  semaforo: Semaforo
}

/** % de descuento que le toca a la unidad en `posicion` (0-indexada) de un pedido de `cantidadTotal` unidades. */
export function descuentoDePosicion(promo: PromoTramo, posicion: number): number {
  if (promo.repetir) return promo.descuentosPct[posicion % promo.cantidadGrupo] ?? 0
  return posicion < promo.cantidadGrupo ? (promo.descuentosPct[posicion] ?? 0) : 0
}

/** Simula aplicar una promoción por tramos a `cantidadTotal` unidades de un producto. */
export function simularPromo(cp: CostoPrecio, cantidadTotal: number, promo: PromoTramo): ResumenPromo {
  const unidades: UnidadPromo[] = Array.from({ length: cantidadTotal }, (_, i) => {
    const descuentoPct = descuentoDePosicion(promo, i)
    return {
      posicion: i,
      descuentoPct,
      precioNetoUnitario: cp.precio_neto * (1 - descuentoPct),
      costoNetoUnitario: cp.costo_neto,
    }
  })

  const ventaNormalTotal = cp.precio_neto * cantidadTotal
  const ventaNetaTotal = unidades.reduce((s, u) => s + u.precioNetoUnitario, 0)
  const costoTotal = cp.costo_neto * cantidadTotal
  const descuentoTotalClp = ventaNormalTotal - ventaNetaTotal
  const margenClpTotal = ventaNetaTotal - costoTotal
  const margenPctTotal = ventaNetaTotal > 0 ? margenClpTotal / ventaNetaTotal : 0
  const margenSinPromo = calcularMargen(cp.precio_neto, cp.costo_neto)

  return {
    cp, promo, cantidadTotal, unidades,
    ventaNormalTotal, ventaNetaTotal, costoTotal, descuentoTotalClp,
    margenClpTotal, margenPctTotal,
    margenPctSinPromo: margenSinPromo.margenPct,
    semaforo: semaforoDeMargen(margenPctTotal),
  }
}

/** Convierte una promoción simulada en una línea equivalente de % de descuento plano, para reusar el Simulador/Historial existente sin tocar su schema. */
export function promoAItemSimulacion(r: ResumenPromo): ItemSimulacion {
  const descuentoPctPromedio = r.ventaNormalTotal > 0 ? r.descuentoTotalClp / r.ventaNormalTotal : 0
  return {
    costoPrecioId: r.cp.id,
    producto: `${r.cp.producto} (${r.promo.nombre})`,
    formato: r.cp.formato,
    cantidad: r.cantidadTotal,
    descuentoPct: descuentoPctPromedio,
  }
}

export const ZONA_LABEL: Record<Zona, string> = {
  sur: 'Zona Sur',
  santiago: 'Santiago',
  supermercados: 'Supermercados',
}

export const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: '#16A34A',
  amarillo: '#D97706',
  rojo: '#DC2626',
}
