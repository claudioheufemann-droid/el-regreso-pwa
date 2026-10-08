/**
 * Modo demo de /ventas: escala las cifras mostradas para grabar videos sin
 * exponer números reales. Es sólo de presentación — no escribe nada en la base
 * y se activa por usuario (users.demo_factor_litros; NULL = datos reales).
 *
 * Escala litros, ingresos, unidades, pedidos, clientes y metas con el mismo
 * factor, así los porcentajes, comparaciones y el precio por litro no cambian.
 */
const CLAVES_ESCALABLES = /litros|revenue|unidades|clientes|pedidos/i

export function escalarModoDemo<T>(valor: T, factor: number | null | undefined): T {
  if (!factor || factor === 1 || !Number.isFinite(factor) || factor <= 0) return valor
  return escalar(valor, factor) as T
}

function escalar(v: unknown, f: number): unknown {
  if (Array.isArray(v)) return v.map(x => escalar(x, f))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = typeof x === 'number' && CLAVES_ESCALABLES.test(k)
        ? Math.round(x * f * 10) / 10
        : escalar(x, f)
    }
    return out
  }
  return v
}
