import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getServerUser } from '@/lib/auth'
import { parseInsumosExcel, unidadBaseDe } from '@/lib/insumosParser'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logSync(supabase: any, params: {
  origen: 'automatico' | 'manual'; ok: boolean; mensaje?: string
  total?: number; insertados?: number
}) {
  try {
    await supabase.from('erp_sync_log').insert({ fuente: 'stock_insumos', ...params })
  } catch {
    // El log es informativo — nunca debe tumbar la carga real.
  }
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Varios insumos.nombre llevan un sufijo de marca/proveedor entre paréntesis
 *  ("Caraaroma (Weyermann)", "Safale S-04 (Fermentis)") que el export de
 *  Gestión Cervecera no trae — el ERP solo trackea stock por nombre genérico.
 *  Se usa como fallback de matching cuando el nombre exacto no calza. */
function sinSufijoParentesis(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * POST /api/insumos/stock/upload?preview=true|false
 *
 * Carga del informe de Stock de Insumos (Gestión Cervecera → Compra →
 * StockInsumos). Es una FOTO del momento: cada carga confirmada reemplaza
 * por completo la anterior en stock_insumos (mismo criterio que
 * stock_productos, ver /api/stock/upload) — no se acumula histórico fila a
 * fila, sólo el snapshot más reciente por insumo.
 *
 * El nombre del insumo en el ERP puede no calzar EXACTO con insumos.nombre
 * (mayúsculas, espacios, tildes) — se matchea normalizado, y si de todos
 * modos no hay match, la fila queda en `sinMatch` en vez de perderse en
 * silencio o crear un insumo fantasma. Mismo motivo, la unidad del ERP
 * puede no ser una que sepamos convertir (unidadBaseDe devuelve null) — esas
 * filas también van a `sinMatch`, con el detalle de por qué.
 *
 * Autenticación dual (mismo patrón que /api/stock/upload): sesión de admin
 * desde la UI, o Bearer UPLOAD_SECRET_INSUMOS desde el sync automático del
 * ERP (sin sesión, por eso usa el cliente service-role para saltar RLS).
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.UPLOAD_SECRET_INSUMOS
  const esCron = !!secret && auth === `Bearer ${secret}`

  if (!esCron) {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!user.isAdmin) return NextResponse.json({ error: 'Solo administradores pueden cargar stock de insumos' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const preview = searchParams.get('preview') === 'true'

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  let filas
  try {
    const buffer = await file.arrayBuffer()
    filas = parseInsumosExcel(buffer)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al leer el archivo' }, { status: 400 })
  }

  if (filas.length === 0) {
    return NextResponse.json({ error: 'El archivo no trajo ninguna fila de insumo reconocible' }, { status: 400 })
  }

  const supabase = esCron
    ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    : await createClient()

  const { data: insumosDb, error: insumosError } = await supabase.from('insumos').select('id, nombre')
  if (insumosError) return NextResponse.json({ error: insumosError.message }, { status: 500 })

  const idPorNombreNormalizado = new Map((insumosDb ?? []).map(i => [norm(i.nombre as string), i.id as string]))

  // Fallback sin sufijo de marca — sólo se agrega si el nombre resultante es
  // único (si dos insumos distintos colapsaran al mismo nombre sin sufijo,
  // preferimos dejarlos en sinMatch antes que adivinar cuál es).
  const conteoSinSufijo = new Map<string, number>()
  for (const i of insumosDb ?? []) {
    const k = norm(sinSufijoParentesis(i.nombre as string))
    conteoSinSufijo.set(k, (conteoSinSufijo.get(k) ?? 0) + 1)
  }
  const idPorNombreSinSufijo = new Map(
    (insumosDb ?? [])
      .map(i => [norm(sinSufijoParentesis(i.nombre as string)), i.id as string] as const)
      .filter(([k]) => conteoSinSufijo.get(k) === 1)
  )

  const matcheados: { insumoId: string; nombre: string; cantidadBase: number }[] = []
  const sinMatch: { nombreCrudo: string; cantidad: number; unidadCruda: string; motivo: string }[] = []

  for (const f of filas) {
    const insumoId = idPorNombreNormalizado.get(norm(f.nombreCrudo)) ?? idPorNombreSinSufijo.get(norm(f.nombreCrudo))
    if (!insumoId) {
      sinMatch.push({ ...f, motivo: 'No existe ningún insumo con ese nombre en el catálogo (insumos.nombre) — falta crearlo o es un alias que hay que mapear.' })
      continue
    }
    const conv = unidadBaseDe(f.unidadCruda)
    if (!conv) {
      sinMatch.push({ ...f, motivo: `Unidad "${f.unidadCruda}" no reconocida — no se puede convertir a gr/ml sin adivinar.` })
      continue
    }
    matcheados.push({ insumoId, nombre: f.nombreCrudo, cantidadBase: f.cantidad * conv.factor })
  }

  const resumen = {
    filasLeidas: filas.length,
    matcheados: matcheados.length,
    sinMatch: sinMatch.length,
  }

  if (preview) {
    return NextResponse.json({ preview: true, resumen, matcheados, sinMatch })
  }

  const fechaInforme = new Date().toISOString().split('T')[0]

  // Reemplazo completo del snapshot — mismo criterio que stock_productos.
  const { error: delError } = await supabase.from('stock_insumos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delError) {
    await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: false, mensaje: `Error al limpiar stock de insumos anterior: ${delError.message}` })
    return NextResponse.json({ error: `Error al limpiar stock de insumos anterior: ${delError.message}` }, { status: 500 })
  }

  const filasInsert = matcheados.map(m => ({
    fecha_informe: fechaInforme,
    insumo_id: m.insumoId,
    cantidad: m.cantidadBase,
  }))

  const { error: insError, data } = await supabase.from('stock_insumos').insert(filasInsert).select('id')
  if (insError) {
    await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: false, mensaje: insError.message })
    return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: true, total: filas.length, insertados: data?.length ?? 0 })

  return NextResponse.json({ insertados: data?.length ?? 0, sinMatch: sinMatch.length, fechaInforme, resumen, sinMatchDetalle: sinMatch })
}
