// Limpia lat/lng SOLO de los IDs revisados manualmente como errores reales
// de geocodificación (lista curada a partir de validate-clientes-coords.js,
// excluyendo falsos positivos: typos como "Villarica"/"Villarrica" y
// localidades rurales que sí pertenecen a la comuna encontrada).
require('./_loadenv').loadEnv()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.SUPA_URL, process.env.SUPA_KEY)

const BAD_IDS = [
  18, 24, 8, 191, 457, 81, 263, 266, 271, 120, 393, 186, 641, 174, 182, 451,
  692, 310, 712, 442, 447, 524, 501, 368, 594, 628, 638, 704, 699, 63, 149,
  435, 619, 687, 470, 703,
]

async function main() {
  const { data, error } = await sb.from('clientes').update({ lat: null, lng: null }).in('id', BAD_IDS).select('id,nombre_fantasia')
  if (error) throw error
  console.log('Coordenadas limpiadas:', data.length)
  for (const d of data) console.log(' -', d.nombre_fantasia)

  // Corrección de dato: El Trébol Futrono tenía localidad "Vilcun" mal
  // cargada (el nombre del negocio y la geocodificación real coinciden en
  // Futrono) — se arregla el dato en vez de descartar la coordenada.
  await sb.from('clientes').update({ localidad: 'Futrono' }).eq('id', 342)
  console.log('\nCorregido localidad de El Trébol Futrono: Vilcun -> Futrono')
}
main().catch(e => { console.error(e); process.exit(1) })
