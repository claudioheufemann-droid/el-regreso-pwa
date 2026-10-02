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
import { brutoLinea } from '@/lib/cobranza'
import { esClienteExcluidoFinanzas } from '@/lib/types'

/**
 * Cuentas bancarias reales de la empresa (23-sep-2026). Antes `caja_saldos`
 * asumía una sola cuenta (Banco de Chile) — la planilla que usa
 * Administración trackea las 3 por separado, cada una con su propio saldo e
 * informe descargable, así que el saldo de caja del dashboard de flujo tiene
 * que sumar las 3, no reemplazarlas por un número único.
 */
export type BancoId = 'chile' | 'santander' | 'itau'
export const BANCOS: BancoId[] = ['chile', 'santander', 'itau']
export const BANCO_LABEL: Record<BancoId, string> = {
  chile: 'Banco de Chile',
  santander: 'Banco Santander',
  itau: 'Banco Itaú',
}

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
  /** Número de factura del ERP. Es la llave que permite cruzar una venta
   *  contra su pago en `cobros_erp` (ver proyeccionCobros.ts) — presente en
   *  ~95% de las ventas despachadas. */
  numero_factura?: string | null
}

/** ¿Esta fila es ingreso real de la empresa? Excluye consumo interno sin
 *  valor de flujo (mermas, muestras, marketing, calidad) y tours. PDV,
 *  BaseCamp, ferias y la maquila a EWU Ginger Beer SÍ entran (decisión del
 *  usuario, 15-sep-2026) — no son venta del área comercial, pero mueven
 *  plata o insumos reales que le importan a Finanzas, vía
 *  `esClienteExcluidoFinanzas` (re-inclusión sobre la lista general de
 *  CLIENTES_EXCLUIR, mismo patrón que ya usa Producción). */
export function esIngresoReal(f: Pick<FilaVentaFinanzas, 'nombre_fantasia' | 'producto'>): boolean {
  if (esClienteExcluidoFinanzas(f.nombre_fantasia)) return false
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

/** Lunes de la semana de una fecha (ISO, UTC). */
export function lunesDe(fechaISO: string): string {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=domingo
  const delta = dow === 0 ? -6 : 1 - dow
  return new Date(dt.getTime() + delta * 86_400_000).toISOString().slice(0, 10)
}
