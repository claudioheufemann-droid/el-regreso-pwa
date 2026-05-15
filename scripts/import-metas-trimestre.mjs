/**
 * Importa las metas trimestrales (Mayo–Julio 2026) a Supabase
 * desde los archivos Excel de Javier Badilla y Charly Urrejola.
 *
 * Uso: node scripts/import-metas-trimestre.mjs
 * Requiere: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_KEY en .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar .env.local manualmente
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env.local')
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const [key, ...parts] = line.split('=')
      if (key?.trim() && parts.length) {
        process.env[key.trim()] = parts.join('=').trim()
      }
    }
  } catch {
    console.warn('No se encontró .env.local, usando variables de entorno del sistema')
  }
}

loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ─── Estructura de períodos de calendario ───────────────────────────────────

const PERIODOS_CALENDARIO = [
  { nombre: 'Mayo 2026',  fecha_inicio: '2026-05-01', fecha_fin: '2026-05-31' },
  { nombre: 'Junio 2026', fecha_inicio: '2026-06-01', fecha_fin: '2026-06-30' },
  { nombre: 'Julio 2026', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-31' },
]

// ─── Datos de metas extraídos de los Excel ───────────────────────────────────
// Fuente: Metas_Javier_Badilla.xlsx y Metas_Carlos_Urrejola.xlsx
// Escenario OPTIMISTA · Unidad: Litros

const METAS = {
  'Javier Badilla': {
    mayo: {
      mensual: {
        'Bar': 1171, 'Supermercado': 883, 'Minimarket': 864, 'Distribuidor': 593,
        'Botillería': 294, 'Cafetería': 251, 'Cliente Directo': 232,
        'Almacén': 102, 'Restaurante': 63,
      },
      semanas: [
        // S1: 1-3 Mayo (semana corta: 1 día hábil — viernes 1)
        { num: 1, inicio: '2026-05-01', fin: '2026-05-03',
          canales: { 'Bar':92,'Supermercado':70,'Minimarket':68,'Distribuidor':47,'Botillería':23,'Cafetería':20,'Cliente Directo':18,'Almacén':8,'Restaurante':5 } },
        // S2: 4-10 Mayo (5 días hábiles: L-V)
        { num: 2, inicio: '2026-05-04', fin: '2026-05-10',
          canales: { 'Bar':256,'Supermercado':193,'Minimarket':189,'Distribuidor':130,'Botillería':64,'Cafetería':55,'Cliente Directo':51,'Almacén':22,'Restaurante':14 } },
        // S3: 11-17 Mayo
        { num: 3, inicio: '2026-05-11', fin: '2026-05-17',
          canales: { 'Bar':239,'Supermercado':180,'Minimarket':176,'Distribuidor':121,'Botillería':60,'Cafetería':51,'Cliente Directo':47,'Almacén':21,'Restaurante':13 } },
        // S4: 18-24 Mayo
        { num: 4, inicio: '2026-05-18', fin: '2026-05-24',
          canales: { 'Bar':337,'Supermercado':254,'Minimarket':249,'Distribuidor':170,'Botillería':85,'Cafetería':72,'Cliente Directo':67,'Almacén':29,'Restaurante':18 } },
        // S5: 25-31 Mayo
        { num: 5, inicio: '2026-05-25', fin: '2026-05-31',
          canales: { 'Bar':247,'Supermercado':186,'Minimarket':182,'Distribuidor':125,'Botillería':62,'Cafetería':53,'Cliente Directo':49,'Almacén':22,'Restaurante':13 } },
      ],
    },
    junio: {
      mensual: {
        'Bar': 1340, 'Minimarket': 1121, 'Supermercado': 876, 'Distribuidor': 810,
        'Botillería': 315, 'Cafetería': 229, 'Cliente Directo': 140,
        'Almacén': 100, 'Restaurante': 70,
      },
      semanas: [
        { num: 1, inicio: '2026-06-01', fin: '2026-06-07',
          canales: { 'Bar':119,'Supermercado':78,'Minimarket':100,'Distribuidor':72,'Botillería':28,'Cafetería':20,'Cliente Directo':12,'Almacén':9,'Restaurante':6 } },
        { num: 2, inicio: '2026-06-08', fin: '2026-06-14',
          canales: { 'Bar':350,'Supermercado':229,'Minimarket':293,'Distribuidor':212,'Botillería':82,'Cafetería':60,'Cliente Directo':37,'Almacén':26,'Restaurante':18 } },
        { num: 3, inicio: '2026-06-15', fin: '2026-06-21',
          canales: { 'Bar':268,'Supermercado':175,'Minimarket':224,'Distribuidor':162,'Botillería':63,'Cafetería':46,'Cliente Directo':28,'Almacén':20,'Restaurante':14 } },
        { num: 4, inicio: '2026-06-22', fin: '2026-06-28',
          canales: { 'Bar':280,'Supermercado':183,'Minimarket':234,'Distribuidor':169,'Botillería':66,'Cafetería':48,'Cliente Directo':29,'Almacén':21,'Restaurante':15 } },
        // S5: 29-30 Junio (semana corta: 2 días hábiles)
        { num: 5, inicio: '2026-06-29', fin: '2026-06-30',
          canales: { 'Bar':323,'Supermercado':211,'Minimarket':270,'Distribuidor':195,'Botillería':76,'Cafetería':55,'Cliente Directo':34,'Almacén':24,'Restaurante':17 } },
      ],
    },
    julio: {
      mensual: {
        'Bar': 1604, 'Supermercado': 1789, 'Minimarket': 1086, 'Distribuidor': 536,
        'Botillería': 259, 'Cafetería': 192, 'Almacén': 102, 'Restaurante': 57,
      },
      semanas: [
        { num: 1, inicio: '2026-07-01', fin: '2026-07-05',
          canales: { 'Bar':278,'Supermercado':310,'Minimarket':188,'Distribuidor':93,'Botillería':45,'Cafetería':33,'Almacén':18,'Restaurante':10 } },
        { num: 2, inicio: '2026-07-06', fin: '2026-07-12',
          canales: { 'Bar':368,'Supermercado':410,'Minimarket':249,'Distribuidor':123,'Botillería':59,'Cafetería':44,'Almacén':23,'Restaurante':13 } },
        { num: 3, inicio: '2026-07-13', fin: '2026-07-19',
          canales: { 'Bar':326,'Supermercado':364,'Minimarket':221,'Distribuidor':109,'Botillería':53,'Cafetería':39,'Almacén':21,'Restaurante':11 } },
        { num: 4, inicio: '2026-07-20', fin: '2026-07-26',
          canales: { 'Bar':242,'Supermercado':270,'Minimarket':164,'Distribuidor':81,'Botillería':39,'Cafetería':29,'Almacén':15,'Restaurante':9 } },
        { num: 5, inicio: '2026-07-27', fin: '2026-07-31',
          canales: { 'Bar':390,'Supermercado':435,'Minimarket':264,'Distribuidor':130,'Botillería':63,'Cafetería':47,'Almacén':25,'Restaurante':14 } },
      ],
    },
  },

  'Charly Urrejola': {
    mayo: {
      mensual: {
        'Bar': 2710, 'Minimarket': 465, 'Supermercado': 136, 'Botillería': 425,
        'Cafetería': 319, 'Actividades Turísticas': 273, 'Distribuidor': 465,
        'Restaurante': 146, 'Almacén': 122,
      },
      semanas: [
        { num: 1, inicio: '2026-05-01', fin: '2026-05-03',
          canales: { 'Bar':247,'Minimarket':42,'Supermercado':12,'Botillería':39,'Cafetería':29,'Actividades Turísticas':25,'Distribuidor':42,'Restaurante':13,'Almacén':11 } },
        { num: 2, inicio: '2026-05-04', fin: '2026-05-10',
          canales: { 'Bar':445,'Minimarket':76,'Supermercado':22,'Botillería':70,'Cafetería':52,'Actividades Turísticas':45,'Distribuidor':76,'Restaurante':24,'Almacén':20 } },
        { num: 3, inicio: '2026-05-11', fin: '2026-05-17',
          canales: { 'Bar':773,'Minimarket':133,'Supermercado':39,'Botillería':121,'Cafetería':91,'Actividades Turísticas':78,'Distribuidor':133,'Restaurante':42,'Almacén':35 } },
        { num: 4, inicio: '2026-05-18', fin: '2026-05-24',
          canales: { 'Bar':670,'Minimarket':115,'Supermercado':34,'Botillería':105,'Cafetería':79,'Actividades Turísticas':67,'Distribuidor':115,'Restaurante':36,'Almacén':30 } },
        { num: 5, inicio: '2026-05-25', fin: '2026-05-31',
          canales: { 'Bar':575,'Minimarket':99,'Supermercado':29,'Botillería':90,'Cafetería':68,'Actividades Turísticas':58,'Distribuidor':99,'Restaurante':31,'Almacén':26 } },
      ],
    },
    junio: {
      mensual: {
        'Bar': 3068, 'Minimarket': 557, 'Supermercado': 407, 'Botillería': 220,
        'Cafetería': 386, 'Actividades Turísticas': 375, 'Distribuidor': 123,
        'Restaurante': 165, 'Almacén': 55,
      },
      semanas: [
        { num: 1, inicio: '2026-06-01', fin: '2026-06-07',
          canales: { 'Bar':777,'Minimarket':141,'Supermercado':103,'Botillería':56,'Cafetería':98,'Actividades Turísticas':95,'Distribuidor':31,'Restaurante':42,'Almacén':14 } },
        { num: 2, inicio: '2026-06-08', fin: '2026-06-14',
          canales: { 'Bar':451,'Minimarket':82,'Supermercado':60,'Botillería':32,'Cafetería':57,'Actividades Turísticas':55,'Distribuidor':18,'Restaurante':24,'Almacén':8 } },
        { num: 3, inicio: '2026-06-15', fin: '2026-06-21',
          canales: { 'Bar':614,'Minimarket':111,'Supermercado':81,'Botillería':44,'Cafetería':77,'Actividades Turísticas':75,'Distribuidor':25,'Restaurante':33,'Almacén':11 } },
        { num: 4, inicio: '2026-06-22', fin: '2026-06-28',
          canales: { 'Bar':556,'Minimarket':101,'Supermercado':74,'Botillería':40,'Cafetería':70,'Actividades Turísticas':68,'Distribuidor':22,'Restaurante':30,'Almacén':10 } },
        { num: 5, inicio: '2026-06-29', fin: '2026-06-30',
          canales: { 'Bar':670,'Minimarket':122,'Supermercado':89,'Botillería':48,'Cafetería':84,'Actividades Turísticas':82,'Distribuidor':27,'Restaurante':36,'Almacén':12 } },
      ],
    },
    julio: {
      mensual: {
        'Bar': 3138, 'Minimarket': 472, 'Supermercado': 530, 'Botillería': 329,
        'Cafetería': 241, 'Actividades Turísticas': 210, 'Distribuidor': 125,
        'Restaurante': 83, 'Almacén': 110,
      },
      semanas: [
        { num: 1, inicio: '2026-07-01', fin: '2026-07-05',
          canales: { 'Bar':706,'Minimarket':106,'Supermercado':119,'Botillería':74,'Cafetería':54,'Actividades Turísticas':47,'Distribuidor':28,'Restaurante':19,'Almacén':25 } },
        { num: 2, inicio: '2026-07-06', fin: '2026-07-12',
          canales: { 'Bar':430,'Minimarket':65,'Supermercado':73,'Botillería':45,'Cafetería':33,'Actividades Turísticas':29,'Distribuidor':17,'Restaurante':11,'Almacén':15 } },
        { num: 3, inicio: '2026-07-13', fin: '2026-07-19',
          canales: { 'Bar':505,'Minimarket':76,'Supermercado':85,'Botillería':53,'Cafetería':39,'Actividades Turísticas':34,'Distribuidor':20,'Restaurante':13,'Almacén':18 } },
        { num: 4, inicio: '2026-07-20', fin: '2026-07-26',
          canales: { 'Bar':923,'Minimarket':139,'Supermercado':156,'Botillería':97,'Cafetería':71,'Actividades Turísticas':62,'Distribuidor':37,'Restaurante':25,'Almacén':32 } },
        { num: 5, inicio: '2026-07-27', fin: '2026-07-31',
          canales: { 'Bar':574,'Minimarket':86,'Supermercado':97,'Botillería':60,'Cafetería':44,'Actividades Turísticas':38,'Distribuidor':23,'Restaurante':15,'Almacén':20 } },
      ],
    },
  },
}

// ─── Ejecución ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🍺 Importando metas trimestrales Mayo–Julio 2026...\n')

  // 1. Crear o encontrar los períodos de calendario
  const periodoIds = {}

  for (const p of PERIODOS_CALENDARIO) {
    const { data: existing } = await supabase
      .from('periodos')
      .select('id')
      .eq('nombre', p.nombre)
      .single()

    if (existing) {
      periodoIds[p.nombre] = existing.id
      console.log(`✓ Período ya existe: ${p.nombre} (id=${existing.id})`)
    } else {
      const { data, error } = await supabase
        .from('periodos')
        .insert({ nombre: p.nombre, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin, activo: false })
        .select('id')
        .single()

      if (error) { console.error(`✗ Error creando período ${p.nombre}:`, error.message); process.exit(1) }
      periodoIds[p.nombre] = data.id
      console.log(`✓ Período creado: ${p.nombre} (id=${data.id})`)
    }
  }

  const mesMap = {
    mayo:  'Mayo 2026',
    junio: 'Junio 2026',
    julio: 'Julio 2026',
  }

  let totalInsertadas = 0
  let totalActualizadas = 0

  for (const [vendedor, mesesData] of Object.entries(METAS)) {
    console.log(`\n📊 ${vendedor}`)

    for (const [mesKey, mesData] of Object.entries(mesesData)) {
      const periodoNombre = mesMap[mesKey]
      const periodoId = periodoIds[periodoNombre]

      // Eliminar metas anteriores de este vendedor/período para reimportar limpio
      const periodoRow = PERIODOS_CALENDARIO.find(p => p.nombre === periodoNombre)
      await supabase
        .from('metas')
        .delete()
        .eq('vendedor', vendedor)
        .gte('fecha_inicio', periodoRow.fecha_inicio)
        .lte('fecha_fin', periodoRow.fecha_fin)

      // Insertar metas MENSUALES por canal
      const metasMensuales = Object.entries(mesData.mensual).map(([canal, litros]) => ({
        periodo_id: periodoId,
        vendedor,
        tipo: 'mensual',
        semana_numero: null,
        fecha_inicio: periodoRow.fecha_inicio,
        fecha_fin: periodoRow.fecha_fin,
        categoria_negocio: canal,
        meta_litros: litros,
      }))

      const { error: errMes } = await supabase.from('metas').insert(metasMensuales)
      if (errMes) { console.error(`  ✗ Error metas mensuales ${mesKey}:`, errMes.message) }
      else {
        totalInsertadas += metasMensuales.length
        console.log(`  ✓ ${periodoNombre}: ${metasMensuales.length} metas mensuales`)
      }

      // Insertar metas SEMANALES por canal
      for (const semana of mesData.semanas) {
        const metasSemanales = Object.entries(semana.canales).map(([canal, litros]) => ({
          periodo_id: periodoId,
          vendedor,
          tipo: 'semanal',
          semana_numero: semana.num,
          fecha_inicio: semana.inicio,
          fecha_fin: semana.fin,
          categoria_negocio: canal,
          meta_litros: litros,
        }))

        const { error: errSem } = await supabase.from('metas').insert(metasSemanales)
        if (errSem) { console.error(`  ✗ Error semana ${semana.num}:`, errSem.message) }
        else {
          totalInsertadas += metasSemanales.length
          console.log(`  ✓ ${periodoNombre} S${semana.num} (${semana.inicio}→${semana.fin}): ${metasSemanales.length} canales`)
        }
      }
    }
  }

  console.log(`\n✅ Importación completada: ${totalInsertadas} metas insertadas, ${totalActualizadas} actualizadas`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
