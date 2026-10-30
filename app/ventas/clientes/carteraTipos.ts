import { ETIQUETA_CARTERA } from '@/lib/types'

/** Cliente activo = compró en los últimos 2 años (decisión de Claudio, 2026-10-30). */
export const ACTIVO_DIAS = 730

export type CarteraKey = 'rm' | 'lagos' | 'rios' | 'araucania' | 'retail' | 'online' | 'otros'

/** Carteras en el orden en que se muestran. `vendedor` = nombre canónico
 *  (vendedorCanonico); la etiqueta visible sale de ETIQUETA_CARTERA, así un
 *  cambio de etiqueta en lib/types.ts llega solo a esta pantalla. */
export const CARTERAS: { key: Exclude<CarteraKey, 'otros'>; vendedor: string; nombre: string; color: string }[] = [
  { key: 'rios',      vendedor: 'Nicol Delgado',     nombre: ETIQUETA_CARTERA['Nicol Delgado'].corta,     color: '#60A5FA' },
  { key: 'lagos',     vendedor: 'Marion Meza',       nombre: ETIQUETA_CARTERA['Marion Meza'].corta,       color: '#2DD4BF' },
  { key: 'araucania', vendedor: 'Marcelo Diaz',      nombre: ETIQUETA_CARTERA['Marcelo Diaz'].corta,      color: '#F97316' },
  { key: 'rm',        vendedor: 'Yadro Fabijancic',  nombre: ETIQUETA_CARTERA['Yadro Fabijancic'].corta,  color: '#A78BFA' },
  { key: 'retail',    vendedor: 'Claudio Heufemann', nombre: ETIQUETA_CARTERA['Claudio Heufemann'].corta, color: '#D4AF37' },
  { key: 'online',    vendedor: 'OnLine',            nombre: 'OnLine',                                    color: '#F472B6' },
]

/** Clientes cuyo vendedor (asignado y de su última compra) no es una cartera
 *  vigente: Inactivo, Incobrable, Douglas Koenig, CERVECERÍA, sin vendedor… */
export const CARTERA_OTROS = { key: 'otros' as const, nombre: 'Otros', color: '#8A847D' }

export function infoCartera(key: CarteraKey) {
  return CARTERAS.find(c => c.key === key) ?? CARTERA_OTROS
}

export type EstadoCliente = 'activo' | 'inactivo' | 'sin_compras'

export interface ClienteCartera {
  id: number | null
  nombre: string
  razonSocial: string | null
  categoria: string | null
  localidad: string | null
  provincia: string | null
  telefono: string | null
  cartera: CarteraKey
  /** Vendedor tal como lo trae el ERP — se muestra sólo en la cartera "Otros". */
  vendedorErp: string | null
  estado: EstadoCliente
  primeraCompra: string | null
  ultimaCompra: string | null
  diasSinComprar: number | null
  /** Días promedio entre compras (null si compró un solo día). */
  cicloDias: number | null
  /** Días distintos en que compró (el ERP parte una compra en varios pedidos). */
  compras: number
  litros: number
  /** Venta neta histórica (total sin impuestos). */
  monto: number
  litros12m: number
  monto12m: number
}

export interface DetalleCliente {
  anios: { anio: number; litros: number; monto: number; compras: number }[]
  productos: { producto: string; litros: number; monto: number; veces: number; ultima: string }[]
  /** Últimas compras, una por día (con los N° de pedido del ERP de ese día). */
  compras: {
    fecha: string; pedidos: string | null; litros: number; monto: number
    items: { producto: string | null; envase: string | null; litros: number; monto: number }[]
  }[]
}
