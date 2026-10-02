/**
 * Un producto vendido se compone de VARIOS ítems del ERP en el mismo pedido:
 *   "Aguas Blancas" (Lata 473 ml, con litros)  +  "Empaque y Distribución Lata CERVEZA LOCAL" (0 L, con $)
 * El segundo es parte del precio del primero (pedido del usuario, 2-oct-2026). Pesa
 * mucho: en sep-2026 fue $18,0 M de ~$52 M netos. Sin repartirlo, un ranking por
 * producto muestra "Empaque y Distribución" como el producto más vendido y el $ de
 * cada cerveza queda ~1/3 más bajo de lo que de verdad paga el cliente.
 *
 * Regla: cada línea de empaque se reparte entre las líneas de PRODUCTO del mismo
 * pedido que calzan con su nombre, en proporción a los litros:
 *   · "Lata …" → envase Lata; "Barril …" → envase Barril; sin envase en el nombre → cualquiera.
 *   · "…KOMBUCHA…" → kombucha; "…CERVEZA…" → cerveza; sin categoría → cualquiera.
 * Si no calza nada se relaja (sólo envase, luego cualquier línea con litros); si el
 * pedido no tiene productos, la línea queda tal cual. Los totales no cambian.
 */

export const RE_EMPAQUE = /empaque\s*y\s*distrib/i

export interface LineaRepartible {
  pedido: string | null
  producto: string | null
  envase: string | null
  categoria_producto: string | null
  litros: number | null
  total_sin_impuesto: number | null
}

export type LineaConEmpaque<T> = T & {
  /** Parte del empaque y distribución del pedido asignada a esta línea (CLP neto). */
  empaque: number
}

const esKombucha = (l: LineaRepartible) => /kombucha/i.test(`${l.producto ?? ''} ${l.categoria_producto ?? ''}`)

function candidatas<T extends LineaRepartible>(ed: T, productos: T[]): T[] {
  const nombre = ed.producto ?? ''
  const env = /lata/i.test(nombre) ? 'lata' : /barril/i.test(nombre) ? 'barril' : null
  const cat = /kombucha/i.test(nombre) ? 'kombucha' : /cerveza/i.test(nombre) ? 'cerveza' : null
  const okEnv = (l: T) => !env || (l.envase ?? '').toLowerCase().startsWith(env)
  const okCat = (l: T) => !cat || (cat === 'kombucha' ? esKombucha(l) : !esKombucha(l))
  for (const filtro of [(l: T) => okEnv(l) && okCat(l), okEnv, () => true]) {
    const xs = productos.filter(filtro)
    if (xs.length) return xs
  }
  return []
}

/** Devuelve las líneas de producto con su `empaque` repartido sumado al neto; las de empaque sin destino quedan con empaque=0. */
export function repartirEmpaque<T extends LineaRepartible>(filas: T[]): LineaConEmpaque<T>[] {
  const porPedido = new Map<string, T[]>()
  const sueltas: T[] = []
  for (const f of filas) {
    if (f.pedido) {
      const xs = porPedido.get(f.pedido) ?? []
      xs.push(f)
      porPedido.set(f.pedido, xs)
    } else sueltas.push(f)
  }

  const out: LineaConEmpaque<T>[] = sueltas.map(f => ({ ...f, empaque: 0 }))
  for (const lineas of porPedido.values()) {
    const productos = lineas.filter(l => !RE_EMPAQUE.test(l.producto ?? '') && (Number(l.litros) || 0) > 0)
    const extra = new Map<T, number>()
    for (const l of lineas) {
      if (!RE_EMPAQUE.test(l.producto ?? '')) continue
      const destino = candidatas(l, productos)
      const litrosDestino = destino.reduce((s, d) => s + (Number(d.litros) || 0), 0)
      if (!destino.length || litrosDestino <= 0) { out.push({ ...l, empaque: 0 }); continue }
      const monto = Number(l.total_sin_impuesto) || 0
      for (const d of destino) extra.set(d, (extra.get(d) ?? 0) + monto * (Number(d.litros) || 0) / litrosDestino)
    }
    for (const l of lineas) {
      if (RE_EMPAQUE.test(l.producto ?? '')) continue
      const e = extra.get(l) ?? 0
      out.push({ ...l, total_sin_impuesto: (Number(l.total_sin_impuesto) || 0) + e, empaque: e })
    }
  }
  return out
}
