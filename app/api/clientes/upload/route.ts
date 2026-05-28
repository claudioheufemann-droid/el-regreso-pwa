import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

function getString(row: Record<string, unknown>, ...keys: string[]): string | null {
  // First try exact matches
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      return String(v).trim()
    }
  }

  // Then try case-insensitive and with/without accents
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')

  const normalizedKeys = keys.map(normalize)
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      const normalizedKey = normalize(k)
      if (normalizedKeys.includes(normalizedKey)) {
        return String(v).trim()
      }
    }
  }

  return null
}

function getNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  // First try exact matches
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined) {
      const n = parseFloat(String(v))
      if (!isNaN(n)) return n
    }
  }

  // Then try case-insensitive
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')

  const normalizedKeys = keys.map(normalize)
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && v !== undefined) {
      const normalizedKey = normalize(k)
      if (normalizedKeys.includes(normalizedKey)) {
        const n = parseFloat(String(v))
        if (!isNaN(n)) return n
      }
    }
  }

  return null
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  // Remove spaces, dashes, parentheses, keep +56 prefix
  const cleaned = raw.replace(/[\s\-\(\)\.]/g, '')
  // If starts with 0, replace with +56
  if (cleaned.startsWith('0')) return '+56' + cleaned.slice(1)
  // If starts with 9 (8 digits), prepend +569
  if (/^9\d{7,8}$/.test(cleaned)) return '+569' + cleaned.slice(1)
  return cleaned
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })
  }

  const supabase = createClient(url, key)

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const mode = (formData.get('mode') as string) ?? 'upsert' // 'upsert' | 'replace'

  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]

  // Read all raw data to find header row
  const allRawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    defval: null,
    header: 1,
  }) as unknown[][]

  // Find header row (contains "nombre", "Nombre", etc.)
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(allRawRows.length, 10); i++) {
    const row = allRawRows[i]
    if (Array.isArray(row) && row.some(v => v && String(v).toLowerCase().includes('nombre'))) {
      headerRowIdx = i
      break
    }
  }

  // Extract headers and data rows
  const headerRow = allRawRows[headerRowIdx] as unknown[]
  const dataRows = allRawRows.slice(headerRowIdx + 1)

  // Convert to objects with header names
  const rows = dataRows
    .map(row => {
      if (!Array.isArray(row) || row.length === 0) return null
      const obj: Record<string, unknown> = {}
      for (let i = 0; i < headerRow.length; i++) {
        const key = String(headerRow[i] ?? '').trim()
        if (key) obj[key] = row[i] ?? null
      }
      return Object.keys(obj).length > 0 ? obj : null
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (rows.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene datos. Verifica que tenga una columna "Nombre".' }, { status: 400 })
  }

  // Map Excel rows → clientes records
  const clientes = rows
    .map((row) => {
      const nombre_fantasia = getString(
        row,
        'nombre', 'Nombre', 'NOMBRE',
        'nombre_fantasia', 'NombreFantasia', 'Nombre Fantasia',
        'nombre fantasia'
      )
      if (!nombre_fantasia) return null

      return {
        nombre_fantasia,
        razon_social: getString(row, 'razon_social', 'Razon Social', 'Razón Social', 'razon social'),
        rut: getString(row, 'rut', 'RUT', 'Rut'),
        telefono: normalizePhone(getString(row, 'telefonos', 'Telefonos', 'Teléfonos', 'telefono', 'Telefono')),
        email: getString(row, 'email', 'Email', 'EMAIL', 'correo', 'Correo'),
        contacto: getString(row, 'contacto', 'Contacto', 'CONTACTO'),
        direccion: getString(row, 'direccion', 'Dirección', 'Direccion', 'DIRECCION'),
        localidad: getString(row, 'localidad', 'Localidad', 'LOCALIDAD'),
        provincia: getString(row, 'provincia', 'Provincia', 'PROVINCIA'),
        codigo_postal: getString(row, 'codigo_postal', 'Codigo Postal', 'Código Postal', 'CP'),
        condicion_fiscal: getString(row, 'condicion_fiscal', 'Condicion Fiscal', 'Condición Fiscal'),
        direccion_entrega: getString(row, 'direccion_entrega', 'Dirección de entrega', 'Direccion Entrega'),
        localidad_entrega: getString(row, 'localidad_entrega', 'Localidad Entrega', 'Localidad de entrega'),
        provincia_entrega: getString(row, 'provincia_entrega', 'Provincia Entrega'),
        saldo_cta_cte_inicial: getNumber(row, 'saldo_cta_cte_inicial', 'Saldo Cta Cte Inicial', 'Saldo inicial'),
        dias_horas_entrega: getString(row, 'dias_horas_entrega', 'Dias/Horas Entrega', 'Días/Horas Entrega'),
        notas: getString(row, 'notas', 'Notas', 'NOTAS', 'observaciones', 'Observaciones'),
        ruta_despacho: getString(row, 'nro_ruta', 'Nro Ruta', 'Nro. Ruta', 'nro. ruta', 'ruta', 'Ruta'),
        direccion_google_maps: getString(row, 'direccion_google_maps', 'Direccion Google Maps', 'Google Maps'),
        lista_precios: getString(row, 'lista_precios', 'Lista de Precios', 'Lista Precios'),
        codigo_cliente: getString(row, 'codigo_cliente', 'Código Cliente', 'Codigo Cliente', 'Código de Cliente'),
        vendedor: getString(row, 'vendedor', 'Vendedor', 'VENDEDOR'),
        dias_pago: getNumber(row, 'dias_pago', 'Dias de pago', 'Días de pago', 'Días pago'),
        porcentaje_bonificacion: getNumber(row, 'porcentaje_bonificacion', 'Porcentaje Bonificacion', '% Bonificación'),
        limite_cta_cte: getNumber(row, 'limite_cta_cte', 'Limite Cta Cte', 'Límite Cta Cte', 'Límite cuenta corriente'),
        tipo: getString(row, 'tipo', 'Tipo', 'TIPO'),
        categoria: getString(row, 'categoria', 'Categoria', 'Categoría', 'CATEGORIA'),
        condicion_venta: getString(row, 'condicion_venta', 'Condicion de venta', 'Condición de venta'),
        giro: getString(row, 'giro', 'Giro', 'GIRO'),
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (clientes.length === 0) {
    return NextResponse.json(
      { error: 'No se encontraron filas con nombre de cliente válido' },
      { status: 400 }
    )
  }

  let insertadas = 0
  let actualizadas = 0
  let eliminadasPrev = 0

  if (mode === 'replace') {
    // Delete all existing clientes and re-insert
    const { error: delError } = await supabase
      .from('clientes')
      .delete()
      .neq('id', 0)

    if (delError) {
      return NextResponse.json({ error: `Error al limpiar tabla: ${delError.message}` }, { status: 500 })
    }
    eliminadasPrev = 1 // we don't know exact count easily
  }

  // Insert / upsert in batches
  const BATCH = 100

  for (let i = 0; i < clientes.length; i += BATCH) {
    const batch = clientes.slice(i, i + BATCH)

    if (mode === 'replace') {
      const { data, error } = await supabase
        .from('clientes')
        .insert(batch)
        .select('id')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      insertadas += data?.length ?? batch.length
    } else {
      // Upsert on nombre_fantasia
      const { data, error } = await supabase
        .from('clientes')
        .upsert(batch, { onConflict: 'nombre_fantasia', ignoreDuplicates: false })
        .select('id')

      if (error) {
        // If upsert fails (no unique constraint), fall back to insert
        const { data: d2, error: e2 } = await supabase
          .from('clientes')
          .insert(batch)
          .select('id')

        if (e2) {
          return NextResponse.json({ error: e2.message }, { status: 500 })
        }
        insertadas += d2?.length ?? batch.length
      } else {
        insertadas += data?.length ?? batch.length
      }
    }
  }

  return NextResponse.json({
    total: clientes.length,
    insertadas,
    actualizadas,
    eliminadasPrev: mode === 'replace' ? 'todas' : 0,
    modo: mode,
  })
}
