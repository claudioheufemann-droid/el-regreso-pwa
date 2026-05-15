import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

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

  const vendedoresValidos = ['Javier Badilla', 'Carlos Urrejola']

  const registros = rows
    .filter(row => {
      const vendedor = String(row['VendedorActual'] ?? row['Vendedor actual'] ?? '')
      return vendedoresValidos.includes(vendedor)
    })
    .map(row => {
      const fechaRaw = row['FechaPedido'] ?? row['Fecha pedido'] ?? row['Fecha Pedido']
      let fechaPedido: string

      if (fechaRaw instanceof Date) {
        fechaPedido = fechaRaw.toISOString().split('T')[0]
      } else if (typeof fechaRaw === 'string') {
        fechaPedido = fechaRaw.split('T')[0].split(' ')[0]
      } else if (typeof fechaRaw === 'number') {
        const d = XLSX.SSF.parse_date_code(fechaRaw)
        fechaPedido = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      } else {
        return null
      }

      const nombreFantasia = String(row['NombreDeFantasia'] ?? row['Nombre de fantasía'] ?? row['Nombre de fantasia'] ?? '') || null
      const categoriaRaw = String(row['Categoria'] ?? row['Categoría'] ?? '') || null

      return {
        fecha_pedido: fechaPedido,
        vendedor_actual: String(row['VendedorActual'] ?? row['Vendedor actual'] ?? ''),
        nombre_fantasia: nombreFantasia,
        categoria_producto: String(row['CategoriaProducto'] ?? row['Categoría producto'] ?? '') || null,
        categoria_negocio: categoriaRaw && categoriaRaw !== '-' ? categoriaRaw : null,
        producto: String(row['Producto'] ?? '') || null,
        envase: String(row['Envase'] ?? '') || null,
        litros: parseFloat(String(row['Litros'] ?? '0')) || 0,
        total_sin_impuesto: parseFloat(String(row['TotalSImp$'] ?? row['Total s/imp $'] ?? '0')) || 0,
        pedido: String(row['Pedido'] ?? '') || null,
        tipo_venta: String(row['TipoDeVenta'] ?? row['Tipo de venta'] ?? '') || null,
        localidad: String(row['Localidad'] ?? '') || null,
        provincia: String(row['Provincia'] ?? '') || null,
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (registros.length === 0) {
    return NextResponse.json({ error: 'No se encontraron ventas de Javier Badilla o Carlos Urrejola en el archivo' }, { status: 400 })
  }

  // Obtener combinaciones únicas de (vendedor, fecha) presentes en el archivo
  const combinaciones = [
    ...new Map(
      registros.map(r => [`${r.vendedor_actual}__${r.fecha_pedido}`, { vendedor: r.vendedor_actual, fecha: r.fecha_pedido }])
    ).values()
  ]

  // Borrar las filas existentes para esas combinaciones (evita duplicados)
  for (const { vendedor, fecha } of combinaciones) {
    const { error: deleteError } = await supabase
      .from('ventas')
      .delete()
      .eq('vendedor_actual', vendedor)
      .eq('fecha_pedido', fecha)

    if (deleteError) {
      return NextResponse.json({ error: `Error al limpiar datos: ${deleteError.message}` }, { status: 500 })
    }
  }

  // Insertar registros nuevos en batches
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

  return NextResponse.json({
    insertadas,
    duplicadas: 0,
    fechas: combinaciones.map(c => c.fecha),
    errores: [],
  })
}
