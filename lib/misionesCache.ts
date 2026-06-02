import { unstable_cache } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

// Cliente sin cookies → apto para unstable_cache
function anon() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(fn: string, args: Record<string, unknown>): Promise<any[]> {
  const { data } = await anon().rpc(fn, args)
  return Array.isArray(data) ? data : []
}

const key = (v: string | null) => v ?? 'all'

// Análisis caros (escanean ventas) — cacheados compartidos, TTL 10 min.
// No necesitan ser en tiempo real; se recalculan al cambiar de semana o por TTL.

export function getVolumenBajaCached(vendedor: string | null) {
  return unstable_cache(
    () => rpc('get_clientes_volumen_baja', { p_vendedor: vendedor, p_umbral: 0.25 }),
    ['mis-volbaja', key(vendedor)],
    { tags: ['ventas'], revalidate: 600 },
  )()
}

export function getCrossSellCached(vendedor: string | null) {
  return unstable_cache(
    () => rpc('get_cross_sell', { p_vendedor: vendedor, p_min_penetracion: 0.4 }),
    ['mis-crosssell', key(vendedor)],
    { tags: ['ventas'], revalidate: 600 },
  )()
}

export function getPedidoSugeridoCached(vendedor: string | null) {
  return unstable_cache(
    () => rpc('get_pedido_sugerido', { p_vendedor: vendedor }),
    ['mis-pedidosug', key(vendedor)],
    { tags: ['ventas'], revalidate: 600 },
  )()
}

// Último pedido (fecha + monto) por cliente — scan completo, cacheado por scope
export function getUltimaVentasCached(scope: string[]) {
  const k = scope.slice().sort().join('|') || 'none'
  return unstable_cache(
    async () => {
      const supabase = anon()
      const rows: { nombre_fantasia: string | null; fecha_pedido: string; total_sin_impuesto: number }[] = []
      let off = 0
      const sc = scope.length ? scope : ['__none__']
      while (true) {
        const { data } = await supabase.from('ventas')
          .select('nombre_fantasia, fecha_pedido, total_sin_impuesto')
          .in('vendedor_actual', sc)
          .order('fecha_pedido', { ascending: false })
          .range(off, off + 999)
        if (!data || data.length === 0) break
        rows.push(...(data as typeof rows))
        if (data.length < 1000) break
        off += 1000
      }
      return rows
    },
    ['mis-ultventas', k],
    { tags: ['ventas'], revalidate: 600 },
  )()
}
