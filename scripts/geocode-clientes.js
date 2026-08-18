require('./_loadenv').loadEnv()
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(process.env.SUPA_URL, process.env.SUPA_KEY)
const CHILE_BOUNDS = { minLat: -56.0, maxLat: -17.5, minLng: -75.7, maxLng: -66.4 }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function geocodeAddress(query) {
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=cl&addressdetails=0`,
      { headers: { 'User-Agent': 'ElRegresoBeerApp/1.0 (admin@elregresobeer.com)', 'Accept-Language': 'es' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    if (isNaN(lat) || isNaN(lng)) return null
    if (lat < CHILE_BOUNDS.minLat || lat > CHILE_BOUNDS.maxLat || lng < CHILE_BOUNDS.minLng || lng > CHILE_BOUNDS.maxLng) return null
    return { lat, lng, displayName: data[0].display_name }
  } catch {
    return null
  }
}

function buildQuery(c) {
  if (c.direccion_google_maps) return `${c.direccion_google_maps}, Chile`
  if (c.direccion) {
    const zona = c.localidad || c.provincia
    return zona ? `${c.direccion}, ${zona}, Chile` : `${c.direccion}, Chile`
  }
  return null
}

async function main() {
  let pendientes = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('clientes')
      .select('id,nombre_fantasia,direccion,direccion_google_maps,localidad,provincia')
      .or('lat.is.null,lng.is.null')
      .range(from, from + 999)
    if (error) throw error
    pendientes = pendientes.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  console.log('Clientes sin coordenadas:', pendientes.length)

  let actualizados = 0, sinDireccion = 0, sinResultado = 0
  const fallidos = []

  for (const c of pendientes) {
    const query = buildQuery(c)
    if (!query) { sinDireccion++; continue }

    const coords = await geocodeAddress(query)
    await sleep(1100)

    if (!coords) { sinResultado++; fallidos.push({ nombre: c.nombre_fantasia, query }); continue }

    const { error } = await sb.from('clientes').update({ lat: coords.lat, lng: coords.lng }).eq('id', c.id)
    if (error) { console.error('Error actualizando', c.nombre_fantasia, error.message); continue }
    actualizados++
    console.log(`[${actualizados}] ${c.nombre_fantasia} -> ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
  }

  console.log('\n--- RESUMEN ---')
  console.log('Actualizados:', actualizados)
  console.log('Sin dirección (no geocodeable):', sinDireccion)
  console.log('Sin resultado de Nominatim:', sinResultado)
  if (fallidos.length) {
    console.log('\nFallidos (revisar manualmente):')
    for (const f of fallidos) console.log(' -', f.nombre, '|', f.query)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
