require('./_loadenv').loadEnv()
const { createClient } = require('@supabase/supabase-js')
const xlsx = require('xlsx')

const sb = createClient(process.env.SUPA_URL, process.env.SUPA_KEY)
const DRY_RUN = process.argv.includes('--dry-run')

function norm(s) {
  return (s || '').toString().trim().toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
}
function normRut(s) {
  if (!s) return null
  return s.toString().replace(/[.\s]/g, '').toUpperCase()
}
function str(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function num(v) {
  if (v == null || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}
function normalizePhone(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/[\s\-().]/g, '')
  if (cleaned.startsWith('0')) return '+56' + cleaned.slice(1)
  if (/^9\d{7,8}$/.test(cleaned)) return '+569' + cleaned.slice(1)
  if (/^56/.test(cleaned)) return '+' + cleaned
  return cleaned
}

async function main() {
  const wb = xlsx.readFile('C:/Users/Claudio Heufemann/Desktop/Aplicacion el regreso/Clientes El Regreso Brewing Co. 23-6-2026.xlsx')
  const ws = wb.Sheets['Clientes']
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headers = rows[2]
  const data = rows.slice(3).filter(r => r.some(c => c !== null))
  const col = (name) => headers.indexOf(name)

  const idx = {
    nombre: col('Nombre'),
    razon_social: col('Razón social'),
    rut: col('RUT'),
    telefonos: col('Teléfonos'),
    email: col('Email'),
    contacto: col('Contacto'),
    direccion: col('Dirección'),
    localidad: col('Localidad'),
    provincia: col('Provincia'),
    codigo_postal: col('Código postal'),
    condicion_fiscal: col('Condición fiscal'),
    direccion_entrega: col('Dirección de entrega'),
    localidad_entrega: col('Localidad de entrega'),
    provincia_entrega: col('Provincia de entrega'),
    saldo: col('Saldo Cta. Cte. Inicial'),
    dias_horas_entrega: col('Días y Horas de entrega'),
    notas: col('Notas'),
    nro_ruta: col('Nro. Ruta'),
    direccion_gmaps: col('Dirección completa Google Maps'),
    lista_precios: col('Lista de precios'),
    codigo_cliente: col('Código de cliente'),
    vendedor: col('Vendedor'),
    dias_pago: col('Días de pago'),
    pct_bonif: col('Porcentaje de bonificación'),
    limite_cta_cte: col('Límite Cta. Cte.'),
    tipo: col('Tipo'),
    categoria: col('Categoría'),
    condicion_venta: col('Condición de venta'),
    giro: col('Giro'),
  }

  const excelRows = data.map(r => ({
    nombre_fantasia: str(r[idx.nombre]),
    razon_social: str(r[idx.razon_social]),
    rut: str(r[idx.rut]),
    telefono: normalizePhone(str(r[idx.telefonos])),
    email: str(r[idx.email]),
    contacto: str(r[idx.contacto]),
    direccion: str(r[idx.direccion]),
    localidad: str(r[idx.localidad]),
    provincia: str(r[idx.provincia]),
    codigo_postal: str(r[idx.codigo_postal]),
    condicion_fiscal: str(r[idx.condicion_fiscal]),
    direccion_entrega: str(r[idx.direccion_entrega]),
    localidad_entrega: str(r[idx.localidad_entrega]),
    provincia_entrega: str(r[idx.provincia_entrega]),
    saldo_cta_cte_inicial: num(r[idx.saldo]),
    dias_horas_entrega: str(r[idx.dias_horas_entrega]),
    notas: str(r[idx.notas]),
    ruta_despacho: str(r[idx.nro_ruta]),
    direccion_google_maps: str(r[idx.direccion_gmaps]),
    lista_precios: str(r[idx.lista_precios]),
    codigo_cliente: str(r[idx.codigo_cliente]),
    vendedor: str(r[idx.vendedor]),
    dias_pago: num(r[idx.dias_pago]),
    porcentaje_bonificacion: num(r[idx.pct_bonif]),
    limite_cta_cte: num(r[idx.limite_cta_cte]),
    tipo: str(r[idx.tipo]),
    categoria: str(r[idx.categoria]),
    condicion_venta: str(r[idx.condicion_venta]),
    giro: str(r[idx.giro]),
  })).filter(r => r.nombre_fantasia)

  console.log('Filas válidas en Excel:', excelRows.length)

  // Traer todos los clientes existentes
  let existentes = []
  let from = 0
  while (true) {
    const { data: d, error } = await sb.from('clientes').select('*').range(from, from + 999)
    if (error) throw error
    existentes = existentes.concat(d)
    if (d.length < 1000) break
    from += 1000
  }
  console.log('Clientes existentes en DB:', existentes.length)

  const byRut = new Map()
  const byNombre = new Map()
  for (const c of existentes) {
    if (c.rut) byRut.set(normRut(c.rut), c)
    byNombre.set(norm(c.nombre_fantasia), c)
  }

  const toInsert = []
  const toUpdate = []
  const seenIds = new Set()

  for (const row of excelRows) {
    // nombre_fantasia es la clave única real en esta tabla (UNIQUE constraint).
    // El RUT NO es confiable como llave: una misma razón social/RUT puede
    // tener varios nombres de fantasía distintos (ej. "Altamira" y
    // "Club De Cervezas" comparten RUT 76.308.654-2 pero son clientes
    // distintos en la app). Match por nombre primero, RUT solo como apoyo.
    let match = byNombre.get(norm(row.nombre_fantasia))
    if (!match && row.rut) match = byRut.get(normRut(row.rut))

    if (match) {
      seenIds.add(match.id)
      // Solo actualizamos campos de datos del negocio (no tocamos lat/lng, que se geocodifican aparte)
      const changes = {}
      for (const k of Object.keys(row)) {
        if (row[k] != null && row[k] !== match[k]) changes[k] = row[k]
      }
      if (Object.keys(changes).length > 0) {
        toUpdate.push({ id: match.id, changes, nombre: row.nombre_fantasia })
      }
    } else {
      toInsert.push(row)
    }
  }

  console.log('Nuevos clientes a insertar:', toInsert.length)
  console.log('Clientes existentes con cambios a actualizar:', toUpdate.length)
  console.log('Clientes en DB que NO aparecen en este Excel:', existentes.length - seenIds.size)

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: primeros 5 nuevos ---')
    console.log(toInsert.slice(0, 5).map(r => r.nombre_fantasia))
    console.log('--- DRY RUN: primeros 5 actualizados (campos que cambian) ---')
    for (const u of toUpdate.slice(0, 5)) console.log(u.nombre, Object.keys(u.changes))
    return
  }

  // Insertar nuevos en batches
  let insertados = 0
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    const { data: d, error } = await sb.from('clientes').insert(batch).select('id')
    if (error) { console.error('Error insertando batch', i, error.message); continue }
    insertados += d.length
  }
  console.log('Insertados:', insertados)

  // Actualizar existentes uno por uno (cambios distintos por fila)
  let actualizados = 0
  for (const u of toUpdate) {
    const { error } = await sb.from('clientes').update(u.changes).eq('id', u.id)
    if (error) { console.error('Error actualizando', u.nombre, error.message); continue }
    actualizados++
  }
  console.log('Actualizados:', actualizados)
}

main().catch(e => { console.error(e); process.exit(1) })
