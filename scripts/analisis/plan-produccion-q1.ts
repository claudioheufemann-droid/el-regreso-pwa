/**
 * Extrae los datos para el plan de producción, insumos y envase del primer trimestre (ciclos
 * enero-marzo 2027) de los productos de LÍNEA FIJA. Sólo LEE (Supabase) y escribe un JSON que
 * consume el armado del Excel. Reutiliza las reglas de la app: cámaras de Producción,
 * normalización de nombres de stock, ciclo 24→23 y la lista LINEAS_FIJAS.
 *
 * Uso: npx tsx --env-file=.env.local scripts/analisis/plan-produccion-q1.ts <salida.json>
 */
import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { LINEAS_FIJAS, normalizarProducto, inicioDeCiclo, finDeCiclo } from '../../lib/produccion/reglas'
import { esCamaraProduccion } from '../../lib/camaras'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })
const hoy = new Date().toISOString().slice(0, 10)
const productos = [...LINEAS_FIJAS]
const ciclos = ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

async function todas<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let o = 0; ; o += 1000) {
    const { data, error } = await q(o, o + 999)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function main() {
  const salida = process.argv[2] ?? 'plan-q1.json'

  // Forecast por producto × envase (litros) y por producto (control).
  const fc = await todas<{ nivel: string; clave: string; mes: string; litros: number; litros_min: number; litros_max: number }>((a, b) =>
    admin.from('forecast_produccion').select('nivel, clave, mes, litros, litros_min, litros_max').eq('tipo', 'forecast').in('nivel', ['producto', 'producto_envase']).in('mes', ciclos).order('id').range(a, b))
  const demanda: Record<string, Record<string, Record<string, number>>> = {}
  const demandaProducto: Record<string, Record<string, number>> = {}
  for (const f of fc) {
    const mes = String(f.mes).slice(0, 10)
    if (f.nivel === 'producto_envase') {
      const [p, env] = String(f.clave).split('::')
      if (!productos.includes(p)) continue
      ;((demanda[p] ??= {})[mes] ??= {})[env] = Number(f.litros) || 0
    } else if (productos.includes(String(f.clave))) (demandaProducto[f.clave] ??= {})[mes] = Number(f.litros) || 0
  }

  // Stock de seguridad por producto y ciclo.
  const ss = await todas<{ producto: string; mes: string; stock_seguridad_litros: number; confianza: string }>((a, b) =>
    admin.from('stock_seguridad').select('producto, mes, stock_seguridad_litros, confianza').eq('nivel', 'producto').in('mes', ciclos).order('id').range(a, b))
  const stockSeguridad: Record<string, Record<string, number>> = {}
  for (const s of ss) if (productos.includes(s.producto)) (stockSeguridad[s.producto] ??= {})[String(s.mes).slice(0, 10)] = Number(s.stock_seguridad_litros) || 0

  // Stock de seguridad de LATA por producto y ciclo (para calcular cuántas latas hay que envasar).
  const ssl = await todas<{ producto: string; mes: string; stock_seguridad_litros: number }>((a, b) =>
    admin.from('stock_seguridad').select('producto, mes, stock_seguridad_litros').eq('nivel', 'producto_envase').eq('envase', 'lata').in('mes', ciclos).order('id').range(a, b))
  const stockSeguridadLata: Record<string, Record<string, number>> = {}
  for (const s of ssl) if (productos.includes(s.producto)) (stockSeguridadLata[s.producto] ??= {})[String(s.mes).slice(0, 10)] = Number(s.stock_seguridad_litros) || 0

  // Stock de producto terminado (última foto), sólo cámaras de Producción, con el criterio de /produccion.
  const { data: ult } = await admin.from('stock_productos').select('fecha_informe').order('fecha_informe', { ascending: false }).limit(1)
  const fechaStock = ult?.[0]?.fecha_informe as string
  const filas = await todas<{ producto: string; tipo: string; camara: string | null; cantidad: number; litros: number | null }>((a, b) =>
    admin.from('stock_productos').select('producto, tipo, camara, cantidad, litros').eq('fecha_informe', fechaStock).order('id').range(a, b))
  const conocidos = [...productos].sort((a, b) => b.length - a.length)
  const resolver = (crudo: string) => {
    const limpio = normalizarProducto(crudo)
    return conocidos.find(p => limpio === p || limpio.startsWith(p + ' ')) ?? null
  }
  const stock: Record<string, { barril: number; lata: number; latas: number; tanque: number }> = {}
  for (const f of filas) {
    const p = resolver(f.producto)
    if (!p) continue
    const a = (stock[p] ??= { barril: 0, lata: 0, latas: 0, tanque: 0 })
    const cant = Number(f.cantidad) || 0
    if (f.tipo === 'tanque') { a.tanque += Number(f.litros) || 0; continue }
    if (!esCamaraProduccion(f.camara)) continue
    const ml = f.producto.match(/Lata \((\d+)\s*ml\)/i)?.[1]
    if (ml) { a.latas += cant; a.lata += cant * Number(ml) / 1000 } else a.barril += Number(f.litros) || 0
  }

  // Lotes ya planificados desde hoy (los anteriores se asumen en tanque, ya contados en el stock).
  const plan = await todas<{ producto: string; estado: string; fecha_planificada: string; litros_planificados: number }>((a, b) =>
    admin.from('plan_produccion').select('producto, estado, fecha_planificada, litros_planificados').in('estado', ['planificado', 'en_curso']).gte('fecha_planificada', hoy).order('id').range(a, b))
  const lotes = plan.filter(l => productos.includes(l.producto)).map(l => ({ producto: l.producto, fecha: l.fecha_planificada, litros: Number(l.litros_planificados) || 0 }))

  // Recetas con precio.
  const rec = await todas<{ id: string; producto: string; litros_base: number }>((a, b) => admin.from('recetas').select('id, producto, litros_base').order('id').range(a, b))
  const lineas = await todas<{ receta_id: string; insumo_id: string; cantidad: number; uso: string | null }>((a, b) => admin.from('receta_insumos').select('receta_id, insumo_id, cantidad, uso').order('id').range(a, b))
  const ins = await todas<{ id: string; nombre: string; categoria: string; unidad_base: string; precio_unitario: number | null }>((a, b) => admin.from('insumos').select('id, nombre, categoria, unidad_base, precio_unitario').order('id').range(a, b))
  const insPorId = new Map(ins.map(i => [i.id, i]))
  const recetas: { producto: string; litros_base: number; insumo: string; categoria: string; unidad: string; cantidad: number; precio: number | null; uso: string | null }[] = []
  for (const r of rec) {
    if (!productos.includes(r.producto)) continue
    for (const l of lineas.filter(x => x.receta_id === r.id)) {
      const i = insPorId.get(l.insumo_id)
      if (!i) continue
      recetas.push({ producto: r.producto, litros_base: Number(r.litros_base), insumo: i.nombre, categoria: i.categoria, unidad: i.unidad_base, cantidad: Number(l.cantidad), precio: i.precio_unitario != null ? Number(i.precio_unitario) : null, uso: l.uso })
    }
  }
  // Stock de insumos (última foto).
  const { data: ultI } = await admin.from('stock_insumos').select('fecha_informe').order('fecha_informe', { ascending: false }).limit(1)
  const fechaInsumos = ultI?.[0]?.fecha_informe as string
  const si = await todas<{ insumo_id: string; cantidad: number }>((a, b) => admin.from('stock_insumos').select('insumo_id, cantidad').eq('fecha_informe', fechaInsumos).order('id').range(a, b))
  const stockInsumos: Record<string, number> = {}
  for (const s of si) { const n = insPorId.get(s.insumo_id)?.nombre; if (n) stockInsumos[n] = (stockInsumos[n] ?? 0) + (Number(s.cantidad) || 0) }

  // Calendario de ciclos y fracción restante del ciclo en curso.
  const cal = ciclos.map(c => ({ ciclo: c, inicio: inicioDeCiclo(c), fin: finDeCiclo(c) }))
  const enCurso = cal.find(c => c.inicio <= hoy && c.fin >= hoy)
  const fraccionRestante = enCurso ? Math.max(0, dias(hoy, enCurso.fin)) / (dias(enCurso.inicio, enCurso.fin) + 1) : 0

  const out = { hoy, fechaStock, fechaInsumos, productos, calendario: cal, cicloEnCurso: enCurso?.ciclo ?? null, fraccionRestante, demanda, demandaProducto, stockSeguridad, stockSeguridadLata, stock, lotes, recetas, stockInsumos }
  writeFileSync(salida, JSON.stringify(out, null, 1))
  console.log(`productos ${productos.length} · recetas ${recetas.length} líneas · lotes ${lotes.length} · stock ${Object.keys(stock).length} productos · fracción restante ${fraccionRestante.toFixed(2)}`)
  for (const p of productos) {
    const d = demanda[p] ?? {}
    const tot = (m: string) => Object.values(d[m] ?? {}).reduce((s, x) => s + x, 0)
    console.log(p.padEnd(30), 'Q1', Math.round(tot('2027-01-01') + tot('2027-02-01') + tot('2027-03-01')), '| stock', Math.round((stock[p]?.barril ?? 0) + (stock[p]?.lata ?? 0)), 'tanque', Math.round(stock[p]?.tanque ?? 0), '| control producto Jan', Math.round(demandaProducto[p]?.['2027-01-01'] ?? 0), 'vs suma', Math.round(tot('2027-01-01')))
  }
}
main()
