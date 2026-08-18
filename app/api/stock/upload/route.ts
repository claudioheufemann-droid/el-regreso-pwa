import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { parseStockExcel } from '@/lib/stockParser'

export const dynamic = 'force-dynamic'

/**
 * POST /api/stock/upload?preview=true|false
 *
 * Carga del informe de stock (Camara General Barrios Bajos: barriles +
 * envases). Es una FOTO del momento: cada carga confirmada reemplaza por
 * completo la anterior, no se acumula histórico fila a fila.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Solo administradores pueden cargar stock' }, { status: 403 })

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

  const barriles = productos.filter(p => p.tipo === 'barril')
  const envases = productos.filter(p => p.tipo === 'envase')
  const resumen = {
    barriles: { productos: barriles.length, cantidad: barriles.reduce((s, p) => s + p.cantidad, 0), litros: Math.round(barriles.reduce((s, p) => s + (p.litros ?? 0), 0)) },
    envases: { productos: envases.length, cantidad: envases.reduce((s, p) => s + p.cantidad, 0) },
  }

  if (preview) {
    return NextResponse.json({ preview: true, resumen, productos })
  }

  const supabase = await createClient()
  const fechaInforme = new Date().toISOString().split('T')[0]

  // Reemplazo completo: es una foto del stock actual, no un acumulado.
  const { error: delError } = await supabase.from('stock_productos').delete().neq('id', 0)
  if (delError) return NextResponse.json({ error: `Error al limpiar stock anterior: ${delError.message}` }, { status: 500 })

  const filas = productos.map(p => ({
    fecha_informe: fechaInforme,
    tipo: p.tipo,
    producto: p.producto,
    codigo_producto: p.codigoProducto,
    categoria: p.categoria,
    cantidad: p.cantidad,
    litros: p.litros,
  }))

  const { error: insError, data } = await supabase.from('stock_productos').insert(filas).select('id')
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  return NextResponse.json({ insertadas: data?.length ?? 0, fechaInforme, resumen })
}
