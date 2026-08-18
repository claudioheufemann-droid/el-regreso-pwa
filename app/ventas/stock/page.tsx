import { createClient } from '@/lib/supabase/server'
import StockClient from './StockClient'

export const dynamic = 'force-dynamic'

export interface StockProductoRow {
  tipo: 'barril' | 'envase'
  producto: string
  codigo_producto: string | null
  categoria: string | null
  cantidad: number
  litros: number | null
}

export default async function StockPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('stock_productos')
    .select('tipo, producto, codigo_producto, categoria, cantidad, litros, fecha_informe')
    .order('cantidad', { ascending: false })

  const filas = (data ?? []) as (StockProductoRow & { fecha_informe: string })[]
  const fechaInforme = filas[0]?.fecha_informe ?? null

  return <StockClient filas={filas} fechaInforme={fechaInforme} />
}
