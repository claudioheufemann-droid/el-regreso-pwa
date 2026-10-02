import { type Consulta, redondear, terminoSeguro, texto } from './_base'
import { normalizarProducto } from '@/lib/produccion/reglas'
import { esCamaraProduccion } from '@/lib/camaras'

/**
 * Mismo criterio que el Stock de Seguridad de /produccion (app/produccion/page.tsx):
 *   · el ERP escribe el producto distinto según el formato ("Kombucha Lemon (Fresh)",
 *     "Lata (354 ml) de Kombucha Lemon Fresh") → se normaliza y se resuelve contra los
 *     productos del forecast;
 *   · las latas vienen SIN litros (sólo unidades) → litros = unidades × ml del nombre;
 *   · disponible = barriles + latas en las cámaras de Producción; lo que está en tanque
 *     va aparte (todavía no es producto terminado).
 * Sin esto el agente cruzaba nombres crudos y daba quiebres falsos (1-oct-2026:
 * "Kombucha Lemon 0 L" con 1.842 L entre barriles, latas y tanque).
 */

interface Acum { categoria: string | null; litrosBarril: number; barriles: number; litrosLata: number; latas: number; litrosTanque: number }

const nuevo = (categoria: string | null): Acum => ({ categoria, litrosBarril: 0, barriles: 0, litrosLata: 0, latas: 0, litrosTanque: 0 })

/** Ciclo 24→23 en curso como yyyy-mm-01 del mes en que termina. */
function cicloEnCurso(hoyISO: string): string {
  const [a, m, d] = hoyISO.split('-').map(Number)
  const fin = d > 23 ? new Date(Date.UTC(a, m, 1)) : new Date(Date.UTC(a, m - 1, 1))
  return fin.toISOString().slice(0, 10)
}

export const stockActual: Consulta = {
  nombre: 'stock_actual',
  descripcion:
    'Stock de producto terminado por producto (litros en barril y en lata, unidades, y aparte lo que está en tanque) del último informe del ERP, ' +
    'con la demanda proyectada del ciclo en curso y los DÍAS DE COBERTURA. Usar para "¿cuánto stock hay de X?" y "¿qué va a quebrar stock?" ' +
    '(ordenado de menor a mayor cobertura). No cruzar stock a mano con SQL: los nombres y los litros de latas requieren esta normalización.',
  parametros: [
    { nombre: 'producto', tipo: 'string', descripcion: 'Parte del nombre del producto. Omitir para ver todo.' },
    { nombre: 'categoria', tipo: 'string', enum: ['cerveza', 'kombucha'], descripcion: 'Filtrar por categoría.' },
  ],
  async ejecutar(args, ctx) {
    const { data: ultimo, error: e1 } = await ctx.admin.from('stock_productos')
      .select('fecha_informe').order('fecha_informe', { ascending: false }).limit(1)
    if (e1) throw new Error(e1.message)
    const fechaInforme = ultimo?.[0]?.fecha_informe as string | undefined
    if (!fechaInforme) return { nota: 'No hay informes de stock cargados.' }

    const mes = cicloEnCurso(ctx.hoyISO)
    const [stockRes, fcRes] = await Promise.all([
      ctx.admin.from('stock_productos').select('producto, categoria, tipo, camara, cantidad, litros').eq('fecha_informe', fechaInforme).limit(1000),
      ctx.admin.from('forecast_produccion').select('clave, litros').eq('nivel', 'producto').eq('tipo', 'forecast').eq('mes', mes),
    ])
    if (stockRes.error) throw new Error(stockRes.error.message)
    if (fcRes.error) throw new Error(fcRes.error.message)

    const demanda = new Map<string, number>()
    for (const f of fcRes.data ?? []) demanda.set(f.clave as string, Number(f.litros) || 0)
    // Más largo primero: "Doble Hazy IPA" antes que "Hazy IPA".
    const conocidos = [...demanda.keys()].sort((a, b) => b.length - a.length)
    const resolver = (crudo: string): string => {
      const limpio = normalizarProducto(crudo)
      return conocidos.find(p => limpio === p || limpio.startsWith(p + ' ')) ?? limpio
    }

    const acc = new Map<string, Acum>()
    for (const s of stockRes.data ?? []) {
      if (!s.producto) continue
      const nombre = resolver(s.producto as string)
      const a = acc.get(nombre) ?? nuevo(s.categoria as string | null)
      const cantidad = Number(s.cantidad) || 0
      if (s.tipo === 'tanque') { a.litrosTanque += Number(s.litros) || 0; acc.set(nombre, a); continue }
      if (!esCamaraProduccion(s.camara as string | null)) continue
      const ml = (s.producto as string).match(/Lata \((\d+)\s*ml\)/i)?.[1]
      if (ml) { a.latas += cantidad; a.litrosLata += cantidad * Number(ml) / 1000 }
      else { a.barriles += cantidad; a.litrosBarril += Number(s.litros) || 0 }
      acc.set(nombre, a)
    }
    // Productos con demanda pero sin ninguna fila de stock: son los quiebres.
    for (const p of conocidos) if (!acc.has(p) && (demanda.get(p) ?? 0) > 0) acc.set(p, nuevo(null))

    const prod = texto(args.producto) && terminoSeguro(texto(args.producto)!).toLowerCase()
    const cat = texto(args.categoria)?.toLowerCase()
    const filas = [...acc.entries()]
      .filter(([nombre, a]) => (!prod || nombre.toLowerCase().includes(prod))
        && (!cat || (a.categoria ?? (nombre.toLowerCase().includes('kombucha') ? 'kombucha' : 'cerveza')).toLowerCase().includes(cat)))
      .map(([producto, a]) => {
        const disponibles = a.litrosBarril + a.litrosLata
        const dem = demanda.get(producto) ?? null
        return {
          producto,
          litros_disponibles: redondear(disponibles),
          litros_barril: redondear(a.litrosBarril), barriles: a.barriles,
          litros_lata: redondear(a.litrosLata), latas: a.latas,
          litros_en_tanque: redondear(a.litrosTanque),
          demanda_ciclo_litros: dem != null ? redondear(dem) : null,
          dias_cobertura: dem && dem > 0 ? Math.round(disponibles / (dem / 30)) : null,
        }
      })
      .sort((x, y) => (x.dias_cobertura ?? Infinity) - (y.dias_cobertura ?? Infinity) || y.litros_disponibles - x.litros_disponibles)
      .slice(0, 40)

    return {
      fecha_informe: fechaInforme,
      ciclo_demanda: mes,
      nota: 'Disponible = barriles + latas en cámaras de Producción; lo en tanque aún no está envasado. Cobertura en días corridos ≈ disponible ÷ (demanda del ciclo ÷ 30).',
      productos: filas,
    }
  },
}
