import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { esClienteExcluido } from '@/lib/types'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

type EnvaseBucket = 'barril_30' | 'barril_50' | 'lata_354' | 'lata_473' | 'otros'

/** Litros de un barril → familia de tamaño. Múltiplos de 30 (30/60/90/120…)
 *  son N barriles de 30L en una sola línea; 50L exacto es la otra medida
 *  estándar. El resto (growlers, casos atípicos) va a "otros". */
function bucketEnvase(envase: string | null, litros: number): EnvaseBucket {
  if (envase === 'Lata (354 ml)') return 'lata_354'
  if (envase === 'Lata (473 ml)') return 'lata_473'
  if (envase === 'Barril') {
    if (litros > 0 && litros % 30 === 0) return 'barril_30'
    if (litros === 50) return 'barril_50'
  }
  return 'otros'
}

function mesDe(fecha: string) {
  return fecha.slice(0, 7) + '-01' // yyyy-mm-01
}

/** Espacios dobles del ERP ("Mocho  English") y descriptores entre
 *  paréntesis en costos_precios ("Kombucha Lemon (Fresh)") hacen que el
 *  nombre de ventas.producto no calce contra costos_precios.producto con una
 *  igualdad estricta — normalizamos ambos lados igual antes de cruzar
 *  (confirmado con datos reales: sin esto se perdía ~48% del volumen). */
function normalizarProducto(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim()
}

/**
 * GET /api/produccion/datos
 *
 * Prepara los datos de venta ya limpios (sin clientes internos/mermas, sólo
 * productos reconocidos) y agregados por mes, para que el script de forecast
 * (Prophet, Python) no tenga que tocar Supabase directo ni duplicar la lógica
 * de negocio — esa lógica vive UNA vez acá, en TypeScript.
 *
 * Autenticación dual, mismo patrón que /api/barriles/upload.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.UPLOAD_SECRET_FORECAST
  const esCron = !!secret && auth === `Bearer ${secret}`

  let supabase: ReturnType<typeof getAdminClient>
  try {
    supabase = getAdminClient()
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  if (!esCron) {
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Puente nombre→código — mismo criterio que app/ventas/stock/page.tsx: es
  // lo que separa "producto real de fábrica" de merch/arriendos/fletes, que
  // no le sirven a producción para planificar litros a brewear.
  const { data: costosPrecios } = await supabase
    .from('costos_precios')
    .select('producto, codigo')
    .not('codigo', 'is', null)
  const codigoPorProducto = new Map((costosPrecios ?? []).map(c => [normalizarProducto(c.producto as string), c.codigo as string]))

  // ventas puede tener >50k filas — PostgREST limita a 1000 por página.
  const PAGE = 1000
  type VentaRow = { fecha_pedido: string; nombre_fantasia: string | null; producto: string | null; envase: string | null; litros: number | null }
  const filas: VentaRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('ventas')
      .select('fecha_pedido, nombre_fantasia, producto, envase, litros')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    filas.push(...(data as VentaRow[]))
    if (data.length < PAGE) break
  }

  let excluidosCliente = 0
  let excluidosProducto = 0
  const litrosExcluidosProducto = new Map<string, number>()

  const general = new Map<string, number>()
  const porProducto = new Map<string, Map<string, number>>()
  const porEnvase = new Map<EnvaseBucket, Map<string, number>>()
  const mesesConVenta = new Set<string>()

  for (const f of filas) {
    if (!f.fecha_pedido || !f.producto) continue
    if (esClienteExcluido(f.nombre_fantasia)) { excluidosCliente++; continue }
    const nombreNormalizado = normalizarProducto(f.producto)
    const codigo = codigoPorProducto.get(nombreNormalizado)
    if (!codigo) {
      excluidosProducto++
      litrosExcluidosProducto.set(f.producto, (litrosExcluidosProducto.get(f.producto) ?? 0) + (f.litros ?? 0))
      continue
    }

    const litros = f.litros ?? 0
    const mes = mesDe(f.fecha_pedido)
    mesesConVenta.add(mes)

    general.set(mes, (general.get(mes) ?? 0) + litros)

    // Se agrega bajo el nombre NORMALIZADO (no el crudo de la fila) para que
    // variantes del mismo producto ("Mocho  English" con doble espacio,
    // "Kombucha Lemon (Fresh)") caigan en una sola serie.
    if (!porProducto.has(nombreNormalizado)) porProducto.set(nombreNormalizado, new Map())
    const serieProd = porProducto.get(nombreNormalizado)!
    serieProd.set(mes, (serieProd.get(mes) ?? 0) + litros)

    const bucket = bucketEnvase(f.envase, litros)
    if (!porEnvase.has(bucket)) porEnvase.set(bucket, new Map())
    const serieEnv = porEnvase.get(bucket)!
    serieEnv.set(mes, (serieEnv.get(mes) ?? 0) + litros)
  }

  const toArray = (m: Map<string, number>) =>
    [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, litros]) => ({ mes, litros: Math.round(litros * 1000) / 1000 }))

  const productoObj: Record<string, { mes: string; litros: number }[]> = {}
  for (const [producto, serie] of porProducto) productoObj[producto] = toArray(serie)

  const envaseObj: Record<string, { mes: string; litros: number }[]> = {}
  for (const [bucket, serie] of porEnvase) envaseObj[bucket] = toArray(serie)

  // Calidad de datos que ya se puede juzgar acá, sin correr el modelo todavía.
  const calidad: { tipo: string; clave: string | null; detalle: string; severidad: 'info' | 'advertencia' }[] = []
  if (excluidosCliente > 0) {
    calidad.push({ tipo: 'excluido_cliente', clave: null, detalle: `${excluidosCliente} filas de ventas excluidas por ser clientes internos/mermas/muestras (no cuentan como demanda real).`, severidad: 'info' })
  }
  if (excluidosProducto > 0) {
    const top = [...litrosExcluidosProducto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([n, litros]) => `${n} (${Math.round(litros)} L)`).join(', ')
    calidad.push({ tipo: 'producto_no_reconocido', clave: null, detalle: `${excluidosProducto} filas con un nombre de producto que no calza con ningún código activo en costos_precios (merch, fletes, o nombres viejos del ERP) — no entran al forecast. Por volumen, las más importantes: ${top}.`, severidad: 'advertencia' })
  }
  for (const [producto, serie] of porProducto) {
    if (serie.size < 6) {
      calidad.push({ tipo: 'historial_corto', clave: producto, detalle: `"${producto}" tiene sólo ${serie.size} mes(es) con ventas registradas — no alcanza para un forecast confiable (mínimo 6).`, severidad: 'advertencia' })
    }
  }

  return NextResponse.json({
    series: { general: toArray(general), producto: productoObj, envase: envaseObj },
    calidadDatos: calidad,
    meta: { totalFilas: filas.length, excluidosCliente, excluidosProducto, mesesConVenta: mesesConVenta.size },
  })
}
