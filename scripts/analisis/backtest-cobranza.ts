/**
 * Backtest de la proyección de cobranza de Administración.
 *
 *   npx tsx scripts/analisis/backtest-cobranza.ts
 *
 * Simula, 26 semanas hacia atrás, qué habría proyectado el modelo con la
 * información disponible EN ESE MOMENTO —el comportamiento de pago de cada
 * cliente se recalcula usando sólo sus pagos anteriores a esa semana, para no
 * hacer trampa mirando el futuro— y lo compara contra lo que realmente entró.
 *
 * Para qué sirve re-correrlo: `RECUPERO_SEMANAL_ATRASO` en
 * lib/administracion/proyeccionCobros.ts es una constante MEDIDA acá. Si el
 * comportamiento de pago de la cartera cambia (una crisis, un cliente grande
 * nuevo, una política de cobranza distinta), esa tasa se mueve y la
 * proyección se empieza a desviar. Conviene re-correrlo cada vez que se
 * carguen varios meses nuevos de "Movimientos Cta. Cte." y actualizar la
 * constante si el número cambió de forma apreciable.
 *
 * Resultado de la corrida del 19-sep-2026 (12 meses de pagos cargados):
 *
 *   modelo                          MAE     MAPE     sesgo    corr
 *   sólo al día (v1)         $2.199.010     36%      -36%     0.43
 *   al día + recupero 42%    $1.638.346     36%       +7%     0.57
 *   al día × 1,56 (crudo)    $2.130.472     40%       -0%     0.43
 *
 * La lectura: el problema no era de escala sino de mecanismo. Multiplicar por
 * un factor arregla el promedio pero no mejora la capacidad de anticipar UNA
 * semana concreta; modelar el recupero del atraso sí, porque el tamaño del
 * pool vencido cambia semana a semana y es lo que de verdad mueve la caja.
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

for (const linea of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Za-z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

const PAGE = 1000
// El tipo del query builder de PostgREST es enorme y sólo se usa para
// encadenar un .not() opcional; en un script de análisis no paga la pena.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any
async function traerTodo<T>(tabla: string, cols: string, filtro?: (q: Consulta) => Consulta): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; ; off += PAGE) {
    let q = admin.from(tabla).select(cols).order('id', { ascending: true }).range(off, off + PAGE - 1)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    if (error) throw new Error(`${tabla}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return out
}
const lunesDe = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay()
  return new Date(dt.getTime() + (dow === 0 ? -6 : 1 - dow) * 86400000).toISOString().slice(0, 10)
}
const sumarDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const diffDias = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
const norm = (s: string | null) => (s ?? '').toLowerCase().trim()
const fM = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

async function main() {
  const ventas = await traerTodo<{ numero_factura: string | null; nombre_fantasia: string | null; fecha_entrega: string | null; total_sin_impuesto: number | null }>(
    'ventas', 'id, numero_factura, nombre_fantasia, fecha_entrega, total_sin_impuesto',
    q => q.not('fecha_entrega', 'is', null).not('numero_factura', 'is', null)
  )
  const cobros = await traerTodo<{ factura: string | null; fecha: string; monto: number; cliente: string }>(
    'cobros_erp', 'id, factura, fecha, monto, cliente'
  )

  const fact = new Map<string, { cliente: string; entrega: string; bruto: number }>()
  let excluidosPdv = 0
  for (const v of ventas) {
    if (!v.numero_factura || !v.fecha_entrega) continue
    const cli = norm(v.nombre_fantasia)
    if (cli.includes('pdv') || cli.includes('feria')) { excluidosPdv++; continue }
    const a = fact.get(v.numero_factura) ?? { cliente: cli, entrega: v.fecha_entrega, bruto: 0 }
    a.bruto += (Number(v.total_sin_impuesto) || 0) * 1.19
    if (v.fecha_entrega > a.entrega) a.entrega = v.fecha_entrega
    fact.set(v.numero_factura, a)
  }
  const pago = new Map<string, string>()
  for (const c of cobros) {
    if (!c.factura) continue
    const prev = pago.get(c.factura)
    if (!prev || c.fecha < prev) pago.set(c.factura, c.fecha)
  }

  // ── Diagnóstico de cobertura ────────────────────────────────────────────
  const fechaMinCobro = cobros.reduce((m, c) => (c.fecha < m ? c.fecha : m), '9999')
  let conPago = 0, sinPago = 0, fueraRango = 0, entregaVieja = 0
  for (const [f, v] of fact) {
    const fp = pago.get(f)
    if (!fp) { sinPago++; if (v.entrega < fechaMinCobro) entregaVieja++; continue }
    const d = diffDias(v.entrega, fp)
    if (d < 0 || d > 365) { fueraRango++; continue }
    conPago++
  }
  console.log('=== COBERTURA ===')
  console.log('facturas B2B totales en ventas:', fact.size)
  console.log('  con pago rastreable       :', conPago)
  console.log('  sin pago en cobros_erp    :', sinPago, `(de esas, ${entregaVieja} entregadas antes del inicio del informe ${fechaMinCobro})`)
  console.log('  desfase fuera de [0,365]  :', fueraRango)
  console.log('líneas de venta PDV/feria excluidas:', excluidosPdv)
  const totalCobros = cobros.reduce((s, c) => s + c.monto, 0)
  const cobrosB2B = cobros.filter(c => !norm(c.cliente).includes('pdv') && !norm(c.cliente).includes('feria'))
  console.log('cobros_erp total:', fM(totalCobros), '| B2B:', fM(cobrosB2B.reduce((s, c) => s + c.monto, 0)))

  /* Universo COMPLETO: incluye las facturas que nunca se pagaron.
     Medir la tasa de recupero sólo sobre las que terminaron pagándose es
     sesgo de supervivencia, y de los gordos: la bolsa de atraso real que ve
     la proyección en producción tiene adentro deuda vieja que quizás no se
     cobre nunca. Con el universo filtrado la tasa salía 42% sobre un pool
     promedio de $5,7M; aplicada al pool real (~$31M) sobreproyectaba ~5x.

     Para que "sin pago" signifique de verdad "impaga" y no "entregada antes
     de que empiece el informe", sólo entran facturas despachadas desde que
     arranca cobros_erp. */
  interface F { factura: string; cliente: string; entrega: string; bruto: number; fechaPago: string | null; diasReal: number | null }
  const universo: F[] = []
  for (const [factura, f] of fact) {
    if (f.entrega < fechaMinCobro) continue
    const fp = pago.get(factura) ?? null
    const d = fp ? diffDias(f.entrega, fp) : null
    if (d != null && (d < 0 || d > 365)) continue
    universo.push({ factura, cliente: f.cliente, entrega: f.entrega, bruto: f.bruto, fechaPago: fp, diasReal: d })
  }
  const pagados = universo.filter(f => f.fechaPago != null)
    .sort((a, b) => a.fechaPago!.localeCompare(b.fechaPago!))
  console.log('\nuniverso completo (desde', fechaMinCobro + '):', universo.length,
    '| pagadas:', pagados.length, '| impagas:', universo.length - pagados.length,
    '| monto impago:', fM(universo.filter(f => !f.fechaPago).reduce((s, f) => s + f.bruto, 0)))

  const pctl = (xs: number[], p: number) => {
    if (!xs.length) return null
    const s = [...xs].sort((a, b) => a - b)
    const i = (s.length - 1) * p
    const lo = Math.floor(i), hi = Math.ceil(i)
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo)
  }
  const clientes = await traerTodo<{ nombre_fantasia: string | null; dias_pago: number | null }>('clientes', 'id, nombre_fantasia, dias_pago')
  const declarado = new Map<string, number>()
  for (const c of clientes) {
    const k = norm(c.nombre_fantasia)
    if (k && c.dias_pago != null && !declarado.has(k)) declarado.set(k, c.dias_pago)
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const semanas: string[] = []
  for (let i = 26; i >= 1; i--) semanas.push(sumarDias(lunesDe(hoy), -7 * i))

  // ── Tasa de recupero de lo atrasado ─────────────────────────────────────
  const filas: { sem: string; alDia: number; real: number; poolAtraso: number; recuperado: number; porModo: Record<string, number> }[] = []
  for (const w of semanas) {
    const wFin = sumarDias(w, 7)
    const hist = new Map<string, number[]>()
    for (const f of pagados) {
      if (f.fechaPago! >= w) break
      const a = hist.get(f.cliente) ?? []; a.push(f.diasReal!); hist.set(f.cliente, a)
    }
    const medCartera = pctl([...hist.values()].filter(v => v.length >= 3).map(v => pctl(v, 0.5)!), 0.5) ?? 15
    const diasDe = (cli: string, modo: 'p50' | 'p75' | 'media' | 'declarado' = 'p50') => {
      const h = hist.get(cli) ?? []
      if (modo === 'declarado') return Math.round(declarado.get(cli) ?? medCartera)
      if (h.length < 3) return Math.round(declarado.get(cli) ?? medCartera)
      if (modo === 'p75') return Math.round(pctl(h, 0.75)!)
      if (modo === 'media') return Math.round(h.reduce((s, x) => s + x, 0) / h.length)
      return Math.round(pctl(h, 0.5)!)
    }
    // Cuánto proyecta cada variante de estimador de días para esta semana.
    const alDiaPorModo: Record<string, number> = { p50: 0, p75: 0, media: 0, declarado: 0 }
    for (const modo of ['p50', 'p75', 'media', 'declarado'] as const) {
      for (const f of universo.filter(x => x.entrega < w && (x.fechaPago == null || x.fechaPago >= w))) {
        const esperada = sumarDias(f.entrega, diasDe(f.cliente, modo))
        if (esperada >= w && esperada < wFin) alDiaPorModo[modo] += f.bruto
      }
    }

    // Pendientes al inicio de la semana: despachadas antes y todavía impagas
    // (nunca pagadas, o pagadas en/después de esta semana).
    const pendientes = universo.filter(f => f.entrega < w && (f.fechaPago == null || f.fechaPago >= w))
    let alDia = 0, poolAtraso = 0, recuperado = 0
    for (const f of pendientes) {
      const esperada = sumarDias(f.entrega, diasDe(f.cliente))
      if (esperada < w) {
        poolAtraso += f.bruto
        if (f.fechaPago != null && f.fechaPago < wFin) recuperado += f.bruto
      } else if (esperada < wFin) {
        alDia += f.bruto
      }
    }
    const real = pagados.filter(f => f.fechaPago! >= w && f.fechaPago! < wFin).reduce((s, f) => s + f.bruto, 0)
    filas.push({ sem: w, alDia, real, poolAtraso, recuperado, porModo: alDiaPorModo })
  }

  const tasas = filas.filter(f => f.poolAtraso > 0).map(f => f.recuperado / f.poolAtraso)
  const tasaMedia = tasas.reduce((s, t) => s + t, 0) / tasas.length
  const tasaMediana = pctl(tasas, 0.5)!
  console.log('\n=== RECUPERO DE LO ATRASADO ===')
  console.log('pool atrasado promedio  :', fM(filas.reduce((s, f) => s + f.poolAtraso, 0) / filas.length))
  console.log('recuperado por semana   :', fM(filas.reduce((s, f) => s + f.recuperado, 0) / filas.length))
  console.log('tasa semanal de recupero: media', (tasaMedia * 100).toFixed(1) + '%', '| mediana', (tasaMediana * 100).toFixed(1) + '%')

  const evaluar = (nombre: string, pred: (f: typeof filas[number]) => number) => {
    const r = filas.filter(f => f.real > 0)
    const errs = r.map(f => pred(f) - f.real)
    const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / r.length
    const mape = (r.reduce((s, f) => s + Math.abs(pred(f) - f.real) / f.real, 0) / r.length) * 100
    const sesgo = errs.reduce((s, e) => s + e, 0) / r.length
    const mr = r.reduce((s, f) => s + f.real, 0) / r.length
    const mp = r.reduce((s, f) => s + pred(f), 0) / r.length
    const cov = r.reduce((s, f) => s + (pred(f) - mp) * (f.real - mr), 0)
    const sp = Math.sqrt(r.reduce((s, f) => s + (pred(f) - mp) ** 2, 0))
    const sr = Math.sqrt(r.reduce((s, f) => s + (f.real - mr) ** 2, 0))
    console.log(
      nombre.padEnd(34), fM(mae).padStart(12), (mape.toFixed(0) + '%').padStart(7),
      fM(sesgo).padStart(12), ((sesgo / mr) * 100).toFixed(0).padStart(6) + '%',
      (cov / (sp * sr)).toFixed(2).padStart(7)
    )
  }

  console.log('\n=== MODELOS ===')
  console.log('modelo'.padEnd(34), 'MAE'.padStart(12), 'MAPE'.padStart(7), 'sesgo'.padStart(12), 'sesgo%'.padStart(7), 'corr'.padStart(7))
  for (const modo of ['p50','p75','media','declarado']) evaluar(`estimador: ${modo}`, f => f.porModo[modo])
  evaluar('al día + recupero (mediana)', f => f.alDia + f.poolAtraso * tasaMediana)
  evaluar('al día + recupero (media)', f => f.alDia + f.poolAtraso * tasaMedia)
  for (const k of [1.3, 1.5, 1.56, 1.7]) evaluar(`al día × ${k} (calibración cruda)`, f => f.alDia * k)

  console.log('\n=== DETALLE modelo recomendado (últimas 12 semanas) ===')
  console.log('semana'.padEnd(12), 'al día'.padStart(12), 'recupero'.padStart(12), 'total'.padStart(12), 'real'.padStart(12))
  for (const f of filas.slice(-12)) {
    const rec = f.poolAtraso * tasaMediana
    console.log(f.sem.padEnd(12), fM(f.alDia).padStart(12), fM(rec).padStart(12), fM(f.alDia + rec).padStart(12), fM(f.real).padStart(12))
  }
}

main()
