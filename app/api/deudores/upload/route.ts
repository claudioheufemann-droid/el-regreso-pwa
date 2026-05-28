import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

// Helper to parse Excel and extract deudores data
function parseDeudoresFromExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })

  // Try "Datos" sheet first, then "Sheet1"
  let worksheet = workbook.Sheets['Datos'] || workbook.Sheets['Sheet1']
  if (!worksheet) {
    throw new Error('No sheet "Datos" o "Sheet1" found in Excel file')
  }

  const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[]

  return rows
    .filter(row => {
      // Filter out empty rows and rows without NombreDeFantasia
      const nombre = String(row.NombreDeFantasia || '').trim()
      return nombre.length > 0
    })
    .map(row => ({
      nombre_fantasia: String(row.NombreDeFantasia || '').trim(),
      saldo_total: Number(row['Saldo$'] || 0),
      deuda_vencida: Number(row['DeudaVencida$'] || 0),
      barriles_adeudados: Number(row.BarrilesAdeudados || 0),
      ultimo_pago: row.UltimoPago ? new Date(row.UltimoPago as unknown as string) : null,
      razon_social: String(row.RazonSocial || '').trim() || null,
      email: String(row.Email || '').trim() || null,
      telefono: String(row.Telefono || '').trim() || null,
      localidad: String(row.Localidad || '').trim() || null,
      categoria_cliente: String(row.CategoriaCliente || '').trim() || null,
      vendedor: String(row.Vendedor || '').trim() || null,
      tipo_cliente: String(row.TipoDeCliente || '').trim() || null,
      fecha_ultima_compra: row.FechaUltimaCompra ? new Date(row.FechaUltimaCompra as unknown as string) : null,
      fecha_alta: row.FechaAlta ? new Date(row.FechaAlta as unknown as string) : null,
      limite_cta_cte: Number(row['LimiteCtaCte$'] || 0),
      deuda_menor_14_dias: Number(row['DeudaMenorA14Dias$'] || 0),
      deuda_entre_15_29_dias: Number(row['DeudaEntre15Y29Dias$'] || 0),
      deuda_entre_30_44_dias: Number(row['DeudaEntre30Y44Dias$'] || 0),
      deuda_entre_45_59_dias: Number(row['DeudaEntre45Y59Dias$'] || 0),
      deuda_entre_60_89_dias: Number(row['DeudaEntre60Y89Dias$'] || 0),
      deuda_mas_90_dias: Number(row['DeudaDeMasDe90Dias$'] || 0),
      dias_pago: row.DiasPago ? Number(row.DiasPago) : null,
      external_remito_mas_antiguo: row.RemitoMasAntiguo ? Number(row.RemitoMasAntiguo) : null,
      external_fecha: row.Fecha ? new Date(row.Fecha as unknown as string) : null,
    }))
}

// POST: Upload Excel file with deudores
export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Solo archivos Excel (.xlsx, .xls)' }, { status: 400 })
    }

    // Parse Excel
    const buffer = await file.arrayBuffer()
    let deudores: unknown[] = []

    try {
      deudores = parseDeudoresFromExcel(buffer)
    } catch (e: unknown) {
      return NextResponse.json({ error: `Error parsing Excel: ${String(e)}` }, { status: 400 })
    }

    if (deudores.length === 0) {
      return NextResponse.json({ error: 'No data found in Excel file' }, { status: 400 })
    }

    // Get admin client
    let supabase: ReturnType<typeof getAdminClient>
    try {
      supabase = getAdminClient()
    } catch (e: unknown) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }

    // Generate unique batch ID (timestamp + random)
    const batchId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Check for duplicates within the current batch
    const nombresUnicos = new Set<string>()
    const duplicados: string[] = []

    for (const d of deudores as unknown[]) {
      const deudor = d as Record<string, unknown>
      const nombre = deudor.nombre_fantasia as string
      if (nombresUnicos.has(nombre)) {
        duplicados.push(nombre)
      } else {
        nombresUnicos.has(nombre)
      }
      nombresUnicos.add(nombre)
    }

    if (duplicados.length > 0) {
      return NextResponse.json(
        { error: `Duplicados en el archivo: ${duplicados.slice(0, 5).join(', ')}${duplicados.length > 5 ? '...' : ''}` },
        { status: 400 }
      )
    }

    // Prepare records for upsert (insert new, update existing)
    const recordsToInsert = (deudores as unknown[]).map(d => {
      const deudor = d as Record<string, unknown>
      return {
        ...deudor,
        upload_batch_id: batchId,
        updated_at: new Date().toISOString(),
      }
    })

    // Check which deudores already exist with these nombres_fantasia
    const nombresFantasia = recordsToInsert.map(r => (r as Record<string, unknown>).nombre_fantasia as string)
    const { data: existentes, error: selectError } = await supabase
      .from('deudores')
      .select('nombre_fantasia')
      .in('nombre_fantasia', nombresFantasia)

    if (selectError && selectError.code !== 'PGRST116') {
      return NextResponse.json({ error: selectError.message }, { status: 500 })
    }

    const nombresExistentes = new Set((existentes || []).map(e => (e as Record<string, unknown>).nombre_fantasia as string))

    // Upsert: Insert or update based on nombre_fantasia (will use newest data)
    const { error: upsertError } = await supabase
      .from('deudores')
      .upsert(recordsToInsert as Record<string, unknown>[], {
        onConflict: 'nombre_fantasia',
      })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    // Get counts
    const nuevos = recordsToInsert.length - nombresExistentes.size
    const actualizados = nombresExistentes.size

    return NextResponse.json({
      ok: true,
      batch_id: batchId,
      total_procesados: deudores.length,
      nuevos,
      actualizados,
      duplicados_en_archivo: duplicados.length,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET: Get summary stats
export async function GET() {
  try {
    let supabase: ReturnType<typeof getAdminClient>
    try {
      supabase = getAdminClient()
    } catch (e: unknown) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }

    const { count: total } = await supabase
      .from('deudores')
      .select('*', { count: 'exact', head: true })

    const { data: ultimos } = await supabase
      .from('deudores')
      .select('upload_batch_id')
      .order('updated_at', { ascending: false })
      .limit(1)

    const ultimoBatchId = (ultimos?.[0] as Record<string, unknown>)?.upload_batch_id || null

    return NextResponse.json({
      total_deudores: total ?? 0,
      ultimo_batch_id: ultimoBatchId,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
