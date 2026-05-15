/**
 * Script para importar el Excel inicial a Supabase.
 * Uso: node scripts/import-initial.mjs
 * Requiere: SUPABASE_URL y SUPABASE_SERVICE_KEY en .env.local
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_KEY')
  console.error('   Agrega SUPABASE_SERVICE_KEY=... a tu .env.local (la service_role key de Supabase)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

const VENDEDORES = ['Javier Badilla', 'Charly Urrejola']
const EXCEL_PATH = join(__dirname, '..', '..', 'Ventas detalladas (29).xlsx')

console.log(`📂 Leyendo: ${EXCEL_PATH}`)

const buffer = readFileSync(EXCEL_PATH)
const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
const ws = wb.Sheets['Datos'] ?? wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: null })

console.log(`📊 Total filas: ${rows.length}`)

const registros = rows
  .filter(row => VENDEDORES.includes(String(row['VendedorActual'] ?? '')))
  .map(row => {
    const fechaRaw = row['FechaEntrega']
    let fechaEntrega

    if (fechaRaw instanceof Date) {
      fechaEntrega = fechaRaw.toISOString().split('T')[0]
    } else if (typeof fechaRaw === 'string') {
      fechaEntrega = fechaRaw.split('T')[0].split(' ')[0]
    } else {
      return null
    }

    const cat = String(row['Categoria'] ?? '-')
    return {
      fecha_entrega: fechaEntrega,
      vendedor_actual: String(row['VendedorActual'] ?? ''),
      nombre_fantasia: String(row['NombreDeFantasia'] ?? '') || null,
      categoria_producto: String(row['CategoriaProducto'] ?? '') || null,
      categoria_negocio: cat !== '-' ? cat : null,
      producto: String(row['Producto'] ?? '') || null,
      envase: String(row['Envase'] ?? '') || null,
      litros: parseFloat(String(row['Litros'] ?? '0')) || 0,
      total_sin_impuesto: parseFloat(String(row['TotalSImp$'] ?? '0')) || 0,
      pedido: String(row['Pedido'] ?? '') || null,
      tipo_venta: String(row['TipoDeVenta'] ?? '') || null,
      localidad: String(row['Localidad'] ?? '') || null,
      provincia: String(row['Provincia'] ?? '') || null,
    }
  })
  .filter(Boolean)

console.log(`✅ Registros de Javier y Charly: ${registros.length}`)

// Insertar en lotes de 500
const BATCH_SIZE = 500
let insertados = 0

for (let i = 0; i < registros.length; i += BATCH_SIZE) {
  const batch = registros.slice(i, i + BATCH_SIZE)
  const { error } = await supabase.from('ventas').insert(batch)
  if (error) {
    console.error(`❌ Error en lote ${i / BATCH_SIZE + 1}:`, error.message)
  } else {
    insertados += batch.length
    console.log(`   Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} registros ✓`)
  }
}

console.log(`\n🎉 Importación completa: ${insertados} registros insertados`)
