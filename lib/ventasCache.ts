import { unstable_cache } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

// Cliente SIN cookies → apto para usar dentro de unstable_cache
// (el cliente normal lee cookies de auth y rompería el cache).
function anonClient() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

export type VentaRangoRow = {
  vendedor_actual: string
  litros: number | null
  total_sin_impuesto: number | null
  categoria_negocio: string | null
  categoria_producto: string | null
  producto: string | null
  envase: string | null
  fecha_pedido: string
  nombre_fantasia: string | null
  pedido: string | null
}

const COLS = 'vendedor_actual,litros,total_sin_impuesto,categoria_negocio,categoria_producto,producto,envase,fecha_pedido,nombre_fantasia,pedido'

async function _fetchVentasRango(ini: string, fin: string): Promise<VentaRangoRow[]> {
  const supabase = anonClient()
  const rows: VentaRangoRow[] = []
  let off = 0
  const PAGE = 1000
  while (true) {
    const { data } = await supabase
      .from('ventas')
      .select(COLS)
      .gte('fecha_pedido', ini)
      .lte('fecha_pedido', fin)
      .order('fecha_pedido', { ascending: true })
      .range(off, off + PAGE - 1)
    if (!data || data.length === 0) break
    rows.push(...(data as VentaRangoRow[]))
    if (data.length < PAGE) break
    off += PAGE
  }
  return rows
}

/**
 * Ventas de un rango de fechas (TODOS los vendedores), cacheado y COMPARTIDO
 * entre todos los usuarios. Se invalida al subir ventas (revalidateTag('ventas')).
 * Las páginas filtran por su scope de vendedor en memoria.
 */
export function getVentasRango(ini: string, fin: string): Promise<VentaRangoRow[]> {
  return unstable_cache(
    () => _fetchVentasRango(ini, fin),
    ['ventas-rango', ini, fin],
    { tags: ['ventas'], revalidate: 300 },
  )()
}
