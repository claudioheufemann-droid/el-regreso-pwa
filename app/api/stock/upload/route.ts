import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getServerUser } from '@/lib/auth'
import { parseStockExcel } from '@/lib/stockParser'
import { esCamaraVentas, esCamaraProduccion } from '@/lib/camaras'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logSync(supabase: any, params: {
  origen: 'automatico' | 'manual'; ok: boolean; mensaje?: string
  total?: number; insertados?: number
}) {
  try {
    await supabase.from('erp_sync_log').insert({ fuente: 'stock', ...params })
  } catch {
    // El log es informativo — nunca debe tumbar la carga real.
  }
}

/**
 * POST /api/stock/upload?preview=true|false
 *
 * Carga del informe de stock: barriles y envases de TODAS las cámaras, más
 * el producto en fermentación (tipo 'tanque'). Es una FOTO del momento: cada
 * carga confirmada reemplaza por completo la anterior, no se acumula
 * histórico fila a fila.
 *
 * Acá se guarda TODO. Cuáles cámaras cuentan lo decide cada módulo al leer,
 * con esCamaraVentas() / esCamaraProduccion() de lib/camaras.ts (son dos
 * listas distintas: Ventas sólo despacha desde Barrios Bajos, Producción
 * cuenta además Frío Planta y Latas FIFO).
 *
 * Autenticación dual (mismo patrón que /api/clientes/upload y
 * /api/deudores/upload): sesión de admin desde la UI, o Bearer
 * UPLOAD_SECRET_STOCK desde el sync automático del ERP (sin sesión, por eso
 * usa el cliente service-role en vez del de cookies para saltar RLS).
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.UPLOAD_SECRET_STOCK
  const esCron = !!secret && auth === `Bearer ${secret}`

  if (!esCron) {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!user.isAdmin) return NextResponse.json({ error: 'Solo administradores pueden cargar stock' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const preview = searchParams.get('preview') === 'true'

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  let productos
  try {
    const buffer = await file.arrayBuffer()
    productos = parseStockExcel(buffer)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al leer el archivo' }, { status: 400 })
  }

  if (productos.length === 0) {
    return NextResponse.json({ error: 'No se encontraron productos en las secciones esperadas' }, { status: 400 })
  }

  // El resumen que ve el admin al previsualizar usa el criterio de VENTAS
  // (sólo Barrios Bajos): es el mismo número que va a ver después en el módulo
  // de Stock. Mostrar el total del archivo confundiría, porque incluye consumo
  // propio del PDV, muestras y producto ya despachado a terceros.
  // `enProduccion` se informa aparte para que se note que también entró.
  const vendibles = productos.filter(p => esCamaraVentas(p.camara))
  const barriles = vendibles.filter(p => p.tipo === 'barril')
  const envases = vendibles.filter(p => p.tipo === 'envase')
  const tanques = productos.filter(p => p.tipo === 'tanque')
  const soloProduccion = productos.filter(p => p.tipo !== 'tanque' && !esCamaraVentas(p.camara) && esCamaraProduccion(p.camara))
  const resumen = {
    barriles: { productos: barriles.length, cantidad: barriles.reduce((s, p) => s + p.cantidad, 0), litros: Math.round(barriles.reduce((s, p) => s + (p.litros ?? 0), 0)) },
    envases: { productos: envases.length, cantidad: envases.reduce((s, p) => s + p.cantidad, 0) },
    tanques: { productos: tanques.length, litros: Math.round(tanques.reduce((s, p) => s + (p.litros ?? 0), 0)) },
    /** Cámaras que no se venden pero sí cuentan para reposición en Producción. */
    soloProduccion: { cantidad: soloProduccion.reduce((s, p) => s + p.cantidad, 0), camaras: [...new Set(soloProduccion.map(p => p.camara))].sort() },
    camarasExcluidas: [...new Set(productos.filter(p => p.tipo !== 'tanque' && !esCamaraProduccion(p.camara)).map(p => p.camara))].sort(),
  }

  if (preview) {
    return NextResponse.json({ preview: true, resumen, productos })
  }

  // El cliente de sesión (cookies) no sirve para el cron: no hay usuario
  // logueado, así que RLS bloquearía el delete/insert. Service-role para
  // el cron, cliente de sesión para la UI (respeta RLS como siempre).
  const supabase = esCron
    ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    : await createClient()
  const fechaInforme = new Date().toISOString().split('T')[0]

  // Reemplazo completo: es una foto del stock actual, no un acumulado.
  const { error: delError } = await supabase.from('stock_productos').delete().neq('id', 0)
  if (delError) {
    await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: false, mensaje: `Error al limpiar stock anterior: ${delError.message}` })
    return NextResponse.json({ error: `Error al limpiar stock anterior: ${delError.message}` }, { status: 500 })
  }

  // Se guardan TODAS las cámaras, no sólo las disponibles: así se puede
  // cambiar la definición de "disponible" sin volver a descargar del ERP, y
  // queda visible de dónde sale cada litro.
  const filas = productos.map(p => ({
    fecha_informe: fechaInforme,
    tipo: p.tipo,
    camara: p.camara,
    producto: p.producto,
    codigo_producto: p.codigoProducto,
    categoria: p.categoria,
    cantidad: p.cantidad,
    litros: p.litros,
    lotes: p.lotes,
  }))

  const { error: insError, data } = await supabase.from('stock_productos').insert(filas).select('id')
  if (insError) {
    await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: false, mensaje: insError.message })
    return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: true, total: productos.length, insertados: data?.length ?? 0 })

  return NextResponse.json({ insertadas: data?.length ?? 0, fechaInforme, resumen })
}
