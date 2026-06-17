import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

// Cliente SIN cookies → para llamadas server-side sin auth
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
  provincia: string | null
}

const COLS = 'vendedor_actual,litros,total_sin_impuesto,categoria_negocio,categoria_producto,producto,envase,fecha_pedido,nombre_fantasia,pedido,provincia'

/**
 * Ventas de un rango de fechas (TODOS los vendedores), llamada directa sin caché.
 * Garantiza que los datos siempre estén actualizados tras un upload de Excel.
 */
export async function getVentasRango(ini: string, fin: string): Promise<VentaRangoRow[]> {
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
