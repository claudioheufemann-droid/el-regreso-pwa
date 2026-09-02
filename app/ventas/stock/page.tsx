import { createClient } from '@/lib/supabase/server'
import StockClient from './StockClient'

export const dynamic = 'force-dynamic'

export interface LoteRow {
  codigo: string
  cantidad: number
  /** Fecha de embarrilado (ISO yyyy-mm-dd), o null si no se encontró el lote en el informe. */
  fechaEmbarrilado: string | null
}

export interface StockProductoRow {
  tipo: 'barril' | 'envase'
  producto: string
  codigo_producto: string | null
  categoria: string | null
  cantidad: number
  litros: number | null
  lotes: LoteRow[]
}

export default async function StockPage() {
  const supabase = await createClient()

  const [{ data }, { data: periodos }, { data: costosPrecios }] = await Promise.all([
    supabase
      .from('stock_productos')
      .select('tipo, producto, codigo_producto, categoria, cantidad, litros, lotes, fecha_informe')
      .order('cantidad', { ascending: false }),
    supabase
      .from('periodos')
      .select('fecha_inicio, fecha_fin, activo')
      .order('fecha_inicio', { ascending: false })
      .limit(2),
    // Puente nombre→código: `ventas.producto` no tiene codigo_producto propio,
    // y su texto no calza directo contra stock_productos.producto (que trae
    // prefijos tipo "Lata (473 ml) de X" o sufijos "(estilo)"). costos_precios
    // sí tiene el nombre limpio que usa ventas, con su código — cubre el
    // 100% de los códigos que hoy aparecen en stock_productos (verificado).
    supabase.from('costos_precios').select('producto, codigo').not('codigo', 'is', null),
  ])

  const filas = (data ?? []) as (StockProductoRow & { fecha_informe: string })[]
  const fechaInforme = filas[0]?.fecha_informe ?? null

  const codigoPorNombreVenta = new Map((costosPrecios ?? []).map(c => [c.producto as string, c.codigo as string]))

  // Ranking de más a menos vendido (litros) para ordenar "Compartir stock" —
  // pedido explícito: mostrarle al cliente primero lo que más se pide.
  // Ventana = período activo + el inmediatamente anterior, así un producto
  // recién lanzado a mitad de mes no queda al fondo por poca data.
  const [actual, anterior] = periodos ?? []
  const inicio = anterior?.fecha_inicio ?? actual?.fecha_inicio ?? null
  const fin = actual?.fecha_fin ?? null

  let ventaPorCodigo: Record<string, number> = {}
  if (inicio && fin) {
    const { data: ventasRango } = await supabase
      .from('ventas')
      .select('producto, litros')
      .gte('fecha_pedido', inicio)
      .lte('fecha_pedido', fin)

    ventaPorCodigo = (ventasRango ?? []).reduce((acc, v) => {
      const codigo = codigoPorNombreVenta.get(v.producto as string)
      if (!codigo) return acc
      acc[codigo] = (acc[codigo] ?? 0) + (v.litros as number ?? 0)
      return acc
    }, {} as Record<string, number>)
  }

  return <StockClient filas={filas} fechaInforme={fechaInforme} ventaPorCodigo={ventaPorCodigo} />
}
