/**
 * ¿Qué parte de lo entregado en un ciclo ya se pagó? (5-oct-2026)
 *
 * Toma las filas del RPC `pagado_por_ciclo` (ciclo 24→23 por FECHA DE ENTREGA,
 * una fila por ciclo · vendedor · cliente · estado) y arma la tabla por vendedor
 * con su detalle por cliente. Sólo facturas a clientes: PDV, BaseCamp y las
 * cuentas internas se sacan con `esClienteExcluido` — la regla de Ventas, no la
 * de Finanzas, porque PDV cobra al contado y BaseCamp no se cobra: ninguno de
 * los dos es cobranza.
 *
 * Una factura cuenta como pagada si tiene cualquier pago en el ERP (los pagos
 * parciales son pocos). Vencida = entrega + días de pago de la ficha ya pasó.
 */
import { esClienteExcluido } from '@/lib/types'

export type EstadoPago = 'pagada' | 'vencida' | 'en_plazo' | 'sin_plazo'

export interface FilaPagadoCiclo {
  ciclo: string // yyyy-mm-01
  vendedor: string
  cliente: string
  estado: EstadoPago
  facturas: number
  litros: number
  neto: number
}

/** Litros o pesos netos, según lo que se mire. */
export interface Montos { pagada: number; vencida: number; en_plazo: number; sin_plazo: number }

export interface ClientePagado {
  cliente: string
  litros: Montos
  neto: Montos
  facturasImpagas: number
}

export interface VendedorPagado {
  vendedor: string
  clientes: number
  litros: Montos
  neto: Montos
  /** Clientes con algo vencido. */
  clientesVencidos: number
  detalle: ClientePagado[]
}

export interface ResumenPagadoCiclo {
  vendedores: VendedorPagado[]
  total: Omit<VendedorPagado, 'vendedor' | 'detalle'>
}

const cero = (): Montos => ({ pagada: 0, vencida: 0, en_plazo: 0, sin_plazo: 0 })

export const totalDe = (m: Montos) => m.pagada + m.vencida + m.en_plazo + m.sin_plazo
export const impagoDe = (m: Montos) => m.vencida + m.en_plazo + m.sin_plazo

/** Ciclos presentes en las filas, del más reciente al más antiguo. */
export function ciclosDisponibles(filas: FilaPagadoCiclo[]): string[] {
  return [...new Set(filas.map(f => f.ciclo))].sort().reverse()
}

export function resumirPagadoCiclo(filas: FilaPagadoCiclo[], ciclo: string): ResumenPagadoCiclo {
  const porVendedor = new Map<string, Map<string, ClientePagado>>()
  for (const f of filas) {
    if (f.ciclo !== ciclo || esClienteExcluido(f.cliente)) continue
    let clientes = porVendedor.get(f.vendedor)
    if (!clientes) porVendedor.set(f.vendedor, (clientes = new Map()))
    let c = clientes.get(f.cliente)
    if (!c) clientes.set(f.cliente, (c = { cliente: f.cliente, litros: cero(), neto: cero(), facturasImpagas: 0 }))
    c.litros[f.estado] += f.litros
    c.neto[f.estado] += f.neto
    if (f.estado !== 'pagada') c.facturasImpagas += f.facturas
  }

  const vendedores: VendedorPagado[] = [...porVendedor].map(([vendedor, clientes]) => {
    const detalle = [...clientes.values()]
      // Primero lo vencido (lo que hay que cobrar), después lo que falta por pagar.
      .sort((a, b) => b.litros.vencida - a.litros.vencida || impagoDe(b.litros) - impagoDe(a.litros) || totalDe(b.litros) - totalDe(a.litros))
    const litros = cero(), neto = cero()
    for (const c of detalle) for (const k of Object.keys(litros) as EstadoPago[]) { litros[k] += c.litros[k]; neto[k] += c.neto[k] }
    return { vendedor, clientes: detalle.length, litros, neto, clientesVencidos: detalle.filter(c => c.neto.vencida > 0).length, detalle }
  }).sort((a, b) => totalDe(b.litros) - totalDe(a.litros) || totalDe(b.neto) - totalDe(a.neto))

  const total = { clientes: 0, litros: cero(), neto: cero(), clientesVencidos: 0 }
  for (const v of vendedores) {
    total.clientes += v.clientes
    total.clientesVencidos += v.clientesVencidos
    for (const k of Object.keys(total.litros) as EstadoPago[]) { total.litros[k] += v.litros[k]; total.neto[k] += v.neto[k] }
  }
  return { vendedores, total }
}
