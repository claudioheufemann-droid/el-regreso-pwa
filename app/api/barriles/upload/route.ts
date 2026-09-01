import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logSync(supabase: any, params: {
  origen: 'automatico' | 'manual'; ok: boolean; mensaje?: string; total?: number
}) {
  try {
    await supabase.from('erp_sync_log').insert({ fuente: 'barriles', ...params })
  } catch {
    // El log es informativo — nunca debe tumbar la carga real.
  }
}

interface FilaExcel {
  NombreDeFantasia?: string
  RazonSocial?: string
  Codigo?: string | number
  Litros?: number
  Lote?: string
  Producto?: string
  Vendedor?: string
  Fecha?: string | Date
  Direccion?: string
  Localidad?: string
  DireccionEntrega?: string
  LocalidadEntrega?: string
  NroRuta?: string | number
}

function parseBarrilesExcel(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets['Datos'] || wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('No se encontró la hoja "Datos" en el archivo')

  const rows = XLSX.utils.sheet_to_json(ws) as FilaExcel[]

  return rows
    .filter(r => r.NombreDeFantasia && r.Codigo != null)
    .map(r => ({
      nombre_fantasia: String(r.NombreDeFantasia).trim(),
      razon_social: r.RazonSocial ? String(r.RazonSocial).trim() : null,
      codigo: String(r.Codigo).trim(),
      litros: r.Litros != null ? Number(r.Litros) : null,
      lote: r.Lote ? String(r.Lote).trim() : null,
      producto: r.Producto ? String(r.Producto).trim() : null,
      vendedor: r.Vendedor ? String(r.Vendedor).trim() : null,
      fecha_entrega: r.Fecha ? new Date(r.Fecha).toISOString() : null,
      direccion: r.Direccion ? String(r.Direccion).trim() : null,
      localidad: r.Localidad ? String(r.Localidad).trim() : null,
      direccion_entrega: r.DireccionEntrega ? String(r.DireccionEntrega).trim() : null,
      localidad_entrega: r.LocalidadEntrega ? String(r.LocalidadEntrega).trim() : null,
      nro_ruta: r.NroRuta != null ? String(r.NroRuta).trim() : null,
      updated_at: new Date().toISOString(),
    }))
}

/**
 * POST /api/barriles/upload
 *
 * Informe "Barriles en Cliente" del ERP: una fila por barril actualmente
 * fuera (con un cliente, sin devolver). Es una FOTO del momento —cada carga
 * reemplaza por completo la anterior, igual que /api/stock/upload— porque un
 * barril que se devolvió simplemente deja de aparecer en el informe.
 *
 * Autenticación dual (mismo patrón que clientes/deudores/stock): sesión de
 * admin desde la UI, o Bearer UPLOAD_SECRET_BARRILES desde el sync automático.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.UPLOAD_SECRET_BARRILES
  const esCron = !!secret && auth === `Bearer ${secret}`

  let supabase: ReturnType<typeof getAdminClient>
  try {
    supabase = getAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  if (!esCron) {
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  let filas: ReturnType<typeof parseBarrilesExcel>
  try {
    filas = parseBarrilesExcel(await file.arrayBuffer())
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: false, mensaje: msg })
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (filas.length === 0) {
    return NextResponse.json({ error: 'No se encontraron barriles en el archivo' }, { status: 400 })
  }

  // Reemplazo completo: es una foto de lo que está afuera ahora mismo.
  const { error: delError } = await supabase.from('barriles_clientes').delete().neq('id', 0)
  if (delError) {
    await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: false, mensaje: delError.message })
    return NextResponse.json({ error: delError.message }, { status: 500 })
  }

  const { error: insError, data } = await supabase.from('barriles_clientes').insert(filas).select('id')
  if (insError) {
    await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: false, mensaje: insError.message })
    return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  await logSync(supabase, { origen: esCron ? 'automatico' : 'manual', ok: true, total: filas.length })

  return NextResponse.json({ insertadas: data?.length ?? 0, total: filas.length })
}
