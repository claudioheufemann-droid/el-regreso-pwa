// Re-geocodifica SOLO los clientes cuyos puntos están amontonados
// (>2 clientes compartiendo exactamente la misma coordenada redondeada a
// 3 decimales) — síntoma del método viejo (ciudad + jitter aleatorio).
// Mucho más rápido que re-geocodificar los 700: solo toca los malos.
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
    const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon)
    if (isNaN(lat) || isNaN(lng)) return null
    if (lat < CHILE_BOUNDS.minLat || lat > CHILE_BOUNDS.maxLat || lng < CHILE_BOUNDS.minLng || lng > CHILE_BOUNDS.maxLng) return null
    return { lat, lng }
  } catch { return null }
}
function buildQuery(c) {
  if (c.direccion_google_maps) return `${c.direccion_google_maps}, Chile`
  if (c.direccion) { const z = c.localidad || c.provincia; return z ? `${c.direccion}, ${z}, Chile` : `${c.direccion}, Chile` }
  return null
}

async function main() {
  let all = [], from = 0
  while (true) {
    const { data, error } = await sb.from('clientes')
      .select('id,nombre_fantasia,direccion,direccion_google_maps,localidad,provincia,lat,lng')
      .not('lat', 'is', null).not('lng', 'is', null).range(from, from + 999)
    if (error) throw error
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }

  // Detectar clusters (>2 clientes en el mismo punto a 3 decimales)
  const byRound = new Map()
  for (const c of all) {
    const k = c.lat.toFixed(3) + ',' + c.lng.toFixed(3)
    if (!byRound.has(k)) byRound.set(k, [])
    byRound.get(k).push(c)
  }
  const clustered = []
  for (const [, v] of byRound) if (v.length > 2) clustered.push(...v)
  // Solo los que tienen dirección propia para re-geocodificar
  const target = clustered.filter(c => c.direccion || c.direccion_google_maps)
  console.log('Clientes amontonados:', clustered.length, '| con dirección re-geocodeable:', target.length)

  let fixed = 0, sinResultado = 0
  const fallidos = []
  for (const c of target) {
    const coords = await geocodeAddress(buildQuery(c))
    await sleep(1100)
    if (!coords) { sinResultado++; fallidos.push(c.nombre_fantasia); continue }
    const { error } = await sb.from('clientes').update({ lat: coords.lat, lng: coords.lng }).eq('id', c.id)
    if (error) { console.error('err', c.nombre_fantasia, error.message); continue }
    fixed++
    console.log(`[${fixed}] ${c.nombre_fantasia} -> ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
  }
  console.log('\n--- RESUMEN CLUSTERS ---')
  console.log('Corregidos:', fixed, '| sin resultado Nominatim:', sinResultado)
  if (fallidos.length) console.log('Fallidos:', fallidos.join(' | '))
}
main().catch(e => { console.error(e); process.exit(1) })
