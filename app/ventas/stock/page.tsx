import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  // Service-role a propósito (lib/supabase/admin.ts): stock_productos y
  // costos_precios exigen RLS `authenticated`, y en modo demo no hay sesión
  // real — mismo gap ya resuelto para deudores/users/barriles_clientes.
  // Sin esto la página queda mostrando "aún no se ha cargado el stock" aunque
  // la tabla tenga datos (confirmado: rol anon devuelve 0 filas acá).
  const admin = createAdminClient()

  const [{ data }, { data: periodoActivo }, { data: costosPrecios }] = await Promise.all([
    admin
      .from('stock_productos')
      .select('tipo, producto, codigo_producto, categoria, cantidad, litros, lotes, fecha_informe')
      .order('cantidad', { ascending: false }),
    // `periodos` tiene meses futuros precreados (ej. "Marzo 2027") — hay que
    // anclar al que tiene activo=true, no al de fecha_inicio más reciente.
    supabase.from('periodos').select('fecha_inicio, fecha_fin').eq('activo', true).maybeSingle(),
    // Puente nombre→código: `ventas.producto` no tiene codigo_producto propio,
    // y su texto no calza directo contra stock_productos.producto (que trae
    // prefijos tipo "Lata (473 ml) de X" o sufijos "(estilo)"). costos_precios
    // sí tiene el nombre limpio que usa ventas, con su código — cubre el
    // 100% de los códigos que hoy aparecen en stock_productos (verificado).
    admin.from('costos_precios').select('producto, codigo').not('codigo', 'is', null),
  ])

  const filas = (data ?? []) as (StockProductoRow & { fecha_informe: string })[]
  const fechaInforme = filas[0]?.fecha_informe ?? null

  const codigoPorNombreVenta = new Map((costosPrecios ?? []).map(c => [c.producto as string, c.codigo as string]))

  // Ranking de más a menos vendido (litros) para ordenar "Compartir stock" —
  // pedido explícito: mostrarle al cliente primero lo que más se pide.
  // Ventana = período activo + el inmediatamente anterior, así un producto
  // recién lanzado a mitad de mes no queda al fondo por poca data.
  let inicio: string | null = periodoActivo?.fecha_inicio ?? null
  const fin = periodoActivo?.fecha_fin ?? null
  if (periodoActivo) {
    const { data: anterior } = await supabase
      .from('periodos')
      .select('fecha_inicio')
      .lt('fecha_inicio', periodoActivo.fecha_inicio)
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anterior) inicio = anterior.fecha_inicio
  }

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
