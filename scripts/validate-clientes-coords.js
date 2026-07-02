// Valida que cada coordenada de cliente realmente caiga en la localidad
// esperada (reverse-geocode). Nominatim a veces "encuentra" una dirección
// rural/vaga devolviendo el centroide de la ciudad contenedora más amplia
// (ej. "Niebla" sin calle exacta -> cae en el centro de Valdivia, a 18km
// de distancia real) sin avisar que es una aproximación. Si la localidad
// que devuelve el reverse-geocode no coincide con la que dice la ficha
// del cliente, se asume que el punto está mal y se limpia (mejor sin pin
// que con un pin en el lugar equivocado para una visita de terreno).
require('./_loadenv').loadEnv()
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(process.env.SUPA_URL, process.env.SUPA_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function norm(s) {
  return (s || '').toString().toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n').trim()
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=14`,
      { headers: { 'User-Agent': 'ElRegresoBeerApp/1.0 (admin@elregresobeer.com)', 'Accept-Language': 'es' } }
    )
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
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
  // Solo tiene sentido validar si conocemos la localidad esperada
  const target = all.filter(c => c.localidad || c.provincia)
  console.log('Clientes con coords a validar:', target.length, '/', all.length)

  let ok = 0, sospechosos = 0, sinReverse = 0
  const malos = []

  for (const c of target) {
    const rev = await reverseGeocode(c.lat, c.lng)
    await sleep(1100)
    if (!rev || !rev.address) { sinReverse++; continue }

    const esperado = norm(c.localidad || c.provincia)
    const candidatos = [rev.address.city, rev.address.town, rev.address.village, rev.address.suburb, rev.address.municipality, rev.address.county]
      .filter(Boolean).map(norm)
    const display = norm(rev.display_name)

    const coincide = candidatos.some(x => x === esperado || x.includes(esperado) || esperado.includes(x)) || display.includes(esperado)

    if (coincide) { ok++; continue }

    sospechosos++
    malos.push({ id: c.id, nombre: c.nombre_fantasia, esperado: c.localidad || c.provincia, encontrado: candidatos.join('/') || '(sin dato)', direccion: c.direccion || c.direccion_google_maps })
    console.log(`[SOSPECHOSO] ${c.nombre_fantasia} | esperaba "${c.localidad || c.provincia}" pero el punto cae en "${candidatos.join('/')}" | dir: ${c.direccion || c.direccion_google_maps}`)

    if (!DRY_RUN) {
      await sb.from('clientes').update({ lat: null, lng: null }).eq('id', c.id)
    }
  }

  console.log('\n--- RESUMEN VALIDACIÓN ---')
  console.log('OK (localidad coincide):', ok)
  console.log('Sospechosos (limpiados):', sospechosos, DRY_RUN ? '(dry-run, no se tocó nada)' : '')
  console.log('Sin respuesta de reverse-geocode:', sinReverse)
  if (malos.length) {
    console.log('\nLista de sospechosos:')
    for (const m of malos) console.log(` - #${m.id} ${m.nombre} | esperado: ${m.esperado} | encontrado: ${m.encontrado} | dir: ${m.direccion}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
