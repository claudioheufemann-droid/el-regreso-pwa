import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { esClienteExcluidoProduccion, CLIENTES_INCLUIR_PRODUCCION } from '@/lib/types'

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
  let excluidosMesEnCurso = 0
  const litrosExcluidosProducto = new Map<string, number>()
  // Volumen y primer mes de los clientes que Ventas excluye y Producción sí
  // cuenta (PDV/BaseCamp/Feria). El primer mes importa: si empiezan mucho
  // después que el resto del historial, la serie tiene un salto de nivel
  // artificial y hay que avisarlo antes de que el modelo lo lea como
  // crecimiento real.
  const litrosReincluidos = new Map<string, number>()
  const primerMesReincluido = new Map<string, string>()

  const general = new Map<string, number>()
  const porProducto = new Map<string, Map<string, number>>()
  const porEnvase = new Map<EnvaseBucket, Map<string, number>>()
  const mesesConVenta = new Set<string>()

  // El mes en curso siempre está incompleto (hoy puede ser el día 2) — si
  // entra al modelo como si fuera un mes cerrado, Prophet lo lee como una
  // caída real de demanda y el backtest compara contra un total falso.
  // Confirmado con una corrida real: metía un desvío de ~550% en "general".
  const hoy = new Date()
  const mesEnCurso = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}-01`

  for (const f of filas) {
    if (!f.fecha_pedido || !f.producto) continue
    if (mesDe(f.fecha_pedido) >= mesEnCurso) { excluidosMesEnCurso++; continue }
    // esClienteExcluidoProduccion (no esClienteExcluido): Producción cuenta
    // PDV/BaseCamp/Feria, que Ventas no reporta — ver
    // CLIENTES_INCLUIR_PRODUCCION en lib/types.ts.
    if (esClienteExcluidoProduccion(f.nombre_fantasia)) { excluidosCliente++; continue }

    const nombreCliente = (f.nombre_fantasia ?? '').toLowerCase().trim()
    if (CLIENTES_INCLUIR_PRODUCCION.some(inc => nombreCliente.includes(inc))) {
      const clave = f.nombre_fantasia ?? '(sin nombre)'
      litrosReincluidos.set(clave, (litrosReincluidos.get(clave) ?? 0) + (f.litros ?? 0))
      const mesFila = mesDe(f.fecha_pedido)
      const previo = primerMesReincluido.get(clave)
      if (!previo || mesFila < previo) primerMesReincluido.set(clave, mesFila)
    }
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
  if (litrosReincluidos.size > 0) {
    const detalle = [...litrosReincluidos.entries()].sort((a, b) => b[1] - a[1])
      .map(([n, litros]) => `${n} (${Math.round(litros)} L desde ${primerMesReincluido.get(n)?.slice(0, 7)})`).join(', ')
    calidad.push({
      tipo: 'reincluido_produccion', clave: null,
      detalle: `Producción cuenta consumo propio que Ventas no reporta: ${detalle}.`,
      severidad: 'info',
    })

    // El salto: si estos clientes arrancan mucho después que el resto del
    // historial, todos los meses previos subestiman la demanda real y el
    // modelo va a leer ese arranque como crecimiento genuino.
    const primerMesGlobal = [...mesesConVenta].sort()[0]
    const arranqueTardio = [...primerMesReincluido.entries()]
      .filter(([, mes]) => primerMesGlobal && mes > primerMesGlobal)
      .sort((a, b) => a[1].localeCompare(b[1]))
    if (arranqueTardio.length > 0 && primerMesGlobal) {
      const desde = arranqueTardio[0][1].slice(0, 7)
      const litrosNuevos = arranqueTardio.reduce((acc, [n]) => acc + (litrosReincluidos.get(n) ?? 0), 0)
      calidad.push({
        tipo: 'salto_historial', clave: null,
        detalle: `${arranqueTardio.map(([n]) => n).join(', ')} recién aparecen en ${desde}, mientras que el historial arranca en ${primerMesGlobal.slice(0, 7)} (${Math.round(litrosNuevos)} L en total). Puede ser normal —el local abrió después— o faltar historia. Si es lo segundo, los meses previos subestiman la demanda y el modelo puede leer ese arranque como crecimiento real.`,
        severidad: 'advertencia',
      })
    }
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
    meta: {
      totalFilas: filas.length, excluidosCliente, excluidosProducto, excluidosMesEnCurso,
      mesesConVenta: mesesConVenta.size,
      litrosReincluidos: Object.fromEntries([...litrosReincluidos].map(([n, l]) => [n, Math.round(l)])),
    },
  })
}
