import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

const VENDEDORES_VALIDOS = ['Javier Badilla', 'Carlos Urrejola']

function parseFecha(raw: unknown): string | null {
  if (raw instanceof Date) {
    return raw.toISOString().split('T')[0]
  }
  if (typeof raw === 'string') {
    const part = raw.split('T')[0].split(' ')[0]
    return part.match(/^\d{4}-\d{2}-\d{2}$/) ? part : null
  }
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return null
}

function deduplicarRegistros(registros: Record<string, unknown>[]) {
  const seen = new Set<string>()
  const unicos: Record<string, unknown>[] = []
  const dupCount: number[] = []

  for (const r of registros) {
    const key = [
      r.vendedor_actual,
      r.fecha_pedido,
      r.pedido,
      r.producto,
      r.envase,
      r.litros,
      r.total_sin_impuesto,
    ].join('|')

    if (seen.has(key)) {
      dupCount.push(1)
    } else {
      seen.add(key)
      unicos.push(r)
    }
  }

  return { unicos, duplicadosEnArchivo: dupCount.length }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheetName = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 })
  }

  // Mapear y filtrar filas
  const erroresMapeo: string[] = []
  const registrosBrutos = rows
    .map((row, idx) => {
      const vendedor = String(
        row['VendedorActual'] ?? row['Vendedor actual'] ?? ''
      ).trim()

      if (!VENDEDORES_VALIDOS.includes(vendedor)) return null

      const fechaPedido = parseFecha(
        row['FechaPedido'] ?? row['Fecha pedido'] ?? row['Fecha Pedido']
      )

      if (!fechaPedido) {
        erroresMapeo.push(`Fila ${idx + 2}: fecha inválida (${row['FechaPedido']})`)
        return null
      }

      const categoriaRaw = String(row['Categoria'] ?? row['Categoría'] ?? '').trim() || null

      return {
        fecha_pedido: fechaPedido,
        vendedor_actual: vendedor,
        nombre_fantasia:
          String(row['NombreDeFantasia'] ?? row['Nombre de fantasía'] ?? row['Nombre de fantasia'] ?? '').trim() || null,
        categoria_producto:
          String(row['CategoriaProducto'] ?? row['Categoría producto'] ?? '').trim() || null,
        categoria_negocio: categoriaRaw && categoriaRaw !== '-' ? categoriaRaw : null,
        producto: String(row['Producto'] ?? '').trim() || null,
        envase: String(row['Envase'] ?? '').trim() || null,
        litros: parseFloat(String(row['Litros'] ?? '0')) || 0,
        total_sin_impuesto:
          parseFloat(String(row['TotalSImp$'] ?? row['Total s/imp $'] ?? '0')) || 0,
        pedido: String(row['Pedido'] ?? '').trim() || null,
        tipo_venta:
          String(row['TipoDeVenta'] ?? row['Tipo de venta'] ?? '').trim() || null,
        localidad: String(row['Localidad'] ?? '').trim() || null,
        provincia: String(row['Provincia'] ?? '').trim() || null,
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (registrosBrutos.length === 0) {
    return NextResponse.json(
      { error: 'No se encontraron ventas de Javier Badilla o Carlos Urrejola en el archivo' },
      { status: 400 }
    )
  }

  // Deduplicar dentro del archivo
  const { unicos: registros, duplicadosEnArchivo } = deduplicarRegistros(registrosBrutos)

  // Combinaciones únicas (vendedor, fecha) presentes en el archivo
  const combinaciones = [
    ...new Map(
      registros.map(r => [
        `${r.vendedor_actual}__${r.fecha_pedido}`,
        { vendedor: r.vendedor_actual as string, fecha: r.fecha_pedido as string },
      ])
    ).values(),
  ]

  // Resumen por vendedor
  const resumenVendedor: Record<string, { filas: number; litros: number; fechas: Set<string> }> = {}
  for (const r of registros) {
    const v = r.vendedor_actual as string
    if (!resumenVendedor[v]) resumenVendedor[v] = { filas: 0, litros: 0, fechas: new Set() }
    resumenVendedor[v].filas++
    resumenVendedor[v].litros += r.litros as number
    resumenVendedor[v].fechas.add(r.fecha_pedido as string)
  }

  // Borrar filas existentes para esas combinaciones (vendedor + fecha)
  for (const { vendedor, fecha } of combinaciones) {
    const { error: deleteError } = await supabase
      .from('ventas')
      .delete()
      .eq('vendedor_actual', vendedor)
      .eq('fecha_pedido', fecha)

    if (deleteError) {
      return NextResponse.json(
        { error: `Error al limpiar datos: ${deleteError.message}` },
        { status: 500 }
      )
    }
  }

  // Insertar en batches
  const BATCH = 200
  let insertadas = 0

  for (let i = 0; i < registros.length; i += BATCH) {
    const batch = registros.slice(i, i + BATCH)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insertError } = await supabase
      .from('ventas')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(batch as any[])
      .select('id')

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    insertadas += data?.length ?? batch.length
  }

  // Fechas únicas procesadas
  const fechasOrdenadas = combinaciones
    .map(c => c.fecha)
    .sort()

  return NextResponse.json({
    insertadas,
    duplicadosEnArchivo,
    erroresMapeo: erroresMapeo.slice(0, 10),
    fechas: fechasOrdenadas,
    fechaMin: fechasOrdenadas[0],
    fechaMax: fechasOrdenadas[fechasOrdenadas.length - 1],
    vendedores: Object.entries(resumenVendedor).map(([nombre, d]) => ({
      nombre,
      filas: d.filas,
      litros: Math.round(d.litros * 10) / 10,
      fechas: d.fechas.size,
    })),
  })
}
