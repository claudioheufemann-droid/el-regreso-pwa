import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esCamaraVentas } from '@/lib/camaras'
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
      .select('tipo, camara, producto, codigo_producto, categoria, cantidad, litros, lotes, fecha_informe')
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

  // stock_productos guarda desde el 4 sep 2026 TODAS las cámaras del informe
  // del ERP más los tanques de fermentación, no sólo Barrios Bajos.
  //
  // Ventas se queda SÓLO con Barrios Bajos (esCamaraVentas): es la bodega de
  // despacho, y un vendedor no debería comprometer producto que está en planta
  // o en el depósito de rotación —puede no estar liberado o trasladado, y
  // prometerlo genera un quiebre en el despacho. Producción sí mira una lista
  // más amplia, porque su pregunta es otra (ver lib/camaras.ts).
  //
  // Igual hay que agrupar por producto: aunque hoy Ventas mire una sola
  // cámara, la fuente ya trae varias y esta pantalla lista las filas tal cual.
  // El tipo se ensancha a propósito: la tabla ya trae también 'tanque', que
  // StockProductoRow (lo que consume la UI) no contempla y se filtra abajo.
  const crudas = (data ?? []) as (Omit<StockProductoRow, 'tipo'> & {
    tipo: 'barril' | 'envase' | 'tanque'; fecha_informe: string; camara: string | null
  })[]
  const fechaInforme = crudas[0]?.fecha_informe ?? null

  const acumulado = new Map<string, StockProductoRow & { fecha_informe: string }>()
  for (const f of crudas) {
    if (f.tipo === 'tanque' || !esCamaraVentas(f.camara)) continue
    const clave = `${f.tipo}::${f.producto}`
    const previo = acumulado.get(clave)
    if (!previo) {
      acumulado.set(clave, { ...f, tipo: f.tipo, lotes: [...(f.lotes ?? [])] } as StockProductoRow & { fecha_informe: string })
      continue
    }
    previo.cantidad += f.cantidad
    if (f.litros != null) previo.litros = (previo.litros ?? 0) + f.litros
    previo.lotes = [...(previo.lotes ?? []), ...(f.lotes ?? [])]
  }
  const filas = [...acumulado.values()].sort((a, b) => b.cantidad - a.cantidad)

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
