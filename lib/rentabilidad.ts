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
